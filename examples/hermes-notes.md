# Hermes Agent

Native MCP registry: https://github.com/NousResearch/hermes-agent/blob/main/website/docs/reference/cli-commands.md

```bash
node setup-agents.cjs hermes --dry-run
node setup-agents.cjs hermes
hermes mcp list
hermes mcp test guest-ai-bridge
```

The installer only adds an MCP server. It does not change Hermes model routing or inference credentials. If an entry with this name already exists, it refuses to overwrite it; inspect it manually before retrying. The MCP tool may appear as `mcp_guest-ai-bridge_guest_auto` in Hermes.
