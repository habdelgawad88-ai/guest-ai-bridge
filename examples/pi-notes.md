# Pi coding agent

Current Pi CLI supports native MCP: https://docs.pi.dev/latest/mcp

```bash
node setup-agents.cjs pi
pi mcp list --json
```

Restart Pi or use `/reload`, then `/mcp`. Registration is global under `~/.pi/agent/mcp.json`.
Legacy Pi versions without `pi mcp add` may require manual MCP configuration or a suitable extension; the installer reports unsupported versions rather than installing a dependency or overwriting an agent config.

Do not forward proprietary code or secrets to free anonymous services. See `../docs/AGENT_ROUTING.md`.
