# Guest AI Bridge v0.7.0 — choose verified free models or automatic routing

> **Public developer preview — v0.7.0.** A local, free-only MCP delegation utility for **non-sensitive text tasks**. No signup is required for supported anonymous provider routes, but upstream availability and rate limits vary. It does **not** increase Claude or Codex subscription limits, provide unlimited frontier-model access, or guarantee free inference.

### Install from GitHub

```bash
git clone https://github.com/habdelgawad88-ai/guest-ai-bridge.git
cd guest-ai-bridge
node --version       # Node >= 18.17
npm test             # offline regression tests
node src/cli.cjs doctor
node setup-agents.cjs all --dry-run    # inspect proposed changes before installing
node setup-agents.cjs all              # Codex, Hermes, Pi, Antigravity when available
node setup-claude.cjs                  # optional Claude Code integration
```

Run `node src/cli.cjs models` to list selectable free models or `node src/cli.cjs models --frontier` to see additional **locked** catalog entries. See [INSTALL.md](INSTALL.md), [model choices](docs/MODEL_CHOICES.md), and [developer review](docs/DEVELOPER_REVIEW.md) for details. This package is distributed as source and does **not** install paid model APIs.

---

## New in v0.7.0 — see and choose your model

Guest AI Bridge can now list **specific, officially catalogued, anonymously eligible free models** and let you choose which one your Codex, Hermes, Pi, Antigravity or Claude Code MCP tool uses. It also displays **frontier proprietary models listed by a provider** with a prominent **LOCKED** flag: catalog visibility does not imply free access or permission to call these models.

```bash
node src/cli.cjs models                  # numbered selectable list (no user prompt sent)
node src/cli.cjs models --frontier       # also show locked GPT / Claude / Gemini etc.
node src/cli.cjs models --json           # machine-readable status and model IDs
node src/cli.cjs use nvidia/nemotron-3.5-lightning:free
node src/cli.cjs selected                # see global preference
node src/cli.cjs auto 'What is 117+104?' # uses exact selection or returns an explicit failure
node src/cli.cjs use auto                # revert to original free-provider fallback
```

The MCP tools `guest_models` and `guest_select_model` expose the same flow directly inside all five supported agents, including the slim personal MCP profile. `guest_auto` also accepts an optional `model_id` for an individual call. If a **specific** model is selected, the bridge refuses to silently use a different model, and only the Kilo API can receive a concrete, officially verified `:free` model ID. Vireonix and JarvisClaw still provide **automatic aliases** whose underlying model cannot be selected through the anonymous route; public Hugging Face demo names are self-declared and not independently verified. The Kilo model catalog is refreshed at most hourly and selection fails closed when verification is unavailable.

An anonymous, keyless live probe on 2026-11-23 returned HTTP 200, a matching model identifier, and the answer `221` when requesting `nvidia/nemotron-3.5-lightning:free`. This is a single protocol smoke check, not an uptime or model-quality benchmark. Named paid frontier models cannot be invoked by this free-only package.

**Official access documentation:** https://kilo.ai/docs/gateway/models-and-providers and https://kilo.ai/docs/gateway/authentication .

---

## New in v0.6.0 — no manual provider entry required for public Gradio chats

When an installed **MCP server starts**, Guest AI Bridge performs a bounded background search for public Hugging Face Gradio text-chat Spaces. It uses Hugging Face's official public listing and each Space's published `/gradio_api/openapi.json` specification, checks the Space is running and requires no login, then sends **one harmless synthetic test** to a compatible, documented chat endpoint. A route is automatically enabled **only if the final completed reply passes the test**. Partial streams, errors, rate limits, auth blocks, and incompatible input formats do not qualify. Admission never requires copying selectors or an API key.

The check runs **at most once every 24 hours per local installation**, on MCP startup and while the MCP process stays running, with a small inspection/probe budget. Already registered and recently verified routes are skipped to discover other candidates; a manually disabled provider remains disabled. Automatically admitted routes expire after 7 days without successful re-verification. Provider probes consume the upstream's own free quota; the bridge limits regular calls separately.

