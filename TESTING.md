# TxVault Automated Testing

**Version:** 4.3.0

## Quick Start

```bash
npm install
npm test
```

## Expected Result

- **29 tests** across **4 suites**
- **0 failures**
- Suites: guards, safety-caps, messaging, data-handling

## What Gets Tested

| Suite | File | Coverage |
|-------|------|----------|
| Guards | `tests/guards.test.js` | Login/logout guards, URL checks, extraction gating |
| Safety Caps | `tests/safety-caps.test.js` | Pacing, scroll limits, transaction caps |
| Messaging | `tests/messaging.test.js` | `chrome.runtime.lastError` handling |
| Data Handling | `tests/data-handling.test.js` | Deduplication, CSV, date validation |

## Troubleshooting

- **Jest not found:** Run `npm install` to install devDependencies.
- **Module not found:** Ensure you are in the project root and `lib/` exists with guards.js, safety-caps.js, messaging.js, data-handling.js.

See [ANNEX-TxVault-Exporter-Technical-Documentation-v4.3.0.md](./ANNEX-TxVault-Exporter-Technical-Documentation-v4.3.0.md) for technical details.
