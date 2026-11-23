# Google Antigravity

Native MCP configuration: https://antigravity.google/docs/ide/mcp

```bash
node setup-agents.cjs antigravity --dry-run
node setup-agents.cjs antigravity
```

Global config: `~/.gemini/config/mcp_config.json`. The installer preserves other MCP servers, makes a private backup before editing a pre-existing file, and refuses to overwrite a conflicting guest-ai-bridge entry.

If Antigravity workspace config `.agents/mcp_config.json` overrides the global entry, inspect and reconcile it yourself using MCP Servers → Manage MCP Servers → View raw config. Reload after installation.
