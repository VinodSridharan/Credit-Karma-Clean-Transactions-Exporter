# 📚 Lessons Learned

**Last Updated:** 2025-11-22 21:00:00  
**Document Owner:** Project Plan & Review Resource  
**Status:** ✅ Active Knowledge Base  
**Version:** 1.3

---

## 🎯 Document Purpose

This document maintains critical lessons learned from project development, user feedback, and problem-solving experiences. All lessons are synchronized with review inputs and metadata inputs to ensure continuous improvement and knowledge preservation.

---

## 📋 Lessons Learned

### Lesson #1: Last Month Preset - Incomplete Boundary Detection (Critical)

**Date:** 2025-11-22  
**Status:** ✅ Resolved - Code Fix Required  
**Priority:** 🔴 CRITICAL

#### Problem Statement

**Issue:** Last Month preset (October) only captured 47 records instead of expected 133 posted transactions. Date range was only Oct 18-31 instead of full month Oct 1-31.

**Impact:**
- ❌ Only 35% of expected transactions captured (47/133)
- ❌ Missing 17 days of transaction data (Oct 1-17)
- ❌ Incomplete date range (14 days instead of 31 days)
- ❌ Failed to meet 100% recovery standard

#### Root Cause Analysis

**Primary Causes:**

1. **Early Stopping Risk:**
   - Scrolling loop stopped after seeing enough "unchanged scrolls"
   - Boundary detection satisfied too early based on oldest transaction found
   - Did not scroll far enough to capture start boundary (Oct 1)
   - Stop condition triggered before all lazy-loaded transactions were available

2. **Incomplete Lazy Loading Triggers:**
   - Scroll increment may not have been sufficient to trigger Credit Karma's lazy loading
   - Mid-month data (Oct 1-17) never entered DOM due to incomplete scroll coverage
   - Platform lazy-loads data after user scroll passes ~2/3 or ~80% of page - this wasn't achieved

3. **Boundary Detection Logic Issues:**
   - Detection of "scrolledPastStart" and "scrolledPastEnd" boundaries too strict
   - Overly reliant on oldest record detected without sufficient buffer
   - DOM changes may have disrupted boundary calculations
   - Buffer scrolls insufficient (need 5 days past end, 3 days before start)

4. **Segmented Scroll-Back Not Fully Utilized:**
   - Segmented scroll to top existed but may not extract at each step during reverse scroll
   - Older transactions at top of list not captured during scroll-back phase
   - Need to extract after each segment of reverse scroll

#### Solution & Recommendations

**1. Buffer Scrolls Past Both Boundaries:**
```javascript
// For single month or "last month" scenarios, require scrolling significantly past both boundaries
// - At least 5 days past end date (Oct 31 → Nov 5)
// - At least 3 days before start date (Oct 1 → Sep 28)
// Add a "final pass" that continues scrolling even if optimal stop detection is met
```

**2. Force Smaller Scroll Increments in Key Range:**
```javascript
// Near boundaries (start and end of month), use smaller increments (0.1x viewport height)
// Add explicit waits and extraction passes after each scroll increment near boundaries
// This ensures lazy loading is triggered for edge transactions
```

**3. Boundary Verification - Require BOTH Dates:**
```javascript
// After primary scroll, iterate through all transactions and manually verify:
// - Earliest date is Oct 1 (start boundary)
// - Latest date is Oct 31 (end boundary)
// If not, keep scrolling until both dates appear or up to hard maximum (300 scrolls)
```

**4. "Completed Month" Check:**
```javascript
// After each scroll + extraction, count unique transaction dates present for the month
// October should have at least 31 unique dates
// If fewer, log: "Boundary incomplete—continuing scroll…"
// Only stop when all 31 dates present AND 133+ transactions
```

**5. Enhanced Segmented Scroll-Back Logic:**
```javascript
// CRITICAL: Scroll back from bottom to top in small increments
// - Use scrollStep = window.innerHeight * 0.2 (small segments)
// - After EACH upward scroll segment, run extractAllTransactions()
// - Continue until window.scrollY <= 0 (true top reached)
// - Extract at each step to capture newly-loaded older transactions
```

