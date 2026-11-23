# Verified anonymous API responses — 2026-11-21 UTC

Executed once from connected Contabo engineering VPS using Python HTTP requests; **no provider API key, account, login, or CAPTCHA**. Prompt: `What is 13 times 17? Reply with only the number.` Responses contained only synthetic content.

| API | Fixed alias | HTTP | Answer | Observed upstream model |
|---|---|---:|---:|---|
| JarvisClaw | `auto/free` | 200 | `221` | `nvidia/nemotron-3.5-bolt` |
| Kilo Gateway | `kilo-auto/free` | 200 | `221` | `nvidia/nemotron-3.5-super-vl:free` |
| Vireonix | `auto` | 200 | `221` | `auto` (provider did not expose a distinct upstream model in the standard field) |

The completed v0.3.0 package was tested offline with mocks, Chromium fixture and the MCP/HTTP subprocess interfaces. **These live calls validate each public endpoint separately, not a fully deployed v0.3.0 agent integration.** External availability and rate limits may change without notice.

Documentation references:
- https://jarvisclaw.ai/en/free-llm-api
- https://kilo.ai/docs/gateway/authentication
- https://kilo.ai/docs/gateway/models-and-providers
- https://vireonix.ai/docs
