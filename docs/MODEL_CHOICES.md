# Guest AI Bridge — model catalog & explicit selection (v0.7.0)

The app lists four distinct classes of route:

1. **Specific free Kilo models** — exact IDs from Kilo's live public `GET /api/v1/models` catalog. A model is selectable only if its official metadata says `isFree: true`, both input/output token prices are zero, the ID ends in `:free`, and text input/output are declared. The actual call is made to Kilo with *that exact model ID*, and an answer is accepted only when the response reports the same model ID. Availability is still not guaranteed; per-IP, provider and model-level limits apply.
2. **Anonymous free auto aliases** — Kilo `kilo-auto/free`, JarvisClaw `auto/free`, and Vireonix `auto`. The upstream chooses the actual model; it may change between requests. Choosing an alias pins the provider, not a named underlying model.
3. **Public, prequalified Hugging Face demos** — eligible auto-admitted Gradio Space routes. The Space operator's title is **not independent proof** of the underlying model. These are often unstable; they never receive confidential data and do not promise latency, quality or uptime.
4. **Frontier model catalog listings (LOCKED)** — names such as GPT, Claude, and Gemini that appear in Kilo's public `/models` list but are *paid or require credentials*. They are shown for comparison only and **cannot be selected** by this free-only bridge. Zero prices without an eligible free tag are insufficient proof of anonymous permission.

## CLI

```bash
node src/cli.cjs models                # numbered free/auto/demo list
node src/cli.cjs models --frontier     # also show locked frontier names
node src/cli.cjs models --json        # machine-readable
node src/cli.cjs models --refresh     # fetch the official catalog now
node src/cli.cjs use nvidia/nemotron-3.5-lightning:free  # only if listed as selectable
node src/cli.cjs selected
node src/cli.cjs plan 'Explain a public toy sorting algorithm' --no-web
node src/cli.cjs auto 'Explain a public toy sorting algorithm' --no-web
node src/cli.cjs use auto              # restore the normal free-provider fallback
node src/cli.cjs auto 'Public math prompt' --model kilo-auto/free  # one-call override
```

`use` persists the preference to `~/.guest-ai-bridge/selected-model.json` (mode `0600`), or `GUEST_BRIDGE_STATE_DIR/selected-model.json` if the state directory is customized. The preference is shared by all local agents that run as the **same operating-system user** against the same bridge state directory. A single-call `model_id` override does not change the saved choice.

## MCP use in Codex / Hermes / Pi / Antigravity / Claude Code

After installing the bridge and restarting the agent, ask it to call **`guest_models`** and show `choice_id` values. After you decide, it may call **`guest_select_model`** with that exact `model_id`. Subsequent **`guest_auto`** calls respect the choice. Use `guest_select_model({"model_id":"auto"})` to restore automatic fallback.

The reduced personal profile exposes five tools: `guest_auto`, `guest_providers`, `guest_usage`, `guest_models`, `guest_select_model`. The full profile additionally includes explicit provider calls and discovery controls.

## Safety, access, and reliability

- All catalog requests use official HTTPS endpoints and no API credentials. The Kilo model allowlist is refreshed at most hourly unless requested; a stale or unavailable catalog cannot authorize a named model. Provider quotas are still enforced.
- A fixed choice **never silently falls back** to another model. If unavailable, rate-limited or answered by a different/unverified model, the bridge reports failure. To restore automatic fallback, choose `auto`.
- This is *not* an account bypass: named paid frontier models remain locked. The package does not add provider API keys, create accounts, override rate limits, rotate IPs or solve CAPTCHAs.
- Never forward private source code, credentials, financial records, PHI, real patient data, proprietary documents or confidential prompts to anonymous services. A model-selection setting is not a privacy authorization.
- The bridge is an MCP delegation tool. It does not change the underlying Claude/Codex subscription tier or guarantee savings.

Official docs: https://kilo.ai/docs/gateway/models-and-providers ; https://kilo.ai/docs/gateway/authentication ; https://jarvisclaw.ai/en/free-llm-api ; https://vireonix.ai/docs ; https://huggingface.co/docs/hub/spaces-api-endpoints .
