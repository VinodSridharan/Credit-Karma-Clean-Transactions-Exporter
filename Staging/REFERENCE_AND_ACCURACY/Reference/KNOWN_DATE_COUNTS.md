# Known Date Counts - Maximum Records by Date Range

**Created**: 2025-11-18 10:57:28  
**Last Updated**: 2025-11-18 12:58:26  
**Purpose**: Track MAXIMUM transaction counts for specific date ranges - TEST DATA SOURCE (PRISTINE Reference Standard)  
**Source**: Documents, test results, and successful CSV exports  
**Status**: ✅ **ACTIVE - CONSTANTLY UPDATED WITH NEW DATA**

---

## 🎯 Purpose

**This is the TEST DATA SOURCE** - Maximum record counts are the pristine reference standard for all comparisons.

### Key Principles:
1. ✅ **Record count matching matters** - Transactions per day is an independent event and can vary naturally
2. ✅ **Maximum record obtained sets the reference** - Highest count from any PRISTINE test becomes the standard
3. ✅ **Constantly updated** - When new PRISTINE runs produce higher counts, this document is updated immediately
4. ✅ **All runs match against this** - Any extraction output is compared against these maximum counts

---

## 📊 Maximum Transaction Counts by Date Range (TEST DATA SOURCE)

### ✅ PRISTINE Maximum Counts - Reference Standard

**These are the MAXIMUM record counts** - Use these as the reference standard for all comparisons.

| Date Range | Max Records<br>(TEST DATA SOURCE) | Source | Test Date | Status | Notes |
|------------|----------------------------------|--------|-----------|--------|-------|
| **Nov 1-14, 2025** | **52** | This Month preset | 2025-11-17 | ✅ PRISTINE | Reference count for Nov 1-14, 2025 |
| **Oct 1-31, 2025** | **133** | Excel file analysis (unique transactions) | 2025-11-18 | ✅ PRISTINE ⭐ | Reference count for Oct 1-31, 2025 (138 rows, 133 unique by Date+Merchant+Amount) |
| **Jan 1 - Oct 31, 2025** | **1,497** | This Year preset | 2025-11-18 | ✅ PRISTINE ⭐ | Reference count for Jan-Oct 2025 (Oct = 133 unique transactions) |
| **Jan 1 - Dec 31, 2024** | **738** | Manual run | 2025-11-18 | ✅ PRISTINE ⭐ | Reference count for 2024 full year |
| **Nov 19, 2023 - Nov 18, 2025** | **2,286** | 2-Year manual test | 2025-11-18 | ✅ PRISTINE | Reference count for 2-year range |
| **Nov 1, 2022 - Nov 18, 2025** | **2,865** | 3-Year manual test | 2025-11-18 | ✅ PRISTINE | Reference count for 3-year range |

### Additional Test Results (Not Maximum - For Reference Only)

| Date Range | Records | Source | Status | Notes |
|------------|---------|--------|--------|-------|
| **Jan 1 - Nov 16, 2025** | 1,551 | This Year preset | ✅ Working | Subset of Jan-Oct range |
| **Jan 1 - Nov 14, 2025** | 1,559 | Previous test | ✅ Working | Subset of Jan-Oct range |
| **Jan 1 - Nov 14, 2025** | 1,646 | 2-Year test portion | ✅ Working | Subset of Jan-Oct range |
| **Feb 1, 2021 - Nov 14, 2025** | 3,103 | Last 5 Years preset | ⚠️ Partial | Missing start date |
| **Nov 2017 - Nov 2025** | 3,990 | Last 8 Years preset | ✅ Working | Longer range |
| **Nov 16, 2015 - Nov 14, 2025** | 5,323 | Last 10 Years | ⚠️ Not Recommended | Too long (139 min) |

---

## 🎯 How to Use This Reference (Test Data Source)

### For Any Extraction Run:

1. **Identify Date Range**: Determine the date range of your extraction
2. **Look Up Reference**: Find corresponding max record count in table above
3. **Compare Counts**: 
   - **Match**: ✅ Extraction is PRISTINE
   - **Higher**: ⚠️ Possible data inconsistency - investigate
   - **Lower**: ❌ Incomplete extraction - missing transactions
4. **Calculate Match**: (Actual Count / Reference Count) × 100
5. **Report Status**:
   - ✅ **100%+**: PRISTINE (matches or exceeds reference)
   - ✅ **95-99%**: Very Good (within 5% variance)
   - ⚠️ **80-94%**: Acceptable (within 20% variance)
   - ❌ **<80%**: Poor (missing significant data)