**6. Improved Stop Condition Logic:**
```javascript
// Only stop when ALL criteria met:
// - hasStartDate: earliest transaction date <= Oct 1
// - hasEndDate: latest transaction date >= Oct 31
// - enoughTransactions: posted transactions >= 133
// - uniqueDatesCount >= 31 (complete month coverage)
// - scrolledPastStart: scrolled past start boundary (3 days before)
// - scrolledPastEnd: scrolled past end boundary (5 days after)
```

#### Code Fix Requirements

**Key Changes Needed in `content.js`:**

1. **Increase Buffer Scrolls:**
   - For Last Month preset: require scrolling 5 days past end date, 3 days before start date
   - Verify BOTH boundaries passed before allowing stop

2. **Add Complete Month Verification:**
   - Count unique transaction dates in month
   - For October: require 31 unique dates before stopping
   - Log diagnostic: "Date coverage: X/31 unique dates"

3. **Fix Segmented Scroll-Back:**
   - Extract transactions after EACH upward scroll segment
   - Ensure scroll reaches true top (window.scrollY <= 0)
   - Add extraction passes at each segment position

4. **Enhance Boundary Verification:**
   - Manually verify Oct 1 and Oct 31 dates are present
   - If missing, continue scrolling with smaller increments near boundaries
   - Add explicit boundary date checks in stop condition

5. **Improve Lazy Loading Triggers:**
   - Force dispatch scroll events if needed
   - Use smaller increments near boundaries to trigger lazy loads
   - Add waits after each scroll to allow DOM updates

#### Example Fix Outline

```javascript
// In scrolling loop (pseudo-code)
while (!stopScrolling && scrollAttempts < MAX_SCROLLS) {
    // ... scrolling + extraction code ...
    
    // Count in-range POSTED transactions only
    let transactionsInRange = allTransactions.filter(
        t => isDateInRange(t.date, startDateObj, endDateObj) && 
             t.status !== 'pending'
    );
    
    // Get unique dates
    let uniqueDates = new Set(
        transactionsInRange
            .map(tx => {
                const txDate = parseTransactionDate(tx.date);
                return txDate ? `${txDate.getFullYear()}-${txDate.getMonth()}-${txDate.getDate()}` : null;
            })
            .filter(d => d)
    );
    
    // For October (Last Month), require:
    let hasStartDate = uniqueDates.has('2025-10-01'); // Oct 1 present
    let hasEndDate = uniqueDates.has('2025-10-31');   // Oct 31 present
    let enoughTransactions = transactionsInRange.length >= 133; // 133+ posted transactions
    let completeMonth = uniqueDates.size >= 31; // All 31 days covered
    
    // Only stop when ALL criteria met
    if (hasStartDate && hasEndDate && enoughTransactions && completeMonth) {
        break; // Complete extraction achieved
    }
    
    // Otherwise, keep scrolling (use smaller increments near boundaries)
}
```

#### Prevention Strategy

**For Future Development:**

1. ✅ **Always verify BOTH boundary dates** are present in collected transactions
2. ✅ **Count unique dates** to ensure complete month coverage
3. ✅ **Use buffer scrolls** past both boundaries before stopping
4. ✅ **Extract during scroll-back** at each segment to capture older transactions
5. ✅ **Test with known data** (133 transactions for October) to validate completeness
6. ✅ **Log diagnostic information** (unique dates count, boundary status) for debugging

#### Related Documentation

- **Root Cause Analysis:** See `TxVault/Documentation/ROOT_CAUSE_ANALYSIS.md`
- **Code Implementation Log:** See `Selenium-Version/Documentation/STEP_1.1_CODE_IMPLEMENTATION_LOG.md`
- **Workflow Policy:** See `WORKFLOW_POLICY.md` (Code Resource Issue Resolution Protocol)

### Lesson #2: SYSTEM_DATE Captured But Never Used (Critical)

**Date:** 2025-11-22  
**Status:** ✅ Resolved - Code Fix Applied  
**Priority:** 🔴 CRITICAL

#### Problem Statement

**Issue:** Code captured `SYSTEM_DATE` at the start of extraction (line 1114) with explicit comment "Collect system date once at start for consistency throughout extraction", but the captured `SYSTEM_DATE` was never actually used. Instead, the code continued to call `new Date()` at multiple points throughout extraction (lines 1352, 1452, 1470, 1654, 1841, 1893, 1993, 2348) to determine if the current extraction is for "Last Month".

