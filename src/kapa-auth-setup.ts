/**
 * kapa.ai OAuth Setup Script
 *
 * One-time setup for authenticating with kapa.ai's n8n documentation MCP server.
 * This opens a browser for Google OAuth login, catches the callback,
 * and saves tokens for headless AI agent use.
 *
 * Usage: node start.js --setup-kapa
 */

import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import { exec } from "child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { auth as mcpAuth } from "@modelcontextprotocol/sdk/client/auth.js";
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthTokens,
  OAuthClientMetadata,
  OAuthClientInformationMixed,
} from "@modelcontextprotocol/sdk/shared/auth.js";

const KAPA_SERVER_URL = "https://n8n.mcp.kapa.ai/";
const KAPA_TOKENS_FILE = path.join(process.cwd(), ".kapa-tokens.json");
const KAPA_CLIENT_FILE = path.join(process.cwd(), ".kapa-client.json");
const CALLBACK_PORT = 9876;
const REDIRECT_URL = `http://localhost:${CALLBACK_PORT}/callback`;

// Colors for console output
const c = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  red: "\x1b[31m",
  dim: "\x1b[2m",
};

function log(msg: string) {
  console.log(msg);
}

/**
 * Open a URL in the user's default browser (cross-platform)
 */
function openBrowser(url: string): void {
  const platform = process.platform;
  let cmd: string;
  if (platform === "win32") {
    cmd = `start "" "${url}"`;
  } else if (platform === "darwin") {
    cmd = `open "${url}"`;
  } else {
    cmd = `xdg-open "${url}"`;
  }
  exec(cmd, (err) => {
    if (err) {
      log(
        `${c.yellow}  Could not open browser automatically.${c.reset}`
      );
      log(`${c.yellow}  Please open this URL manually:${c.reset}`);
      log(`${c.bright}  ${url}${c.reset}`);
    }
  });
}

/**
 * Setup-mode OAuth provider that opens the browser for auth
 */
class SetupKapaOAuthProvider implements OAuthClientProvider {
  private _codeVerifier: string = "";
  private _authResolve: ((code: string) => void) | null = null;
  private _authPromise: Promise<string> | null = null;
  private _callbackServer: http.Server | null = null;

  get redirectUrl(): string {
    return REDIRECT_URL;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      redirect_uris: [new URL(REDIRECT_URL)],
      client_name: "n8n-mcp-copilot",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    } as OAuthClientMetadata;
  }

  async clientInformation(): Promise<
    OAuthClientInformationMixed | undefined
  > {
    try {
      if (fs.existsSync(KAPA_CLIENT_FILE)) {
        return JSON.parse(fs.readFileSync(KAPA_CLIENT_FILE, "utf-8"));
      }
    } catch {
      // No saved client info
    }
    return undefined;
  }

  async saveClientInformation(
    info: OAuthClientInformationMixed
  ): Promise<void> {
    fs.writeFileSync(KAPA_CLIENT_FILE, JSON.stringify(info, null, 2));
    log(`${c.dim}  Client info saved.${c.reset}`);
  }

  async tokens(): Promise<OAuthTokens | undefined> {
    try {
      if (fs.existsSync(KAPA_TOKENS_FILE)) {
        return JSON.parse(fs.readFileSync(KAPA_TOKENS_FILE, "utf-8"));
      }
    } catch {
      // No saved tokens
    }
    return undefined;
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    fs.writeFileSync(KAPA_TOKENS_FILE, JSON.stringify(tokens, null, 2));
    log(`${c.green}  ✓ Tokens saved to .kapa-tokens.json${c.reset}`);
  }

  async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
    log(
      `\n${c.cyan}[SETUP]${c.reset} Opening browser for Google login...`
    );
    openBrowser(authorizationUrl.toString());

    // Start callback server to catch the OAuth redirect
    await this._startCallbackServer();
  }

  async saveCodeVerifier(codeVerifier: string): Promise<void> {
    this._codeVerifier = codeVerifier;
  }

  async codeVerifier(): Promise<string> {
    return this._codeVerifier;
  }

  /**
   * Wait for the OAuth callback and return the authorization code
   */
  async waitForAuthCode(): Promise<string> {
    if (!this._authPromise) {
      this._authPromise = new Promise<string>((resolve) => {
        this._authResolve = resolve;
      });
    }
    return this._authPromise;
  }

  private async _startCallbackServer(): Promise<void> {
    if (this._callbackServer) return;

    this._authPromise = new Promise<string>((resolve) => {
      this._authResolve = resolve;
    });

    this._callbackServer = http.createServer((req, res) => {
      const url = new URL(req.url || "/", `http://localhost:${CALLBACK_PORT}`);

      if (url.pathname === "/callback") {
        const code = url.searchParams.get("code");
        const error = url.searchParams.get("error");

        if (error) {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end(
            `<html><body><h1>Authentication Failed</h1><p>Error: ${error}</p><p>You can close this window.</p></body></html>`
          );
          if (this._authResolve) {
            this._authResolve("");
          }
        } else if (code) {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(
            `<html><body><h1>Authentication Successful!</h1><p>You can close this window and return to the terminal.</p></body></html>`
          );
          if (this._authResolve) {
            this._authResolve(code);
          }
        } else {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end(
            `<html><body><h1>Missing code</h1><p>No authorization code received.</p></body></html>`
          );
        }
      } else {
        res.writeHead(404);
        res.end("Not found");
      }
    });

    this._callbackServer.listen(CALLBACK_PORT, () => {
      log(
        `${c.dim}  Waiting for callback on http://localhost:${CALLBACK_PORT}/callback...${c.reset}`
      );
    });
  }

  shutdown(): void {
    if (this._callbackServer) {
      this._callbackServer.close();
      this._callbackServer = null;
    }
  }
}