### Important Notes:

- ⚠️ **Transactions per day is independent** - Can vary naturally, don't use for comparison
- ✅ **Record count matching matters** - Must match maximum reference count
- ✅ **Maximum counts are authoritative** - Highest PRISTINE count is the standard
- ✅ **This document is constantly updated** - New PRISTINE data with higher counts updates immediately

---

## 🎯 Date Range Quality Check

### For Files in Downloads Folder:

**Expected Counts (by date range in filename)**:

| Date Range in Filename | Expected Min | Expected Max | Status Indicator |
|------------------------|--------------|--------------|------------------|
| **2025-11-01 to 2025-11-17** | 50 | 60 | ✅ Good (52 expected) |
| **2024-10-01 to 2024-10-31** | 130 | 140 | ✅ Good (133 from preset, 139 from Excel - use 139) |
| **2025-10-01 to 2025-10-31** | 130 | 140 | ✅ Good (133 unique from Excel analysis - 138 rows with 4 duplicates) |
| **2025-01-01 to 2025-10-31** | 1,490 | 1,510 | ✅ Good (1,497 actual - matches "This Year" preset) |
| **2024-01-01 to 2024-12-31** | 700 | 800 | ✅ Good (738 actual from manual run) |
| **2025-01-01 to 2025-11-16** | 1,550 | 1,600 | ✅ Good (1,551-1,646 expected) |
| **2023-11-19 to 2025-11-18** | 2,200 | 2,400 | ✅ Good (2,286 expected) |
| **2022-11-01 to 2025-11-18** | 2,700 | 3,000 | ✅ Good (2,865 expected) |
| **2021-11-01 to 2025-11-18** | 3,700 | 4,100 | ⚠️ Check (4-year failed, only got 938) |
| **2020-11-17 to 2025-11-17** | 3,800 | 4,000 | ⚠️ Check (5-year partial, got 3,103) |

---

## 🔍 Files to Analyze

### Based on Known Counts:

**✅ KEEP (Useful Data)**:
1. `all_transactions_2025-11-01_to_2025-11-17*.csv` - Should have ~52 transactions
2. `all_transactions_2024-10-01_to_2024-10-31*.csv` - Should have ~133 transactions
3. `all_transactions_2023-11-19_to_2025-11-18.csv` - Should have ~2,286 transactions
4. `all_transactions_2022-11-01_to_2025-11-18.csv` - Should have ~2,865 transactions
5. `all_transactions_2025-01-01_to_2025-11-16*.csv` - Should have ~1,551-1,646 transactions

**⚠️ REVIEW (Partial/Failed)**:
1. `all_transactions_2021-11-01_to_2025-11-18.csv` - Only 938 transactions (expected 3,700-4,100) - **DEFECTIVE**
2. `all_transactions_2020-11-17_to_2025-11-17*.csv` - Only 3,103 transactions (expected 3,800-4,000) - **PARTIAL**
3. Files with <144 bytes (likely empty/failed exports)

**❌ DELETE (Defective)**:
1. Files with 144 bytes or less (failed exports)
2. Files with terrible boundary count failures (<50% of expected)
3. Files with date ranges that don't match known successful patterns

---

**Last Updated**: 2025-11-18 14:15:00  
**Purpose**: Guide cleanup of Downloads folder, identify useful vs defective files

---

## 📋 Excel File Analysis - Oct 2025 (2025-11-18)

### File Path:
`C:\Users\ceoci\OneDrive\Desktop\Docs of desktop\Tech channels\Automation Efforts\CK auto\Gold version\CreditKarmaExtractor-main\CK_TX_Downloader_JavaScript\oct 2025 tx.xlsx`

### Analysis Results:
- **Total rows**: 138
- **Exact duplicates**: 4 (8 rows total that are exact duplicates)
- **Unique transactions** (Date+Merchant+Amount): **133** ⭐

### Duplicate Details:
- **Xfinity Mobile $248.40** (Oct 31): 1 exact duplicate
- **Grammarly $144.00** (Oct 10, 11, 14, 17): Multiple exact duplicates with same date/merchant/amount
- Some entries have same date/merchant/amount but different categories (treated as separate if categories differ)

### Recommendation:
✅ **Use 133 as PRISTINE count** for Oct 1-31, 2025 (matches "Last Month" preset extraction perfectly)