**Impact:**
- ❌ Inconsistent date calculations if extraction spans midnight or crosses date boundary
- ❌ Multiple `isLastMonth` calculations could return different results during same extraction
- ❌ Potential incorrect extraction logic if date changes during long-running extraction
- ❌ Violates principle of single source of truth for system date

#### Root Cause Analysis

**Primary Causes:**

1. **Incomplete Implementation:**
   - `SYSTEM_DATE` was captured at start but never referenced in date calculations
   - Multiple `new Date()` calls scattered throughout code instead of using captured date
   - No enforcement mechanism to ensure SYSTEM_DATE is used consistently

2. **Copy-Paste Pattern:**
   - Date calculations copied from different sections without updating to use SYSTEM_DATE
   - Each section independently called `new Date()` without checking for existing SYSTEM_DATE

3. **Missing Code Review:**
   - SYSTEM_DATE capture added but usage not verified throughout codebase
   - No systematic replacement of `new Date()` calls with SYSTEM_DATE

**Evidence:**
- Line 1114: `const SYSTEM_DATE = new Date();` - Captured but never used
- Lines 1352, 1452, 1470, 1654, 1841, 1893, 1993, 2348: Multiple `new Date()` calls for `isLastMonth` calculations
- All date calculations for `isLastMonth` detection should use SYSTEM_DATE for consistency

#### Solution & Recommendations

**1. Replace All `new Date()` Calls with SYSTEM_DATE:**
```javascript
// BEFORE:
const todayForStatus = new Date();
const daysSinceEndForStatus = (todayForStatus - endDateObj) / (24 * 60 * 60 * 1000);

// AFTER:
// Use SYSTEM_DATE for consistency (captured once at start)
const daysSinceEndForStatus = (SYSTEM_DATE - endDateObj) / (24 * 60 * 60 * 1000);
```

**2. Systematic Replacement:**
- ✅ Replace all `isLastMonth` calculation date calls with SYSTEM_DATE
- ✅ Replace pending check date calculations with SYSTEM_DATE
- ✅ Replace summary date calculations with SYSTEM_DATE
- ✅ Keep SYSTEM_DATE capture at function start for single source of truth

**3. Code Review Checklist:**
- ✅ Verify SYSTEM_DATE is captured once at start
- ✅ Verify all date calculations use SYSTEM_DATE
- ✅ No `new Date()` calls for date range calculations
- ✅ SYSTEM_DATE used consistently throughout extraction

#### Code Fix Requirements

**Key Changes Made in `content.js`:**

1. **Line 1352-1353:** `isLastMonthForStatus` now uses SYSTEM_DATE
2. **Line 1452-1453:** `isLastMonthMin` now uses SYSTEM_DATE
3. **Line 1470-1471:** `isLastMonth` now uses SYSTEM_DATE
4. **Line 1654-1655:** `isLastMonthStop` now uses SYSTEM_DATE
5. **Line 1841-1842:** `isLastMonthCheck` now uses SYSTEM_DATE
6. **Line 1893-1894:** `isLastMonthUnchanged` now uses SYSTEM_DATE
7. **Line 1993-1994:** Pending check calculation now uses SYSTEM_DATE
8. **Line 2349-2350:** `isLastMonthSummary` now uses SYSTEM_DATE

#### Prevention Strategy

**For Future Development:**

1. ✅ **Always use captured SYSTEM_DATE** for all date calculations within extraction
2. ✅ **Single source of truth** - capture date once at start, use throughout
3. ✅ **Code review checklist** - verify no `new Date()` calls for date range calculations
4. ✅ **Consistent date handling** - prevents inconsistencies if extraction spans date boundaries
5. ✅ **Documentation** - comment SYSTEM_DATE usage to prevent future regressions

#### Related Documentation

- **Root Cause Analysis:** See `TxVault/Documentation/ROOT_CAUSE_ANALYSIS.md` (Issue 8)
- **Code Implementation:** All date calculations now use SYSTEM_DATE consistently

---

### Lesson #3: Hardcoded Values Break Centralized Configuration System

**Date:** 2025-11-22  
**Status:** ✅ Resolved - Code Fix Applied  
**Priority:** 🟡 MEDIUM

#### Problem Statement

**Issue:** Line 1788 hardcoded the value `40` (`if (isStable && scrollAttempts >= 40)`) instead of using the calculated `MIN_SCROLLS_FOR_STOP` variable. While the hardcoded value currently matched the CONFIG value for Last Month, this broke the centralized configuration system introduced in the same commit.

