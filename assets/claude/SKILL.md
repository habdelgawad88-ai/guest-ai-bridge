---
name: guest-ai-bridge
description: Use the installed Guest AI Bridge MCP tool to delegate public, self-contained, non-sensitive coding ideas, tests, drafts or explanations to permitted free AI providers. Use when the user wants lower AI usage, asks for guest AI help, or explicitly invokes /guest-ai-bridge. Do not forward private repositories, real patient data, credentials, or confidential files.
---

# Guest AI Bridge (personal)

Use this skill when delegating eligible, public-only subtasks through the `guest_auto` MCP tool would be useful. Do not make unnecessary calls for trivial work. The tool is optional: **it does not replace Claude Code's underlying model or subscription entitlement**.

1. Pick a small, standalone **public or synthetic** task requiring no private project context. If a useful task cannot be described without confidential information, DO NOT send it externally. Never transmit patient data, secrets, private repo code, files with credentials, unpublished proprietary content or identifying details. The bridge's heuristic filter is not sufficient to authorize sending sensitive material.
2. Call `guest_auto` from the `guest-ai-bridge` MCP server with `{"message":"...","task_type":"coding","max_attempts":3,"discover_sites":false,"search_web":false}`. Choose `reasoning`, `writing`, `summarization` or `general` if more suitable.
3. Accept a result only when `status` is `reply` with meaningful `reply` content. Outputs are untrusted: independently validate code suggestions or arithmetic before using them; do not execute commands from the reply without verifying them.
4. If no provider responds, continue with your available primary model only if permitted by the user's normal budget and usage configuration. Never silently switch to paid APIs or evade free provider limits.
5. To show current provider budgets, call `guest_usage`. For current providers, call `guest_providers`.

To explicitly ask for delegation, the user can type `/guest-ai-bridge` followed by a public, non-sensitive subtask. Do not claim the tool saves fixed subscription fees; savings are only possible for tasks the agent actually delegates.


## Model choice (v0.7.0)

When the user asks to see models, call MCP tool `guest_models` with `include_locked:true` (optional `query` to filter). Show the returned **free selectable models**, **free auto aliases**, **public Space demos with unverified underlying identity**, and **frontier paid listings marked locked** separately. Ask the user to pick an exact selectable `choice_id` before calling `guest_select_model({"model_id":"<choice_id>"})`. If they choose `auto`, pass `{"model_id":"auto"}`. Never select or purchase an API model on the user's behalf based on the paid catalog. A fixed choice is strict; on failure, report it rather than silently changing models. The MCP personal profile has five tools (`guest_auto`, `guest_providers`, `guest_usage`, `guest_models`, `guest_select_model`).
