# Security Policy

## Trust boundary

Guest AI Bridge forwards selected task text to third-party free providers, including public web-hosted apps. Treat every provider as an **untrusted external recipient** and every returned answer as **untrusted content**.

Do **not** submit private source repositories, credentials, proprietary documents, patient information, financial records, internal prompts, or other sensitive data. The built-in heuristic filter is **not** a data-loss-prevention guarantee; the user and calling agent must enforce their own classification and review policy.

The loopback HTTP/proxy features are experimental and not certified for public internet exposure. They are not authenticated, hardened production APIs unless their own documentation explicitly says so. Do not expose local ports publicly.

## Provider boundaries

- Paid frontier models are catalog-only and **locked** in the free-only build.
- Anonymous free services have independent quotas and may change availability or terms without notice.
- Automatic Hugging Face Gradio admission uses documented public endpoints and a bounded synthetic probe. Successful admission is not proof of the provider's identity, model quality, privacy or uptime.
- No CAPTCHA solving, proxy rotation, credential harvesting, or circumvention of provider restrictions is supported.

## Reporting a vulnerability

Do not put exploit secrets, real credentials, or private data in public GitHub issues. Where the repository enables GitHub private vulnerability reporting, use that channel. Otherwise report a high-level issue requesting a private disclosure channel without revealing sensitive details.

## Supported version

The current published source release is **v0.7.0**. Review updates carefully before installing into a trusted development environment.
