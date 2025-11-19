# Changelog - Credit Karma Transaction Exporter

All notable changes to this extension will be documented in this file.

---

## Version 3.0 (2025-11-18) - Production Ready

### ✅ Major Changes

**Presets Streamlined**:
- ✅ Kept only verified working presets: This Month, Last Month, Last Year, Last 2 Years, Last 3 Years
- ✅ Removed unverified presets: Last 2 Months, Last 3 Months, This Year
- ✅ All presets based on successful manual tests

**Verified Presets**:
- ✅ **This Month**: Nov 1-14, 2025 = 52 transactions (2m 58s) - PRISTINE
- ✅ **Last Month**: Oct 1-31, 2025 = 133 transactions (2m 35s) - PRISTINE
- ✅ **Last Year**: Jan 1 - Dec 31, 2024 = 738 transactions (~15-25m) - Working
- ✅ **Last 2 Years**: Nov 19, 2023 - Nov 18, 2025 = 2,286 transactions (18m 3s) - PRISTINE
- ✅ **Last 3 Years**: Nov 1, 2022 - Nov 18, 2025 = 2,865 transactions (22m 51s) - PRISTINE

**Maximum Working Range**: **3 years** (verified and documented)

### 🆕 Features

- ✅ Multi-format date parsing (MM/DD/YYYY, "Nov 14, 2025", "November 14, 2025")
- ✅ Enhanced deduplication (includes amount in composite key)
- ✅ CSV export in MM/DD/YYYY format
- ✅ Progress display with real-time updates
- ✅ Strict boundary capture (start AND end dates)

### 🐛 Fixes

- ✅ Fixed date parsing to handle Credit Karma's format changes
- ✅ Improved scrolling for long ranges (up to 3 years)
- ✅ Enhanced stop condition logic for better completeness
- ✅ Fixed CSV date format consistency

### 📚 Documentation

- ✅ Comprehensive README.md with only relevant information
- ✅ Complete testing records with PRISTINE status tracking
- ✅ Monthly comparison tables for all tests
- ✅ Success stories documentation
- ✅ Lean, focused documentation structure

### ⚠️ Known Limitations

- Maximum working range: 3 years (verified)
- Ranges beyond 3 years may produce incomplete results
- Recommend splitting long ranges into multiple extractions

---

## Version 3.3 (2025-11-18) - Removed (Replaced by v3.0)

**Note**: Version 3.3 had too many unverified presets. Replaced by v3.0 with lean, verified presets only.

---

## Version 3.2 (2025-11-17)

- ✅ Multi-format date parsing (MM/DD/YYYY, "Nov 14, 2025", etc.)
- ✅ Enhanced 5-year preset (60-day buffer, improved stop conditions)
- ✅ CSV date format consistency (always MM/DD/YYYY)
- ✅ Improved deduplication (includes amount in composite key)

**Note**: 5-year preset later found to exceed maximum working range (3 years).

---

## Version 3.0 - October 133 Version (2025-11-14)

**Base Version**: This version established the foundation for all future development.

### ✅ Features

- ✅ Boundary capture fixes (both start and end dates)
- ✅ Large range handling (warnings, max scroll limits)
- ✅ Progress display ("In Range" count)
- ✅ Enhanced logging and diagnostics

### 🎯 Achievement

Successfully extracted all 133 transactions from October 1-31, 2025 with 100% accuracy, proving the extension works reliably for single-month extractions.

---

## Version 3.0.1 (2025-11-18) - GitHub Publishing & Code Enhancements

### ✅ Major Changes

**Enhanced Deduplication**:
- ✅ Updated composite key to include transaction type (date + description + amount + transaction type)
- ✅ Transactions with same date/description/amount but different type (credit vs debit) are now correctly identified as NOT duplicates
- ✅ Improved accuracy for transactions that differ only by type

**Documentation Updates**:
- ✅ Updated README with best practices (log out after download, clear downloads for fresh login)
- ✅ Added warnings about Credit Karma changing tools/UI (expected unknown issues)
- ✅ Replaced Ctrl+F5 references with "refresh button" for clarity
- ✅ Added guidance for single year extractions (e.g., 2022, 2023, 2024)
- ✅ Removed pending transaction mentions from documentation
- ✅ Refactored Credits section - Moved acknowledgments below improvements with polite wording

**GitHub Publishing**:
- ✅ Published to GitHub: `https://github.com/VinodSridharan/Credit-Karma-Clean-Transactions-Exporter`
- ✅ LICENSE file matched with repository version
- ✅ Complete Production folder with all extension files and screenshots published
- ✅ All documentation files included

### 🐛 Code Fixes

- ✅ Enhanced `combineTransactions()` function to include `transactionType` in composite key
- ✅ Updated deduplication logic to distinguish credit vs debit transactions correctly
- ✅ Improved comments explaining duplicate detection logic

---

**Last Updated**: 2025-11-18 18:57:00  
**Current Version**: 3.0.1 - Published to GitHub