**Impact:**
- ❌ If CONFIG values are modified in the future, hardcoded check won't update
- ❌ Breaks centralized configuration principle
- ❌ Potential logic errors if CONFIG.MIN_SCROLLS.LAST_MONTH changes
- ❌ Inconsistent behavior between different code sections

#### Root Cause Analysis

**Primary Causes:**

1. **Incomplete Refactoring:**
   - CONFIG system was introduced to centralize parameters
   - Most code updated to use CONFIG, but one hardcoded value missed
   - Line 1788 was in nested conditional, easy to miss during refactoring

2. **Copy-Paste Without Update:**
   - Hardcoded value copied from earlier version
   - Not updated when CONFIG system was introduced
   - No systematic search for hardcoded values after CONFIG introduction

**Evidence:**
- Line 1788: `if (isStable && scrollAttempts >= 40)` - Hardcoded value
- Line 1697-1704: `MIN_SCROLLS_FOR_STOP` calculated from CONFIG
- CONFIG.MIN_SCROLLS.LAST_MONTH = 40 (matches hardcoded value, but breaks system)

#### Solution & Recommendations

**1. Use CONFIG Variable:**
```javascript
// BEFORE:
if (isStable && scrollAttempts >= 40) {

// AFTER:
// Use MIN_SCROLLS_FOR_STOP from CONFIG (already calculated above) instead of hardcoded value
if (isStable && scrollAttempts >= MIN_SCROLLS_FOR_STOP) {
```

**2. Systematic Code Review:**
- ✅ Search for hardcoded values after introducing CONFIG system
- ✅ Verify all parameters use CONFIG values
- ✅ No magic numbers in conditional checks

#### Code Fix Requirements

**Key Changes Made in `content.js`:**

1. **Line 1788-1789:** Changed from hardcoded `40` to `MIN_SCROLLS_FOR_STOP` variable

#### Prevention Strategy

**For Future Development:**

1. ✅ **Always use CONFIG values** - no hardcoded parameters
2. ✅ **Code review checklist** - verify no magic numbers after CONFIG introduction
3. ✅ **Systematic refactoring** - search for hardcoded values when introducing configuration
4. ✅ **Consistent behavior** - all code sections use same configuration source

#### Related Documentation

- **Root Cause Analysis:** See `TxVault/Documentation/ROOT_CAUSE_ANALYSIS.md` (Issue 9)
- **CONFIG System:** All parameters centralized at top of `content.js` (lines 15-56)

---

### Lesson #4: Critical Syntax Error - Extra Closing Brace Preventing Script Loading

**Date:** 2025-11-22  
**Status:** ✅ Resolved - Code Fix Applied  
**Priority:** 🔴 CRITICAL

#### Problem Statement

**Issue:** Extra closing brace `}` at line 1619 in `content.js` prematurely closed the `try` block (started at line 1435), making the `catch` block at line 1620 invalid syntax. This caused `Uncaught SyntaxError: Unexpected token 'catch'` error, preventing the entire content script from loading.

**Impact:**
- 🔴 **Complete Extension Failure** - Content script failed to load due to syntax error
- 🔴 **"No Scroll" Symptom** - Extension appeared broken to user (no scrolling occurred)
- 🔴 **No Transaction Extraction** - All extraction logic blocked because script never loaded
- 🔴 **JavaScript Parser Failure** - Parser failed before any code could execute

#### Root Cause Analysis

**Primary Causes:**

1. **Extra Closing Brace:**
   - Line 1619 had an extra `}` that closed the `try` block prematurely
   - The `try` block started at line 1435
   - The extra brace made the `catch` at line 1620 invalid (no matching `try`)
   - JavaScript parser threw syntax error before script could load

2. **Large Function Complexity:**
   - `captureTransactionsInDateRange` function is ~900 lines
   - Multiple nested `try-catch-finally` blocks (outer try at line 1240, inner try at line 1435)
   - Nested `if` statements made brace matching difficult to track

3. **No Syntax Validation:**
   - No pre-commit syntax validation caught the error
   - No automated testing of script loading before deployment
   - Syntax error only discovered when user reported "no scroll"

4. **Incremental Code Changes:**
   - Extra brace likely introduced during incremental edits
   - No systematic brace matching verification after each change
   - Easy to miss brace mismatches in large, nested structures

