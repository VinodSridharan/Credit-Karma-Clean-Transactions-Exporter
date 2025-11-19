# Reference and Accuracy Documents

**Created**: 2025-11-18 11:02:14  
**Last Updated**: 2025-11-18 11:02:14  
**Purpose**: Organized collection of reference data, accuracy comparisons, and analysis tools

---

## 📁 Folder Structure

```
REFERENCE_AND_ACCURACY/
├── Reference/              # Reference data and baseline metrics
├── Comparison/             # Accuracy comparisons and analysis reports
├── Tools/                  # Analysis scripts and utilities
└── README.md              # This file
```

---

## 📚 Reference Documents

**Location**: `Reference/`

### Purpose
Baseline data, expected counts, and reference metrics for comparison.

### Files

1. **DAILY_TRANSACTION_REFERENCE_TABLE.md**
   - Daily and monthly transaction count reference table
   - Expected counts based on PRISTINE test results
   - Daily averages by time period
   - Monthly estimated counts

2. **KNOWN_DATE_COUNTS.md**
   - Maximum transaction counts by date range
   - Quality indicators for different ranges
   - Expected counts for validation

3. **KNOWN_REFERENCE_DATA.md**
   - Known reference data points
   - Historical test results
   - Baseline metrics

4. **LESSONS_LEARNED.md**
   - Key learnings from testing
   - Best practices
   - Patterns and observations

---

## 📊 Comparison Documents

**Location**: `Comparison/`

### Purpose
Accuracy analysis, comparison reports, and detailed output evaluations.

### Files

1. **PRISTINE_OUTPUT_COMPARISON.md** ⭐
   - Detailed comparison of all PRISTINE test outputs
   - Overall percent correctness analysis
   - Monthwise percent correctness
   - Shortfall dates identification
   - Comprehensive statistics

2. **CSV_COMPARISON_ANALYSIS.md**
   - CSV file comparison methodology
   - Month-by-month comparison plan
   - Analysis script templates

3. **TESTING_SUMMARY_FINAL.md**
   - Complete testing summary
   - All test results
   - Pristine method identification

4. **STATUS_SUMMARY.md**
   - Quick reference summary
   - Status overview
   - Key statistics

5. **FINAL_SUMMARY.md**
   - Final status report
   - Success rate analysis
   - Next steps

6. **BOUNDARY_ANALYSIS.md**
   - Boundary testing analysis
   - Working range limits
   - Failure analysis

7. **ROOT_CAUSE_ANALYSIS.md**
   - Root cause analysis of issues
   - Problem identification
   - Fix documentation

8. **POLISHED_FOLDER_ANALYSIS.md**
   - Analysis of defective code
   - Folder comparison
   - Recommendations

---

## 🔧 Tools

**Location**: `Tools/`

### Purpose
Python scripts and utilities for automated analysis and comparison.

### Files

1. **compare_with_reference.py** ⭐
   - Compare CSV outputs with reference table
   - Calculate percent correctness
   - Identify shortfall dates
   - Generate detailed reports
   
   **Usage**:
   ```bash
   python compare_with_reference.py <csv_file> [--range-type 2year|3year]
   ```

2. **analyze_csvs.py**
   - Compare two CSV files
   - Month-by-month comparison
   - Daily sample analysis
   
   **Usage**:
   ```bash
   python analyze_csvs.py
   ```

3. **csv_analysis.py**
   - CSV analysis utilities
   - Transaction counting
   - Date range analysis

---

## 🎯 How to Use

### For Reference Data:

1. **Check Reference/ folder** for expected counts and baseline metrics
2. **Use DAILY_TRANSACTION_REFERENCE_TABLE.md** for daily/monthly expected counts
3. **Use KNOWN_DATE_COUNTS.md** for range-specific expected counts

### For Accuracy Analysis:

1. **Run comparison tool** from Tools/ folder:
   ```bash
   cd REFERENCE_AND_ACCURACY/Tools
   python compare_with_reference.py ../path/to/csv_file.csv --range-type 2year
   ```

2. **Review PRISTINE_OUTPUT_COMPARISON.md** for detailed analysis methodology

3. **Check Comparison/ folder** for existing analysis reports

### For Output Validation:

1. **Parse your CSV output** to get daily/monthly counts
2. **Compare with reference** using expected counts from Reference/ folder
3. **Calculate percent correctness**: (Actual / Expected) × 100
4. **Identify shortfalls**: Dates/months with <80% correctness
5. **Use comparison tools** for automated analysis

---

## 📋 Accuracy Thresholds

| Percent | Status | Description |
|---------|--------|-------------|
| **100%+** | ✅ EXCELLENT | ±5% of expected |
| **95-99%** | ✅ VERY GOOD | ±10% of expected |
| **80-94%** | ⚠️ ACCEPTABLE | ±20% of expected |
| **<80%** | ❌ POOR | >±20% of expected (Missing Data) |

---

## 📊 Current Status

### Reference Data Coverage:

- ✅ Daily transaction counts (Nov 2025, Oct 2025)
- ✅ Monthly transaction counts (Oct 2025 exact, Nov 2025 partial)
- ✅ 2-Year range reference (2,286 transactions, 3.13/day)
- ✅ 3-Year range reference (2,865 transactions, 2.65/day)

### Comparison Results:

- ✅ This Month preset: **100.00%** correctness
- ✅ Last Month preset: **100.00%** correctness
- ✅ 2-Year Manual test: **100.04%** correctness
- ✅ 3-Year Manual test: **99.93%** correctness

**Average Percent Correctness**: **100.00%** (Perfect)

---

**Last Updated**: 2025-11-18 11:02:14  
**Status**: ✅ **ORGANIZED AND READY FOR USE**

