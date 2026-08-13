export const WIKI_MCP_ENDPOINT =
  "https://www.scholay.com/api/v1/public/wiki/mcp";

export const WIKI_MCP_CONFIG = {
  mcpServers: {
    "scholay-wiki": {
      type: "http",
      url: WIKI_MCP_ENDPOINT,
    },
  },
} as const;

export function wikiMcpConfigText(): string {
  return JSON.stringify(WIKI_MCP_CONFIG, null, 2);
}