```bash
node setup-agents.cjs all          # installs for available Codex, Hermes, Pi, Antigravity
node setup-claude.cjs              # Claude Code remains supported
node src/cli.cjs auto-add          # optional immediate discovery and admission
node src/cli.cjs providers         # see verified auto-added routes
```

The **personal agent MCP profile now exposes five tools** (`guest_auto`, `guest_providers`, `guest_usage`, `guest_models`, `guest_select_model`) to avoid unnecessary host-model context. The full MCP profile also exposes `guest_expand` for an on-demand scan; use `node src/cli.cjs auto-add --force` to override the once-daily discovery cache manually. Set `GUEST_BRIDGE_AUTO_ADD=0` to disable startup discovery if you do not want automated outside requests.

This is **not** blanket permission to automate unrelated web chatbots. Duck.ai, Qwen Chat and other prohibited or restricted browser UIs stay blocked; unknown browser websites are never enrolled from HTML alone. The auto-enrolled routes invoke the **official API of a browser-hosted Gradio application**, not hidden session endpoints or a CAPTCHA-bypassing browser script. Site owners control their apps and may impose additional limits or terms, and even a successful synthetic probe is not an SLA or a guarantee of model quality.

A single independent live endpoint probe on **2026-11-23** reached a completed `221` reply from the public Space `Shadowjoker369/my-ai-chat` (using its declared `/chat` API); other Spaces checked failed or required different inputs. This is evidence that the protocol can work, **not** an assertion that the newly packaged auto-admission algorithm was run end-to-end against the live service or that this Space will remain available.

Official programmatic API documentation: https://huggingface.co/docs/hub/spaces-api-endpoints and https://gradio.app/guides/view-api-page .

---

This release extends the v0.4.0 multi-agent package without replacing its inference engine. Install the same small personal MCP server into **Codex, Hermes, Pi, or Antigravity** with `node setup-agents.cjs <name>` (or `all`); Claude Code remains available through `node setup-claude.cjs`. `--dry-run` shows what would happen without modifying agent settings. Installers use a stable path in `~/.guest-ai-bridge/app`, preserve unrelated settings, and reject conflicting server registrations. For steps, tests and removal commands, see [INSTALL.md](INSTALL.md).

```bash
node setup-agents.cjs all --dry-run
node setup-agents.cjs all
```

This is a **tool delegation** integration. It does not transparently replace any agent's underlying model, grant access to paid model subscriptions, or guarantee quota savings. Only public, synthetic, non-sensitive prompts are suitable for anonymous providers.

**One MCP tool. No provider selection, account, API key, CAPTCHA, or confirmation required to use its *supported anonymous APIs*.**

Guest AI Bridge lets an MCP-enabled coding agent delegate a public, non-sensitive text task to free AI services. The tool looks for candidate services and supported free model catalogs, automatically ranks verified providers, sends the task, reads the reply, and falls back to another provider on failure. It provides a separate guest-browser discovery/inspection layer for playground websites.

**Current execution pool (original v0.3.0):**

| Provider | Transport | Fixed free alias | Evidence |
|---|---|---|---|
| Kilo Gateway | Anonymous public chat API | `kilo-auto/free` | https://kilo.ai/docs/gateway/authentication |
| Vireonix | Anonymous public chat API | `auto` | https://vireonix.ai/docs |
| JarvisClaw | Anonymous public chat API | `auto/free` | https://jarvisclaw.ai/en/free-llm-api |

Each endpoint was checked with one synthetic arithmetic prompt from the connected Contabo VPS on 21 November 2026 and returned HTTP 200 with answer `221`. Provider availability, upstream model, privacy policies and rate limits may change. The original v0.3.0 application reported 27/27 local tests; the multi-agent v0.5.0 installer tests are described in INSTALL.md. Production deployments to existing agents must be independently verified.

### Quick start — no registration and no configuration step

Requirements: Node.js >=18.17 (22+ preferred). **Chrome is optional**, needed only for website inspection and any future authorized browser chat adapter. No runtime npm packages or model API keys required.

```bash
unzip Guest_AI_Bridge_Model_Choice_v0.7.0.zip
cd guest-ai-bridge
node src/cli.cjs doctor
node src/cli.cjs plan 'Suggest three JavaScript unit tests' --no-web
node src/cli.cjs auto 'Suggest three JavaScript unit tests'
```

