# Browser chat routes — Guest AI Bridge v0.5.0

**What changed:** Guest AI Bridge now supports two *distinct* ways to connect a web-based chat application, in addition to the three existing anonymous APIs.

1. `transport: browser` — a **real headless Chromium UI** adapter that uses explicit CSS selectors to find the editor, send button and assistant reply. It waits for *new* assistant DOM text, not just any page content. Each site needs affirmative operator permission for automated use, a public HTTPS URL, a working Chromium installation, and a reviewed local provider profile. The bridge enforces local request caps, robots policy, DNS/IP restrictions, same-origin navigation, and stops at verification/login/captcha prompts.
2. `transport: gradio_space` — a **documented API endpoint of a browser-hosted Hugging Face Gradio chat Space**. This is *not* a headless UI interaction; Hugging Face documents programmatic Space APIs. One experimental chat profile is included but **disabled** because a live test ended with a ZeroGPU worker error despite streaming partial text. It is not counted as reliable/free capacity.

## Ready out of the box

The existing `jarvisclaw-free`, `kilo-free`, and `vireonix-free` API routes remain available without an account. **No arbitrary third-party browser-chat website is enabled by default.** Browser routes are only eligible after documented authorization and selector testing; site discoverability never substitutes for permission.

## Add a permitted browser-chat website

Use this only when the website owner **explicitly permits automated chat** at the URL you provide (e.g., a web chat you administer with public HTTPS). Inspect the site manually and determine actual CSS selectors first. The following is **a template, not a real provider**:

```bash
node src/cli.cjs browser-add \
  --id my-permitted-chat \
  --url https://chat.example.org/ \
  --permission-url https://chat.example.org/automation-policy \
  --editor '#message-input' \
  --send 'button[type="submit"]' \
  --reply '[data-role="assistant"]' \
  --approve
```

The `--approve` flag records **your assertion** that you obtained and reviewed affirmative permission; the program cannot independently establish legal permission from an arbitrary URL. Missing, incorrect or undocumented permission should be treated as **not approved**. The command refuses a preexisting ID, safely merges the policy in `~/.guest-ai-bridge/providers.json`, creates a private backup when applicable, and sets conservative caps (3 requests/day, at least 120 seconds between attempts). The HTTPS URL must resolve publicly, not to localhost or a private network address. Custom service operators can publish a publicly accessible endpoint for isolated testing.

Verify without sending any prompt:

```bash
node src/cli.cjs providers
node src/cli.cjs inspect https://chat.example.org/
node src/cli.cjs plan 'Summarize this public description' --no-web
```

Once a *real* approved, working route exists, test with an innocuous public text prompt:

```bash
node src/cli.cjs ask my-permitted-chat 'What is 117 plus 104?'
```

You may also call `guest_auto` from Codex, Hermes, Pi, Antigravity or Claude Code. Router rankings favor known APIs; a browser UI is a fallback when eligible. `guest_ask` can force a specific approved route. Browser UI routes support **single-turn only**; history/system prompt is rejected, not silently discarded.

## Experimental Gradio Space example

A verified public Space was inspected at https://huggingface.co/spaces/steliotel/qwen3-8-27b-chat . Its documented browser-application API is `POST /gradio_api/call/v2/generate` followed by the queued SSE result endpoint. The built-in profile `hf-qwen38-browser-chat-experimental` is **disabled by default**. In a Nov 23, 2026 synthetic live check it returned a *generating* event with `221` and then an **error** event; the bridge correctly does not treat this as a successful answer. ZeroGPU quotas and availability are subject to change. It can be enabled for experimental personal use **only after verifying the individual Space's permissions, availability, and terms**, by editing the private provider policy created with `node src/cli.cjs init` (set the specific `enabled` flag to `true`). No third-party model is guaranteed to work.

## Known exclusions

- Duck.ai: its Terms prohibit automated querying: https://duckduckgo.com/duckai/privacy-terms .
- Qwen Chat: its Terms prohibit automated interaction/extraction: https://qwen.ai/termsservice .
- Z.ai Chat: its Terms constrain unauthorized automated access and third-party tools: https://chat.z.ai/legal-agreement/terms-of-service .
- Gemini guest and TryingOpen browser routes are blocked in the bundled policy; do not use browser scraping as a substitute for their supported APIs.

The runtime hard-blocks these browser UI hosts even if a local provider object tries to mark them enabled. This is not a route to CAPTCHA solving, automated account signup, traffic rotation, hidden APIs, free-trial abuse or noncompliant scraping.

## Security limits

Site DOM and model replies are untrusted. Never send passwords, tokens, private repositories, patient records, real financial data or proprietary prompts to a guest route. The client-side sensitive text heuristic is incomplete and cannot establish confidentiality. Browser DOM layouts change and the agent's owning provider may still use its own tokens to invoke the MCP tool; savings are not guaranteed. The Chromium adapter is intended for sites with clear authorization and explicit reply elements, not a blind crawler that automatically presses Send on search results.

## v0.6.0 — automatic admission of public browser-hosted chat applications

The new `node src/cli.cjs auto-add` command and MCP startup routine discover running public Hugging Face **Gradio** text-chat Spaces through the official Hub listing. For each bounded candidate, the bridge retrieves its public OpenAPI spec and, for a supported single-turn input, sends one anonymous synthetic arithmetic prompt. An app is automatically enrolled only on a **completed, correct response**. Browser-hosted Gradio execution uses the official Space API rather than clicking its web UI. Existing manual Chromium routes are unchanged. No other third-party guest chat site is granted automation permission from discoverability alone.

Default: at most 15 candidate inspections and 2 synthetic Space calls per 24-hour scan. Probes may consume free quota and a model can still fail after admission. Per-route local daily quotas and cooldowns remain enforced, and routes more than 7 days out of verification are ineligible. User-disabled routes stay disabled. This process runs during MCP sessions without additional agent tool calls; set `GUEST_BRIDGE_AUTO_ADD=0` to turn it off. See main README for CLI commands.
