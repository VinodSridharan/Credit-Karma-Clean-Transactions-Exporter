# CSV Comparison Analysis - 3-Year vs 4-Year Output

**Created**: 2025-11-18 10:21:26  
**Purpose**: Compare 3-year and 4-year CSV outputs month by month to identify missing transactions  
**Status**: 🔄 Awaiting 3-year test completion

---

## 📊 Test Results Summary

### Test #5: 4-Year Manual Test
**Date Range**: 11/01/2021 to 11/18/2025  
**Status**: ⚠️ **PARTIAL** - Only extracted recent 2025 data  
**CSV File**: `all_transactions_2021-11-01_to_2025-11-18.csv` (61,950 bytes)  
**Results**:
- Total Found: 952
- Exported (In Range): 938
- **Posted Transactions**: 5/22/2025 to 11/17/2025 (938 transactions)
- **Issue**: Only captured ~6 months of 2025, missing 2021-2024

### Test #6: 3-Year Manual Test
**Date Range**: [User to enter - suggest: 11/01/2022 to 11/18/2025]  
**Status**: 🔄 **IN PROGRESS**  
**Expected CSV File**: `all_transactions_2022-11-01_to_2025-11-18.csv` (TBD)  
**Progress**: Scroll: 137 | Found: 2,274 | In range: 2,193 | Range: 8/31/2022 - 11/17/2025

---

## 🔍 Month-by-Month Comparison Plan

### When 3-Year Test Completes:

1. **Load Both CSV Files**:
   - 4-year: `all_transactions_2021-11-01_to_2025-11-18.csv`
   - 3-year: `all_transactions_2022-XX-XX_to_2025-11-18.csv`

2. **Parse and Group by Month**:
   - Extract date from each transaction
   - Group transactions by Year-Month (YYYY-MM)
   - Count transactions per month

3. **Compare Monthly Counts**:
   - For overlapping months (8/2022 to 11/2025):
     - 3-year output should have MORE transactions (more complete)
     - 4-year output should have FEWER transactions (stopped early)
   - Identify missing months in 4-year output
   - Count differences per month

4. **Identify Missing Transactions**:
   - Months present in 3-year but missing/partial in 4-year
   - Transaction count differences per month
   - Date range gaps

5. **Analyze Boundary Issues**:
   - Where did 4-year test stop? (Started at 5/22/2025 instead of 11/01/2021)
   - Where does 3-year test start? (Shows 8/31/2022 in progress)
   - What's the maximum working range?

---

## 📋 Expected Findings

### 4-Year Test Issues:
- **Missing**: Nov 2021 - May 2025 (~3.5 years)
- **Captured**: May 2025 - Nov 2025 (~6 months)
- **Reason**: Extension stopped scrolling too early, didn't reach 2021 start date

### 3-Year Test Expectations:
- **Start Date**: Should be close to 11/01/2022 (currently showing 8/31/2022 in progress)
- **Transaction Count**: Should be higher than 4-year (2,274 found vs 952 total)
- **Range Coverage**: Should capture full 3-year range or close to it

### Comparison Strategy:
1. **Overlap Period** (May 2025 - Nov 2025):
   - Compare transaction counts for same months
   - 3-year should have >= 4-year counts (more complete)

2. **Missing Period in 4-Year** (Nov 2021 - May 2025):
   - Count transactions in 3-year that fall in this period
   - These should be ZERO (outside 3-year range)

3. **Unique to 3-Year** (Aug 2022 - May 2025):
   - Months captured by 3-year but not by 4-year
   - Transaction counts for these months

---

## 🔧 Analysis Script Plan

### Python Script to Compare CSVs:

```python
import csv
from collections import defaultdict
from datetime import datetime

def parse_csv(filename):
    """Parse CSV and group by year-month"""
    monthly_counts = defaultdict(int)
    transactions = []
    
    with open(filename, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            date_str = row.get('Date', '')
            try:
                date = datetime.strptime(date_str, '%m/%d/%Y')
                year_month = date.strftime('%Y-%m')
                monthly_counts[year_month] += 1
                transactions.append({
                    'date': date,
                    'year_month': year_month,
                    'row': row
                })
            except:
                pass
    
    return monthly_counts, transactions

def compare_csvs(csv_4year, csv_3year):
    """Compare 4-year and 3-year outputs"""
    counts_4year, txns_4year = parse_csv(csv_4year)
    counts_3year, txns_3year = parse_csv(csv_3year)
    
    print("=== Monthly Transaction Counts ===\n")
    print(f"{'Month':<12} {'4-Year':<10} {'3-Year':<10} {'Difference':<12}")
    print("-" * 50)
    
    all_months = sorted(set(list(counts_4year.keys()) + list(counts_3year.keys())))
    
    for month in all_months:
        count_4 = counts_4year.get(month, 0)
        count_3 = counts_3year.get(month, 0)
        diff = count_3 - count_4
        print(f"{month:<12} {count_4:<10} {count_3:<10} {diff:>+12}")
    
    print("\n=== Analysis ===")
    print(f"4-Year Total: {sum(counts_4year.values())}")
    print(f"3-Year Total: {sum(counts_3year.values())}")
    print(f"Difference: {sum(counts_3year.values()) - sum(counts_4year.values())}")
    
    # Identify missing months
    missing_in_4year = set(counts_3year.keys()) - set(counts_4year.keys())
    if missing_in_4year:
        print(f"\nMonths missing in 4-year output: {sorted(missing_in_4year)}")
    
    # Date range analysis
    if txns_4year:
        min_4year = min(t['date'] for t in txns_4year)
        max_4year = max(t['date'] for t in txns_4year)
        print(f"\n4-Year Date Range: {min_4year.strftime('%Y-%m-%d')} to {max_4year.strftime('%Y-%m-%d')}")
    
    if txns_3year:
        min_3year = min(t['date'] for t in txns_3year)
        max_3year = max(t['date'] for t in txns_3year)
        print(f"3-Year Date Range: {min_3year.strftime('%Y-%m-%d')} to {max_3year.strftime('%Y-%m-%d')}")

# Usage
compare_csvs(
    'all_transactions_2021-11-01_to_2025-11-18.csv',
    'all_transactions_2022-XX-XX_to_2025-11-18.csv'
)
```

---

## 📝 Actions After 3-Year Test Completes

1. ✅ **Check Downloads Folder**:
   - Locate 3-year CSV file
   - Verify filename and size

2. ✅ **Run Comparison Script**:
   - Load both CSV files
   - Parse transaction dates
   - Group by month
   - Compare counts

3. ✅ **Analyze Results**:
   - Monthly transaction differences
   - Missing months in 4-year output
   - Date range coverage
   - Boundary issues

4. ✅ **Update Documentation**:
   - TESTING_RECORDS.md with 3-year results
   - BOUNDARY_ANALYSIS.md with findings
   - PROJECT_PLAN.md with working range limits

---

**Last Updated**: 2025-11-18 10:21:26  
**Status**: 🔄 Awaiting 3-year test completion  
**Next Steps**: Compare CSVs month by month after 3-year test finishes

