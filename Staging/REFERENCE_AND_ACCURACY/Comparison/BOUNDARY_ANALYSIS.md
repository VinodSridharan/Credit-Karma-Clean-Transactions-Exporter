# Boundary Analysis - 4-Year vs 5-Year Range

**Created**: 2025-11-18 10:01:04  
**Purpose**: Analyze the boundary between working 4-year range and failing 5-year range  
**Status**: 🔄 Awaiting 4-year test completion

---

## 🎯 Test Results Summary

### ✅ Working Ranges
- **2 Years**: ✅ **WORKING** (11/19/2023 to 11/18/2025)
  - Transactions: 2,286 exported
  - Time: 18m 3s
  - Status: 100% complete, PRISTINE

- **4 Years**: 🔄 **TESTING** (11/01/2021 to 11/18/2025)
  - Status: In progress
  - Expected: Should work based on pattern

### ❌ Failing Ranges
- **5 Years**: ❌ **FAILED** (attempted)
  - Status: Did not work
  - Boundary point between working/failing

- **6 Years**: ❌ **FAILED** (11/01/2019 to 11/18/2025)
  - Status: Did not work

---

## 📊 Boundary Analysis

### Date Range Breakdown

| Range | Start Date | End Date | Days | Status | Pattern |
|-------|-----------|----------|------|--------|---------|
| **2 Years** | 11/19/2023 | 11/18/2025 | ~730 days | ✅ Working | Nov start |
| **4 Years** | 11/01/2021 | 11/18/2025 | ~1,448 days | 🔄 Testing | Nov start |
| **5 Years** | ~11/01/2020 | 11/18/2025 | ~1,843 days | ❌ Failed | Nov start |
| **6 Years** | 11/01/2019 | 11/18/2025 | ~2,209 days | ❌ Failed | Nov start |

### Key Observations

1. **Working Threshold**: Between 4 years (~1,448 days) and 5 years (~1,843 days)
2. **Boundary Point**: Approximately **~1,500-1,800 days** (4-5 years)
3. **Pattern**: All tests use November start dates (consistent pattern)
4. **Test Range**: Manual date entry (custom range)

---

## 🔍 Minimal 5-Year Range Analysis

### Objective
Find the minimal date range that makes 5-year extraction work, if possible.

### Hypothesis
- If 4 years works: Range limit is **~1,448-1,843 days** (between 4-5 years)
- Possible solutions:
  1. **Reduce to 4 years**: Maximum working range
  2. **Optimize 5-year logic**: May need special handling for >4 year ranges
  3. **Split 5-year range**: Split into smaller chunks (e.g., 2 years + 3 years)

### Test Strategy (After 4-year confirmation)

**If 4-year succeeds:**
1. Test boundary: Try **4.5 years** (e.g., 05/01/2021 to 11/18/2025 = ~1,626 days)
2. If 4.5 works: Try **4.75 years** (e.g., 02/01/2021 to 11/18/2025 = ~1,745 days)
3. If 4.75 works: Try **4.9 years** (e.g., 12/01/2020 to 11/18/2025 = ~1,813 days)
4. Find exact failure point

**If 4-year fails:**
- Maximum working range is **2 years** (~730 days)
- 5-year preset not viable without optimization

---

## 📝 Preset Implementation Strategy

### Manual Test Conditions for Presets

Based on successful tests, presets should:

1. **Use November Start Dates**: 
   - Pattern: Start from November 1st of N years ago
   - Example: "Last 4 Years" = 11/01/2021 to 11/18/2025

2. **Maintain Buffer Days**:
   - Start: -2 days before target start date
   - End: +2 days after target end date
   - Ensures boundary capture

3. **Date Range Limit**:
   - **Maximum**: 4 years (~1,448 days) [pending 4-year test confirmation]
   - **Recommended**: 2 years (~730 days) [confirmed working]
   - **Avoid**: >4 years - will fail

### Preset Code Pattern

```javascript
case 'last-4-years':
    // November 1st of 4 years ago MINUS 2 days to current date PLUS 2 days
    // Pattern matches manual test: 11/01/2021 to 11/18/2025
    startDate = new Date(today.getFullYear() - 4, 10, 1); // November = month 10
    startDate.setDate(startDate.getDate() - 2); // Subtract 2 days for boundary buffer
    endDate = new Date(today);
    endDate.setDate(endDate.getDate() + 2); // Add 2 days for boundary buffer
    endDate.setHours(23, 59, 59, 999); // End of day
    break;
```

---

## ⚠️ Current Status

- **4-Year Test**: 🔄 In Progress (11/01/2021 to 11/18/2025)
- **Next Steps**: 
  - Wait for 4-year test completion
  - Verify CSV output (check Downloads folder)
  - Confirm PRISTINE status
  - If successful: Analyze minimal 5-year approach
  - If failed: Maximum working range = 2 years

---

**Last Updated**: 2025-11-18 10:01:04  
**Next Update**: After 4-year test completion

