# Guest AI Bridge v0.7.0 — Developer Review Guide

## What this is

A lightweight, local Node.js service that exposes Model Context Protocol (MCP) tools allowing an AI coding agent to delegate **public, non-sensitive text** requests to eligible no-key free inference providers. It provides provider discovery, deterministic routing, limits, local telemetry, fallback and model selection. It does **not** replace an agent's hosted core model or remove the host's subscription/token consumption.

**License:** MIT. **Runtime:** Node.js >=18.17. **Primary protocol:** stdio MCP; a localhost-only compatibility proxy is experimental.

## Architecture

```text
Claude Code / Codex / Hermes / Pi / Antigravity
                  |
           stdio MCP server
         (src/mcp-personal.cjs)
                  |
         request classification
         sensitive-text check
                  |
           selection / router
             /        \\
    free API adapters    admitted Gradio apps
      /      |     \\         (documented interfaces)
    Kilo  Vireonix  JarvisClaw
                  |
        explicit result or error
```

The caller retains the chat history. State persists locally (provider quota and health records, model preference) rather than storing prompt/reply transcripts. See `src/bridge.cjs`, `src/router.cjs`, `src/api.cjs`, `src/auto-add.cjs`, `src/gradio.cjs`, `src/model-choice.cjs`, and `src/protocol.cjs`.

## Installation

```bash
git clone https://github.com/habdelgawad88-ai/guest-ai-bridge.git
cd guest-ai-bridge
node --version
npm test
node src/cli.cjs doctor
node setup-agents.cjs all --dry-run
node setup-agents.cjs all
# optional, if Claude Code is installed and eligible:
node setup-claude.cjs
```

The installer copies its own code to `~/.guest-ai-bridge/app/`, does not replace unrelated settings, rejects conflicting MCP registrations, and registers only clients detected on that machine. Review the dry-run output before executing. For individual-client commands and troubleshooting, see [`../INSTALL.md`](../INSTALL.md).

## Minimal verification

```bash
npm test
node src/cli.cjs providers
node src/cli.cjs models
node src/cli.cjs plan 'Generate a toy CSV parser' --no-web
```

The first three commands are local or metadata-only. An actual inference call sends the provided public text to the selected upstream:

```bash
node src/cli.cjs auto 'What is 117 + 104?' --no-web
```

To select a specific verified free model:

```bash
node src/cli.cjs models --refresh
node src/cli.cjs use nvidia/nemotron-3.5-lightning:free
node src/cli.cjs selected
node src/cli.cjs use auto
```

Actual catalog IDs and access rights may change. Named paid GPT, Claude and Gemini entries are listed but cannot be invoked without a paid provider account. An auto-routing alias does not guarantee the identity of the underlying model.

## Automatic discovery

On MCP startup (unless disabled), the bridge performs bounded searches of public Hugging Face Gradio chat Spaces. Only candidates with documented compatible public endpoints and a complete, correct synthetic response are admitted. Incompatible sites, unclear permission, login/CAPTCHA gates and failed responses do not qualify. Discovery runs periodically, with local caching and quotas. Disable background checks for a process with `GUEST_BRIDGE_AUTO_ADD=0`.

For authorized HTML browser-chat websites, see [`BROWSER_ROUTES.md`](BROWSER_ROUTES.md). Websites are not authorized for automation simply because a browser can open them.

## Known limitations / review priorities

1. **Supply and reliability:** upstream free quotas, model availability and terms may change; a test pass is not an uptime guarantee.
2. **Data privacy:** provider retention/training policies vary; this bridge must not handle confidential or clinical data.
3. **Host savings:** MCP tool calls still consume host-model context; savings versus a paid baseline have not been independently quantified.
4. **Model identity:** anonymous auto routes and Space titles do not verify a specific upstream model; exact selection is supported only when a documented free catalog offers that ID.
5. **Protocol features:** the optional local proxy supports text completions but not production-grade tool calling, structured output or true token streaming.
6. **Production hardening:** no security audit, SLA, third-party dependency review, or performance benchmark is claimed.

## Reproducibility

The v0.7.0 release archive previously passed **71 offline tests** in a clean extraction on 2026-11-23. Re-run `npm test` in the checked-out commit: a local pass is not proof of a working live provider, nor that MCP authentication is available in the agent's subscription tier.

## Suggestions for a code review

- Inspect the trust boundary and sensitive-content heuristics in `src/safety.cjs` and `src/bridge.cjs`.
- Inspect the model allowlist and paid-model rejection in `src/model-choice.cjs` and `src/catalog.cjs`.
- Inspect prompt-forwarding/quotas/fallback in `src/api.cjs`, `src/router.cjs`, and `src/state.cjs`.
- Inspect automatic admission and official Gradio calls in `src/auto-add.cjs` and `src/gradio.cjs`.
- Inspect idempotency and symlink handling in `setup-agents.cjs` and `setup-claude.cjs`.
- Confirm no credentials, machine-specific settings, or locally generated state enter the repository.
