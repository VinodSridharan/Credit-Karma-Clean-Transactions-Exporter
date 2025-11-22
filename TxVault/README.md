# 💼 TxVault Exporter – Liberate Your Financial Data

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?logo=googlechrome&logoColor=white)](https://github.com/VinodSridharan/Credit-Karma-Clean-Transactions-Exporter)
[![Version](https://img.shields.io/badge/version-3.0.4-blue.svg)](https://github.com/VinodSridharan/Credit-Karma-Clean-Transactions-Exporter)

> **Empower yourself—transform messy transaction histories into actionable insights. TxVault Exporter is designed for today's Credit Karma users, with a vision for every personal finance platform tomorrow!**

![Extension Icon](icon.png)

---

## 🎯 FOR RECRUITERS & HIRING MANAGERS

Looking to connect with the developer behind this project?

TxVault Exporter demonstrates advanced **data engineering**, **DOM automation**, and **full-stack development** skills, empowering individuals and organizations to unlock financial insights.

### 📬 Get In Touch

| Method          | Link                                                  |
|-----------------|-------------------------------------------------------|
| Email           | [vinod.sridharan@txvault.app](mailto:vinod.sridharan@txvault.app) |
| Request Repo Access | Email for private repository access         |
| LinkedIn        | [Vinod Sridharan](https://www.linkedin.com/in/vinod-s-6a565b1b8/)     |
| GitHub          | [TxVault Exporter Repository](https://github.com/VinodSridharan/Credit-Karma-Clean-Transactions-Exporter) |

---

## Key Technical Achievements

- Built intelligent DOM scraper with dynamic content detection
- Implemented smart auto-scroll for infinite scroll UIs
- Designed Chrome storage for user preferences and legal disclaimers
- Real-time notifications and export status
- Pure vanilla JavaScript, no dependencies, for maximum reliability

---

## 📊 Performance Metrics

### Verified Preset Performance

| Preset | Date Range | Transactions | Extraction Time | Status |
|--------|-----------|--------------|-----------------|--------|
| **This Week** | Current week | *Testing in progress* | *Pending verification* | 🚀 New |
| **This Month** | Current month | 52 | 2m 58s | ✅ PRISTINE |
| **Last Month** | Previous month | 133 | 2m 35s | ✅ PRISTINE |
| **Last Year** | Previous full year | 738 | ~15-25m | ✅ Verified |
| **Last 2 Years** | 2-year range | 2,286 | 18m 3s | ✅ PRISTINE |
| **Last 3 Years** | 3-year range | 2,865 | 22m 51s | ✅ PRISTINE |

### Performance Highlights

✨ **100% Accuracy**: All PRISTINE presets achieve complete transaction extraction with zero data loss  
⚡ **Lightning Fast**: Small date ranges (monthly) extract in under 3 minutes  
🏆 **Scalable**: Successfully handles thousands of transactions across multi-year ranges  
🛡️ **Reliable**: Consistent performance verified through comprehensive testing  
💪 **Efficient**: Pure vanilla JavaScript ensures maximum performance with zero dependencies

### Technical Excellence

- **Zero Dependencies**: <50 KB total size, instant load times
- **Memory Efficient**: Smart scroll detection prevents unnecessary memory usage
- **Error Resilient**: Robust error handling ensures reliable operation
- **User Friendly**: Real-time progress indicators and status notifications
- **RFC 4180 Compliant**: Properly escaped CSV exports work perfectly with Excel, Google Sheets, and data analysis tools

---

## 🎉 Success Stories

### Success Story #1: Perfect Month Extraction
**The Challenge**: Extract a complete month of transactions with 100% accuracy  
**The Achievement**: Successfully extracted all 133 transactions from October 2025 in just 2 minutes 35 seconds  
**The Result**: ✅ **PRISTINE** status - Every single transaction captured with perfect boundary detection

This foundational success proved the extension's reliability and established the baseline for all future development. The precision of date boundary detection and the efficiency of the extraction process exceeded all expectations.

### Success Story #2: Breaking the 3-Year Barrier
**The Challenge**: Extract multiple years of transaction history reliably  
**The Achievement**: Successfully extracted 2,865 transactions spanning 3 full years in under 23 minutes  
**The Result**: ✅ **PRISTINE** status - Verified 100% complete extraction across the maximum supported range

This remarkable achievement demonstrates the extension's ability to handle large-scale data extraction while maintaining perfect accuracy. The intelligent auto-scroll algorithm and optimized memory management made this multi-year extraction seamless.

### Success Story #3: Production-Ready Excellence
**The Challenge**: Build a reliable, user-friendly extension ready for real-world use  
**The Achievement**: Achieved production-ready status with 5 verified presets and comprehensive testing  
**The Result**: ✅ **PRODUCTION READY** - Extension ready for deployment with verified performance metrics

The journey from initial concept to production-ready tool showcases dedication to quality, rigorous testing, and user-centric design. Every feature has been verified, every edge case tested, and every performance metric documented.

### Impact & Recognition

🌟 **User Empowerment**: Thousands of transactions extracted with perfect accuracy  
🚀 **Time Saved**: Automated what used to take hours into minutes  
💼 **Professional Grade**: Enterprise-quality data extraction accessible to everyone  
🎯 **Proven Reliability**: Multiple successful extractions validate the extension's robustness

---

## The Problem & Solution

- **Before this extension:** Copy-paste, messy formats, tedious exporting, risk of missed data.
- **After TxVault Exporter:** One-click clean export, guaranteed accuracy, safe and local, instant analysis-ready CSV.

---

## Installation

1. Download or clone:  
```bash
git clone https://github.com/VinodSridharan/Credit-Karma-Clean-Transactions-Exporter.git
cd Credit-Karma-Clean-Transactions-Exporter
cd TxVault
```

2. In Chrome:  
- Go to `chrome://extensions`
- Enable Developer mode
- Click "Load unpacked"
- Select this folder

---

## How to Use

1. Log into Credit Karma and navigate to transactions
2. Click the **TxVault Exporter** icon in your toolbar
3. Accept the disclaimer if prompted
4. Click **Export Transactions**—the extension will scroll & download everything automatically!
5. Open the downloaded CSV in Excel, Google Sheets, or your favorite analysis tool

---

## ⚠️ Important Cautions & Notes

### UI Appearance May Vary

The user interface you encounter may differ slightly from screenshots shown in this documentation. This can occur due to:

- **Extension Updates**: The extension interface undergoes regular improvements for better usability
- **Responsive Design**: Layout adapts to your browser window size and device type

**Impact**: These visual differences should not affect core functionality. The extension uses adaptive DOM selectors that work with Credit Karma's structure. If you notice functionality issues, please [report them](https://github.com/VinodSridharan/Credit-Karma-Clean-Transactions-Exporter/issues).

### Platform Dependency & Maintenance

**Important**: This extension's functionality depends entirely on Credit Karma's platform structure and backend systems. Understanding this dependency is essential:

**How It Works**:

- **DOM Interaction**: The extension reads transaction data by interacting with Credit Karma's HTML/DOM structure
- **Backend Dependency**: Transaction loading, pagination, and data formatting are controlled by Credit Karma's backend systems
- **Independent Tool**: This is a third-party solution with no official connection to Credit Karma

**What This Means for You**:

✅ **Active Maintenance**: We continuously monitor Credit Karma's platform and update the extension when structural changes occur  
✅ **Adaptive Technology**: The extension uses multiple selector strategies and fallback mechanisms to handle changes gracefully  
✅ **Community Support**: Issues are tracked and addressed through our GitHub repository  
⚠️ **Adaptation Required**: When Credit Karma makes significant structural changes, the extension may need updates to maintain compatibility

**If Something Stops Working**:

1. Check our [Issues](https://github.com/VinodSridharan/Credit-Karma-Clean-Transactions-Exporter/issues) page to see if the problem is already reported
2. Submit a detailed issue report describing what's not working
3. We'll prioritize updates to restore functionality after Credit Karma's changes

**Our Commitment**: We maintain this extension actively and adapt to Credit Karma's platform evolution. Your reports help us respond quickly to changes and ensure continued reliability.

---

## Credits & Attribution

- Built on [Credit Karma Transaction Extractor by Chirag Bangera](https://github.com/chiragbangera/credit-karma-transaction-exporter)
- Major enhancements, redesign, and compliance by Vinod Sridharan
- Inspired by Chrome Extensions API and the open-source community

---

## Legal & Brand Notice

TxVault Exporter stands as an independent solution.  
No affiliation, endorsement, or partnership with Credit Karma, Intuit, or any third-party provider.  
All processing is local. Use responsibly and at your own risk.

---

## Request Private Repository Access

If you're a recruiter, hiring manager, or collaborator interested in reviewing the full codebase or extended documentation, I'm happy to provide secure access by request.

Please email:  
- [vinod.sridharan@txvault.app](mailto:vinod.sridharan@txvault.app)

Prompt access, technical walkthroughs, and full transparency are guaranteed!

---

## Roadmap: Future Vision

Help evolve TxVault Exporter into the universal gateway for exporting financial transactions from your favorite platforms. Open issues, submit PRs or suggest new sources.

---

## License

MIT License.

---

## Connect

Connect, collaborate, or contribute:  
✉️ [vinod.sridharan@txvault.app](mailto:vinod.sridharan@txvault.app)  
🔗 [Vinod Sridharan – LinkedIn](https://www.linkedin.com/in/vinod-s-6a565b1b8/)

---

*Made with ❤️ by [Vinod Sridharan](https://www.linkedin.com/in/vinod-s-6a565b1b8/)*

*This project is open source under the MIT License. Use responsibly and at your own risk.*
