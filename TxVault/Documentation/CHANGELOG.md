# Changelog - TxVault Exporter

All notable changes to this extension will be documented in this file.

**Last Updated**: 2025-11-22 21:45:00

---

## [3.0.5] - 2025-11-22

### Fixed
- **CRITICAL: Finally Syntax Error** - Fixed 'Unexpected token finally' error in `content.js` at line 2203
  - Corrected try-finally block structure (removed catch block, keeping try-finally only)
  - Validated that try-finally without catch is valid JavaScript syntax per ECMAScript specification
  - **Impact**: Extension content script now loads without syntax errors
  - **Related**: Issue #16 documented in ROOT_CAUSE_ANALYSIS.md, Lesson #9 added to LESSONS_LEARNED.md

### Added
- **Transaction Page Notices** - Added UI notices in popup to indicate page status
  - Warning notice when not on Credit Karma transactions page
  - Success notice when on Credit Karma transactions page
  - Notices appear above date presets area for better visibility
  - Automatic detection and display based on current page URL

### Changed
- **Gitignore Configuration** - Updated .gitignore to include additional documentation files
  - Added PROJECT_REVIEW.md to tracked files (root level and TxVault/Documentation/)
  - Added LESSONS_LEARNED.md to tracked files (root level)
  - Maintains core files and screenshots as before, now includes key documentation

### Documentation
- Added Issue #16 to ROOT_CAUSE_ANALYSIS.md (Finally syntax error investigation and resolution)
- Added Lesson #9 to LESSONS_LEARNED.md (Try-Finally structure and linter false positives)
- Updated PROJECT_REVIEW.md with latest code quality assessment
- Updated WORKFLOW_POLICY.md with recent code implementation activities

---

## [3.0.4] - 2025-11-20

### Fixed
- **CRITICAL: Syntax Error** - Fixed missing closing brace in `content.js` at line 1285
  - The `if` statement starting at line 1174 was missing its closing brace before the `catch` block
  - This caused `Uncaught SyntaxError: Unexpected token 'catch'` preventing the entire content script from loading
  - Extension was completely non-functional due to this syntax error
  - **Impact**: Extension can now load and execute properly, scrolling and preset functionality restored

---

## [3.0.3] - 2025-11-20

### Added
- **This Week** preset - Export transactions from the start of the current week (Sunday) to today
  - Automatically calculates week boundaries (Sunday to current day)
  - Quick access to recent weekly transactions
  - Statistics pending testing and verification

### Fixed
- **Button Navigation** - Changed "Open Credit Karma Transactions Page" from `<a>` tag to `<button>` with proper navigation handler
  - Now properly handles three scenarios: already on page, on different Credit Karma page, or not on Credit Karma
  - Fixes issue where new tab opening broke extension context
- **Date Comparison Errors** - Added null/undefined checks before date parsing
  - Prevents "Error comparing dates" console errors
  - Script now continues execution even if date comparison fails
  - Improved error logging with proper null handling

### Changed
- Version number updated to 3.0.3
- Preset button layout now includes 6 presets (This Week, This Month, Last Month, Last Year, Last 2 Years, Last 3 Years)
- Improved button navigation logic for better reliability

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

