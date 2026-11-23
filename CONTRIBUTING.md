# Contributing to Guest AI Bridge

Developer review and reproducible fixes are welcome.

## Development setup

1. Install Node.js >=18.17 (Node.js 22+ recommended).
2. Clone this repository and run `npm test` (no package download required for the Node.js runtime paths).
3. Use public or **synthetic** text in fixtures and smoke tests. Never commit real prompts from confidential work, API keys, credentials, or patient information.
4. For a bug, include the tool/command, Node version, OS, expected behavior, actual error, and a minimal redacted reproduction.
5. When changing routing, permissions, provider selection, or installation logic, add an offline regression test. Run the full suite before opening a pull request.

## Provider admission

Only add a service when its operator publishes authorization for the proposed automated use. Respect login gates, rate limits, robots requirements and terms. Do not add CAPTCHA bypass, IP rotation, hidden API endpoints, account creation, or a paid inference fallback disguised as free access. Keep all new routes disabled until explicitly qualified. Browser page availability alone is not permission for automation.

## Scope

The bridge is intended for non-sensitive text delegation only. It is not a general-purpose remote code executor, an authorization bypass, a free unlimited frontier-model API, or a clinical information system.

Changes are offered under the repository's MIT License.