`auto` sends the request; `plan` does not. Built-in official anonymous API providers are already available, including when upgrading from an older, customized `providers.json`. `init` and `migrate` are **optional**, not prerequisites.

### Add to Codex or Claude Code with one command

```bash
node setup-agents.cjs codex
node setup-claude.cjs
```

Each command registers the permanent `~/.guest-ai-bridge/app/src/mcp-personal.cjs` path using the respective installed CLI, without launching a provider login flow. If a CLI is not installed or the installed version has different commands, you receive a concrete error/command rather than a false success. For more clients, use the same stdio MCP server:

```json
{
  "mcpServers": {
    "guest-ai-bridge": {
      "command": "node",
      "args": ["/ABS/PATH/guest-ai-bridge/src/mcp.cjs"]
    }
  }
}
```

Pi, Hermes and Antigravity now have tested setup paths through `setup-agents.cjs`; see `INSTALL.md`, `examples/` and `docs/AGENT_ROUTING.md` for version-specific caveats. ChatGPT web conversations cannot automatically use your local stdio process: it requires a supported remote MCP connection (the prototype `src/http.cjs` is loopback-only and not production-certified). Connecting a tool is not equivalent to changing ChatGPT's underlying model.

### What the agent does

```json
{
  "message": "Give three edge-case tests for a public CSV parser",
  "task_type": "coding",
  "max_attempts": 3
}
```

Call MCP tool `guest_auto`. It discovers sites with **no task data in search queries**, selects an eligible free provider, sends the prompt, and returns `provider_id`, the upstream model ID where supplied, the actual text response, and an attempt log. When one provider fails or rate-limits, it tries a different eligible provider. No account creation, identity verification, CAPTCHA solving, human confirmation, proxy rotation, IP rotation, or paid upgrade will ever be attempted.

For stateless follow-up chatting, pass `history: [{"role":"user","content":"..."},{"role":"assistant","content":"..."}]` and an optional `system_prompt`. The calling agent keeps its transcript: this bridge does not save chat contents to disk. The `guest_ask` command can force an *already authorized* provider; `guest_auto` is preferred.

### Authorized browser chat routes (v0.5.0 and later)

The package can now send a prompt through an **authorized Chromium guest-chat UI** using explicit editor/send/reply CSS selectors and verify a *new* assistant response. To configure a route for a site that explicitly permits automated access, use `node src/cli.cjs browser-add` with `--permission-url`, three selectors, and `--approve`. See **[Browser Routes](docs/BROWSER_ROUTES.md)** for the command, safety restrictions and tests. It is intentionally **not** enabled for arbitrary public guest chats. Qwen Chat and Duck.ai forbid automated querying, and browser access must not be used to circumvent restrictions.

The original experimental Hugging Face Gradio chat remains **disabled** after a ZeroGPU worker error. v0.6.0 can now **automatically discover and admit other compatible, verified public Gradio text-chat Spaces**. This uses their documented API, not an undocumented endpoint. Public Space API documentation: https://huggingface.co/docs/hub/spaces-api-endpoints . No change to the three active anonymous API routes.

### Automatically search web chat websites and playgrounds

```bash
node src/cli.cjs discover 'free AI chatbot'       # links and candidates
node src/cli.cjs scan 'AI playground'              # read-only guest browser inspection
node src/cli.cjs refresh                           # official free-model API catalogs
node src/cli.cjs auto-add                          # automatically test and admit eligible public Gradio apps
```

MCP tools:

| Tool | What it does |
|---|---|
| `guest_auto` | **One-call** choose → send → receive → free-provider fallback |
| `guest_expand` | Full MCP profile only: public Gradio Space discovery, synthetic validation and automatic admission |
| `guest_route_plan` | Explain provider ranking without sending a prompt |
| `guest_discover` | Search guest-chat candidates, a 100+ site directory and optional Bing RSS |
| `guest_scan` | Auto-inspect a bounded set of guest chat websites (read-only) |
| `guest_inspect` | Inspect a specified public HTTPS URL with Chrome |
| `guest_catalog` | Query **official** public no-key model catalogs, with one-hour cache |
| `guest_providers` | Show approved free routes and disabled websites |
| `guest_usage` | Read local daily budgets and health/cooldown metrics |
| `guest_ask` | Call one approved provider by ID |