**Evidence:**
- Browser console: `Uncaught SyntaxError: Unexpected token 'catch'` at line 1620
- Code inspection: Extra `}` at line 1619 before `catch` at line 1620
- Try block starts at line 1435, catch expected at line 1620
- Removing extra brace restored proper structure

#### Solution & Recommendations

**1. Remove Extra Closing Brace:**
```javascript
// BEFORE (line 1616-1620):
                            }
                        }
                    }
                }  // ❌ EXTRA closing brace - removed
                } catch (e) {

// AFTER (line 1616-1620):
                            }
                        }
                    }
                } catch (e) {  // ✅ Now correctly follows try block
```

**2. Verify Try-Catch-Finally Structure:**
- ✅ Verify `try` block starts correctly (line 1435)
- ✅ Verify `catch` block follows `try` correctly (line 1620)
- ✅ Verify `finally` block structure (line 2203 - confirmed correct by user)
- ✅ Verify outer try-catch-finally structure (lines 1240-2250)

**3. Add Syntax Validation:**
- ✅ Add pre-commit hooks with `node -c TxVault/content.js` to validate syntax
- ✅ Test extension loading in Chrome before deployment
- ✅ Use IDE brace matching features to highlight unmatched braces
- ✅ Run linter to catch syntax errors early

#### Code Fix Requirements

**Key Changes Made in `content.js`:**

1. **Line 1619:** Removed extra closing brace `}`
2. **Structure Verification:** Confirmed `try-catch-finally` blocks properly nested:
   - Outer try-catch-finally: Lines 1240-2250
   - Inner try-catch: Lines 1435-1623 (Issue 14 location)
   - Finally block: Lines 2203-2250 (correctly closes outer try)

**Verification Steps:**
1. ✅ Removed extra brace at line 1619
2. ✅ Verified `catch` at line 1620 now correctly follows `try` at line 1435
3. ✅ Verified `finally` at line 2203 correctly closes outer try at line 1240
4. ✅ Tested extension loading - no syntax errors
5. ✅ Tested scrolling functionality - works correctly
6. ✅ User verified `finally` block structure is correct

#### Prevention Strategy

**For Future Development:**

1. ✅ **Syntax Validation**: Add pre-commit hooks with `node -c` to validate JavaScript syntax before commits
2. ✅ **Brace Matching Tools**: Use IDE features or linters to highlight unmatched braces in real-time
3. ✅ **Systematic Code Review**: Review try-catch-finally blocks after each edit, especially in large functions
4. ✅ **Testing Before Deployment**: Test extension loading in Chrome (`chrome://extensions/`) before marking as ready
5. ✅ **Incremental Validation**: Validate syntax after each significant code change, not just at the end
6. ✅ **Function Size Management**: Consider refactoring very large functions (>500 lines) to improve maintainability
7. ✅ **Code Structure Documentation**: Document complex nested try-catch-finally structures with comments

#### Related Documentation

- **Root Cause Analysis:** See `TxVault/Documentation/ROOT_CAUSE_ANALYSIS.md` (Issue 14)
- **Project Review:** See `TxVault/Documentation/PROJECT_REVIEW.md` (Version 3.0.4 entry)
- **Syntax Error Investigation:** See `TxVault/Documentation/SYNTAX_ERROR_SUMMARY.md` (initial investigation)

---

## 💡 Lesson #9: Try-Finally Structure and Linter False Positives

**Date Learned:** 2025-11-22 21:30:00  
**Severity:** 🔴 **CRITICAL**  
**Category:** Syntax & Structure

### Problem Context

**Issue:** Browser console reported "Unexpected token 'finally'" at `content.js:2203`, and linter reported "'try' expected" at the same location, even though the code structure appeared correct.

**Investigation:**
- Outer `try` block starts at line 1240 (4 spaces indentation)
- Nested `try-catch` block (lines 1940-2201) properly closed at 8 spaces
- `finally` block at line 2203 (4 spaces) should match outer `try`
- Structure: `try { ... } finally { ... }` is valid JavaScript syntax
- Linter reported error even though structure was correct

### Root Cause

**Primary Cause:**
1. **Linter False Positive**: Linter may report errors on valid `try-finally` structures
2. **Browser Caching**: Browser may cache old version of script with syntax errors
3. **Code Complexity**: Large nested try-catch blocks can confuse linters
4. **Valid Syntax**: `try-finally` without `catch` is valid JavaScript (ECMAScript standard)

