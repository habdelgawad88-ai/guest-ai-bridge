# Guest AI Bridge Personal v0.7.0 — Codex, Hermes, Pi, Antigravity and Claude Code

## Requirements

- Install [Node.js](https://nodejs.org/) 18.17+ (22+ preferred).
- Your target agent must already be installed and usable. The bridge does not activate a paid plan or provide model entitlements.
- The bridge only uses documented, approved anonymous free endpoints. Providers may rate-limit or stop responding.
- The installer runs **on the same machine as the agent**. For an agent on a VPS, copy the ZIP to that VPS and run setup there; local `stdio` MCP cannot connect directly to a separate computer.

## Install (macOS, Linux, Windows terminal)

Unzip the release, open a terminal inside `guest-ai-bridge`, then run **one** of the following:

```bash
node setup-agents.cjs all --dry-run  # show exact commands/locations, no edits
node setup-agents.cjs all            # install into all 4 requested agents where available
node setup-agents.cjs codex          # or target just one agent
node setup-agents.cjs hermes
node setup-agents.cjs pi
node setup-agents.cjs antigravity
node setup-claude.cjs                # Claude Code installer from v0.3.1 remains available
```

`node src/cli.cjs install <agent>` uses the same stable installers (including `claude`).

The installer copies the bridge to `~/.guest-ai-bridge/app` and registers the **five-tool personal profile** `src/mcp-personal.cjs`: `guest_auto`, `guest_providers`, `guest_usage`, `guest_models`, `guest_select_model`. It does not change a model, API key, payment setting, active agent session, or existing unrelated MCP server. It **refuses** to overwrite a conflicting registration. Hermes uses its built-in `hermes mcp add`; Codex and Pi use their `mcp add` commands; Antigravity merges its global JSON, backing up a pre-existing file privately. If a CLI is missing or unsupported, that agent is reported as not installed instead of silently pretending it worked.

**User-scope installation:** these commands affect the current OS user. Install separately under the correct user account if agent processes run as different service users. A user-level Pi MCP entry can be overridden by a project-level `.pi/mcp.json`, and Antigravity may select a workspace-specific `.agents/mcp_config.json` entry instead of the global one.

### Verify in each agent

| Agent | Check | Remove only this integration |
|---|---|---|
| Codex CLI | `codex mcp get guest-ai-bridge --json`, or `/mcp` in Codex | `codex mcp remove guest-ai-bridge` |
| Hermes | `hermes mcp list`, `hermes mcp test guest-ai-bridge` | `hermes mcp remove guest-ai-bridge` |
| Pi | `pi mcp list --json`, or `/mcp` / `/reload` in Pi | `pi mcp remove guest-ai-bridge` |
| Antigravity | MCP Servers → Manage → View raw config, or `~/.gemini/config/mcp_config.json`; reload IDE | Remove only `mcpServers.guest-ai-bridge` in config, or restore the dated backup if no other changes occurred |
| Claude Code | `claude mcp get guest-ai-bridge`, `/mcp` | `claude mcp remove guest-ai-bridge --scope user` |

After registration, restart/reload the agent, and ask:

> Use the `guest_auto` MCP tool to suggest five edge cases for a **public synthetic** CSV parser. Do not read or share my repository. Validate the suggestions before using them.

The MCP tool returns a provider and reply on success, or a clear no-provider/error outcome. Some agents need explicit tool invocation; registering a server does **not** forcibly reroute all model calls. See [`docs/AGENT_ROUTING.md`](docs/AGENT_ROUTING.md) for optional instructions you can add to each agent's preferences/skills.

## Choose a model (new in v0.7.0)

After installing or upgrading the same stable MCP server, restart/reload your agent. Say:

> Use `guest_models` to show me the free models I can select and the locked frontier models. Let me choose before calling `guest_select_model`.

Or use your local terminal:

```bash
node src/cli.cjs models                # human-readable numbered menu
node src/cli.cjs models --frontier     # adds locked, paid frontier catalog listings
node src/cli.cjs models --json        # machine-readable menu
node src/cli.cjs use nvidia/nemotron-3.5-lightning:free  # only if live catalog shows it free
node src/cli.cjs selected              # show selected choice
node src/cli.cjs plan 'Write a public toy parser function' --no-web
node src/cli.cjs use auto              # restores normal automatic fallback
```

A specific choice is strict: if the upstream model is rate limited, unavailable, or unexpectedly returns a different model, the call fails and does **not** silently switch to another model. All free model selections are checked against Kilo's official no-key free catalog and remain subject to IP and rate limits. The original auto routing aliases and verified public Gradio demos can also be selected, but an auto alias is **not** a guarantee of one named underlying model. Locked paid GPT, Claude, Gemini and other model listings are informational; choosing them will be rejected.

**Privacy:** do not transmit private repositories, unpublished work, secrets, patient data or other confidential content to free anonymous routes. Selecting a different model does not make it private.

## Manual stdio installation

If an installed agent version lacks the expected MCP CLI, manually configure a local `stdio` server with:

```text
command: absolute path of Node.js (for example /usr/bin/node)
args: ["/absolute/home/path/.guest-ai-bridge/app/src/mcp-personal.cjs"]
```

Supported native formats and current documentation:

- Codex MCP CLI: https://learn.chatgpt.com/docs/cli/reference
- Hermes MCP CLI: https://github.com/NousResearch/hermes-agent/blob/main/website/docs/reference/cli-commands.md
- Pi MCP CLI: https://docs.pi.dev/latest/mcp
- Antigravity MCP config: https://antigravity.google/docs/ide/mcp

## Standalone test, without any coding agent

```bash
node src/cli.cjs doctor
node src/cli.cjs auto-add       # optional immediate provider discovery; also runs on MCP startup
node src/cli.cjs plan 'Generate five synthetic public Python parser tests' --no-web
node src/cli.cjs auto 'Generate five synthetic public Python parser tests' --no-web
npm test
```

Only send non-sensitive public examples. Never forward private repositories, credentials, patient records, unpublished commercial documents or confidential prompts to anonymous providers. The tool's heuristic sensitive-content filter is not a guarantee; the agent must check before sending anything. Providers can fail or rate-limit; no CAPTCHA, proxy rotation, account creation or paid inference fallback is attempted. Quota/savings claims are not guaranteed.

**Important:** MCP delegation is a side tool. It does not automatically increase Codex/Claude/Hermes/Pi/Antigravity subscription limits or remove their own model token costs. Its optional OpenAI-compatible proxy remains text-only and does not support native remote tool calling, strict structured-output contracts or genuine token-by-token streaming.

## Browser chat routes (v0.5.0)

For a site whose operator **explicitly permits automation**, use the documented `browser-add` command with selectors and policy-evidence URL; read [`docs/BROWSER_ROUTES.md`](docs/BROWSER_ROUTES.md). Browser adapter routes are disabled until admitted. The included experimental browser-hosted Gradio Space is opt-in and was **not reliably working in the last live trial**. Public sites such as Duck.ai and Qwen Chat are not eligible for scraping/automated querying under their published terms.

## Automatic browser-hosted chat providers (v0.6.0)

No manual selectors, approval flag or provider API key are needed for **public Hugging Face Gradio text-chat Spaces with officially exposed APIs**. The MCP server scans on startup, then at most once per 24 hours, in a bounded background job. Results persist locally under `~/.guest-ai-bridge/providers.json`. A candidate is admitted only if it is public, currently running, exposes a compatible text-chat endpoint in its machine-readable OpenAPI, and provides a **completed** correct synthetic reply. Otherwise it is skipped. Known prohibited browser UIs remain blocked.

To run a bounded scan immediately, check results or turn it off:

```bash
node src/cli.cjs auto-add
node src/cli.cjs providers
GUEST_BRIDGE_AUTO_ADD=0 node src/mcp-personal.cjs  # disables background checks for this process
```

To force a new scan after reviewing the upstream's quotas, run `node src/cli.cjs auto-add --force`. This can expend a limited amount of provider free quota; repeated force runs are not recommended. The personal MCP profile now exposes five tools; the full `src/mcp.cjs` exposes `guest_expand`.

**Limitations:** Real browser-click automation on arbitrary chat websites still requires documented owner permission, compatible selectors and robots compliance. A public webpage alone cannot establish permission. Auto-admitted Gradio chat routes are single-turn and intended for non-sensitive public text only; individual Space runtime, limits and model availability may change. The tool does not access private repositories, secrets or confidential records unless the agent sends them—do not authorize that transfer.
