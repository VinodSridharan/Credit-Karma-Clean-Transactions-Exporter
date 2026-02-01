# TxVault Exporter – Technical Annex v4.3.0

**Version:** 4.3.0  
**Status:** Production Ready  
**Last Updated:** 2026-01-31

This annex supplements the main [README.md](./README.md) with technical details for TxVault v4.3.0, including automated testing, guards, safety caps, messaging, and data handling.

---

## Automated Testing

TxVault v4.3.0 includes a Jest test suite for core logic used by the extension:

- **`npm test`** – Runs the full suite (4 suites, ~29 tests)
- **Location:** `tests/` directory
- **Coverage:** Guards, safety caps, messaging (`lastError` handling), data handling

### Test Suites

| Suite | File | Focus |
|-------|------|--------|
| Guards | `tests/guards.test.js` | Login/logout guards, URL checks, extraction gating |
| Safety Caps | `tests/safety-caps.test.js` | Pacing, scroll limits, transaction caps |
| Messaging | `tests/messaging.test.js` | `chrome.runtime.lastError` handling, context invalidation |
| Data Handling | `tests/data-handling.test.js` | Deduplication, CSV export, date validation |

### Library Modules

Pure, testable logic lives in `lib/`:

- `lib/guards.js` – `isCreditKarmaTransactionsUrl`, `appearsLoggedIn`, `canRunExtraction`, `shouldAbortAndExport`
- `lib/safety-caps.js` – `withinScrollCap`, `hitScrollCap`, `getPacingDelay`, `withinTransactionCap`
- `lib/messaging.js` – `sendMessageWithLastErrorCheck`, `getLastErrorMessage`, `isContextInvalidatedError`
- `lib/data-handling.js` – `transactionKey`, `deduplicateTransactions`, `filterValidDates`, `toCSV`

---

## Guards

Guards prevent extraction when the user is not on Credit Karma or when a logout is detected.

- **`isCreditKarmaTransactionsUrl(url)`** – Returns true only for `creditkarma.com` URLs containing `/transactions`
- **`appearsLoggedIn(state)`** – True when transaction list is present and login form is not
- **`appearsLoggedOut(state)`** – True when login form present or no transaction list
- **`canRunExtraction(url, state)`** – Combined guard: CK transactions URL + logged in
- **`shouldAbortAndExport(state)`** – True when logout detected (trigger auto-export of partial data)

---

## Safety Caps

Safety caps enforce pacing and limits to avoid triggering Credit Karma’s security or overloading the DOM.

- **`withinScrollCap(current, max)`** – Scroll count within cap (default max 500)
- **`hitScrollCap(current, max)`** – Scroll count at or above cap
- **`getPacingDelay(baseMs, minMs)`** – Pacing delay between scroll actions (min 800 ms)
- **`withinTransactionCap(count, max)`** – Transaction count within export cap (default 50,000)

---

## Messaging

Messaging wrappers handle `chrome.runtime.lastError` consistently:

- **`sendMessageWithLastErrorCheck(chromeApi, action, payload)`** – Sends message and rejects on `lastError`
- **`getLastErrorMessage(chromeApi)`** – Returns `lastError.message` or null
- **`isContextInvalidatedError(err)`** – Detects “Extension context invalidated”, “Receiving end does not exist”, “Could not establish connection”

---

## Data Handling

- **`transactionKey(tx)`** – Composite key for deduplication (date|description|amount|type|status)
- **`deduplicateTransactions(transactions)`** – Removes duplicates by composite key
- **`isPendingOrInvalidDate(dateStr)`** – Identifies “Pending” or invalid date strings
- **`filterValidDates(transactions, dateField)`** – Filters out pending/invalid dates
- **`escapeCSVValue(val)`** – RFC 4180 CSV escaping
- **`toCSV(transactions, columns)`** – Builds RFC 4180 compliant CSV

---

## Running Tests

```bash
npm install
npm test
```

Expected output: 29 tests, 4 suites, 0 failures.

---

## References

- [README.md](./README.md) – User-facing overview
- [EXTENSION_HEALTH_REPORT.md](./EXTENSION_HEALTH_REPORT.md) – Health and safety review
- [DOCS_STATUS.md](./DOCS_STATUS.md) – Repository and documentation status
