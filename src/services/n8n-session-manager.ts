/**
 * N8nSessionManager - Session-based authentication for n8n internal endpoints
 *
 * n8n has two authentication systems:
 * 1. Public REST API (/api/v1/*) - Uses X-N8N-API-KEY header
 * 2. Internal/Frontend API (/types/*, /rest/*) - Uses session cookies
 *
 * This service handles session-based auth to access internal endpoints like
 * /types/nodes.json which provides the complete node catalog.
 */

import axios, { AxiosInstance, AxiosResponse } from "axios";
import { EventEmitter } from "events";
import { logger } from "../utils/logger";

export interface SessionConfig {
  n8nUrl: string;
  username: string;
  password: string;
  sessionRefreshIntervalMs?: number; // Default: 50 minutes
  maxRetries?: number;
}

export interface SessionState {
  isAuthenticated: boolean;
  cookie: string | null;
  expiresAt: Date | null;
  lastRefresh: Date | null;
  userId?: string;
  firstName?: string;
  lastName?: string;
}

export interface SessionManagerEvents {
  authenticated: (state: SessionState) => void;
  sessionRefreshed: (state: SessionState) => void;
  sessionExpired: () => void;
  sessionFailed: (error: Error) => void;
  logout: () => void;
}

export class N8nSessionManager extends EventEmitter {
  private config: SessionConfig;
  private sessionState: SessionState;
  private sessionClient: AxiosInstance;
  private refreshTimer: NodeJS.Timeout | null = null;

  // Constants matching n8n's implementation
  private readonly AUTH_COOKIE_NAME = "n8n-auth";
  private readonly SESSION_TIMEOUT_MS = 50 * 60 * 1000; // 50 minutes (safe margin before 60-min expiry)
  private readonly MAX_RETRIES: number;

  constructor(config: SessionConfig) {
    super();
    this.config = {
      ...config,
      n8nUrl: config.n8nUrl.replace(/\/$/, ""), // Remove trailing slash
    };
    this.MAX_RETRIES = config.maxRetries ?? 3;

    this.sessionState = {
      isAuthenticated: false,
      cookie: null,
      expiresAt: null,
      lastRefresh: null,
    };

    // Create axios instance for session-based requests
    this.sessionClient = axios.create({
      baseURL: this.config.n8nUrl,
      timeout: 30000,
      withCredentials: true,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      // Don't throw on any status - we handle errors ourselves
      validateStatus: () => true,
    });

    // Add response interceptor for automatic session refresh on 401
    this.sessionClient.interceptors.response.use(
      (response) => response,
      async (error) => {
        // Network errors don't have response
        if (!error.response) {
          throw error;
        }

        const originalRequest = error.config;

        // If 401 and not already retrying, refresh session and retry
        if (error.response.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;

          try {
            await this.refreshSession();

            // Update cookie header and retry
            if (this.sessionState.cookie) {
              originalRequest.headers["Cookie"] =
                `${this.AUTH_COOKIE_NAME}=${this.sessionState.cookie}`;
            }

            return this.sessionClient.request(originalRequest);
          } catch (refreshError) {
            throw error; // Throw original error if refresh fails
          }
        }

        throw error;
      }
    );
  }

