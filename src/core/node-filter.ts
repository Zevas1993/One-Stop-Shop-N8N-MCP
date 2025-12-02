import { Logger } from "../utils/logger";

/**
 * Node Filter Service
 *
 * Responsible for enforcing restrictions on which n8n nodes can be used.
 * By default, only official n8n nodes are allowed.
 * Community nodes can be enabled via configuration.
 */
export class NodeFilter {
  private static instance: NodeFilter;
  private logger: Logger;
  private allowCommunityNodes: boolean;
  private communityNodeWhitelist: Set<string>;

  private constructor() {
    this.logger = new Logger({ prefix: "NodeFilter" });
    this.allowCommunityNodes = process.env.ALLOW_COMMUNITY_NODES === "true";

    const whitelist = process.env.COMMUNITY_NODE_WHITELIST || "";
    this.communityNodeWhitelist = new Set(
      whitelist
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
    );

    this.logger.info("NodeFilter initialized", {
      allowCommunityNodes: this.allowCommunityNodes,
      whitelistSize: this.communityNodeWhitelist.size,
    });
  }

  public static getInstance(): NodeFilter {
    if (!NodeFilter.instance) {
      NodeFilter.instance = new NodeFilter();
    }
    return NodeFilter.instance;
  }

  public isCommunityNodesAllowed(): boolean {
    return this.allowCommunityNodes;
  }

  /**
   * Check if a node type is allowed
   */
  public isNodeAllowed(nodeType: string): boolean {
    // 1. Allow official base nodes
    if (nodeType.startsWith("n8n-nodes-base.")) {
      return true;
    }

    // 2. Allow official LangChain nodes (scoped and unscoped)
    if (
      nodeType.startsWith("@n8n/n8n-nodes-langchain.") ||
      nodeType.startsWith("n8n-nodes-langchain.")
    ) {
      return true;
    }

    // 3. Check community nodes settings
    if (this.allowCommunityNodes) {
      return true;
    }

    // 4. Check whitelist
    if (this.communityNodeWhitelist.has(nodeType)) {
      return true;
    }

    return false;
  }

  /**
   * Get the reason why a node is not allowed
   */
  public getRejectionReason(nodeType: string): string | null {
    if (this.isNodeAllowed(nodeType)) {
      return null;
    }

    return `Node type '${nodeType}' is not allowed. Only official n8n nodes (n8n-nodes-base.*, @n8n/n8n-nodes-langchain.*) are allowed by default. Set ALLOW_COMMUNITY_NODES=true to enable community nodes.`;
  }

  // Map of blocked node prefixes to built-in alternatives
  private static readonly ALTERNATIVES: Record<string, string[]> = {
    "n8n-nodes-browserless": [
      "n8n-nodes-base.httpRequest",
      "n8n-nodes-base.html",
    ],
    "n8n-nodes-openai": [
      "@n8n/n8n-nodes-langchain.lmChatOpenAi",
      "@n8n/n8n-nodes-langchain.lmOpenAi",
    ],
    "n8n-nodes-chatgpt": ["@n8n/n8n-nodes-langchain.lmChatOpenAi"],
    "n8n-nodes-anthropic": ["@n8n/n8n-nodes-langchain.lmChatAnthropic"],
    "n8n-nodes-puppeteer": [
      "n8n-nodes-base.httpRequest",
      "n8n-nodes-base.html",
    ],
    "n8n-nodes-playwright": [
      "n8n-nodes-base.httpRequest",
      "n8n-nodes-base.html",
    ],
    "n8n-nodes-redis": ["n8n-nodes-base.redis"],
    "n8n-nodes-postgres": ["n8n-nodes-base.postgres"],
    "n8n-nodes-mongodb": ["n8n-nodes-base.mongoDb"],
  };

  /**
   * Get suggested alternatives for a blocked node
   */
  public getAlternatives(nodeType: string): string[] {
    // Extract package prefix (e.g., 'n8n-nodes-browserless' from 'n8n-nodes-browserless.browserless')
    const parts = nodeType.split(".");
    const packagePrefix = parts[0];

    // Check direct match first
    if (NodeFilter.ALTERNATIVES[packagePrefix]) {
      return NodeFilter.ALTERNATIVES[packagePrefix];
    }

    // Check partial matches
    for (const [key, alternatives] of Object.entries(NodeFilter.ALTERNATIVES)) {
      if (packagePrefix.includes(key) || key.includes(packagePrefix)) {
        return alternatives;
      }
    }

    // Default fallback suggestions
    return ["n8n-nodes-base.httpRequest", "n8n-nodes-base.code"];
  }

  /**
   * Get rejection reason WITH alternatives
   */
  public getRejectionReasonWithAlternatives(nodeType: string): {
    reason: string;
    alternatives: string[];
    suggestion: string;
  } | null {
    if (this.isNodeAllowed(nodeType)) {
      return null;
    }

    const alternatives = this.getAlternatives(nodeType);
    const reason =
      this.getRejectionReason(nodeType) || "Node not allowed by policy";

    return {
      reason,
      alternatives,
      suggestion:
        alternatives.length > 0
          ? `Consider using: ${alternatives.join(", ")}`
          : "Use official n8n-nodes-base or @n8n/n8n-nodes-langchain nodes",
    };
  }
}