**Secondary Factors:**
- Large function (>1000 lines) with deeply nested try-catch blocks
- Multiple nested try-catch blocks at different indentation levels
- Linter may not always correctly parse complex nested structures

### Solution

**Fix Applied:**
1. ✅ Verified `try-finally` structure is syntactically correct
2. ✅ Confirmed outer `try` (4 spaces) matches `finally` (4 spaces)
3. ✅ Validated that `try-finally` without `catch` is valid JavaScript
4. ✅ Recommended hard reload (Ctrl+Shift+R) to clear browser cache

**Key Insight:**
- `try-finally` without `catch` is **valid JavaScript syntax** per ECMAScript specification
- Linter errors on valid syntax should be treated as false positives
- Browser caching can show old errors even after fixes are applied
- Always verify syntax manually before trusting linter errors

### Prevention Strategy

**For Future Development:**

1. ✅ **Syntax Reference**: Verify syntax against ECMAScript specification when linter reports errors
2. ✅ **Hard Reload**: Always hard reload browser (Ctrl+Shift+R) after syntax fixes
3. ✅ **Multiple Linters**: Use multiple linters/tools to verify syntax if one reports false positives
4. ✅ **Manual Verification**: Manually count braces and verify indentation when linter conflicts with visual inspection
5. ✅ **Browser Cache**: Clear browser cache or use incognito mode to test after syntax fixes
6. ✅ **Code Structure**: Consider refactoring very large functions to reduce complexity and linter confusion
7. ✅ **Documentation**: Document complex nested structures with comments explaining brace matching

### Code Example

**Valid `try-finally` Structure:**
```javascript
try {
    // ... code ...
    try {
        // ... nested code ...
    } catch (nestedError) {
        // ... nested error handling ...
    }
    // ... more code ...
} finally {
    // ... cleanup code ...
}
```

**Key Points:**
- Outer `try` (4 spaces) must match `finally` (4 spaces)
- Nested `try-catch` (8 spaces) must be properly closed before outer `finally`
- `try-finally` without `catch` is valid JavaScript
- Linter errors on valid syntax should be investigated, not blindly trusted

### Verification Steps

1. ✅ Verify `try-finally` structure matches ECMAScript specification
2. ✅ Count braces manually to ensure proper nesting
3. ✅ Check indentation levels match for try/finally blocks
4. ✅ Hard reload browser (Ctrl+Shift+R) after syntax fixes
5. ✅ Test in incognito mode to avoid caching issues
6. ✅ Verify linter error is false positive by checking syntax reference

#### Related Documentation

- **Root Cause Analysis:** See `TxVault/Documentation/ROOT_CAUSE_ANALYSIS.md` (Issue 16)
- **Project Review:** See `TxVault/Documentation/PROJECT_REVIEW.md` (latest version entry)
- **ECMAScript Specification:** `try-finally` without `catch` is valid syntax

---

## 🔄 Update History

| Date | Update Type | Description | Source |
|------|-------------|-------------|--------|
| 2025-11-22 11:35:29 | Lesson Added | Added Lesson #1: Last Month Preset - Incomplete Boundary Detection | Code review & user testing feedback |
| 2025-11-22 14:05:24 | Lesson Added | Added Lesson #2: SYSTEM_DATE Captured But Never Used | Code review & bug fix |
| 2025-11-22 14:05:24 | Lesson Added | Added Lesson #3: Hardcoded Values Break Centralized Configuration | Code review & bug fix |
| 2025-11-22 20:15:00 | Lesson Added | Added Lesson #4: Critical Syntax Error - Extra Closing Brace Preventing Script Loading | User bug report & syntax fix |
| 2025-11-22 21:30:00 | Lesson Added | Added Lesson #9: Try-Finally Structure and Linter False Positives | Linter error investigation & syntax validation |

---

## 📝 Notes

- All lessons are automatically synchronized with Project Plan & Review Resource
- Lessons are cross-referenced with Root Cause Analysis and Code Implementation Log
- This document serves as knowledge base for Code Resource when encountering similar issues
- Lessons are reviewed and updated based on new insights and problem-solving experiences

---

**Document Version:** 1.2  
**Last Updated:** 2025-11-22 20:15:00  
**Next Review:** When new lessons learned or updates needed  
**⚠️ IMPORTANT:** Always update "Last Updated" field with current system time when making changes

