# Known Reference Data - Transaction Counts by Date Range

**Created**: 2025-11-18 10:51:46  
**Purpose**: Reference data for validating CSV files and identifying useful vs defective files  
**Status**: ✅ Active Reference

---

## 📊 Known Good Transaction Counts

### ✅ Verified Working Extractions

| Date Range | Start Date | End Date | Transactions | Status | Source | Notes |
|-----------|-----------|----------|--------------|--------|--------|-------|
| **1 Year** | 2025-01-01 | 2025-11-14 | **1,559** | ✅ Good | Manual Test | Previous test data |
| **2 Years** | 2023-11-19 | 2025-11-18 | **2,286** | ✅ Good | Manual Test (Nov 18, 2025) | 100% complete, 18m 3s |
| **3 Years** | 2022-11-01 | 2025-11-18 | **2,865** | ✅ Good | Manual Test (Nov 18, 2025) | 100% complete, 22m 51s |

### ⚠️ Partial/Failed Extractions

| Date Range | Start Date | End Date | Transactions | Status | Source | Issue |
|-----------|-----------|----------|--------------|--------|--------|-------|
| **4 Years** | 2021-11-01 | 2025-11-18 | **938** | ⚠️ Partial | Manual Test (Nov 18, 2025) | Only captured 5/22/2025 to 11/17/2025, missing 2021-2024 |
| **5 Years** | ~2020-11-01 | 2025-11-18 | **N/A** | ❌ Failed | Manual Test | Did not work |
| **6 Years** | 2019-11-01 | 2025-11-18 | **N/A** | ❌ Failed | Manual Test | Did not work |

### 📋 Monthly Reference Counts (for comparison)

From 3-year vs 4-year comparison:
- **2022-11**: 27 transactions (3-year only)
- **2023-01**: 30 transactions (3-year only)
- **2023-07**: 89 transactions (3-year only)
- **2024-06**: 81 transactions (3-year only)
- **2025-05**: 220 transactions (3-year) vs 65 transactions (4-year) = **+155 difference**
- **2025-06**: 180 transactions (both match)
- **2025-10**: 133 transactions (both match)
- **2025-11**: 58 transactions (both match)

---

## 🔍 Date and Record Count Indicators (10+ Days Ago)

**Principle**: Transactions from 10+ days ago should be stable and complete.

**Useful Indicators**:
- If a file has transactions from 10+ days ago with counts matching known good data → **USEFUL**
- If a file has transactions from recent dates only (last 10 days) → **SUSPICIOUS** (may be incomplete)
- If a file has very low counts for known date ranges → **DEFECTIVE**

**Examples**:
- ✅ **Good**: 3-year file has 2,865 transactions from 11/4/2022 to 11/17/2025 (matches expected)
- ⚠️ **Partial**: 4-year file has only 938 transactions, only from 5/22/2025 to 11/17/2025 (missing older data)
- ❌ **Bad**: File with 144 bytes (likely empty/defective CSV)

---

## 📁 Known CSV Files (from Downloads folder)

### ✅ Useful Files (Keep)

1. **`all_transactions_2022-11-01_to_2025-11-18.csv`**
   - Size: 198,509 bytes
   - Date: 2025-11-18 10:37:26 AM
   - Transactions: 2,865
   - Range: 11/4/2022 to 11/17/2025
   - **Status**: ✅ **USEFUL** - Matches known 3-year test (2,865 transactions)

2. **`all_transactions_2023-11-19_to_2025-11-18.csv`**
   - Size: 155,163 bytes
   - Date: 2025-11-18 9:42:11 AM
   - Transactions: 2,286 (expected)
   - Range: 11/19/2023 to 11/17/2025
   - **Status**: ✅ **USEFUL** - Matches known 2-year test (2,286 transactions)

3. **`all_transactions_2025-01-01_to_2025-11-16 (1).csv`** (from image)
   - Size: 103 KB
   - Date: 11/16/2025 2:23 PM
   - Transactions: ~1,559 (expected for 1-year)
   - Range: 2025-01-01 to 2025-11-16
   - **Status**: ✅ **USEFUL** - Matches known 1-year test (1,559 transactions)

### ⚠️ Partial Files (Review/Archive)

4. **`all_transactions_2021-11-01_to_2025-11-18.csv`**
   - Size: 61,950 bytes
   - Date: 2025-11-18 10:10:39 AM
   - Transactions: 938 (expected 2,865+ for full 4-year)
   - Range: 5/22/2025 to 11/17/2025 (missing 2021-2024)
   - **Status**: ⚠️ **PARTIAL** - Only captured recent 2025 data, missing 30+ months
   - **Action**: Keep for analysis comparison, but mark as partial

### ❌ Defective Files (Delete)

5. **`all_transactions_2020-11-17_to_2025-11-17 (12).csv`**
   - Size: 144 bytes
   - Date: 11/17/2025 11:52:43 PM
   - **Status**: ❌ **DEFECTIVE** - Too small (144 bytes = likely empty/header only)

6. **`all_transactions_2020-11-17_to_2025-11-17 (11).csv`**
   - Size: 144 bytes
   - Date: 11/17/2025 11:48:18 PM
   - **Status**: ❌ **DEFECTIVE** - Too small (144 bytes = likely empty/header only)

7. **`all_transactions_2020-11-01_to_2025-11-18.csv`** (if exists)
   - **Status**: ❌ **LIKELY DEFECTIVE** - 5-year range that failed in testing

8. **`all_transactions_2019-11-01_to_2025-11-18.csv`** (if exists)
   - **Status**: ❌ **LIKELY DEFECTIVE** - 6-year range that failed in testing

---

## 🔍 Validation Criteria

### ✅ Useful File Criteria

A CSV file is **USEFUL** if:
1. ✅ Has transactions from 10+ days ago
2. ✅ Transaction count matches known good data for same date range (±5%)
3. ✅ Date range spans expected period
4. ✅ File size reasonable (>1 KB per 100 transactions)
5. ✅ Has complete date coverage (no large gaps)

### ❌ Defective File Criteria

A CSV file is **DEFECTIVE** and should be **DELETED** if:
1. ❌ File size < 200 bytes (likely empty or header only)
2. ❌ Transaction count < 50% of expected for date range
3. ❌ Only contains recent dates (<10 days ago) when older range requested
4. ❌ Date range missing large periods (e.g., 4-year file only has 6 months)
5. ❌ Known to be from failed test (5-year, 6-year ranges)

---

## 📊 Comparison Matrix

| File Pattern | Expected Count | Min Acceptable | Status |
|-------------|----------------|----------------|--------|
| **1-year range** | 1,559 | 1,400+ | ✅ Good if 1,400+ |
| **2-year range** | 2,286 | 2,000+ | ✅ Good if 2,000+ |
| **3-year range** | 2,865 | 2,600+ | ✅ Good if 2,600+ |
| **4-year range** | ~3,800+ | 3,000+ | ⚠️ Partial if <3,000 |
| **5-year range** | ~4,500+ | N/A | ❌ Failed (don't expect) |
| **6-year range** | ~5,200+ | N/A | ❌ Failed (don't expect) |

---

**Last Updated**: 2025-11-18 10:51:46  
**Status**: ✅ Active Reference for file validation

