# ChatGPT / remote MCP preview

ChatGPT connects to *remote* MCP servers, not a local stdio child process.

This package includes a minimal optional localhost-only HTTP MCP endpoint at `src/http.cjs` using the 2026-07-28 wire format. It has not been certified against every ChatGPT app/plugin plan or MCP protocol revision. Test it before connecting ChatGPT; do not publicly expose it without TLS, strong authentication, and a proxy that preserves headers.

1. Generate a long random secret with `openssl rand -hex 32` and store in a protected environment variable (`GUEST_BRIDGE_HTTP_TOKEN`).
2. (Optional) configure `GUEST_BRIDGE_ALLOWED_ORIGINS` for your trusted MCP client's exact origins; if an Origin header is present and not allowlisted the server rejects it.
3. Run `node src/http.cjs`. It binds to 127.0.0.1:8427, not 0.0.0.0.
4. Use a secure HTTPS tunnel or reverse proxy supporting ChatGPT's custom MCP plugin path `/mcp`. Protect the proxy with authentication, keep the MCP endpoint private, and confirm the selected ChatGPT plan supports custom tools.
5. Test with a genuine MCP client and check that `guest_providers` and `guest_discover` appear. `guest_ask` remains disabled until a provider has independently confirmed automation permission.

For production deployments, replace the minimalist HTTP handler with the official MCP SDK, which manages protocol revision compatibility, transports, sessions, cancellation, and authentication more comprehensively.
