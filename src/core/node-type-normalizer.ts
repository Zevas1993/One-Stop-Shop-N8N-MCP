/**
 * Node Type Normalizer
 *
 * Canonical normalizer for n8n node type identifiers.
 * Handles the various prefix formats used across the codebase:
 *   - "n8n-nodes-base.httpRequest"  (canonical for base nodes)
 *   - "nodes-base.httpRequest"      (short form used in some places)
 *   - "@n8n/n8n-nodes-langchain.lmChatOpenAi"  (canonical for AI/langchain nodes)
 *   - "n8n-nodes-langchain.lmChatOpenAi"       (without @n8n scope)
 *   - "httpRequest"                             (bare name, no prefix)
 */

// Known package prefixes in canonical form
const CANONICAL_BASE_PREFIX = "n8n-nodes-base";
const CANONICAL_LANGCHAIN_PREFIX = "@n8n/n8n-nodes-langchain";

/**
 * Normalize a node type string to its canonical form.
 *
 * "nodes-base.httpRequest"           -> "n8n-nodes-base.httpRequest"
 * "n8n-nodes-langchain.lmChatOpenAi" -> "@n8n/n8n-nodes-langchain.lmChatOpenAi"
 * "httpRequest"                      -> "n8n-nodes-base.httpRequest"  (assumes base)
 * Already-canonical strings pass through unchanged.
 */
export function normalizeNodeType(nodeType: string): string {
  if (!nodeType || typeof nodeType !== "string") return nodeType;

  const trimmed = nodeType.trim();

  // Already canonical
  if (
    trimmed.startsWith(`${CANONICAL_BASE_PREFIX}.`) ||
    trimmed.startsWith(`${CANONICAL_LANGCHAIN_PREFIX}.`)
  ) {
    return trimmed;
  }

  // Short form: "nodes-base.X" -> "n8n-nodes-base.X"
  if (trimmed.startsWith("nodes-base.")) {
    return `${CANONICAL_BASE_PREFIX}.${trimmed.slice("nodes-base.".length)}`;
  }

  // Missing @n8n scope: "n8n-nodes-langchain.X" -> "@n8n/n8n-nodes-langchain.X"
  if (trimmed.startsWith("n8n-nodes-langchain.")) {
    return `${CANONICAL_LANGCHAIN_PREFIX}.${trimmed.slice("n8n-nodes-langchain.".length)}`;
  }

  // Bare name with no dot: assume base package
  if (!trimmed.includes(".")) {
    return `${CANONICAL_BASE_PREFIX}.${trimmed}`;
  }

  // Unknown prefix — return as-is (could be a community node)
  return trimmed;
}

/**
 * Get all known alias forms for a canonical node type.
 * Useful for database lookups that need to match any form.
 */
export function getNodeTypeAliases(nodeType: string): string[] {
  const canonical = normalizeNodeType(nodeType);
  const aliases = new Set<string>([canonical, nodeType]);

  if (canonical.startsWith(`${CANONICAL_BASE_PREFIX}.`)) {
    const name = canonical.slice(`${CANONICAL_BASE_PREFIX}.`.length);
    aliases.add(`nodes-base.${name}`);
    aliases.add(name);
  } else if (canonical.startsWith(`${CANONICAL_LANGCHAIN_PREFIX}.`)) {
    const name = canonical.slice(`${CANONICAL_LANGCHAIN_PREFIX}.`.length);
    aliases.add(`n8n-nodes-langchain.${name}`);
    aliases.add(`nodes-langchain.${name}`);
    aliases.add(name);
  }

  return Array.from(aliases);
}

/**
 * Extract the bare node name (without any package prefix).
 */
export function getBareName(nodeType: string): string {
  if (!nodeType) return nodeType;
  const lastDot = nodeType.lastIndexOf(".");
  return lastDot >= 0 ? nodeType.slice(lastDot + 1) : nodeType;
}
