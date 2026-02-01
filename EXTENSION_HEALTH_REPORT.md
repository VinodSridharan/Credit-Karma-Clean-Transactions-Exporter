# TxVault Extension Health Report

**Version:** 4.3.0  
**Last Updated:** 2026-01-31

---

## Account Safety Review

TxVault operates entirely within the user’s browser and does not transmit data to external servers. The extension:

- **Local-only processing** – All transaction data stays in the user’s browser
- **No external servers** – Zero data transmission to third parties
- **No account credentials stored** – The extension never stores or accesses Credit Karma login credentials; users log in via Credit Karma’s normal login flow
- **DOM-only access** – Reads visible transaction data from the Credit Karma page the user has already loaded

Guards and safety caps further reduce risk:

- **Login/logout guards** – Extraction is gated by URL and logged-in state checks
- **Pacing and limits** – Scroll caps and delays reduce the chance of triggering site security measures
- **Auto-export on logout** – If the session ends, captured data is exported before it is lost

---

## Automated Testing

TxVault v4.3.0 includes a Jest test suite for core logic:

| Metric | Value |
|--------|-------|
| Test Suites | 4 |
| Tests | 29 |
| Focus Areas | Guards, safety caps, messaging, data handling |

### How to Run

```bash
npm install
npm test
```

Tests cover:

- **Guards** – `isCreditKarmaTransactionsUrl`, `appearsLoggedIn`, `appearsLoggedOut`, `canRunExtraction`, `shouldAbortAndExport`
- **Safety caps** – `withinScrollCap`, `hitScrollCap`, `getPacingDelay`, `withinTransactionCap`
- **Messaging** – `sendMessageWithLastErrorCheck`, `getLastErrorMessage`, `isContextInvalidatedError`
- **Data handling** – `transactionKey`, `deduplicateTransactions`, `filterValidDates`, `toCSV`, RFC 4180 escaping

See [ANNEX-TxVault-Exporter-Technical-Documentation-v4.3.0.md](./ANNEX-TxVault-Exporter-Technical-Documentation-v4.3.0.md) for details.

---

## Repository & Documentation Status (v4.3.0)

| Document | Status |
|----------|--------|
| README.md | Updated to v4.3.0, links to Annex |
| ANNEX-TxVault-Exporter-Technical-Documentation-v4.3.0.md | Technical annex added |
| DOCS_STATUS.md | Repository and documentation index |
| EXTENSION_HEALTH_REPORT.md | This report |

---

## Git Organization Recommendations

1. **Branch strategy** – Keep `main` stable; use feature branches for changes.
2. **Commit messages** – Use conventional prefixes (e.g. `test:`, `docs:`, `fix:`) for clarity.
3. **Docs and tests** – Commit documentation and test updates together with related code changes.
4. **Version tagging** – Tag releases (e.g. `v4.3.0`) for traceability.

---

## References

- [README.md](./README.md)
- [ANNEX-TxVault-Exporter-Technical-Documentation-v4.3.0.md](./ANNEX-TxVault-Exporter-Technical-Documentation-v4.3.0.md)
- [DOCS_STATUS.md](./DOCS_STATUS.md)
