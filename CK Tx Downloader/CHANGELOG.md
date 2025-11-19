# Changelog - CreditKarmaTxDownloader

All notable changes to this extension will be documented in this file.

**Last Updated**: 2025-11-19 10:49:41

---

## [3.0.1] - 2025-11-19

### Added
- CHANGELOG.md file for user-facing version changes
- Comprehensive additional documentation:
  - TESTING_PLAN.md - Detailed testing procedures and results
  - TROUBLESHOOTING.md - Detailed troubleshooting guide for developers
  - FUNCTION_LIST.md - Detailed function/API documentation
  - LESSONS_LEARNED.md - Document lessons learned during development
- Documentation Index with automatic logging requirements

### Changed
- Enhanced documentation structure with additional reference files
- Updated DOCUMENTATION_INDEX.md with comprehensive dependency tracking
- Standard update checklist now includes CHANGELOG.md (required when publishing)

---

## [3.0.1] - 2025-11-19 (Earlier Updates)

### Added
- Comprehensive "Understanding 'Total Found' vs 'In Range'" section in README
  - Explains scroll boundary checking behavior
  - Clarifies why "Total Found" count is larger than "In Range" count
  - Provides detailed example (367 total found, 58 in range)
- Screenshot pixel dimensions documentation in README
  - Extension UI.png: 241x400 pixels (37.53 KB)
  - Runtime Notifications.png: 600x307 pixels (60.13 KB)
  - Export Notification.png: 300x279 pixels (46.02 KB)
  - HTML scaling explanation (`width="800"` attribute)

### Changed
- Enhanced README troubleshooting section
  - Added detailed explanation of scroll boundary checking
  - Updated screenshot documentation with actual pixel dimensions
  - Improved clarity on informational messages

### Fixed
- Documentation clarity issues
  - Users now understand why transaction counts differ during extraction
  - Screenshot dimensions clearly documented for verification

---

## [3.0.0] - 2025-11-18

### Added
- Version 3.0 - Streamlined to 5 verified presets
- Enhanced deduplication (includes transaction type in composite key)
- Multi-format date parsing (MM/DD/YYYY, "Nov 14, 2025", "November 14, 2025")
- Dual boundary checking for complete transaction capture
- Progress indicators with real-time updates
- Stop & Export functionality

### Verified Presets
- This Month - ✅ PRISTINE
- Last Month - ✅ PRISTINE
- Last Year - ✅ Working
- Last 2 Years - ✅ PRISTINE
- Last 3 Years - ✅ PRISTINE

### Maximum Working Range
- **3 years** (verified and documented)

### Features
- Dual boundary checking (start AND end dates)
- Enhanced deduplication (date + description + amount + transaction type)
- Automatic CSV export with MM/DD/YYYY date format
- Real-time progress indicators

---

## [October-133-Version] - 2025-11-14

### Added
- Initial working version
- Successfully extracted 133 transactions from October 1-31, 2025 with 100% accuracy
- Dual boundary checking implementation
- Adaptive buffer logic for full month capture
- Fixed date parsing (local time, not UTC)

### Key Achievement
- ✅ **PRISTINE Status** - 100% complete extraction with all boundary dates captured

---

**Format**: Based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)

---