**Critical distinction:** a website that opens without registration is not automatically an authorized bot API. Public Gradio API endpoints are auto-admitted only after machine-readable public API verification and a successful completed response. Browser inspection only assesses UI availability; it does **not** send prompts to unknown sites. Sites requiring human verification or disallowing automated chat are skipped. New API adapters require documented authorization and a strict transport allowlist. This is deliberate: the bridge can operate without prompts or confirmation, but it cannot legitimately guarantee anonymous access to every arbitrary website.

### Optional drop-in OpenAI-compatible local model gateway

For an agent supporting a custom OpenAI-compatible base URL, start:

```bash
node src/cli.cjs proxy-config
node src/proxy.cjs
```

The proxy binds only to `http://127.0.0.1:8843/v1` and advertises model **`guest-auto`**. A random **local-only** access token is created automatically in `~/.guest-ai-bridge/proxy-token` (file mode `0600`), unless `GUEST_BRIDGE_PROXY_TOKEN` is set. This is **not a remote provider credential** and requires no signup. Configure your client's API key to this token and base URL to the loopback address; the agent then uses the bridge's free routing as its model for supported text-only calls. Streaming clients get a buffered SSE completion, not token-by-token streaming. Remote tool calling/multimodal/structured output are not supported by this MVP proxy and fail explicitly instead of silently falling back to paid models.

**Important:** this does not directly increase Codex/Claude/ChatGPT subscription limits or automatically replace the provider inside a hosted ChatGPT conversation. MCP delegation reduces some paid model generation, while invoking an MCP tool still costs host-model context. A client can actually replace more calls when it supports a custom inference base URL.

### Routing and quotas

- Provider choice is deterministic and uses task category, declared capabilities, local success/failure statistics, measured latency, provider priority, local daily budget, and cooldown.
- Known audited no-key APIs are supported immediately without manual admission.
- Kilo uses free-only `kilo-auto/free` (officially published anonymous free-model limit: **200 calls/hour/IP**); Jarvis uses only `auto/free`; Vireonix uses the documented free `auto` model with hourly per-IP token quotas.
- Built-in **local conservative** caps and spacing are intentionally stricter than some upstream quotas. An HTTP 429, 401, 403 or 402 is treated as failure, not as a prompt to subscribe or evade a limit.
- Catalog reads from officially documented public model/limit endpoints; any discovered unknown URL cannot become a raw HTTP inference target.
- Only public text tasks are suitable. `research` tasks requiring citations need a separate trusted retrieval tool.

### Security and limitations

Guest responses and websites are untrusted. Never send private code, unpublished project details, API keys, credentials, real patient data, PHI, financial records or proprietary documents. Privacy policies differ: Vireonix states that prompts/traces may be retained for training or service improvement, and Kilo's Auto Free may route to upstream models that log prompts. The sensitive-content filter is heuristic, **not a privacy guarantee**. Local quota and latency metrics are saved, but **not prompts or replies**. Network use still reveals your public IP to providers and discovery sources.

Use this for low-risk delegation, synthetic testing, public code examples and alternative draft generation—not medical decision-making or clinical documentation containing real patient data. No automatic CAPTCHA/verification evasion, user-account creation, or paid API fallback is included.

### Testing

```bash
npm test                         # 27 network-independent tests
node src/cli.cjs doctor
node src/cli.cjs providers
node src/cli.cjs plan 'Explain this function' --no-web
```

Local tests validate API allowlists, real MCP stdio, mock anonymous requests for 3 services, multi-turn messages, quota and fallback, browser fixture automation, local proxy bearer authentication, origin safety and discovery. A distinct **live synthetic** test was run against Kilo, Vireonix and JarvisClaw via VPS; current functionality remains dependent on external provider availability.

Files: `src/auto-add.cjs` (automatic safe admission), `src/mcp.cjs` (MCP stdio), `src/router.cjs` (selection), `src/api.cjs` (anonymous API), `src/catalog.cjs` (public official catalogs), `src/browser.cjs` (Chrome UI), `src/proxy.cjs` (optional text-only gateway), `config/providers.example.json` (audited supported providers).
