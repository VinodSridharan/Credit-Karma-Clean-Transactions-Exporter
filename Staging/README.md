# Credit Karma Transaction Exporter

> **Chrome Extension** | **Version 3.0** | **Status**: ✅ Production Ready  
> **Last Updated**: 2025-11-18 15:20:00

A Chrome extension to export Credit Karma transactions to CSV format with precise date range filtering and comprehensive transaction data.

---

## Quick Start

1. **Install**: Chrome → `chrome://extensions/` → Enable Developer mode → Load unpacked → Select folder
2. **Navigate**: https://www.creditkarma.com/networth/transactions
3. **Use Extension**: Click icon → Choose preset OR set dates (`YYYY-MM-DD`) → Enable "Strict boundaries" → Export
4. **Wait**: CSV downloads automatically when complete

---

## Available Presets

| Preset | Date Range | Time | Transactions | Status |
|--------|-----------|------|--------------|--------|
| **This Month** | Current month (1st to today) | 3-5 min | ~50-60 | ✅ PRISTINE |
| **Last Month** | Previous full month | 3-5 min | ~130-140 | ✅ PRISTINE |
| **Last Year** | Previous full year | 15-25 min | ~700-800 | ✅ Working |
| **Last 2 Years** | Nov 19, 2023 - Nov 18, 2025 | 18-20 min | ~2,286 | ✅ PRISTINE |
| **Last 3 Years** | Nov 1, 2022 - Nov 18, 2025 | 22-25 min | ~2,865 | ✅ PRISTINE |

**PRISTINE Status**: Verified 100% complete extraction with all boundary dates captured.

---

## Manual Date Range

You can also set custom date ranges:
- **Format**: `YYYY-MM-DD` (e.g., `2024-01-01` to `2024-12-31`)
- **Maximum Range**: 3 years (verified working range)
- **Recommended**: Single month or year for best results

---

## Best Practices

✅ **Recommended**: Single month (30-31 days) - Most reliable, fastest  
✅ **Date Format**: Always use `YYYY-MM-DD` format  
✅ **Always Enable**: "Strict boundaries" checkbox for exact date range  
⚠️ **Maximum Range**: 3 years (verified working limit)  
❌ **Avoid**: Ranges > 3 years - Use multiple extractions instead

---

## Features

### Core Capabilities
- ✅ **Precise Date Filtering**: Strict boundary capture (start AND end dates)
- ✅ **Progress Display**: Real-time updates (`Scroll: X | Found: Y | In Range: Z`)
- ✅ **Multi-Format Date Parsing**: Handles MM/DD/YYYY, "Nov 14, 2025", "November 14, 2025"
- ✅ **Enhanced Deduplication**: Uses composite key (date + description + amount)
- ✅ **CSV Export**: Standard format with MM/DD/YYYY date format

### CSV Columns
- Date (MM/DD/YYYY format)
- Description
- Amount
- Category
- Transaction Type
- Status (Posted/Pending)
- Account Name
- Labels
- Notes

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Dates don't match range | Verify format is `YYYY-MM-DD`, enable "Strict boundaries" |
| Extraction stops early | Range may exceed 3 years - Split into smaller ranges |
| Missing boundary dates | Wait for completion - Check console (F12) for progress |
| No transactions found | Verify date range is correct - Extension may need to scroll backward for old dates |
| Extension not responding | Reload extension in `chrome://extensions/`, refresh Credit Karma page |

---

## Verified Performance

### Test Results (PRISTINE = 100% Complete)

| Test | Date Range | Transactions | Time | Status |
|------|-----------|--------------|------|--------|
| This Month | Nov 1-14, 2025 | 52 | 2m 58s | ✅ PRISTINE |
| Last Month | Oct 1-31, 2025 | 133 | 2m 35s | ✅ PRISTINE |
| 2-Year Manual | Nov 19, 2023 - Nov 18, 2025 | 2,286 | 18m 3s | ✅ PRISTINE |
| 3-Year Manual | Nov 1, 2022 - Nov 18, 2025 | 2,865 | 22m 51s | ✅ PRISTINE |

**Note**: Maximum working range is **3 years**. Ranges beyond 3 years may produce partial results.

---

## Installation & Setup

1. **Download Extension**:
   - Clone or download this repository
   - Extract to a folder on your computer

2. **Install in Chrome**:
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top-right)
   - Click "Load unpacked"
   - Select the extension folder

3. **First Use**:
   - Navigate to https://www.creditkarma.com/networth/transactions
   - Click the extension icon
   - Choose a preset or set custom dates
   - Enable "Strict boundaries"
   - Click "Export"
   - Wait for completion (CSV downloads automatically)

---

## Technical Details

**Files Included**:
- `manifest.json` - Extension configuration
- `content.js` - Main extraction logic
- `popup.js` - User interface logic
- `popup.html` - User interface HTML
- `background.js` - Background services
- `popup.css` - Styling
- `icon.png` - Extension icon

**Browser Requirements**: Chrome or Chromium-based browser (Edge, Brave, etc.)

**Permissions**:
- Active tab access (to extract transactions)
- Storage (to save preferences)

---

## Limitations

⚠️ **Maximum Working Range**: 3 years (verified)
- Ranges beyond 3 years may produce incomplete results
- For longer ranges, use multiple extractions and combine

⚠️ **Page Structure Dependency**: 
- Extension relies on Credit Karma's page structure
- If Credit Karma updates their UI, extension may need updates

⚠️ **Session Timeouts**:
- Very long extractions (>30 minutes) may encounter session timeouts
- Keep browser active during extraction

---

## Support & Contributions

- **Issues**: Report bugs or request features via GitHub Issues
- **Contributions**: Pull requests welcome
- **Documentation**: See `PROJECT_REVIEW.md` for detailed project information

---

## Credits

**Developer**: Vinod Sridharan  
**Version**: 3.0  
**License**: See LICENSE file

**Note**: This extension is not affiliated with or endorsed by Credit Karma.

---

**Last Updated**: 2025-11-18 15:20:00  
**Status**: ✅ Production Ready - All Presets Working
