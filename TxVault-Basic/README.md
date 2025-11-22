# 💼 TxVault Basic – Credit Karma Transaction Exporter

**Basic version with late November 2025 date format fix for DOM changes**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/version-1.2.1-blue.svg)](https://github.com/VinodSridharan/Credit-Karma-Clean-Transactions-Exporter)
[![Status](https://img.shields.io/badge/status-Basic%20Version-lightgrey.svg)](https://github.com/VinodSridharan/Credit-Karma-Clean-Transactions-Exporter)

---

## 📋 About This Version

**TxVault Basic** is a foundational version of the TxVault transaction exporter. It includes:

- ✅ **Late November 2025 date format fix** – Enhanced to handle DOM date changes (supports both long and short month names like "January 15, 2023" and "Nov 20, 2025")
- ✅ **Original functionality preserved** – All core features from the original extension
- ✅ **Comparison reference** – Serves as a baseline for comparing with the Enhanced version

This version is maintained as a **comparison baseline** alongside the [TxVault Enhanced](../TxVault) version. Both versions are available in this repository for performance comparison and reference.

---

## 🎯 Key Features

- **Date Range Selection** – Choose specific start and end dates for transaction export
- **Smart Data Export** – Automatically generates three CSV files:
  - `all_transactions.csv`: Complete transaction history
  - `expenses.csv`: Debit transactions only
  - `income.csv`: Credit transactions only
- **Dark Mode Support** – Seamless experience in both light and dark themes
- **Automatic Scrolling** – Intelligently scrolls through all transactions in the selected date range
- **CSV Format** – Export data in a format compatible with popular financial tools
- **Date Format Fix** – Enhanced date parsing handles Credit Karma's DOM changes (November 2024)

---

## 🚀 Quick Start

1. **Install the Extension**:
   - Clone this repository or download the files
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (top right)
   - Click "Load unpacked" and select the `TxVault-Basic` folder

2. **Export Transactions**:
   - Go to [Credit Karma Transactions](https://www.creditkarma.com/networth/transactions)
   - Click the extension icon
   - Select your date range
   - Click "Export" and wait for the files to download

---

## 🔄 Version History

### Version 1.2.1 (November 2025)
- **Enhanced**: Added late November 2025 date format fix
- **Fixed**: DOM date change handling (supports short month names like "Nov 20, 2025")
- **Preserved**: All original functionality from v1.2

### Version 1.2 (Original)
- Original release from Chirag Bangera
- Real-time transaction counter during extraction
- "Stop Scrolling" button functionality
- Adaptive scrolling speeds
- Dark mode support

---

## 📊 Comparison with Enhanced Version

| Feature | Basic (This Version) | Enhanced |
|---------|---------------------|----------|
| Date Format Support | ✅ Enhanced (Nov 2025 fix) | ✅ Advanced |
| DOM Selectors | Original | ✅ Updated |
| Scrolling Strategy | Basic | ✅ Advanced segmented scroll |
| Error Handling | Basic | ✅ Comprehensive |
| Transaction Deduplication | Basic | ✅ Enhanced |
| Content Script Injection | Standard | ✅ Multi-step verification |
| Manifest Version | V3 | ✅ V3 with optimized settings |

For the full-featured version with all enhancements, see [TxVault Enhanced](../TxVault).

---

## 🙏 Credits & Attribution

**Original Extension:**
- Developed by [Chirag Bangera](https://github.com/cbangera2)
- Original repository: [CreditKarmaExtractor](https://github.com/cbangera2/CreditKarmaExtractor)

**TxVault Basic Enhancements:**
- Date format fix (November 2024) by Vinod Sridharan
- Maintained as comparison baseline version

This extension is not affiliated with or endorsed by Credit Karma.

---

## 📄 License

**MIT License** – See [LICENSE](../TxVault/LICENSE) file for details.

---

## 📚 Documentation

- **Enhanced Version**: See [TxVault Enhanced README](../TxVault/README.md)
- **Root Repository**: See [Main README](../README.md)

---

<div align="center">

**Made with ❤️ - Enhanced version available: [TxVault](../TxVault)**

</div>

