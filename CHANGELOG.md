# Changelog

## 0.7.0 — explicit free model choices and frontier catalog visibility (2026-11-23)
- `guest_models`: return live-catalog-eligible specific free Kilo models, anonymous free auto aliases, verified public Gradio demo routes, and separately labeled paid/locked frontier catalog listings.
- `guest_select_model`: persist a strict model choice in a private per-user local file; `auto` restores normal provider selection and bounded fallback.
- `guest_auto` and route planner respect saved choices or a one-call `model_id` override. A strict model's failure never causes an implicit switch to another model.
- `guest_ask` can submit one exact Kilo `:free` model ID only after checking the fresh official model catalog and free pricing/eligibility flags. Unknown, paid, stale, mismatched and non-text models fail closed.
- CLI: `models [--frontier|--json|--refresh]`, `use <model-id|auto>`, `selected`, and `auto --model ID`. Personal MCP profile now advertises five tools.
- Model-choice tests cover paid exclusion, privacy-preserving selection persistence, CLI/MCP compatibility, server model mismatch and strict non-fallback.


## 0.6.0 — bounded automatic public chat provider admission (2026-11-23)
- Discover public Hugging Face Gradio chat applications from the official Space listing; require running public metadata and explicit, compatible OpenAPI declarations.
- Test compatible text/chat endpoints with a harmless arithmetic prompt; only **completed** correct responses are auto-enrolled in the provider registry.
- Launch bounded checks on MCP startup and daily thereafter without delaying ordinary agent tasks; preserve manually disabled routes, reject stale auto-discovered providers, and record only non-sensitive local metadata.
- Add `auto-add` CLI and `guest_expand` (full MCP profile) while keeping the personal agent profile to three tools.
- Support schema-driven `message`, `prompt`, `text`, `query` and standard `messages` array Gradio calls, with only declared safe optional parameters.
- No CAPTCHA bypass, automated account creation, hidden endpoints, website terms circumvention, paid provider fallback or anonymous inference guarantees.
- Retain the five existing agent installers and all three bundled no-key API providers.


## 0.5.0 — permission-gated browser routes (2026-11-23)
- Added configurable real Chromium UI chat routes with CSS editor, send, reply selectors and verified new-response detection.
- `browser-add` CLI requires user-reviewed permission evidence, explicit approval, and conservative quota controls; rejects duplicate IDs and saves private backups.
- Hard-blocked automated browser routes for Duck.ai, Qwen Chat, Z.ai, Gemini and TryingOpen. No arbitrary auto-admission from discovered websites.
- Added support for the officially exposed API of one browser-hosted Gradio Chat Space. Experimental provider is disabled because real ZeroGPU reply ended in an error; partial generations never count as successful.
- Prevented selection of browser-based single-turn routes for requests containing system prompts or chat history.
- Added offline Gradio SSE, safety, CLI, and real-Chromium UI tests. Original three free API routes and five agent installers are unchanged.


## 0.4.0 — native five-agent installation (2026-11-23)
- New `node setup-agents.cjs codex|hermes|pi|antigravity|all [--dry-run]` for stable user-scope personal MCP registration.
- Codex, Hermes and Pi use native MCP CLI commands; Antigravity merges its global JSON non-destructively with a private backup.
- Existing server-name conflicts, invalid JSON, symlink config and symlink app directories are refused.
- Legacy `node src/cli.cjs install` delegates to stable installers. Claude personal installer continues to work.
- Added mocked-agent regression tests for install, refusal, dry-run and idempotence; no production agent settings changed by packaging tests.
- No changes to anonymous API permissions, model inference, quota policy, or tool-call capability.


## 0.3.0 — automatic discovery, routing and anonymous chat without provider setup

- Added audited anonymous free API adapters for Kilo Gateway `kilo-auto/free` and Vireonix `auto` alongside JarvisClaw `auto/free`.
- Added automatic inclusion of newly audited built-in providers for older user policies **in memory**, preserving existing configuration without interactive migration.
- Added stateless multi-turn text chat (`history`) and optional `system_prompt`.
- Added `guest_catalog` (official public API model and quota discovery) and `guest_scan` (bounded read-only guest website reconnaissance). Unknown websites are not silently treated as authorized APIs.
- Added optional text-only OpenAI-compatible local proxy, strict `guest-auto` model allowlist and generated loopback bearer token.
- Added `install codex` and `install claude` one-shot MCP registration commands.
- Expanded offline tests to 27 cases and confirmed live synthetic no-auth responses from Kilo, Vireonix and JarvisClaw on Contabo VPS.
- Privacy/limits: prompts and replies not stored; no paid models, CAPTCHA bypass, account creation or IP/quota evasion.

## 0.2.0 — first automatic provider router
- Added `guest_auto` and `guest_route_plan`, with only JarvisClaw as approved initial anonymous API.

## 0.1.0 — initial guest chat and MCP framework
- Browser inspection, approved provider policy, MCP tools, and local state.

## 0.3.1 — Personal Claude Code packaging (2026-11-22)
- New `node setup-claude.cjs`: one-command, preflighted registration of a user-scoped MCP server to a stable per-user application path; idempotent and non-destructive on existing Claude MCP registrations.
- Adds optional global `/guest-ai-bridge` Claude Code skill without overwriting existing versions.
- New reduced-context personal MCP profile advertises only `guest_auto`, `guest_providers` and `guest_usage`.
- Default `guest_auto` skips website discovery unless explicitly requested, reducing avoidable overhead.
- Added personal installer and MCP regression tests (31/31 local tests total); real Claude CLI authentication is not tested in this environment.
