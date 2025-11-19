# Reference Document Construction - Guidelines

**Created**: 2025-11-18 13:11:14  
**Last Updated**: 2025-11-18 13:11:14  
**Purpose**: Guidelines for constructing and maintaining reference documents (TEST DATA SOURCE)  
**Status**: ✅ **ACTIVE - CONSTANTLY UPDATED WITH NEW DATA**

---

## 🎯 Purpose

This document outlines the methodology for constructing and maintaining reference documents that serve as the TEST DATA SOURCE for all comparisons.

---

## 📊 Key Principles

### 1. Record Count Matching is the Standard

- ✅ **Record count matching matters** - Transactions per day is an independent event and can vary naturally
- ✅ **Maximum record count sets the reference** - Highest count from any PRISTINE source becomes the standard
- ✅ **Transactions/day is NOT used for comparison** - Only total record counts are compared

### 2. Maximum Record Count is Authoritative

- ✅ **Highest count wins** - When new data shows a higher count, it immediately becomes the reference
- ✅ **Multiple sources can verify** - Same count from multiple sources strengthens the reference
- ✅ **Update immediately** - Reference documents are updated as soon as higher counts are verified

### 3. PRISTINE Status Required

- ✅ **Only 100% complete extractions** - Partial or failed extractions never update the reference
- ✅ **Boundary accuracy required** - Both start and end dates must be captured correctly
- ✅ **Data completeness required** - 100% data completeness is mandatory

### 4. Constant Updates

- ✅ **This is a living document** - Updated whenever new PRISTINE data arrives
- ✅ **Multiple data sources** - Can come from extension runs, Excel analysis, CSV files, etc.
- ✅ **Timestamp tracking** - Every update includes timestamp and source

---

## 🔄 Update Process

### When New Data Arrives:

1. **Identify Source**: Determine data source (extension run, Excel file, CSV file, manual count, etc.)
2. **Extract Count**: Count total records for the date range
3. **Verify PRISTINE Status**: 
   - Check if 100% complete extraction
   - Verify boundary accuracy (start and end dates captured)
   - Confirm data completeness
4. **Compare with Reference**: 
   - If higher: ✅ **UPDATE REFERENCE** immediately
   - If equal: ✅ Add as additional verification source
   - If lower: ⚠️ Do not update (indicates incomplete extraction)
5. **Update Documents**:
   - Update `TEST_DATA_SOURCE.md` with new maximum count
   - Update `KNOWN_DATE_COUNTS.md` with new maximum
   - Update all comparison tables
   - Recalculate dependent counts (e.g., if Oct count changes, update Jan-Oct total)
6. **Update Timestamp**: Update "Last Updated" timestamp in all affected documents
7. **Document Source**: Record source, date, and verification method

### Example: October 2025 Update

**Previous Reference**: 133 transactions (from Last Month preset)  
**New Data**: 139 transactions (from Excel file analysis)  
**Action**: ✅ **UPDATE** - 139 > 133, so 139 becomes new reference  
**Dependent Update**: Jan-Oct 2025 count increases from 1,497 to 1,503 (+6)

---

## 📋 Data Source Priority

### Priority Order (Highest to Lowest):

1. ✅ **Excel/CSV File Analysis** - Direct count from exported files (highest priority)
2. ✅ **Manual Run** - Direct extraction for specific date range
3. ✅ **Preset Run** - Extension preset extraction
4. ⚠️ **Longer-Range Test Portion** - Extracted segment from longer range (lower priority, may be estimate)

### When Multiple Sources Conflict:

- ✅ **Use highest count** - Maximum count becomes the reference
- ✅ **Verify PRISTINE status** - Only update if new count is from PRISTINE source
- ✅ **Document all sources** - Keep track of all counts for transparency

---

## 🔍 Reference Document Structure

### TEST_DATA_SOURCE.md Structure:

1. **Maximum Record Counts Table** - Primary reference table with max counts
2. **Segment Reference Counts** - Monthly and yearly segment breakdowns
3. **Update Process** - How to update this document
4. **Comparison Table** - Current tests vs reference
5. **Important Notes** - Key principles and warnings

### KNOWN_DATE_COUNTS.md Structure:

1. **Purpose** - Test Data Source explanation
2. **Maximum Transaction Counts** - Same as TEST_DATA_SOURCE.md (single source of truth)
3. **How to Use** - Comparison methodology
4. **Date Range Quality Check** - Expected counts for validation
5. **Files to Analyze** - Which CSV files to keep/review

---

## 📊 Recalculation Rules

### When Segment Count Changes:

**Example**: October 2025 count changes from 133 to 139

**Affected Counts**:
1. ✅ **Oct 1-31, 2025**: 133 → **139** (direct update)
2. ✅ **Jan 1 - Oct 31, 2025**: 1,497 → **1,503** (1,497 + 6 = 1,503)
3. ✅ **Nov 19, 2023 - Nov 18, 2025**: May need review if Oct 2025 was included
4. ✅ **Nov 1, 2022 - Nov 18, 2025**: May need review if Oct 2025 was included

**Rule**: Always recalculate totals that include the changed segment.

---

## ✅ Verification Checklist

Before updating reference:

- [ ] New count is from PRISTINE source (100% complete)
- [ ] New count is higher than existing reference
- [ ] Source is documented (Excel, CSV, extension run, etc.)
- [ ] Date range matches exactly
- [ ] Boundary dates are captured correctly
- [ ] All dependent counts are recalculated
- [ ] All reference documents are updated
- [ ] Comparison tables are updated
- [ ] Timestamp is updated
- [ ] Change is documented (what changed, why, source)

---

## 🎯 Example: October 2025 Update (2025-11-18)

### What Changed:

| Date Range | Old Reference | New Reference | Source | Change |
|-----------|---------------|---------------|--------|--------|
| **Oct 1-31, 2025** | 133 | **139** | Excel file analysis | +6 |
| **Jan 1 - Oct 31, 2025** | 1,497 | **1,503** | Recalculated | +6 |

### Documents Updated:

1. ✅ `TEST_DATA_SOURCE.md` - Updated Oct count and Jan-Oct total
2. ✅ `KNOWN_DATE_COUNTS.md` - Updated maximum counts
3. ✅ `TEST_DATA_SOURCE_COMPARISON_TABLE.md` - Updated comparison table
4. ✅ `YEARLY_SEGMENT_COMPARISON.md` - Updated segment comparisons

### Result:

- ✅ **October 2025**: 139 transactions (new reference) ⭐
- ✅ **Jan-Oct 2025**: 1,503 transactions (updated reference) ⭐
- ⚠️ **Last Month Preset**: 133 transactions (95.7% match - missing 6)
- ⚠️ **This Year Preset**: 1,497 transactions (99.6% match - missing 6 in Oct)

---

## 📝 Key Learnings

1. ✅ **Excel/CSV analysis can reveal higher counts** - Direct file analysis may show more transactions than extension reports
2. ✅ **Extension counts may be estimates** - Extension reports may show slightly lower counts due to filtering/timing
3. ✅ **Multiple sources strengthen reference** - Excel + extension runs provide verification
4. ✅ **Always verify with file analysis** - When possible, count directly from exported files

---

**Last Updated**: 2025-11-18 13:11:14  
**Status**: ✅ **ACTIVE - GUIDELINES FOR REFERENCE DOCUMENT CONSTRUCTION**