/**
 * Main setup flow
 */
async function main(): Promise<void> {
  log("");
  log(
    `${c.cyan}╔════════════════════════════════════════════════════════════╗${c.reset}`
  );
  log(
    `${c.cyan}║${c.reset}          ${c.bright}kapa.ai n8n Docs - Authentication Setup${c.reset}        ${c.cyan}║${c.reset}`
  );
  log(
    `${c.cyan}╚════════════════════════════════════════════════════════════╝${c.reset}`
  );
  log("");

  // Check if already authenticated
  if (fs.existsSync(KAPA_TOKENS_FILE)) {
    log(
      `${c.yellow}  Existing tokens found. Re-authenticating will overwrite them.${c.reset}`
    );
    log("");
  }

  const provider = new SetupKapaOAuthProvider();

  try {
    log(
      `${c.cyan}[SETUP]${c.reset} Initiating OAuth flow with kapa.ai...`
    );

    // Use the MCP SDK's auth() function to orchestrate the OAuth flow.
    // This will:
    // 1. Discover the OAuth metadata from kapa.ai
    // 2. Register the client dynamically (if needed)
    // 3. Call redirectToAuthorization() which opens the browser + starts callback server
    const result = await mcpAuth(provider, {
      serverUrl: KAPA_SERVER_URL,
      scope: "openid",
    });

    if (result === "AUTHORIZED") {
      // Already authorized (had valid tokens)
      log(
        `\n${c.green}  ✓ Already authenticated! Tokens are valid.${c.reset}`
      );
      provider.shutdown();
      process.exit(0);
    }

    // result === "REDIRECT" - waiting for user to complete browser auth
    log(
      `\n${c.cyan}[SETUP]${c.reset} Waiting for you to complete Google login in the browser...`
    );

    const authCode = await provider.waitForAuthCode();

    if (!authCode) {
      log(`\n${c.red}  ✗ Authentication failed or was cancelled.${c.reset}`);
      provider.shutdown();
      process.exit(1);
    }

    log(`\n${c.cyan}[SETUP]${c.reset} Exchanging authorization code for tokens...`);

    // Exchange the auth code for tokens using the SDK
    const exchangeResult = await mcpAuth(provider, {
      serverUrl: KAPA_SERVER_URL,
      authorizationCode: authCode,
      scope: "openid",
    });

    if (exchangeResult === "AUTHORIZED") {
      log("");
      log(
        `${c.green}  ✓ Authentication successful!${c.reset}`
      );
      log(`${c.dim}  Tokens saved to .kapa-tokens.json${c.reset}`);
      log(
        `${c.dim}  Client info saved to .kapa-client.json${c.reset}`
      );
      log("");
      log(
        `${c.bright}  The n8n_docs tool is now ready for AI agent use.${c.reset}`
      );
      log(`${c.dim}  Start the MCP server: node start.js${c.reset}`);
      log("");

      // Quick verification - try to connect
      log(`${c.cyan}[VERIFY]${c.reset} Testing connection to kapa.ai...`);
      try {
        const testProvider = new SetupKapaOAuthProvider();
        const client = new Client({
          name: "n8n-mcp-kapa-verify",
          version: "1.0.0",
        });
        const transport = new StreamableHTTPClientTransport(
          new URL(KAPA_SERVER_URL),
          { authProvider: testProvider }
        );
        await client.connect(transport);
        const { tools } = await client.listTools();
        log(
          `${c.green}  ✓ Connected! Available tools: ${tools.map((t) => t.name).join(", ")}${c.reset}`
        );
        await transport.close();
        testProvider.shutdown();
      } catch (verifyErr: any) {
        log(
          `${c.yellow}  ⚠ Verification failed: ${verifyErr.message}${c.reset}`
        );
        log(
          `${c.yellow}  Tokens were saved but connection test failed. Try starting the server anyway.${c.reset}`
        );
      }
    } else {
      log(`\n${c.red}  ✗ Token exchange failed.${c.reset}`);
      provider.shutdown();
      process.exit(1);
    }
  } catch (error: any) {
    // Handle the special REDIRECT error from redirectToAuthorization
    if (error.message?.startsWith("REDIRECT:")) {
      // This shouldn't happen since we handle it in the provider
      log(`${c.red}  Unexpected redirect error${c.reset}`);
    } else {
      log(`\n${c.red}  ✗ Setup failed: ${error.message}${c.reset}`);
      if (error.stack) {
        log(`${c.dim}  ${error.stack}${c.reset}`);
      }
    }
    provider.shutdown();
    process.exit(1);
  }

  provider.shutdown();
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
