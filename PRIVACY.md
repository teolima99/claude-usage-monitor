# Privacy Policy — Claude Usage Monitor

**Last updated: 2026-03-25**

## Summary

Claude Usage Monitor does not collect, transmit, or share any personal data. Everything stays on your device.

## Data collected

None. The extension does not collect, store, or transmit any personal information to any external server.

## Data stored locally

The extension stores the following data in `chrome.storage.local` (your browser's local storage, never synced or transmitted):

- **Usage data** — session and weekly utilization percentages and reset timestamps, fetched from the Claude.ai API
- **Widget visibility preference** — whether you have hidden or shown the floating widget

This data never leaves your device.

## Network requests

The extension makes requests exclusively to `https://claude.ai` — the same domain you are already logged into. Specifically:

- `https://claude.ai/api/organizations` — to resolve your organization ID
- `https://claude.ai/api/organizations/{id}/usage` — to fetch usage limits

These requests use your existing Claude.ai session cookies (`credentials: 'include'`). No credentials are stored or forwarded anywhere else.

## No third parties

The extension does not communicate with any third-party server, analytics service, crash reporter, or external API. There are no ads, no tracking, and no telemetry of any kind.

## Open source

The full source code is available at [https://github.com/teolima99/claude-usage-monitor](https://github.com/teolima99/claude-usage-monitor). You can audit every line.

## Contact

If you have questions, open an issue on the GitHub repository.