  /**
   * Perform login to obtain session cookie
   */
  async login(): Promise<boolean> {
    logger.info("[SessionManager] Attempting session login...");

    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        const response = await axios.post(
          `${this.config.n8nUrl}/rest/login`,
          {
            // n8n uses emailOrLdapLoginId instead of email
            emailOrLdapLoginId: this.config.username,
            password: this.config.password,
          },
          {
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            withCredentials: true,
            // Get raw response to access headers
            validateStatus: () => true,
          }
        );

        // Check for successful login
        if (response.status === 200 && response.data) {
          // Extract cookie from Set-Cookie header
          const setCookieHeader = response.headers["set-cookie"];
          const cookie = this.extractAuthCookie(setCookieHeader);

          if (cookie) {
            this.sessionState = {
              isAuthenticated: true,
              cookie,
              expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 60 minutes
              lastRefresh: new Date(),
              userId: response.data.id,
              firstName: response.data.firstName,
              lastName: response.data.lastName,
            };

            // Start refresh timer
            this.startRefreshTimer();

            logger.info(
              `[SessionManager] Login successful for ${response.data.email || this.config.username}`
            );
            this.emit("authenticated", this.sessionState);
            return true;
          }

          // Some n8n versions may return token differently
          // Check if response contains token directly
          if (response.data.token || response.data.authToken) {
            const token = response.data.token || response.data.authToken;
            this.sessionState = {
              isAuthenticated: true,
              cookie: token,
              expiresAt: new Date(Date.now() + 60 * 60 * 1000),
              lastRefresh: new Date(),
              userId: response.data.id,
            };

            this.startRefreshTimer();

            logger.info("[SessionManager] Login successful (token in body)");
            this.emit("authenticated", this.sessionState);
            return true;
          }

          logger.warn(
            "[SessionManager] Login response OK but no auth cookie found"
          );
        }

        // Handle specific error responses
        if (response.status === 401) {
          logger.error("[SessionManager] Invalid credentials");
          this.emit(
            "sessionFailed",
            new Error("Invalid username or password")
          );
          return false;
        }

        if (response.status === 429) {
          logger.warn(
            `[SessionManager] Rate limited, attempt ${attempt}/${this.MAX_RETRIES}`
          );
          await this.sleep(1000 * attempt * 2); // Exponential backoff
          continue;
        }

        logger.error(
          `[SessionManager] Login failed with status ${response.status}:`,
          response.data
        );
      } catch (error: any) {
        logger.error(
          `[SessionManager] Login error (attempt ${attempt}/${this.MAX_RETRIES}):`,
          error.message
        );

        if (attempt < this.MAX_RETRIES) {
          await this.sleep(1000 * attempt);
          continue;
        }
      }
    }

    this.emit(
      "sessionFailed",
      new Error("Failed to login after maximum retries")
    );
    return false;
  }

  /**
   * Extract n8n-auth cookie from Set-Cookie header
   */
  private extractAuthCookie(
    setCookieHeader: string[] | undefined
  ): string | null {
    if (!setCookieHeader || !Array.isArray(setCookieHeader)) {
      return null;
    }

    for (const cookie of setCookieHeader) {
      // Match n8n-auth=<value>
      const match = cookie.match(/n8n-auth=([^;]+)/);
      if (match) {
        return match[1];
      }
    }

    return null;
  }

  /**
   * Get axios instance with session cookie attached
   */
  getSessionClient(): AxiosInstance {
    if (!this.sessionState.isAuthenticated || !this.sessionState.cookie) {
      throw new Error("Not authenticated - call login() first");
    }

    // Attach cookie to default headers
    this.sessionClient.defaults.headers["Cookie"] =
      `${this.AUTH_COOKIE_NAME}=${this.sessionState.cookie}`;

    return this.sessionClient;
  }

  /**
   * Make authenticated request to internal endpoint
   * Automatically handles session refresh if needed
   */
  async requestInternal<T = any>(
    endpoint: string,
    options: { method?: string; data?: any } = {}
  ): Promise<T> {
    // Ensure we're authenticated
    if (!this.isSessionValid()) {
      logger.debug("[SessionManager] Session invalid, attempting refresh...");
      const refreshed = await this.refreshSession();
      if (!refreshed) {
        throw new Error("Session refresh failed");
      }
    }

    const { method = "GET", data } = options;

    const response = await this.sessionClient.request({
      url: endpoint,
      method,
      data,
      headers: {
        Cookie: `${this.AUTH_COOKIE_NAME}=${this.sessionState.cookie}`,
      },
    });

    // Handle error responses
    if (response.status >= 400) {
      if (response.status === 401) {
        // Try one more refresh
        const refreshed = await this.refreshSession();
        if (refreshed) {
          const retryResponse = await this.sessionClient.request({
            url: endpoint,
            method,
            data,
            headers: {
              Cookie: `${this.AUTH_COOKIE_NAME}=${this.sessionState.cookie}`,
            },
          });

          if (retryResponse.status >= 400) {
            throw new Error(
              `Request failed after retry: ${retryResponse.status}`
            );
          }

          return retryResponse.data;
        }
      }

      throw new Error(
        `Internal request failed: ${response.status} ${response.statusText}`
      );
    }

    return response.data;
  }

  /**
   * Refresh session by re-logging in
   */
  async refreshSession(): Promise<boolean> {
    logger.info("[SessionManager] Refreshing session...");

    // Stop existing timer
    this.stopRefreshTimer();

    // Clear current state
    this.sessionState = {
      isAuthenticated: false,
      cookie: null,
      expiresAt: null,
      lastRefresh: null,
    };

    // Re-login
    const success = await this.login();

    if (success) {
      this.emit("sessionRefreshed", this.sessionState);
    } else {
      this.emit("sessionExpired");
    }

    return success;
  }

  /**
   * Check if current session is valid
   */
  isSessionValid(): boolean {
    if (!this.sessionState.isAuthenticated || !this.sessionState.cookie) {
      return false;
    }

    // Check if session has expired
    if (this.sessionState.expiresAt) {
      const now = new Date();
      // Add 5-minute buffer
      const bufferMs = 5 * 60 * 1000;
      if (now.getTime() + bufferMs >= this.sessionState.expiresAt.getTime()) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get current session state (read-only copy)
   */
  getState(): Readonly<SessionState> {
    return { ...this.sessionState };
  }

  /**
   * Logout and cleanup
   */
  async logout(): Promise<void> {
    logger.info("[SessionManager] Logging out...");

    this.stopRefreshTimer();

    // Try to logout from n8n (optional, may fail)
    if (this.sessionState.cookie) {
      try {
        await this.sessionClient.post("/rest/logout", null, {
          headers: {
            Cookie: `${this.AUTH_COOKIE_NAME}=${this.sessionState.cookie}`,
          },
        });
      } catch (error) {
        // Ignore logout errors
      }
    }

    this.sessionState = {
      isAuthenticated: false,
      cookie: null,
      expiresAt: null,
      lastRefresh: null,
    };

    this.emit("logout");
  }

  /**
   * Start automatic session refresh timer
   */
  private startRefreshTimer(): void {
    this.stopRefreshTimer();

    const refreshInterval =
      this.config.sessionRefreshIntervalMs ?? this.SESSION_TIMEOUT_MS;

    this.refreshTimer = setInterval(async () => {
      logger.debug("[SessionManager] Auto-refreshing session...");
      await this.refreshSession();
    }, refreshInterval);

    // Don't let the timer prevent process exit
    if (this.refreshTimer.unref) {
      this.refreshTimer.unref();
    }
  }

  /**
   * Stop refresh timer
   */
  private stopRefreshTimer(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  /**
   * Helper to sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Cleanup on destroy
   */
  destroy(): void {
    this.stopRefreshTimer();
    this.removeAllListeners();
  }
}
