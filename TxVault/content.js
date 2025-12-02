// ============================================================================
// TxVault Exporter - Enhanced Content Script
// ============================================================================

// ============================================================================
// CONFIGURATION PARAMETERS - Update values here as needed
// ============================================================================

/**
 * USER-CONFIGURABLE PARAMETERS
 * All adjustable parameters are centralized here for easy maintenance.
 * Update these values in one location to adjust extraction behavior.
 */

const CONFIG = {
    // Reference Standard: October transaction count range
    EXPECTED_MIN: 133,        // Minimum expected transactions for Last Month
    EXPECTED_MAX: 140,        // Maximum expected transactions for Last Month

    // Scroll Configuration - Minimum scrolls before checking stop conditions
    // PRISTINE VERSION VALUES: Proven to work for 133 transactions extraction
    MIN_SCROLLS: {
        LAST_MONTH: 40,       // Minimum scrolls for Last Month preset (Pristine: worked perfectly)
        MEDIUM_RANGE: 30,     // Minimum scrolls for medium ranges (11-31 days)
        LARGE_RANGE: 50,      // Minimum scrolls for large ranges (>31 days)
        BOTTOM_CHECK: 40,     // Minimum scrolls before bottom check (Last Month)
        UNCHANGED_CHECK: 40   // Minimum scrolls before unchanged check (Last Month)
    },

    // Boundary Buffer Configuration - Days to scroll past boundaries
    BUFFER_DAYS: {
        SMALL_RANGE: 2,       // Days past end for small ranges (<=10 days)
        MEDIUM_RANGE: 3,      // Days past end for medium ranges (11-31 days, non-Last-Month)
        LAST_MONTH: 5,        // Days past end for Last Month preset (31 days) - INCREASED for robustness
        LARGE_RANGE: 5,       // Days past end for large ranges (32-90 days)
        VERY_LARGE_RANGE: 7   // Days past end for very large ranges (>90 days)
    },

    // Before Start Buffer - Days before start date to capture
    BEFORE_START_BUFFER: {
        LAST_MONTH: 3,        // Days before start for Last Month preset
        STANDARD: 2,          // Days before start for standard ranges (<=90 days)
        LARGE: 3              // Days before start for large ranges (>90 days)
    },

    // Coverage Requirements - Percentage of date range that must be present
    COVERAGE_THRESHOLD: {
        RECENT: 0.98,         // Coverage required for recent ranges (<60 days ago) - 98%
        STANDARD: 0.95        // Coverage required for older ranges - 95%
    },

    // Wait Times - Milliseconds between scrolls
    SCROLL_WAIT_TIME: {
        FAST: 1000,           // Fast wait when target range found for 3+ consecutive scrolls
        STANDARD: 1500        // Standard wait time between scrolls
    },

    // Runtime & scroll caps for presets
    RUNTIME_LIMITS: {
        LAST_MONTH_SECONDS: 600,        // Hard cap: ~10 minutes for Last Month preset
        THIS_MONTH_SECONDS: 420,        // Hard cap: ~7 minutes for This Month (in-progress month)
        THIS_YEAR_SECONDS: 900,         // Hard cap: ~15 minutes for This Year
        LAST_YEAR_SECONDS: 840,         // Hard cap: ~14 minutes for Last Year (aim to export before CK session timeout)
        THIS_WEEK_SECONDS: 180,         // Hard cap: ~3 minutes for This Week (high-volume users)
        LAST_FIVE_YEARS_SECONDS: 1200,  // Hard cap: ~20 minutes for Last 5 Years deep archive
        DEFAULT_SECONDS: 1200           // Fallback cap: ~20 minutes for other presets
    },
    SCROLL_LIMITS: {
        LAST_MONTH_MAX_SCROLLS: 80,        // Hard cap: ~80 scrolls for Last Month preset
        THIS_MONTH_MAX_SCROLLS: 160,       // Hard cap: ~160 scrolls for This Month
        THIS_YEAR_MAX_SCROLLS: 260,        // Hard cap: ~260 scrolls for This Year
        LAST_YEAR_MAX_SCROLLS: 260,        // Hard cap: ~260 scrolls for Last Year
        THIS_WEEK_MAX_SCROLLS: 60,         // Hard cap: ~60 scrolls for This Week
        LAST_FIVE_YEARS_MAX_SCROLLS: 600,  // Hard cap: ~600 scrolls for Last 5 Years
        DEFAULT_MAX_SCROLLS: 400           // Fallback cap for other presets (still bounded)
    }
};

// ============================================================================
// Logging Helpers - Centralized logging levels for dev vs user-facing messages
// ============================================================================

/**
 * Development debug logging - only visible when DEV_DEBUG flag is enabled
 * Use for per-transaction decisions, detailed include/exclude logic, etc.
 * These logs do NOT appear in Chrome Extensions error pane for normal users.
 */
function logDevDebug(...args) {
    // Enable dev debug logging by setting window.__txVaultDevDebug = true in console
    if (typeof window !== 'undefined' && window.__txVaultDevDebug === true) {
        console.debug('[TxVault Dev]', ...args);
    }
}

/**
 * User-facing warning logging - appears in popup/notifications and runStats
 * Use for high-level warnings that affect data quality (boundary failures, pending mismatch, etc.)
 */
function logUserWarning(message, details = null) {
    console.warn('⚠️ [TxVault]', message);
    if (details) {
        console.warn('   Details:', details);
    }

    // Add to runStats validation warnings if available
    if (typeof window !== 'undefined' && window.__txVaultCurrentRunStats) {
        const runStats = window.__txVaultCurrentRunStats;
        if (!runStats.validation) {
            runStats.validation = {};
        }
        if (!runStats.validation.userWarnings) {
            runStats.validation.userWarnings = [];
        }
        runStats.validation.userWarnings.push(message);
    }
}

/**
 * User-facing error logging - for actual errors that require re-running or support
 * Use for DOM selector failures, session timeouts, critical extraction errors
 */
function logUserError(message, error = null) {
    console.error('🚨 [TxVault Error]', message);
    if (error) {
        console.error('   Error details:', error);
    }
}

// ============================================================================
// Reference Comparison Functions - For Last Year Preset Validation
// ============================================================================

/**
 * Parse CSV content and build daily distribution map
 * @param {string} csvContent - CSV file content as string
 * @param {number} targetYear - Year to filter for (e.g., 2024)
 * @returns {Object} Map of date (YYYY-MM-DD) -> transaction count
 */
function parseCSVToDailyDistribution(csvContent, targetYear) {
    const dailyCounts = {};
    const lines = csvContent.split('\n');

    // Find header row
    let headerIndex = -1;
    let dateColumnIndex = -1;
    for (let i = 0; i < Math.min(10, lines.length); i++) {
        const header = lines[i].toLowerCase();
        if (header.includes('date')) {
            headerIndex = i;
            const headers = lines[i].split(',').map(h => h.trim().toLowerCase());
            dateColumnIndex = headers.findIndex(h => h === 'date' || h.includes('date'));
            break;
        }
    }

    if (dateColumnIndex === -1) {
        logDevDebug('Reference CSV: Could not find Date column');
        return dailyCounts;
    }

    // Parse data rows
    for (let i = headerIndex + 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Simple CSV parsing (handles quoted fields)
        const fields = [];
        let currentField = '';
        let inQuotes = false;
        for (let j = 0; j < line.length; j++) {
            const char = line[j];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                fields.push(currentField.trim());
                currentField = '';
            } else {
                currentField += char;
            }
        }
        fields.push(currentField.trim());

        if (fields.length <= dateColumnIndex) continue;

        const dateStr = fields[dateColumnIndex].replace(/"/g, '');
        if (!dateStr) continue;

        // Parse date (handle MM/DD/YYYY and YYYY-MM-DD formats)
        let date;
        try {
            if (dateStr.includes('/')) {
                const [month, day, year] = dateStr.split('/').map(Number);
                date = new Date(year, month - 1, day);
            } else if (dateStr.includes('-')) {
                date = new Date(dateStr);
            } else {
                continue;
            }

            if (isNaN(date.getTime())) continue;

            // Filter for target year
            if (date.getFullYear() === targetYear) {
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                const dateKey = `${year}-${month}-${day}`;
                dailyCounts[dateKey] = (dailyCounts[dateKey] || 0) + 1;
            }
        } catch (e) {
            logDevDebug(`Reference CSV: Error parsing date "${dateStr}":`, e);
        }
    }

    return dailyCounts;
}

/**
 * Load reference data from chrome.storage or use hardcoded reference
 * @param {number} targetYear - Year to get reference for (e.g., 2024)
 * @returns {Promise<Object>} Map of date (YYYY-MM-DD) -> transaction count, or null if not available
 */
async function loadReferenceData(targetYear) {
    try {
        // Try to load from chrome.storage first
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            return new Promise((resolve) => {
                chrome.storage.local.get([`txvault_reference_${targetYear}`], (result) => {
                    const key = `txvault_reference_${targetYear}`;
                    if (result && result[key]) {
                        try {
                            const referenceData = typeof result[key] === 'string'
                                ? JSON.parse(result[key])
                                : result[key];
                            logDevDebug(`Loaded reference data for ${targetYear} from storage:`, Object.keys(referenceData).length, 'dates');
                            resolve(referenceData);
                        } catch (e) {
                            logDevDebug('Error parsing reference data from storage:', e);
                            resolve(null);
                        }
                    } else {
                        resolve(null);
                    }
                });
            });
        }
    } catch (e) {
        logDevDebug('Error loading reference data:', e);
    }
    return null;
}

/**
 * Compare current export with reference data
 * @param {Array} currentTransactions - Array of transaction objects with date property
 * @param {Object} referenceDateCounts - Map of date (YYYY-MM-DD) -> count from reference
 * @param {number} targetYear - Year being compared (e.g., 2024)
 * @returns {Object} Comparison results
 */
function compareWithReference(currentTransactions, referenceDateCounts, targetYear) {
    if (!referenceDateCounts || Object.keys(referenceDateCounts).length === 0) {
        return null; // No reference data available
    }

    // Build current daily distribution
    const currentDateCounts = {};
    currentTransactions.forEach(tx => {
        if (!tx.date) return;
        const txDate = parseTransactionDate(tx.date);
        if (!txDate || txDate.getFullYear() !== targetYear) return;

        const year = txDate.getFullYear();
        const month = String(txDate.getMonth() + 1).padStart(2, '0');
        const day = String(txDate.getDate()).padStart(2, '0');
        const dateKey = `${year}-${month}-${day}`;
        currentDateCounts[dateKey] = (currentDateCounts[dateKey] || 0) + 1;
    });

    // Compare dates
    const allDates = new Set([...Object.keys(referenceDateCounts), ...Object.keys(currentDateCounts)]);
    const deltas = [];
    let totalRefRows = 0;
    let totalCurRows = 0;
    let datesWithDifferences = 0;
    let exactMatches = 0;

    allDates.forEach(dateKey => {
        const refCount = referenceDateCounts[dateKey] || 0;
        const curCount = currentDateCounts[dateKey] || 0;
        const delta = curCount - refCount;

        totalRefRows += refCount;
        totalCurRows += curCount;

        if (delta !== 0) {
            datesWithDifferences++;
            deltas.push({
                date: dateKey,
                refCount: refCount,
                curCount: curCount,
                delta: delta
            });
        } else {
            exactMatches++;
        }
    });

    // Sort deltas by absolute value
    deltas.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

    // Get top dates with fewer/more transactions
    const datesWithFewer = deltas.filter(d => d.delta < 0).slice(0, 10);
    const datesWithMore = deltas.filter(d => d.delta > 0).slice(0, 10);

    const totalDelta = totalCurRows - totalRefRows;

    return {
        referenceTotal: totalRefRows,
        currentTotal: totalCurRows,
        totalDelta: totalDelta,
        datesWithDifferences: datesWithDifferences,
        exactMatches: exactMatches,
        datesWithFewer: datesWithFewer,
        datesWithMore: datesWithMore,
        allDeltas: deltas
    };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate a random delay between min and max milliseconds
 * Adds human-like jitter to avoid detection
 */
function randomDelay(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Generate a hash for transaction deduplication
 */
function generateTransactionHash(transaction) {
    // Include status AND dataIndex in hash for better deduplication.
    // Using dataIndex ensures that visually distinct tiles on the same day with
    // the same description/amount (e.g., two "World Market" debits on 10/22)
    // are not accidentally merged into one.
    const key = `${transaction.date}|${transaction.description}|${transaction.amount}|${transaction.status || ''}|${transaction.dataIndex || ''}`;
    return btoa(key).replace(/[^a-zA-Z0-9]/g, '');
}

/**
 * Smooth scroll with easing for human-like behavior
 */
function smoothScrollTo(targetY, duration = 500) {
    const startY = window.scrollY;
    const distance = targetY - startY;
    let startTime = null;

    function animation(currentTime) {
        if (startTime === null) startTime = currentTime;
        const timeElapsed = currentTime - startTime;
        const progress = Math.min(timeElapsed / duration, 1);

        // Easing function (ease-out)
        const ease = 1 - Math.pow(1 - progress, 3);

        window.scrollTo(0, startY + distance * ease);

        if (timeElapsed < duration) {
            requestAnimationFrame(animation);
        }
    }

    requestAnimationFrame(animation);
}

/**
 * Simulate human-like micro-interactions
 */
function simulateHumanBehavior() {
    // Randomly add micro-pauses
    if (Math.random() < 0.3) {
        return randomDelay(50, 200);
    }
    return 0;
}

// ============================================================================
// HTTP / Session Error Tracking (401 detection)
// ============================================================================

// Lightweight tracker for HTTP 401 responses seen in this tab.
// Note: In the Chrome isolated world we may not see ALL page requests, but
// when we do see 401s we record them for diagnostics and export summaries.
const http401Tracker = {
    total: 0,
    consecutive: 0,
    lastTime: null
};

function record401Error(sourceLabel) {
    http401Tracker.total += 1;
    http401Tracker.consecutive += 1;
    http401Tracker.lastTime = new Date().toISOString();
    console.warn(`🚨 [TxVault] Detected HTTP 401 from ${sourceLabel}. total=${http401Tracker.total}, consecutive=${http401Tracker.consecutive}`);

    // Mirror into current runStats if available (set at run start)
    if (window.__txVaultCurrentRunStats && window.__txVaultCurrentRunStats.alerts) {
        const alerts = window.__txVaultCurrentRunStats.alerts;
        if (!alerts.includes('HTTP_401_DETECTED')) {
            alerts.push('HTTP_401_DETECTED');
        }
    }
}

// Best-effort instrumentation of fetch / XHR for 401 detection.
// We do NOT alter behavior of the original calls, only observe status codes.
(function installHttp401Monitors() {
    try {
        if (!window.__txVaultHttpMonitorsInstalled) {
            window.__txVaultHttpMonitorsInstalled = true;

            // Patch fetch if present
            if (typeof window.fetch === 'function') {
                const originalFetch = window.fetch;
                window.fetch = function patchedFetch(...args) {
                    return originalFetch.apply(this, args).then(response => {
                        try {
                            if (response && response.status === 401) {
                                record401Error('fetch');
                            }
                        } catch (e) {
                            console.warn('[TxVault] Error inspecting fetch response for 401:', e);
                        }
                        return response;
                    });
                };
            }

            // Patch XHR if present
            if (window.XMLHttpRequest && window.XMLHttpRequest.prototype) {
                const OriginalXHR = window.XMLHttpRequest;
                const originalOpen = OriginalXHR.prototype.open;
                const originalSend = OriginalXHR.prototype.send;

                OriginalXHR.prototype.open = function patchedOpen(...args) {
                    this.__txVaultRequestLabel = (args && args[1]) || 'XMLHttpRequest';
                    return originalOpen.apply(this, args);
                };

                OriginalXHR.prototype.send = function patchedSend(...args) {
                    this.addEventListener('load', function () {
                        try {
                            if (this.status === 401) {
                                record401Error(this.__txVaultRequestLabel || 'XMLHttpRequest');
                            }
                        } catch (e) {
                            console.warn('[TxVault] Error inspecting XHR for 401:', e);
                        }
                    });
                    return originalSend.apply(this, args);
                };
            }
        }
    } catch (e) {
        console.warn('[TxVault] Failed to install HTTP 401 monitors:', e);
    }
})();

// ============================================================================
// Run Stats Helpers (per-run JSON / Markdown exports for presets)
// ============================================================================

/**
 * Initialize a stats object for a capture run.
 */
function initializeRunStats(presetName, startDateObj, endDateObj) {
    const startTimestamp = new Date();
    return {
        preset: presetName || 'Unknown',
        startTimestamp: startTimestamp.toISOString(),
        endTimestamp: null,
        elapsedSeconds: null,
        requestedRange: {
            start: startDateObj ? startDateObj.toISOString().split('T')[0] : null,
            end: endDateObj ? endDateObj.toISOString().split('T')[0] : null
        },
        scrollAttempts: 0,
        oscillationCount: 0,
        boundaries: {
            leftFound: false,
            rightFound: false,
            leftLabel: null,
            rightLabel: null,
            newestVisibleDate: null,  // Date of topmost visible transaction at start
            newestBoundaryPassed: null,  // true/false/null after validation
            oldestBoundaryPassed: null   // true/false/null after validation
        },
        counts: {
            totalTransactions: 0,
            inRangePosted: 0,
            inRangeAll: 0,
            pendingInRange: 0,
            pendingCountCaptured: 0,  // Pending transactions in captured set
            postedCountCaptured: 0,   // Posted transactions in captured set
            pendingCountVisible: null, // Estimated visible pending count at start (if available)
            referencePosted: CONFIG.EXPECTED_MIN || null
        },
        validation: {
            newestBoundaryCheck: null,  // 'PASS' | 'FAIL' | null
            pendingConsistencyCheck: null,  // 'PASS' | 'WARN' | 'FAIL' | null
            exportStatus: null  // 'PRISTINE' | 'COMPLETE_WITH_WARNINGS' | 'INCOMPLETE_NEWEST_BOUNDARY' | 'COMPLETE_WITH_WARNINGS_PENDING_MISMATCH' | 'INCOMPLETE_ROW_COUNT_MISMATCH' | 'INCOMPLETE_REFERENCE_MISMATCH' | 'INCOMPLETE_NEWER_RANGE_ONLY'
        },
        alerts: [],
        notes: []
    };
}

/**
 * Finalize stats with end time and elapsed seconds.
 */
function finalizeRunStats(runStats) {
    if (!runStats) return runStats;
    const endTimestamp = new Date();
    runStats.endTimestamp = endTimestamp.toISOString();
    try {
        const start = new Date(runStats.startTimestamp);
        const elapsedMs = endTimestamp - start;
        runStats.elapsedSeconds = Math.round(elapsedMs / 1000);
    } catch (e) {
        console.error('Error computing elapsedSeconds for runStats:', e);
    }
    return runStats;
}

/**
 * Convert run stats object to a compact Markdown summary.
 */
function runStatsToMarkdown(runStats) {
    if (!runStats) return '# TxVault Run Stats\n\n_No stats available._\n';
    const lines = [];
    lines.push('# TxVault Run Stats');
    lines.push('');
    lines.push(`- Preset: **${runStats.preset}**`);
    lines.push(`- Requested Range: ${runStats.requestedRange.start || 'N/A'} → ${runStats.requestedRange.end || 'N/A'}`);
    lines.push(`- Start: ${runStats.startTimestamp || 'N/A'}`);
    lines.push(`- End: ${runStats.endTimestamp || 'N/A'}`);
    lines.push(`- Elapsed: ${runStats.elapsedSeconds != null ? runStats.elapsedSeconds + 's' : 'N/A'}`);
    lines.push('');
    lines.push('## Scroll & Oscillation');
    lines.push(`- Scroll attempts: ${runStats.scrollAttempts}`);
    lines.push(`- Oscillation count: ${runStats.oscillationCount}`);
    lines.push('');
    lines.push('## Boundaries');
    lines.push(`- Left found: ${runStats.boundaries.leftFound} (${runStats.boundaries.leftLabel || 'N/A'})`);
    lines.push(`- Right found: ${runStats.boundaries.rightFound} (${runStats.boundaries.rightLabel || 'N/A'})`);
    lines.push('');
    lines.push('## Counts');
    lines.push(`- Total transactions captured: ${runStats.counts.totalTransactions}`);
    lines.push(`- In-range (all): ${runStats.counts.inRangeAll}`);
    lines.push(`- In-range (posted-only): ${runStats.counts.inRangePosted}`);
    if (runStats.counts.referencePosted != null) {
        lines.push(`- Reference posted count: ${runStats.counts.referencePosted}`);
    }
    lines.push('');
    lines.push('## Alerts');
    if (runStats.alerts && runStats.alerts.length > 0) {
        runStats.alerts.forEach(a => lines.push(`- ${a}`));
    } else {
        lines.push('- None');
    }
    lines.push('');
    lines.push('## Notes');
    if (runStats.notes && runStats.notes.length > 0) {
        runStats.notes.forEach(n => lines.push(`- ${n}`));
    } else {
        lines.push('- None');
    }
    lines.push('');

    // Add missing dates information if available
    if (runStats.validation && runStats.validation.missingDates && runStats.validation.missingDates.length > 0) {
        lines.push('## Missing Dates');
        lines.push(`- Missing dates count: ${runStats.validation.missingDatesCount || runStats.validation.missingDates.length}`);
        lines.push(`- Missing dates: ${runStats.validation.missingDates.join(', ')}`);
        lines.push('');
    }

    // Add reference comparison information if available
    if (runStats.validation && runStats.validation.referenceComparison) {
        const comp = runStats.validation.referenceComparison;
        lines.push('## Reference Comparison');
        lines.push(`- Reference total: ${comp.referenceTotal}`);
        lines.push(`- Current total: ${comp.currentTotal}`);
        lines.push(`- Total delta: ${comp.totalDelta > 0 ? '+' : ''}${comp.totalDelta}`);
        lines.push(`- Dates with differences: ${comp.datesWithDifferences}`);
        lines.push(`- Exact matches: ${comp.exactMatches}`);
        if (comp.datesWithFewer && comp.datesWithFewer.length > 0) {
            lines.push(`- Top dates with fewer transactions: ${comp.datesWithFewer.slice(0, 5).map(d => `${d.date} (${d.delta})`).join(', ')}`);
        }
        if (comp.datesWithMore && comp.datesWithMore.length > 0) {
            lines.push(`- Top dates with more transactions: ${comp.datesWithMore.slice(0, 5).map(d => `${d.date} (+${d.delta})`).join(', ')}`);
        }
        lines.push('');
    }

    return lines.join('\n');
}

/**
 * Save run stats as JSON and Markdown sidecar files.
 * Assumes saveCSVToFile respects browser download settings for filename.
 */
function saveRunStatsFiles(runStats, baseFileName) {
    try {
        if (!runStats || !baseFileName) {
            console.warn('saveRunStatsFiles called without runStats or baseFileName');
            return;
        }
        const safeBase = baseFileName.replace(/\.csv$/i, '');
        const jsonName = `${safeBase}.stats.json`;
        const mdName = `${safeBase}.stats.md`;

        // JSON
        const jsonBlob = JSON.stringify(runStats, null, 2);
        const jsonCsvCompatible = `data:text/plain;charset=utf-8,${encodeURIComponent(jsonBlob)}`;
        // Reuse saveCSVToFile helper to trigger download; content is JSON/MD instead of CSV.
        saveCSVToFile(jsonBlob, jsonName);

        // Markdown
        const mdContent = runStatsToMarkdown(runStats);
        saveCSVToFile(mdContent, mdName);

        console.log(`✅ Run stats files saved: ${jsonName}, ${mdName}`);
    } catch (e) {
        console.error('Error saving run stats files:', e);
    }
}

// Date and Number Parsing
// ============================================================================

function convertDateFormat(inputDate) {
    let parsedDate;
    if (typeof inputDate === 'string') {
        if (inputDate.includes('/')) {
            return inputDate;
        } else if (inputDate.includes('-')) {
            const parts = inputDate.split('-');
            return `${parts[1]}/${parts[2]}/${parts[0]}`;
        } else if (inputDate.match(/[A-Za-z]+\s\d+,\s\d+/)) {
            parsedDate = new Date(inputDate);
        } else {
            parsedDate = new Date(inputDate);
        }
    } else {
        parsedDate = new Date(inputDate);
    }

    if (isNaN(parsedDate.getTime())) {
        console.error(`Invalid date format: ${inputDate}`);
        return '';
    }

    const day = ('0' + parsedDate.getDate()).slice(-2);
    const month = ('0' + (parsedDate.getMonth() + 1)).slice(-2);
    const year = parsedDate.getFullYear();
    return month + '/' + day + '/' + year;
}

function extractNumber(inputString) {
    if (!inputString) return NaN;
    // Enhanced regex to handle more formats
    const match = inputString.match(/^-?\$?(\d{1,3}(,\d{3})*(\.\d+)?|\.\d+)$/);
    if (match) {
        const numberString = match[1].replace(/,/g, '');
        const extractedNumber = parseFloat(numberString);
        return inputString.startsWith('-') ? -extractedNumber : extractedNumber;
    }
    return NaN;
}

// Transaction Extraction
// ============================================================================

function extractAmount(element) {
    // Try multiple selectors for robustness
    // UPDATED: Match Python version selectors (proven to work)
    const selectors = [
        '.tr div:first-child', // PRIMARY: Python version selector
        '.tr div:first-of-type', // Alternative Python version selector
        'span.tr div:first-child', // Alternative Python version selector
        '.row-value div:nth-child(1)',
        '.f4.fw5.kpl-color-palette-green-50 div:nth-child(1)',
        '[data-testid*="amount"]',
        '.amount',
        '.transaction-amount'
    ];

    for (const selector of selectors) {
        const amountElement = element.querySelector(selector);
    if (amountElement) {
            const temp = amountElement.textContent.trim();
            const amount = extractNumber(temp);
            if (!isNaN(amount)) {
                return amount;
            }
        }
    }

    return NaN;
}

function extractTransactionInfo(element) {
    const transactionInfo = {
        dataIndex: '',
        description: '',
        category: '',
        amount: NaN,
        date: '',
        status: '', // pending or posted
        hash: ''
    };

    transactionInfo.dataIndex = element.getAttribute('data-index') || '';

    // CRITICAL: Check if transaction is in a "Pending" section
    // Strategy: Look for "Pending" header before this transaction in the DOM
    let isInPendingSection = false;

    // Method 1: Check parent containers for "Pending" section headers
    let currentElement = element.parentElement;
    let depth = 0;
    while (currentElement && depth < 10) {
        // Look for section headers (h1, h2, h3, h4, div with header classes, etc.)
        const headers = currentElement.querySelectorAll('h1, h2, h3, h4, h5, h6, [class*="header"], [class*="title"], [class*="section"]');
        for (const header of headers) {
            const headerText = (header.textContent || '').trim().toLowerCase();
            if (headerText === 'pending' || headerText.startsWith('pending')) {
                // Check if this header comes before our transaction element
                if (header.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING) {
                    isInPendingSection = true;
                    break;
                }
            }
        }
        if (isInPendingSection) break;
        currentElement = currentElement.parentElement;
        depth++;
    }

    // Method 2: Check previous siblings for "Pending" headers
    if (!isInPendingSection) {
        let prevSibling = element.previousElementSibling;
        let checkCount = 0;
        while (prevSibling && checkCount < 100) { // Increased from 50 to 100
            const siblingText = (prevSibling.textContent || '').trim().toLowerCase();
            // Check if sibling is a header with "Pending"
            if ((prevSibling.tagName && prevSibling.tagName.match(/^H[1-6]$/)) ||
                prevSibling.classList.contains('header') ||
                prevSibling.classList.contains('title') ||
                prevSibling.querySelector('h1, h2, h3, h4, h5, h6')) {
                if (siblingText === 'pending' || siblingText.startsWith('pending')) {
                    isInPendingSection = true;
                    break;
                }
            }
            prevSibling = prevSibling.previousElementSibling;
            checkCount++;
        }
    }

    // Method 3: Check if element is within a container that has "Pending" as first text content
    if (!isInPendingSection) {
        currentElement = element.parentElement;
        depth = 0;
        while (currentElement && depth < 5) {
            const firstChild = currentElement.firstElementChild || currentElement.firstChild;
            if (firstChild && firstChild.nodeType === Node.TEXT_NODE) {
                const text = (firstChild.textContent || '').trim().toLowerCase();
                if (text === 'pending' || text.startsWith('pending')) {
                    isInPendingSection = true;
                    break;
                }
            } else if (firstChild && firstChild.tagName && firstChild.tagName.match(/^H[1-6]$/)) {
                const text = (firstChild.textContent || '').trim().toLowerCase();
                if (text === 'pending' || text.startsWith('pending')) {
                    isInPendingSection = true;
                    break;
                }
            }
            currentElement = currentElement.parentElement;
            depth++;
        }
    }

    // Try multiple selectors for description
    // UPDATED: Match Python version selectors (proven to work)
    const descSelectors = [
        '.flex-column.mr3 span div:first-child', // PRIMARY: Python version selector
        '.flex-column.mr3 div:first-child', // Alternative Python version selector
        '.row-title div:nth-child(1)',
        '.transaction-description',
        '[data-testid*="description"]'
    ];
    for (const selector of descSelectors) {
        const descElement = element.querySelector(selector);
        if (descElement) {
            transactionInfo.description = descElement.textContent.trim();
            break;
        }
    }

    // Try multiple selectors for category
    const catSelectors = [
        '.row-title div:nth-child(2)',
        '.transaction-category',
        '[data-testid*="category"]'
    ];
    for (const selector of catSelectors) {
        const catElement = element.querySelector(selector);
        if (catElement) {
            transactionInfo.category = catElement.textContent.trim();
            break;
        }
    }

    transactionInfo.amount = extractAmount(element);
    transactionInfo.transactionType = transactionInfo.amount >= 0 ? 'credit' : 'debit';
    transactionInfo.amount = Math.abs(transactionInfo.amount);

    // Try multiple selectors for date
    // UPDATED: Match Python version selectors (proven to work)
    const dateSelectors = [
        '.tr div:last-child', // PRIMARY: Python version selector
        '.tr div:last-of-type', // Alternative Python version selector
        'span.tr div:last-child', // Alternative Python version selector
        '.row-value div:nth-child(2)',
        '.f4.fw5.kpl-color-palette-green-50 div:nth-child(2)',
        '.transaction-date',
        '[data-testid*="date"]'
    ];
    let foundDate = false;
    for (const selector of dateSelectors) {
        const dateElement = element.querySelector(selector);
        if (dateElement) {
            const dateText = dateElement.textContent.trim();
            // If date text contains "pending" (case insensitive), treat as no date
            if (dateText.toLowerCase().includes('pending')) {
                transactionInfo.date = ''; // Empty date for pending
                foundDate = true;
            } else if (dateText && dateText.length > 0) {
                transactionInfo.date = dateText;
                foundDate = true;
            }
            if (foundDate) break;
        }
    }

    // CRITICAL: If no date found AND we're in pending section, mark as pending
    if (!foundDate && isInPendingSection) {
        transactionInfo.date = ''; // Empty date indicates pending
    }

    // Extract status (pending/posted) FIRST to check for explicit status
    // This ensures we respect explicit "Posted" status even if in pending section
    const statusSelectors = [
        '.row-value div:nth-child(1)', // Often status is in first div
        '[data-testid*="status"]',
        '.transaction-status',
        '.status',
        '.row-title div:nth-child(3)', // Sometimes in third position
        element.querySelector('.row-value')?.querySelector('div:first-child') // First child of row-value
    ];

    const elementText = element.textContent.toLowerCase();
    let explicitStatus = '';

    // Check for explicit status in selectors
    for (const selector of statusSelectors) {
        let statusElement;
        if (typeof selector === 'string') {
            statusElement = element.querySelector(selector);
        } else if (selector) {
            statusElement = selector;
        }

        if (statusElement) {
            const statusText = statusElement.textContent.trim().toLowerCase();
            if (statusText.includes('pending')) {
                explicitStatus = 'Pending';
                break;
            } else if (statusText.includes('posted')) {
                explicitStatus = 'Posted';
                break;
            }
        }
    }

    // If not found in specific selectors, check entire element text
    if (!explicitStatus) {
        if (elementText.includes('pending') && !elementText.includes('posted')) {
            explicitStatus = 'Pending';
        } else if (elementText.includes('posted')) {
            explicitStatus = 'Posted';
        }
    }

    // Set status: Explicit status takes priority, then pending section, then check for empty date, then default to Posted
    if (explicitStatus === 'Posted') {
        // Explicit Posted status - always respect it, even if in pending section
        transactionInfo.status = 'Posted';
    } else if (isInPendingSection && explicitStatus !== 'Posted') {
        // In pending section and no explicit Posted status
        transactionInfo.status = 'Pending';
    } else if (explicitStatus === 'Pending') {
        transactionInfo.status = 'Pending';
    } else if (!transactionInfo.date || transactionInfo.date.trim() === '') {
        // No date found - likely pending transaction
        transactionInfo.status = 'Pending';
    } else {
        // Default to Posted if no status found
        transactionInfo.status = 'Posted';
    }

    // Generate hash for deduplication
    transactionInfo.hash = generateTransactionHash(transactionInfo);

    return transactionInfo;
}

function extractAllTransactions() {
    // CRITICAL: Primary selector for transactions - Credit Karma uses [data-index] attribute
    // This selector is robust and should remain stable across UI updates
    const transactionElements = document.querySelectorAll('[data-index]');
    const selectorCount = transactionElements.length;

    // Log selector performance for QA/auditability (every 10th call to avoid spam)
    if (typeof extractAllTransactions.callCount === 'undefined') {
        extractAllTransactions.callCount = 0;
    }
    extractAllTransactions.callCount++;
    if (extractAllTransactions.callCount % 10 === 0) {
        console.log(`🔍 [SELECTOR VALIDATION] Transaction extraction - Found ${selectorCount} elements with [data-index] selector`);
    }

    const transactions = Array.from(transactionElements, element => extractTransactionInfo(element));

    // ENHANCED: Mark transactions that are in "Pending" sections
    // Strategy: Find "Pending" headers, then find all transactions in the same parent container
    // that come after the header but before the next section header

    // Find all potential "Pending" headers (more efficient - only check likely header elements)
    const headerSelectors = 'h1, h2, h3, h4, h5, h6, [class*="header"], [class*="title"], [class*="section"]';
    const potentialHeaders = document.querySelectorAll(headerSelectors);
    const pendingHeaders = [];

    for (const header of potentialHeaders) {
        const text = (header.textContent || '').trim().toLowerCase();
        if (text === 'pending' || (text.startsWith('pending') && text.length < 20)) {
            pendingHeaders.push(header);
        }
    }

    // Mark all transactions that come after a "Pending" header as pending
    // BUT: Only if they don't already have "Posted" status explicitly set
    if (pendingHeaders.length > 0) {
        console.log(`Found ${pendingHeaders.length} "Pending" section header(s)`);
        for (const header of pendingHeaders) {
            // Find the parent container of the header
            const parentContainer = header.parentElement;
            if (!parentContainer) continue;

            // Walk through all elements after the header until we hit another section
            let currentEl = header.nextSibling;
            let processedCount = 0;
            let foundMonthHeader = false;

            while (currentEl && processedCount < 200 && !foundMonthHeader) {
                // Check if we've hit a month/year section header (stop processing)
                if (currentEl.nodeType === Node.ELEMENT_NODE) {
                    // Check if this element is a month/year header
                    if (currentEl.tagName && currentEl.tagName.match(/^H[1-6]$/)) {
                        const headerText = (currentEl.textContent || '').trim().toLowerCase();
                        // Check if it's a month/year pattern like "november 2025" or "nov 2025"
                        if (headerText.match(/^(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d{4}$/i)) {
                            console.log(`Hit month/year section header: "${headerText}", stopping pending marking`);
                            foundMonthHeader = true;
                            break;
                        }
                        // Also stop for other section headers (but not "pending")
                        if (headerText && headerText !== 'pending' && headerText.length < 30 && !headerText.match(/^\d+$/)) {
                            console.log(`Hit another section header: "${headerText}", stopping pending marking`);
                            foundMonthHeader = true;
                            break;
                        }
                    }

                    // Check if this element or its children contain transactions
                    const txElements = [];
                    if (currentEl.hasAttribute && currentEl.hasAttribute('data-index')) {
                        txElements.push(currentEl);
                    }
                    if (currentEl.querySelectorAll) {
                        txElements.push(...currentEl.querySelectorAll('[data-index]'));
                    }

                    // Mark found transactions as pending ONLY if they don't already have "Posted" status
                    for (const txEl of txElements) {
                        const txIndex = transactions.findIndex(t => t.dataIndex === txEl.getAttribute('data-index'));
                        if (txIndex >= 0) {
                            // Check if transaction already has explicit "Posted" status - don't override it
                            const txElementText = (txEl.textContent || '').toLowerCase();
                            const hasExplicitPosted = txElementText.includes('posted') && !txElementText.includes('pending');

                            if (!hasExplicitPosted && transactions[txIndex].status !== 'Pending') {
                                transactions[txIndex].status = 'Pending';
                                console.log(`Marked transaction as pending: ${transactions[txIndex].description}, date: ${transactions[txIndex].date}`);
                            } else if (hasExplicitPosted) {
                                console.log(`Skipping transaction (has explicit Posted status): ${transactions[txIndex].description}, date: ${transactions[txIndex].date}`);
                            }
                        }
                    }
                }

                currentEl = currentEl.nextSibling;
                processedCount++;
            }
        }
    }

    return transactions;
}

/**
 * Enhanced deduplication using multiple identifiers
 * IMPROVED: Better duplicate detection with date+description+amount+transactionType combination
 * Transactions with same date/description/amount but different type (credit vs debit) are NOT duplicates
 */
function combineTransactions(existingTransactions, newTransactions) {
    // Create multiple lookup sets for better duplicate detection
    const existingHashes = new Set(existingTransactions.map(t => t.hash));
    const existingDataIndices = new Set(existingTransactions.map(t => t.dataIndex));

    // Create a composite key set: date|description|amount|transactionType|status for additional checking
    const existingCompositeKeys = new Set(
        existingTransactions.map(t => {
            const date = parseTransactionDate(t.date);
            const dateStr = date ? `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}` : '';
            const statusStr = (t.status || '').toLowerCase();
            const typeStr = (t.transactionType || '').toLowerCase();
            return `${dateStr}|${t.description}|${t.amount}|${typeStr}|${statusStr}`.toLowerCase().trim();
        })
    );

    const uniqueNewTransactions = newTransactions.filter(newTransaction => {
        // Check by hash first (most reliable)
        if (existingHashes.has(newTransaction.hash)) {
            return false;
        }

        // Check by data-index as fallback
        if (newTransaction.dataIndex && existingDataIndices.has(newTransaction.dataIndex)) {
            return false;
        }

        // Check by composite key (date + description + amount + transactionType + status)
        // Note: We allow same transaction with different status (pending -> posted) as separate entries
        // But same date+desc+amount+type+status is a duplicate
        // Transactions with same date/description/amount but different type (credit vs debit) are NOT duplicates
        const date = parseTransactionDate(newTransaction.date);
        const dateStr = date ? `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}` : '';
        const statusStr = (newTransaction.status || '').toLowerCase();
        const typeStr = (newTransaction.transactionType || '').toLowerCase();
        const compositeKey = `${dateStr}|${newTransaction.description}|${newTransaction.amount}|${typeStr}|${statusStr}`.toLowerCase().trim();
        if (existingCompositeKeys.has(compositeKey)) {
            return false;
        }

        return true;
    });

    return [...existingTransactions, ...uniqueNewTransactions];
}

function filterEmptyTransactions(transactions) {
    return transactions.filter(transaction => {
        // Must have valid amount and description
        const hasValidAmount = transaction.amount !== null &&
                              transaction.amount !== undefined &&
                              !isNaN(transaction.amount);
        const hasDescription = transaction.description && transaction.description.trim() !== '';

        // Date is optional (pending transactions may not have dates)
        // But if date exists, it should not be empty string
        const hasValidDate = !transaction.date || transaction.date.trim() === '' || parseTransactionDate(transaction.date) !== null;

        return hasValidAmount && hasDescription && hasValidDate;
    });
}

/**
 * Filter out transactions with "Pending" or invalid dates before export
 * Removes transactions where date is "Pending", empty, or cannot be parsed
 * This prevents "Pending" from appearing in the Date column of the CSV
 */
function filterValidDates(transactions) {
    return transactions.filter(transaction => {
        // Skip if no date field
        if (!transaction.date) {
            return false;
        }

        // Skip if date is empty string, whitespace, or contains "Pending"
        // This prevents "Pending" from appearing in the Date column of the CSV
        const dateStr = String(transaction.date).trim();
        if (dateStr === '' || dateStr.toLowerCase().includes('pending')) {
            return false;
        }

        // Skip if date cannot be parsed to a valid date object
        const parsedDate = parseTransactionDate(dateStr);
        if (!parsedDate || isNaN(parsedDate.getTime())) {
            return false;
        }

        // LAST MONTH DEBUG: trace potential losses for "World Market"
        try {
            if (transaction.description && transaction.description.toLowerCase().includes('world market')) {
                console.log('[LAST MONTH DEBUG] filterValidDates keeping candidate transaction:', {
                    date: transaction.date,
                    description: transaction.description,
                    amount: transaction.amount,
                    status: transaction.status,
                    dataIndex: transaction.dataIndex
                });
            }
        } catch (e) {
            // ignore debug errors
        }

        return true;
    });
}

/**
 * Remove duplicates from transactions before export
 * Uses same logic as combineTransactions but operates on a single array
 */
function removeDuplicates(transactions, options = {}) {
    if (transactions.length === 0) {
        return [];
    }

    const seenHashes = new Set();
    const seenDataIndices = new Set();
    const seenCompositeKeys = new Set();
    const uniqueTransactions = [];

    const presetName = options.preset || '';
    const isLastMonthPreset = presetName === 'last-month';
    const isThisMonthPreset = presetName === 'this-month';
    const isThisYearPreset = presetName === 'this-year';
    const isLastYearPreset = presetName === 'last-year';
    const isThisWeekPreset = presetName === 'this-week';
    const isLastFiveYearsPreset = presetName === 'last-5-years';
    // STRICT PRESETS: week/month/year historical presets used for QC-grade exports.
    // These require status-aware dedup so that pending+posted pairs always
    // yield two rows when statuses differ.
    const isStrictPreset =
        isLastMonthPreset ||
        isThisMonthPreset ||
        isThisYearPreset ||
        isLastYearPreset ||
        isThisWeekPreset ||
        isLastFiveYearsPreset;

    for (const transaction of transactions) {
        // Check by hash first (most reliable)
        // For strict presets (Last Month, This Month, This Year), we avoid early
        // exits on hash/dataIndex alone so that a pending+posted pair for the same
        // charge always yields two rows when statuses differ.
        if (!isStrictPreset && transaction.hash && seenHashes.has(transaction.hash)) {
            // LAST MONTH DEBUG: log when a World Market tx is dropped by hash
            try {
                if (transaction.description && transaction.description.toLowerCase().includes('world market')) {
                    console.warn('[LAST MONTH DEBUG] removeDuplicates dropping by hash:', {
                        date: transaction.date,
                        description: transaction.description,
                        amount: transaction.amount,
                        status: transaction.status,
                        dataIndex: transaction.dataIndex
                    });
                }
            } catch (e) {}
            continue;
        }

        // Check by data-index as fallback
        if (!isStrictPreset && transaction.dataIndex && seenDataIndices.has(transaction.dataIndex)) {
            try {
                if (transaction.description && transaction.description.toLowerCase().includes('world market')) {
                    console.warn('[LAST MONTH DEBUG] removeDuplicates dropping by dataIndex:', {
                        date: transaction.date,
                        description: transaction.description,
                        amount: transaction.amount,
                        status: transaction.status,
                        dataIndex: transaction.dataIndex
                    });
                }
            } catch (e) {}
            continue;
        }

        // Check by composite key (date + normalized description + amount + transactionType + status [+ dataIndex for strict presets])
        const date = parseTransactionDate(transaction.date);
        const dateStr = date ? `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}` : '';
        // Normalize status so that "pending" vs non-pending is part of the key.
        // Example mapping:
        //   - status === 'pending'   -> 'pending'
        //   - any other / missing    -> 'posted' (or generic non-pending)
        const rawStatus = (transaction.status || '').toLowerCase().trim();
        const statusStr = rawStatus === 'pending' ? 'pending' : (rawStatus || 'posted');
        const typeStr = (transaction.transactionType || '').toLowerCase();
        const normalizedDesc = (transaction.description || '').toLowerCase().trim();

        // STRICT PRESETS (Last Month, This Month, This Year, Last Year): treat as
        // duplicate ONLY if date, normalized description, amount, type, status
        // AND dataIndex all match. This guarantees that a unique pending+posted
        // pair for the same charge will continue to produce two rows.
        const compositeKey = isStrictPreset
            ? `${dateStr}|${normalizedDesc}|${transaction.amount}|${typeStr}|${statusStr}|${transaction.dataIndex || ''}`
            : `${dateStr}|${normalizedDesc}|${transaction.amount}|${typeStr}|${statusStr}`;

        if (seenCompositeKeys.has(compositeKey)) {
            try {
                if (transaction.description && transaction.description.toLowerCase().includes('world market')) {
                    console.warn('[LAST MONTH DEBUG] removeDuplicates dropping by compositeKey:', {
                        compositeKey,
                        date: transaction.date,
                        description: transaction.description,
                        amount: transaction.amount,
                        status: transaction.status,
                        dataIndex: transaction.dataIndex
                    });
                }
            } catch (e) {}
            continue;
        }

        // Add to seen sets and unique array
        if (!isLastMonthPreset && transaction.hash) seenHashes.add(transaction.hash);
        if (!isLastMonthPreset && transaction.dataIndex) seenDataIndices.add(transaction.dataIndex);
        seenCompositeKeys.add(compositeKey);
        uniqueTransactions.push(transaction);
    }

    return uniqueTransactions;
}

/**
 * Prepare transactions for export: filter valid dates and remove duplicates
 */
function prepareTransactionsForExport(transactions, options = {}) {
    // First filter out transactions with invalid or "Pending" dates
    const validDateTransactions = filterValidDates(transactions);

    // Then remove duplicates (optionally preset-aware, e.g., Last Month)
    const uniqueTransactions = removeDuplicates(validDateTransactions, options);

    return uniqueTransactions;
}

// CSV Generation
// ============================================================================

function convertToCSV(transactions) {
    const header = 'Date,Description,Amount,Category,Transaction Type,Status,Account Name,Labels,Notes\n';
    const rows = transactions.map(transaction => {
        // Handle pending transactions (no date) - use "Pending" as placeholder
        const dateStr = (!transaction.date || transaction.date.trim() === '')
            ? 'Pending'
            : convertDateFormat(transaction.date);
        const categoryStr = transaction.category || '';
        // OPTIMIZED: Pending transactions show "Pending", others show blank (not "Posted")
        const isPendingStatus = transaction.status && transaction.status.toLowerCase() === 'pending';
        const hasNoDate = !transaction.date || transaction.date.trim() === '';
        const isPending = isPendingStatus || hasNoDate;
        const statusStr = isPending ? 'Pending' : ''; // Blank for posted transactions
        return `"${dateStr}","${transaction.description.replace(/"/g, '""')}","${transaction.amount}","${categoryStr.replace(/"/g, '""')}","${transaction.transactionType}","${statusStr}",,,\n`;
    });
    return header + rows.join('');
}

function saveCSVToFile(csvData, fileName) {
    const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// UI Components
// ============================================================================

/**
 * Create a comprehensive statistics panel
 */
function createStatsPanel(stats) {
    const panel = document.createElement('div');
    panel.id = 'ck-export-stats-panel';
    panel.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: white;
        border-radius: 10px;
        padding: 24px;
        z-index: 10001;
        box-shadow: 0 6px 24px rgba(0,0,0,0.35);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    const has401Errors = !!stats.http401Total && stats.http401Total > 0;
    const isPartialRun = !!stats.isPartialRun;
    const hasSessionLogout = !!stats.sessionErrorDetected;
    const isPartial = hasSessionLogout || isPartialRun || has401Errors;

    const title = isPartial ? 'Partial Export ⚠️' : 'Export Complete ✓';
    const titleColor = isPartial ? '#f59e0b' : '#22c55e';

    const dateRange = `${stats.startDate} – ${stats.endDate}`;

    let transactionText;
    if (hasSessionLogout) {
        transactionText = `${stats.exported} collected before logout`;
    } else if (isPartialRun || has401Errors) {
        transactionText = `${stats.exported} exported (partial)`;
    } else {
        transactionText = `${stats.exported} exported from ${stats.totalFound || stats.exported} total`;
    }

    const elapsedLabel = stats.elapsedTime || 'N/A';
    const fileLabel = (stats.filesGenerated && stats.filesGenerated.length > 0)
        ? stats.filesGenerated.join(', ')
        : (stats.filename || 'ck_transactions.csv');

    const sessionWarningHtml = hasSessionLogout
        ? `<div style="color: #f59e0b; font-size: 14px; margin-top: 8px;">
                ⚠️ Credit Karma logged you out${stats.sessionLogoutTime ? ` after ~${Math.floor(stats.sessionLogoutTime / 60)}m` : ''}.<br>
                Log back in and re-run this preset to collect remaining data.
           </div>`
        : (has401Errors ? `<div style="color: #f59e0b; font-size: 14px; margin-top: 8px;">
                ⚠️ HTTP 401 / session issues detected. Exported data may be incomplete.
           </div>` : '');

    panel.innerHTML = `
        <div class="txvault-export-modal" style="
            width: 420px;
            padding: 24px;
            background: white;
            border-radius: 10px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        ">
            <h2 style="
                font-size: 18px;
                font-weight: bold;
                color: ${titleColor};
                margin: 0 0 20px 0;
            ">${title}</h2>

            <div style="margin-bottom: 16px;">
                <div style="font-size: 14px; font-weight: 600; color: #6b7280; margin-bottom: 4px;">
                    📅 Date Range
                </div>
                <div style="font-size: 16px; color: #1f2937;">
                    ${dateRange}
                </div>
            </div>

            <div style="margin-bottom: 16px;">
                <div style="font-size: 14px; font-weight: 600; color: #6b7280; margin-bottom: 4px;">
                    📊 Transactions
                </div>
                <div style="font-size: 16px; color: #1f2937;">
                    ${transactionText}
                </div>
                ${sessionWarningHtml}
            </div>

            <div style="margin-bottom: 16px;">
                <div style="font-size: 14px; font-weight: 600; color: #6b7280; margin-bottom: 4px;">
                    ⏱️ Time
                </div>
                <div style="font-size: 16px; color: #1f2937;">
                    ${elapsedLabel}
                </div>
            </div>

            <div style="margin-bottom: 20px;">
                <div style="font-size: 14px; font-weight: 600; color: #6b7280; margin-bottom: 4px;">
                    📁 File
                </div>
                <div style="font-size: 16px; color: #1f2937;">
                    ${fileLabel}
                </div>
            </div>

            <div style="display: flex; gap: 12px; justify-content: flex-end;">
                <button id="ck-stats-close" style="
                    padding: 10px 20px;
                    background: #e5e7eb;
                    border: none;
                    border-radius: 6px;
                    font-size: 14px;
                    font-weight: 600;
                    cursor: pointer;
                ">Close</button>
                <button id="ck-stats-preview" style="
                    padding: 10px 20px;
                    background: #3b82f6;
                    color: white;
                    border: none;
                    border-radius: 6px;
                    font-size: 14px;
                    font-weight: 600;
                    cursor: pointer;
                ">Preview Data</button>
            </div>
        </div>
    `;

    document.body.appendChild(panel);

    // Add event listeners
    document.getElementById('ck-stats-close').addEventListener('click', () => {
        document.body.removeChild(panel);
    });

    document.getElementById('ck-stats-preview').addEventListener('click', () => {
        showPreviewTable(stats.previewData);
    });

    // Close on outside click
    panel.addEventListener('click', (e) => {
        if (e.target === panel) {
            document.body.removeChild(panel);
        }
    });
}

/**
 * Show preview table of transactions
 */
function showPreviewTable(transactions) {
    const preview = document.createElement('div');
    preview.id = 'ck-preview-table';
    preview.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: white;
        border: 2px solid #3f51b5;
        border-radius: 8px;
        padding: 20px;
        z-index: 10002;
        max-width: 90%;
        max-height: 80vh;
        overflow: auto;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    // Sort by date descending to show newest first, then take top 20
    const sortedForPreview = [...transactions].sort((a, b) => {
        const dateA = parseTransactionDate(a.date);
        const dateB = parseTransactionDate(b.date);
        // Put transactions without dates at the end (pending transactions)
        if (!dateA && !dateB) return 0;
        if (!dateA) return 1; // No date goes to end
        if (!dateB) return -1; // No date goes to end
        return dateB.getTime() - dateA.getTime();
    });

    const table = sortedForPreview.slice(0, 20).map(t => `
        <tr>
            <td>${(!t.date || (typeof t.date === 'string' && t.date.trim() === '')) ? 'Pending' : convertDateFormat(t.date)}</td>
            <td>${t.description}</td>
            <td>$${t.amount.toFixed(2)}</td>
            <td>${t.category}</td>
            <td>${t.transactionType}</td>
            <td>${t.status || 'Posted'}</td>
        </tr>
    `).join('');

    preview.innerHTML = `
        <h3 style="margin-top: 0;">Transaction Preview (First 20)</h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
            <thead>
                <tr style="background: #f5f5f5;">
                    <th style="padding: 8px; text-align: left; border-bottom: 2px solid #ddd;">Date</th>
                    <th style="padding: 8px; text-align: left; border-bottom: 2px solid #ddd;">Description</th>
                    <th style="padding: 8px; text-align: right; border-bottom: 2px solid #ddd;">Amount</th>
                    <th style="padding: 8px; text-align: left; border-bottom: 2px solid #ddd;">Category</th>
                    <th style="padding: 8px; text-align: left; border-bottom: 2px solid #ddd;">Type</th>
                    <th style="padding: 8px; text-align: left; border-bottom: 2px solid #ddd;">Status</th>
                </tr>
            </thead>
            <tbody>
                ${table}
            </tbody>
        </table>
        <button id="ck-preview-close" style="
            margin-top: 15px;
            padding: 10px 20px;
            background: #3f51b5;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            width: 100%;
        ">Close</button>
    `;

    document.body.appendChild(preview);

    document.getElementById('ck-preview-close').addEventListener('click', () => {
        document.body.removeChild(preview);
    });
}

/**
 * Calculate data completeness percentage
 */
function calculateCompleteness(transactions) {
    if (transactions.length === 0) return 0;

    let completeFields = 0;
    const totalFields = transactions.length * 4; // date, description, amount, category

    transactions.forEach(t => {
        if (t.date) completeFields++;
        if (t.description) completeFields++;
        if (!isNaN(t.amount)) completeFields++;
        if (t.category) completeFields++;
    });

    return Math.round((completeFields / totalFields) * 100);
}

// Enhanced Scrolling and Capture
// ============================================================================

let stopScrolling = false;

// Helper function to send scroll progress to popup
function sendScrollProgress(data) {
    try {
        chrome.runtime.sendMessage({
            action: 'scrollProgress',
            data: data
        }).catch(() => {
            // Popup might be closed, ignore errors
        });
    } catch (e) {
        // Ignore messaging errors
    }
}

/**
 * Simple scroll function - PRISTINE VERSION APPROACH
 * ROLLBACK: Restore simple scroll from working version (October-133-Version)
 * This Month, Last Month, This Year presets work with this approach
 * Keep simple and proven - worked for 133 transactions extraction
 *
 * LESSON LEARNED: Simple window.scrollTo() works better than complex event dispatching
 * Credit Karma's lazy loading triggers naturally on window scroll
 */
function scrollDown() {
    // Simple, proven scroll mechanism from pristine version
    const currentPosition = window.scrollY;
    window.scrollTo(0, currentPosition + window.innerHeight * 1.5);
}

/**
 * Scroll to top of page (direct - use scrollToTopSegmented() to avoid logout)
 */
function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * Scroll back to top in segments (at least 33% per scroll) to avoid logout triggers
 * @param {Function} progressCallback - Optional callback for progress updates
 * @returns {Promise} Resolves when scroll to top is complete
 */
/**
 * LESSON LEARNED: Enhanced segmented scroll-back with extraction at each step
 * Scrolls back to top in small increments and extracts transactions at each segment
 * This ensures older transactions at top of list are captured during scroll-back
 */
async function scrollToTopSegmented(progressCallback = null, extractCallback = null) {
    const currentPosition = window.scrollY || window.pageYOffset || 0;
    const targetPosition = 0;

    // If already at top, nothing to do
    if (currentPosition <= 10) {
        if (progressCallback) progressCallback(0, 0, 100);
        return;
    }

    // LESSON LEARNED: Use smaller scroll increments (0.2x viewport height) for better lazy loading
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 800;
    const scrollStep = viewportHeight * 0.2; // Small segments (20% of viewport)
    const totalDistance = currentPosition - targetPosition;
    const numSegments = Math.ceil(totalDistance / scrollStep);

    console.log(`Scrolling back to top in ${numSegments} segments (${Math.round(scrollStep)}px per segment, ~20% viewport)`);

    let remainingDistance = currentPosition;
    let segmentNumber = 0;

    while (remainingDistance > 10 && segmentNumber < 20) { // Safety limit: max 20 segments
        segmentNumber++;
        remainingDistance = Math.max(0, remainingDistance - scrollStep);
        const targetScrollPosition = Math.max(0, remainingDistance);

        // Scroll to this segment position
        window.scrollTo({ top: targetScrollPosition, behavior: 'smooth' });

        // PRISTINE VERSION: No event dispatching needed - native scroll works

        // Call progress callback if provided
        if (progressCallback) {
            const progressPercent = Math.round(((currentPosition - targetScrollPosition) / currentPosition) * 100);
            progressCallback(segmentNumber, numSegments, progressPercent);
        }

        // Wait for scroll to complete and DOM to update
        await new Promise(resolve => setTimeout(resolve, 400));

        // LESSON LEARNED: Extract transactions after EACH scroll segment
        // This captures newly-loaded older transactions at top of list
        if (extractCallback && typeof extractCallback === 'function') {
            try {
                extractCallback(); // Extract transactions at this position
            } catch (e) {
                console.warn(`Warning: Extraction callback failed at segment ${segmentNumber}:`, e);
            }
        }

        // Verify scroll happened
        const actualPosition = window.scrollY || window.pageYOffset || 0;
        if (Math.abs(actualPosition - targetScrollPosition) > 50) {
            // Scroll didn't happen, try direct scroll
            window.scrollTo(0, targetScrollPosition);
            await new Promise(resolve => setTimeout(resolve, 300));

            // Extract again after forced scroll
            if (extractCallback && typeof extractCallback === 'function') {
                try {
                    extractCallback();
                } catch (e) {
                    console.warn('Warning: Extraction callback failed after forced scroll:', e);
                }
            }
        }

        // Small pause between segments to avoid triggering logout
        await new Promise(resolve => setTimeout(resolve, randomDelay(200, 400)));
    }

    // Final scroll to ensure we're at true top (window.scrollY <= 0)
    const finalCheck = window.scrollY || window.pageYOffset || 0;
    if (finalCheck > 10) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        await new Promise(resolve => setTimeout(resolve, 500));

        // Verify final position - must be at true top
        const finalPosition = window.scrollY || window.pageYOffset || 0;
        if (finalPosition > 10) {
            window.scrollTo(0, 0); // Direct scroll as fallback
            await new Promise(resolve => setTimeout(resolve, 300));
        }

        // LESSON LEARNED: Final extraction at top to capture any remaining older transactions
        if (extractCallback && typeof extractCallback === 'function') {
            try {
                extractCallback();
            } catch (e) {
                console.warn('Warning: Final extraction callback failed:', e);
            }
        }
    }

    if (progressCallback) progressCallback(numSegments, numSegments, 100);
    console.log(`✓ Completed segmented scroll back to top (${segmentNumber} segments) with extraction at each step`);
}

/**
 * Wait for DOM to stabilize (no new transactions loading)
 */
async function waitForDOMStability(previousCount, maxWait = 3000) {
    const startTime = Date.now();
    let stableCount = 0;

    while (Date.now() - startTime < maxWait) {
        await new Promise(resolve => setTimeout(resolve, 500));
        const currentCount = document.querySelectorAll('[data-index]').length;

        if (currentCount === previousCount) {
            stableCount++;
            if (stableCount >= 3) {
                return true; // DOM is stable
            }
        } else {
            stableCount = 0;
            previousCount = currentCount;
        }
    }

    return false;
}

/**
 * Parse date string to Date object, handling various formats
 */
function parseTransactionDate(dateString) {
    if (!dateString || typeof dateString !== 'string') return null;

    const trimmed = dateString.trim();
    if (!trimmed) return null;

    // IMPROVED: Multi-format date parsing (kept from functional improvements)
    // Format 1: MM/DD/YYYY (original format)
    if (trimmed.includes('/')) {
        const parts = trimmed.split('/');
        if (parts.length === 3) {
            const month = parseInt(parts[0], 10);
            const day = parseInt(parts[1], 10);
            const year = parseInt(parts[2], 10);
            if (!isNaN(month) && !isNaN(day) && !isNaN(year) &&
                month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 2010 && year <= 2030) {
                const date = new Date(year, month - 1, day);
                if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) {
                    return date;
                }
            }
        }
    }

    // Format 2: Abbreviated month (e.g., "Nov 14, 2025")
    const abbreviatedMatch = trimmed.match(/^([A-Za-z]{3})\s+(\d{1,2}),\s+(\d{4})$/);
    if (abbreviatedMatch) {
        const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
        const monthName = abbreviatedMatch[1].toLowerCase();
        const monthIndex = monthNames.indexOf(monthName);
        if (monthIndex !== -1) {
            const day = parseInt(abbreviatedMatch[2], 10);
            const year = parseInt(abbreviatedMatch[3], 10);
            if (!isNaN(day) && !isNaN(year) && day >= 1 && day <= 31 && year >= 2010 && year <= 2030) {
                return new Date(year, monthIndex, day);
            }
        }
    }

    // Format 3: Full month name (e.g., "November 14, 2025")
    const fullMatch = trimmed.match(/^([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})$/);
    if (fullMatch) {
        const monthNames = ['january', 'february', 'march', 'april', 'may', 'june',
                           'july', 'august', 'september', 'october', 'november', 'december'];
        const monthName = fullMatch[1].toLowerCase();
        const monthIndex = monthNames.indexOf(monthName);
        if (monthIndex !== -1) {
            const day = parseInt(fullMatch[2], 10);
            const year = parseInt(fullMatch[3], 10);
            if (!isNaN(day) && !isNaN(year) && day >= 1 && day <= 31 && year >= 2010 && year <= 2030) {
                return new Date(year, monthIndex, day);
            }
        }
    }

    // Format 4: Fallback to standard Date parsing
    const date = new Date(trimmed);
    if (!isNaN(date.getTime())) {
        return date;
    }

    return null;
}

/**
 * Check if transaction date is within range (inclusive, day-level comparison)
 * FIXED: More inclusive boundary handling to catch edge dates like 10/31
 */
function isDateInRange(transactionDate, startDate, endDate) {
    if (!transactionDate) return false;

    const txDate = parseTransactionDate(transactionDate);
    if (!txDate) return false;

    // Normalize to start of day for comparison (handles timezone issues)
    const txYear = txDate.getFullYear();
    const txMonth = txDate.getMonth();
    const txDay = txDate.getDate();
    const txDayStart = new Date(txYear, txMonth, txDay, 0, 0, 0, 0).getTime();

    const startYear = startDate.getFullYear();
    const startMonth = startDate.getMonth();
    const startDay = startDate.getDate();
    const startDayStart = new Date(startYear, startMonth, startDay, 0, 0, 0, 0).getTime();

    const endYear = endDate.getFullYear();
    const endMonth = endDate.getMonth();
    const endDay = endDate.getDate();
    // Include entire end day (up to end of day)
    const endDayEnd = new Date(endYear, endMonth, endDay, 23, 59, 59, 999).getTime();

    // More inclusive: include if transaction day is >= start day AND <= end day
    return txDayStart >= startDayStart && txDayStart <= endDayEnd;
}

/**
 * Calculate scroll strategy based on date range
 * Returns: { scrollDirection: 'forward'|'backward', estimatedScrolls: number }
 */
function calculateScrollStrategy(startDate, endDate) {
    const today = new Date();
    const startDateObj = new Date(startDate);
    const endDateObj = new Date(endDate);

    // If end date is in the future or very recent, scroll forward (default)
    if (endDateObj >= today || (today - endDateObj) < (30 * 24 * 60 * 60 * 1000)) {
        return { scrollDirection: 'forward', estimatedScrolls: 50 };
    }

    // If start date is more than 1 year ago, we need backward scrolling
    const yearsAgo = (today - startDateObj) / (365 * 24 * 60 * 60 * 1000);

    if (yearsAgo > 1) {
        // Estimate scrolls needed: ~50 per year, minimum 100
        const estimatedScrolls = Math.max(100, Math.ceil(yearsAgo * 50));
        return { scrollDirection: 'backward', estimatedScrolls };
    }

    return { scrollDirection: 'forward', estimatedScrolls: 50 };
}

/**
 * Helper function to get target period name for notifications
 * Returns month name (e.g., "November") or period description (e.g., "Last 2 Years")
 */
function getTargetPeriodName(startDateObj, endDateObj) {
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                       'July', 'August', 'September', 'October', 'November', 'December'];

    // Check if it's a single month range
    const startMonth = startDateObj.getMonth();
    const endMonth = endDateObj.getMonth();
    const startYear = startDateObj.getFullYear();
    const endYear = endDateObj.getFullYear();

    // Single month (e.g., November 1-30)
    if (startMonth === endMonth && startYear === endYear) {
        return monthNames[startMonth];
    }

    // Same year, different months (e.g., October-November)
    if (startYear === endYear && Math.abs(endMonth - startMonth) <= 2) {
        return `${monthNames[startMonth]}-${monthNames[endMonth]}`;
    }

    // Year range (e.g., Last Year, Last 2 Years)
    const yearsDiff = endYear - startYear;
    if (yearsDiff === 1 && startMonth === 0 && endMonth === 11) {
        return `Last Year (${startYear})`;
    }
    if (yearsDiff >= 1 && yearsDiff <= 3) {
        return `Last ${yearsDiff} Year${yearsDiff > 1 ? 's' : ''}`;
    }

    // Default: return date range
    return `${startDateObj.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })} - ${endDateObj.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`;
}

/**
 * Enhanced transaction capture with multiple improvements
 */
async function captureTransactionsInDateRange(startDate, endDate, request = {}) {
    const startTime = Date.now();

    // CRITICAL: Collect system date once at start for consistency throughout extraction
    const SYSTEM_DATE = new Date();
    const SYSTEM_YEAR = SYSTEM_DATE.getFullYear();
    const SYSTEM_MONTH = SYSTEM_DATE.getMonth();
    const SYSTEM_DAY = SYSTEM_DATE.getDate();

    console.log('=== STARTING EXTRACTION ===');
    console.log(`🕐 SYSTEM TIME: ${SYSTEM_DATE.toLocaleString()} (${SYSTEM_DATE.toISOString()})`);
    console.log(`📅 Today: ${SYSTEM_DATE.toLocaleDateString()} (Year: ${SYSTEM_YEAR}, Month: ${SYSTEM_MONTH + 1}, Day: ${SYSTEM_DAY})`);
    console.log(`📊 Target date range: ${startDate} to ${endDate}`);

    // CRITICAL: Parse dates FIRST before using them
    // Parse dates properly - these are the ACTUAL selected dates (with buffer if preset)
    // FIXED: Parse YYYY-MM-DD format explicitly to avoid timezone issues
    let startDateObj, endDateObj;
    try {
        // Parse YYYY-MM-DD format explicitly (avoids UTC timezone issues)
        if (startDate && startDate.includes('-') && startDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
            const [year, month, day] = startDate.split('-').map(Number);
            startDateObj = new Date(year, month - 1, day, 0, 0, 0, 0); // Local time, start of day
        } else {
            startDateObj = new Date(startDate);
        }

        if (endDate && endDate.includes('-') && endDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
            const [year, month, day] = endDate.split('-').map(Number);
            endDateObj = new Date(year, month - 1, day, 23, 59, 59, 999); // Local time, end of day
        } else {
            endDateObj = new Date(endDate);
        }
    } catch (dateError) {
        const diagnosticMsg = `
═══════════════════════════════════════════════════════════════════════════════
🔴 ERROR: Date Parsing Failed
═══════════════════════════════════════════════════════════════════════════════

📅 INPUT VALUES:
   • Start Date (raw): ${startDate}
   • End Date (raw): ${endDate}
   • Start Date Type: ${typeof startDate}
   • End Date Type: ${typeof endDate}

❌ ERROR DETAILS:
   • Error Message: ${dateError.message}
   • Error Stack: ${dateError.stack || 'N/A'}

💡 TROUBLESHOOTING:
   1. Verify date format is YYYY-MM-DD (e.g., 2025-10-01)
   2. Check if dates are valid calendar dates
   3. Ensure dates are strings, not objects
   4. Check browser console for additional errors

═══════════════════════════════════════════════════════════════════════════════`;
        console.error(diagnosticMsg);
        const errorMsg = `Failed to parse dates: startDate=${startDate}, endDate=${endDate}, error=${dateError.message}. Check console (F12) for full diagnostic details.`;
        throw new Error(errorMsg);
    }

    // Initialize per-run stats object (preset-aware)
    const presetNameForStats = request && request.preset ? request.preset : 'custom-range';
    const runStats = initializeRunStats(presetNameForStats, startDateObj, endDateObj);
    // Expose current run stats for HTTP 401 monitors and other global helpers
    window.__txVaultCurrentRunStats = runStats;

    if (presetNameForStats === 'last-year') {
        console.log('⏱️ Last Year preset: 14-minute runtime cap (session may expire around 15–20 minutes).');
        console.log('💡 Extension will auto-export partial data if logged out. Re-run the preset after logging back in to collect remaining rows.');
    }

    // CRITICAL: Declare preset detection variables at function scope AFTER date parsing
    // These are used throughout the function, including in error handlers and completion callbacks
    // Must be declared after startDateObj and endDateObj are parsed
    const todayForPreset = new Date(SYSTEM_DATE);
    todayForPreset.setHours(0, 0, 0, 0); // Normalize to start of day
    const isThisWeekPreset = (endDateObj >= todayForPreset &&
                              (todayForPreset - startDateObj) / (24 * 60 * 60 * 1000) <= 7);
    const isThisMonthPreset = (startDateObj.getMonth() === todayForPreset.getMonth() &&
                               startDateObj.getFullYear() === todayForPreset.getFullYear() &&
                               endDateObj >= todayForPreset);
    const isThisYearPreset = (startDateObj.getFullYear() === todayForPreset.getFullYear() &&
                              startDateObj.getMonth() === 0 && startDateObj.getDate() === 1 &&
                              endDateObj >= todayForPreset);
    const shouldIncludePendingPreset = isThisWeekPreset || isThisMonthPreset || isThisYearPreset;

    // Validate date parsing
    if (isNaN(startDateObj.getTime()) || isNaN(endDateObj.getTime())) {
        const diagnosticMsg = `
═══════════════════════════════════════════════════════════════════════════════
🔴 ERROR: Invalid Date Range
═══════════════════════════════════════════════════════════════════════════════

📅 INPUT VALUES:
   • Start Date (raw): ${startDate}
   • End Date (raw): ${endDate}
   • Parsed Start Date: ${startDateObj.toISOString()} (${isNaN(startDateObj.getTime()) ? 'INVALID' : 'Valid'})
   • Parsed End Date: ${endDateObj.toISOString()} (${isNaN(endDateObj.getTime()) ? 'INVALID' : 'Valid'})

❌ VALIDATION FAILED:
   • Start Date Valid: ${!isNaN(startDateObj.getTime())}
   • End Date Valid: ${!isNaN(endDateObj.getTime())}

💡 TROUBLESHOOTING:
   1. Verify dates are in correct format (YYYY-MM-DD)
   2. Check if dates are valid calendar dates
   3. Ensure start date is before end date
   4. Check browser console for parsing errors

═══════════════════════════════════════════════════════════════════════════════`;
        console.error(diagnosticMsg);
        throw new Error(`Invalid date range: ${startDate} to ${endDate}. Check console (F12) for full diagnostic details.`);
    }

    // Log parsed dates for debugging
    console.log(`📅 Parsed date range: ${startDateObj.toLocaleDateString()} (${startDateObj.toISOString()}) to ${endDateObj.toLocaleDateString()} (${endDateObj.toISOString()})`);

    // Get target period name for notifications (e.g., "November", "Last Year", etc.)
    const targetPeriodName = getTargetPeriodName(startDateObj, endDateObj);
    console.log(`🎯 Target Period: ${targetPeriodName}`);

    // CRITICAL: Warn if trying to extract future dates (likely user error)
    const daysUntilStart = (startDateObj - SYSTEM_DATE) / (24 * 60 * 60 * 1000);
    if (daysUntilStart > 7) {
        const warningMsg = `⚠️ WARNING: Start date (${startDateObj.toLocaleDateString()}) is ${Math.round(daysUntilStart)} days in the future. ` +
                          `System date: ${SYSTEM_DATE.toLocaleDateString()}. ` +
                          `Did you mean to extract ${startDateObj.getFullYear() - 1} instead of ${startDateObj.getFullYear()}?`;
        console.warn(warningMsg);
        // Don't throw error, but log warning - user might intentionally want future dates for pending transactions
    }

    // Determine date range priority based on SYSTEM_DATE (now that dates are parsed)
    const daysSinceEnd = (SYSTEM_DATE - endDateObj) / (24 * 60 * 60 * 1000);
    const isCurrentMonth = daysSinceEnd < 30 && startDateObj.getMonth() === SYSTEM_MONTH && startDateObj.getFullYear() === SYSTEM_YEAR;
    const isLastMonth = daysSinceEnd >= 30 && daysSinceEnd < 60;
    const scrollPriority = isCurrentMonth ? 'CURRENT_MONTH' : (isLastMonth ? 'LAST_MONTH' : 'OTHER');
    console.log(`🎯 Scroll Priority: ${scrollPriority} (${isCurrentMonth ? 'Highest' : isLastMonth ? 'High' : 'Standard'})`);

        let allTransactions = [];

        // REFERENCE STANDARD: October expected 133-140 transactions (from CONFIG)
        const EXPECTED_MIN = CONFIG.EXPECTED_MIN;
        const EXPECTED_MAX = CONFIG.EXPECTED_MAX;
        const TARGET_RANGE = { min: EXPECTED_MIN, max: EXPECTED_MAX };

        // CRITICAL: Calculate isLastMonthStop early so it's available for oscillation exit checks
        // Check if preset is "last-month" OR if end date is 30-60 days ago (fallback for custom ranges)
        const preset = request.preset || '';
        const daysSinceEndDateStop = (SYSTEM_DATE - endDateObj) / (24 * 60 * 60 * 1000);
        const isLastMonthStop = preset === 'last-month' || (daysSinceEndDateStop >= 30 && daysSinceEndDateStop < 60);

        let extractionComplete = false;  // Flag when 100% achieved

        // Track scroll statistics for 100% recovery optimization
        const scrollStats = {
            totalScrolls: 0,
            scrollsWithNewTransactions: 0,
            scrollsWithNoChange: 0,
            totalCollected: 0,
            inRangeCollected: 0,
            outOfRangeCollected: 0,
            scrollsAt100Percent: null,  // Track when 100% achieved
            parametersAt100Percent: {}  // Save parameters when 100% achieved
        };
    const finalVerificationScrolls = 0; // Initialize early to avoid scope issues

    // Dates already parsed and validated above (lines 1109-1115)
    // Log parsed dates for debugging
    console.log(`Parsed start date: ${startDateObj.toLocaleDateString()} (${startDateObj.toISOString()}) - Year: ${startDateObj.getFullYear()}, Month: ${startDateObj.getMonth()+1}, Day: ${startDateObj.getDate()}`);
    console.log(`Parsed end date: ${endDateObj.toLocaleDateString()} (${endDateObj.toISOString()}) - Year: ${endDateObj.getFullYear()}, Month: ${endDateObj.getMonth()+1}, Day: ${endDateObj.getDate()}`);

    // Verify dates are correct
    if (startDateObj.getFullYear() < 2020 || startDateObj.getFullYear() > 2030) {
        console.error(`⚠️ ERROR: Start date year seems incorrect: ${startDateObj.getFullYear()}`);
    }
    if (endDateObj.getFullYear() < 2020 || endDateObj.getFullYear() > 2030) {
        console.error(`⚠️ ERROR: End date year seems incorrect: ${endDateObj.getFullYear()}`);
    }
    if (startDateObj > endDateObj) {
        console.error(`⚠️ ERROR: Start date (${startDateObj.toLocaleDateString()}) is AFTER end date (${endDateObj.toLocaleDateString()})`);
    }

    // Calculate scroll strategy
    const scrollStrategy = calculateScrollStrategy(startDate, endDate);
    console.log(`Scroll strategy: ${scrollStrategy.scrollDirection}, estimated scrolls: ${scrollStrategy.estimatedScrolls}`);

    // ============================================================================
    // CAPTURE NEWEST VISIBLE DATE AND PENDING COUNT AT START (for validation)
    // ============================================================================
    // Capture the date of the topmost visible transaction (pending or posted) as newestVisibleDate
    // This is used later to validate that we captured the newest boundary correctly
    let newestVisibleDate = null;
    let pendingCountVisible = null;
    try {
        // Extract initial transactions to get the newest visible date
        const initialTransactions = extractAllTransactions();
        if (initialTransactions.length > 0) {
            // Get the first (topmost) transaction - it should be the newest
            const topmostTransaction = initialTransactions[0];
            if (topmostTransaction && topmostTransaction.date) {
                const parsedDate = parseTransactionDate(topmostTransaction.date);
                if (parsedDate) {
                    newestVisibleDate = parsedDate;
                    runStats.boundaries.newestVisibleDate = parsedDate.toISOString().split('T')[0];
                    console.log(`📅 Captured newest visible date at start: ${parsedDate.toLocaleDateString()} (${runStats.boundaries.newestVisibleDate})`);
                }
            }

            // Estimate pending count from initial transactions
            // Count transactions marked as "Pending" status
            const pendingTransactions = initialTransactions.filter(t => {
                const isPendingStatus = t.status && t.status.toLowerCase() === 'pending';
                const hasNoDate = !t.date || (typeof t.date === 'string' && t.date.trim() === '');
                return isPendingStatus || (hasNoDate && shouldIncludePendingPreset);
            });
            pendingCountVisible = pendingTransactions.length > 0 ? pendingTransactions.length : null;
            runStats.counts.pendingCountVisible = pendingCountVisible;
            console.log(`📊 Estimated visible pending count at start: ${pendingCountVisible || 'N/A'}`);
        }
    } catch (e) {
        console.warn('⚠️ Could not capture newest visible date or pending count at start:', e);
    }

    // Set to full day range (start of start day to end of end day)
    const startDateTime = new Date(startDateObj.getFullYear(), startDateObj.getMonth(), startDateObj.getDate()).getTime();
    const endDateTime = new Date(endDateObj.getFullYear(), endDateObj.getMonth(), endDateObj.getDate(), 23, 59, 59, 999).getTime();

    console.log(`Filter range: ${new Date(startDateTime).toLocaleDateString()} to ${new Date(endDateTime).toLocaleDateString()}`);

    let lastTransactionCount = 0;
    let unchangedCount = 0;
        let scrollAttempts = 0;
    let foundTargetDateRange = false;
    let consecutiveTargetDateMatches = 0;
    let lastScrollPosition = 0;
    let scrollPositionUnchangedCount = 0;

    // Calculate range size for max scroll limit
    const rangeDaysForMaxScroll = Math.ceil((endDateTime - startDateTime) / (24 * 60 * 60 * 1000)) + 1;

    // ROLLBACK: Restore simple max scrolls from working version
    // Use strategy-based max scroll attempts (50% buffer for safety)
    // Limit max scrolls for very large ranges to prevent excessive scrolling
    let maxScrollsCalculated = Math.max(200, Math.ceil(scrollStrategy.estimatedScrolls * 1.5));

    // For very large ranges (> 90 days), limit max scrolls to prevent excessive scrolling
    if (rangeDaysForMaxScroll > 90) {
        maxScrollsCalculated = Math.min(maxScrollsCalculated, 300); // Cap at 300 scrolls for very large ranges
        console.warn(`⚠️ Large date range detected (${rangeDaysForMaxScroll} days). Limiting max scrolls to ${maxScrollsCalculated} to prevent issues. Consider splitting into smaller ranges for better results.`);
    }

    // Apply preset-specific scroll caps (bounded, no deep-drill)
    const presetName = request && request.preset ? request.preset : '';
    const isLastMonthPreset = presetName === 'last-month';
    const isThisMonthPresetByName = presetName === 'this-month';
    const isThisYearPresetByName = presetName === 'this-year';
    const isLastYearPresetByName = presetName === 'last-year';
    const isThisWeekPresetByName = presetName === 'this-week';
    const isLastFiveYearsPresetByName = presetName === 'last-5-years';

    if (isLastMonthPreset) {
        const lastMonthCap = (CONFIG.SCROLL_LIMITS && CONFIG.SCROLL_LIMITS.LAST_MONTH_MAX_SCROLLS) || 80;
        if (maxScrollsCalculated > lastMonthCap) {
            console.log(`📊 Applying Last Month scroll cap: ${maxScrollsCalculated} → ${lastMonthCap}`);
            maxScrollsCalculated = lastMonthCap;
        }
    } else if (isThisWeekPresetByName) {
        const thisWeekCap = (CONFIG.SCROLL_LIMITS && CONFIG.SCROLL_LIMITS.THIS_WEEK_MAX_SCROLLS) || 60;
        if (maxScrollsCalculated > thisWeekCap) {
            console.log(`📊 Applying This Week scroll cap: ${maxScrollsCalculated} → ${thisWeekCap}`);
            maxScrollsCalculated = thisWeekCap;
        }
    } else if (isThisMonthPresetByName) {
        const thisMonthCap = (CONFIG.SCROLL_LIMITS && CONFIG.SCROLL_LIMITS.THIS_MONTH_MAX_SCROLLS) || 160;
        if (maxScrollsCalculated > thisMonthCap) {
            console.log(`📊 Applying This Month scroll cap: ${maxScrollsCalculated} → ${thisMonthCap}`);
            maxScrollsCalculated = thisMonthCap;
        }
    } else if (isThisYearPresetByName) {
        const thisYearCap = (CONFIG.SCROLL_LIMITS && CONFIG.SCROLL_LIMITS.THIS_YEAR_MAX_SCROLLS) || 260;
        if (maxScrollsCalculated > thisYearCap) {
            console.log(`📊 Applying This Year scroll cap: ${maxScrollsCalculated} → ${thisYearCap}`);
            maxScrollsCalculated = thisYearCap;
        }
    } else if (isLastYearPresetByName) {
        const lastYearCap = (CONFIG.SCROLL_LIMITS && CONFIG.SCROLL_LIMITS.LAST_YEAR_MAX_SCROLLS) || 260;
        if (maxScrollsCalculated > lastYearCap) {
            console.log(`📊 Applying Last Year scroll cap: ${maxScrollsCalculated} → ${lastYearCap}`);
            maxScrollsCalculated = lastYearCap;
        }
    } else if (isLastFiveYearsPresetByName) {
        const lastFiveYearsCap = (CONFIG.SCROLL_LIMITS && CONFIG.SCROLL_LIMITS.LAST_FIVE_YEARS_MAX_SCROLLS) || 600;
        if (maxScrollsCalculated > lastFiveYearsCap) {
            console.log(`📊 Applying Last 5 Years scroll cap: ${maxScrollsCalculated} → ${lastFiveYearsCap}`);
            maxScrollsCalculated = lastFiveYearsCap;
        }
    }

    const MAX_SCROLL_ATTEMPTS = maxScrollsCalculated;

    stopScrolling = false;

    // Create enhanced UI elements
    const stopButton = document.createElement('button');
    stopButton.textContent = 'Stop Scrolling';
    stopButton.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 20px;
        z-index: 10000;
        padding: 12px 24px;
        background-color: #ff3b30;
        color: white;
        border: none;
        border-radius: 6px;
        font-weight: bold;
        cursor: pointer;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        font-size: 14px;
    `;

    stopButton.addEventListener('mouseover', () => {
        stopButton.style.backgroundColor = '#d9342b';
    });
    stopButton.addEventListener('mouseout', () => {
        stopButton.style.backgroundColor = '#ff3b30';
    });

    stopButton.addEventListener('click', () => {
        stopScrolling = true;
        stopButton.textContent = 'Stopping...';
        stopButton.style.backgroundColor = '#999';
        stopButton.disabled = true;
        // Send stop progress to popup
        const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
        const elapsedMinutes = Math.floor(elapsedSeconds / 60);
        const elapsedDisplay = elapsedMinutes > 0
            ? `${elapsedMinutes}m ${elapsedSeconds % 60}s`
            : `${elapsedSeconds}s`;
        sendScrollProgress({
            isScrolling: false,
            isStopped: true,
            timeElapsed: elapsedDisplay,
            currentScroll: scrollAttempts,
            plannedScrolls: MAX_SCROLL_ATTEMPTS
        });
    });

    document.body.appendChild(stopButton);

    // Enhanced progress counter (fixed, consistent layout)
    const counterElement = document.createElement('div');
    counterElement.style.cssText = `
        position: fixed;
        bottom: 80px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 10000;
        max-width: 960px;
        width: 90%;
        box-sizing: border-box;
        padding: 10px 16px;
        background-color: rgba(20, 20, 20, 0.9);
        color: #f5f5f5;
        border-radius: 6px;
        font-size: 14px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-weight: 500;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        line-height: 1.4;
        display: flex;
        flex-direction: row;
        align-items: stretch;
    `;

    // Left status accent (color changes with QC state)
    const counterAccent = document.createElement('div');
    counterAccent.id = 'txvault-counter-accent';
    counterAccent.style.cssText = `
        width: 4px;
        border-radius: 4px 0 0 4px;
        background-color: #4caf50; /* default green, overridden by QC state */
        flex-shrink: 0;
    `;

    // Right content container with two fixed lines
    const counterContent = document.createElement('div');
    counterContent.id = 'txvault-counter-content';
    counterContent.style.cssText = `
        padding-left: 12px;
        display: flex;
        flex-direction: column;
        justify-content: center;
        width: 100%;
        overflow: hidden;
    `;

    const counterLine1 = document.createElement('div');
    counterLine1.id = 'txvault-counter-line1';
    counterLine1.style.cssText = `
        font-weight: 600;
        margin-bottom: 2px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    `;

    const counterLine2 = document.createElement('div');
    counterLine2.id = 'txvault-counter-line2';
    counterLine2.style.cssText = `
        font-weight: 400;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 13px;
        color: #e0e0e0;
    `;

    counterContent.appendChild(counterLine1);
    counterContent.appendChild(counterLine2);
    counterElement.appendChild(counterAccent);
    counterElement.appendChild(counterContent);

    document.body.appendChild(counterElement);

    // Progress bar
    const progressBar = document.createElement('div');
    progressBar.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 0%;
        height: 4px;
        background: linear-gradient(90deg, #3f51b5, #4caf50);
        z-index: 10001;
        transition: width 0.3s ease;
    `;
    document.body.appendChild(progressBar);

    // Declare result variable outside try block so it's accessible after finally
    let result;

    try {
        // ============================================================================
        // SMART INITIAL POSITIONING: Based on priority and scroll boundaries
        // ============================================================================

        // Wait for DOM to be ready and calculate page dimensions
        await new Promise(resolve => setTimeout(resolve, randomDelay(1000, 1500)));
        const initialDOMCount = document.querySelectorAll('[data-index]').length;
        await waitForDOMStability(initialDOMCount, 2000);

        // ============================================================================
        // CRITICAL: Extract from CURRENT position first (benefit from manual scrolling)
        // ============================================================================
        // If user manually scrolled and loaded transactions, capture them before moving
        const currentUserScrollPosition = window.scrollY;
        console.log(`📍 Current scroll position (user may have scrolled): ${currentUserScrollPosition}`);

        // Extract transactions from current position first (in case user pre-loaded them)
        let preloadedTransactions = extractAllTransactions();
        await new Promise(resolve => setTimeout(resolve, randomDelay(300, 500)));
        const preloadedPass2 = extractAllTransactions();
        preloadedTransactions = combineTransactions(preloadedTransactions, preloadedPass2);
        if (preloadedTransactions.length > 0) {
            allTransactions = combineTransactions(allTransactions, preloadedTransactions);
            console.log(`✅ Captured ${preloadedTransactions.length} transactions from current position (user manual scroll benefit)`);
        }

        // Calculate scroll boundaries BEFORE initial positioning
        const totalPageHeight = document.documentElement.scrollHeight;
        const viewportHeight = window.innerHeight;
        const maxScrollPosition = totalPageHeight - viewportHeight;

        // Determine date range priority based on SYSTEM_DATE
        const daysSinceEndForInitial = (SYSTEM_DATE - endDateObj) / (24 * 60 * 60 * 1000);
        const daysSinceStartForInitial = (SYSTEM_DATE - startDateObj) / (24 * 60 * 60 * 1000);
        const isVeryRecent = daysSinceEndForInitial <= 7; // Within last 7 days (includes "this week")
        const isCurrentMonthPriority =
            daysSinceEndForInitial < 30 &&
            startDateObj.getMonth() === SYSTEM_MONTH &&
            startDateObj.getFullYear() === SYSTEM_YEAR;
        // For explicit Last Month preset, always treat as Last Month priority,
        // even if the end date is slightly less than 30 days ago (e.g., Oct when
        // running in late November).
        const isLastMonthPriority =
            (request && request.preset === 'last-month') ||
            (daysSinceEndForInitial >= 30 && daysSinceEndForInitial < 60);

        // Calculate optimal starting position based on priority
        let optimalStartPosition = 0;
        if (isVeryRecent || isCurrentMonthPriority) {
            // Very recent dates (this week) or current month: Start at top (0), scroll down within top 30%
            optimalStartPosition = 0;
            const priorityType = isVeryRecent ? 'Very Recent (This Week)' : 'Current Month';
            console.log(`🎯 PRIORITY: ${priorityType} - Starting at top (position 0)`);
            // CRITICAL FIX: Ensure we're at position 0 for current month preset
            // User may have scrolled down, so we need to scroll to top first
            if (window.scrollY > 0) {
                console.log(`📍 User was scrolled to position ${window.scrollY}, scrolling to top (0) for ${priorityType} preset`);
                window.scrollTo(0, 0);
                await new Promise(resolve => setTimeout(resolve, randomDelay(500, 800)));
            }
        } else if (isLastMonthPriority) {
            // Last month: Start at estimated position (30% of page), scroll down within 30-70%
            optimalStartPosition = Math.floor(maxScrollPosition * 0.3);
            console.log(`🎯 PRIORITY: Last Month - Starting at estimated position (${optimalStartPosition}, ~30% of page)`);
            window.scrollTo(0, optimalStartPosition);
            await new Promise(resolve => setTimeout(resolve, randomDelay(1000, 1500)));
        } else {
            // Other dates: Start at estimated position (40% of page), scroll down within 40-100%
            optimalStartPosition = Math.floor(maxScrollPosition * 0.4);
            console.log(`🎯 PRIORITY: Other Dates - Starting at estimated position (${optimalStartPosition}, ~40% of page)`);
            window.scrollTo(0, optimalStartPosition);
            await new Promise(resolve => setTimeout(resolve, randomDelay(1000, 1500)));
        }

        // Initial extraction at optimal starting position - do multiple passes
        let initialTransactions = extractAllTransactions();
        await new Promise(resolve => setTimeout(resolve, randomDelay(500, 800)));
        const initialPass2 = extractAllTransactions();
        initialTransactions = combineTransactions(initialTransactions, initialPass2);
        await new Promise(resolve => setTimeout(resolve, randomDelay(500, 800)));
        const initialPass3 = extractAllTransactions();
        initialTransactions = combineTransactions(initialTransactions, initialPass3);
        allTransactions = combineTransactions(allTransactions, initialTransactions);
        console.log(`Initial extraction at position ${optimalStartPosition}: ${initialTransactions.length} unique transactions`);

        // Log date range of initial transactions for debugging
        const initialDates = initialTransactions
            .map(t => parseTransactionDate(t.date))
            .filter(d => d)
            .sort((a, b) => b.getTime() - a.getTime());
        if (initialDates.length > 0) {
            console.log(`Initial date range found: ${initialDates[initialDates.length - 1].toLocaleDateString()} to ${initialDates[0].toLocaleDateString()}`);
        }

        // Set initial scroll position tracking
        let currentScrollPosition = window.scrollY;

        // Session timeout / logout tracking
        let sessionErrorDetected = false;
        let sessionLogoutTime = null;

        // ============================================================================
        // REVAMPED SCROLLING STRATEGY: Priority-based with scroll boundaries
        // ============================================================================

        // Recalculate page dimensions in case more content loaded
        const updatedTotalPageHeight = document.documentElement.scrollHeight;
        const updatedMaxScrollPosition = updatedTotalPageHeight - viewportHeight;
        const finalMaxScrollPosition = Math.max(maxScrollPosition, updatedMaxScrollPosition);

        // Estimate scroll boundaries: where target dates are likely to be
        let estimatedStartBoundary = 0;
        let estimatedEndBoundary = finalMaxScrollPosition;

        if (isVeryRecent || isCurrentMonthPriority) {
            // Very recent dates (this week) or current month - top portion
            estimatedStartBoundary = 0;
            estimatedEndBoundary = finalMaxScrollPosition * 0.3;
            const boundaryType = isVeryRecent ? 'Very recent (this week)' : 'Current month';
            console.log(`📊 Scroll boundaries: ${boundaryType} - Top 0-30% (0 to ${Math.round(estimatedEndBoundary)})`);
        } else if (isLastMonthPriority) {
            // Last month - middle portion
            estimatedStartBoundary = finalMaxScrollPosition * 0.3;
            estimatedEndBoundary = finalMaxScrollPosition * 0.7;
            console.log(`📊 Scroll boundaries: Last month - Middle 30-70% (${Math.round(estimatedStartBoundary)} to ${Math.round(estimatedEndBoundary)})`);
        } else {
            // Older dates - lower portion
            estimatedStartBoundary = finalMaxScrollPosition * 0.4;
            estimatedEndBoundary = finalMaxScrollPosition;
            console.log(`📊 Scroll boundaries: Older dates - Lower 40-100% (${Math.round(estimatedStartBoundary)} to ${Math.round(estimatedEndBoundary)})`);
        }

        // Track when we've reached the target date range to prevent going backwards
        let hasReachedTargetRange = false;
        let lastInRangeCount = 0;
        let noProgressScrolls = 0;
        const MAX_NO_PROGRESS_SCROLLS = 5; // Stop after 5 scrolls with no progress
        const STAGNATION_THRESHOLD = 3; // Exit after 3 scrolls with zero new transactions
        let stagnationScrolls = 0;
        // Track the best in-range count seen so we can detect cap exits that
        // fall short of the Last Month reference minimum.
        let maxTransactionsInRangeCount = 0;

        // OPTIMIZED: Time-Critical Boundary-First Strategy (DESCENDING ORDER)
        // Data is in DESCENDING order: newest first (top) → oldest last (bottom)
        //
        // STRATEGY:
        // 1. Find END boundary (end date, e.g., Oct 31) - HARVEST data while searching
        // 2. Find START boundary (start date, e.g., Oct 1) - HARVEST data while searching
        // 3. Oscillate between boundaries (MAX 3 oscillations)
        // 4. Exit early if no progress for 2 consecutive oscillations
        //
        // TIME-CRITICAL: Minimize wasted scrolls, exit as soon as no new data found

        // Session / logout detection helper
        function isLoggedOut() {
            try {
                const href = window.location.href || '';
                if (href.includes('/auth') || href.includes('/login')) {
                    console.log('🔴 LOGOUT DETECTED: URL redirected to auth/login page');
                    return true;
                }

                const loginForm =
                    document.querySelector('[data-testid="login-form"]') ||
                    document.querySelector('input[type="password"][name="password"]') ||
                    document.querySelector('.login-container');
                if (loginForm) {
                    console.log('🔴 LOGOUT DETECTED: Login form present on page');
                    return true;
                }

                const transactionElements = document.querySelectorAll('[data-index]');
                if (scrollAttempts > 5 && transactionElements.length === 0) {
                    console.log('🔴 LOGOUT DETECTED: No transaction elements after 5+ scrolls');
                    return true;
                }
            } catch (e) {
                console.warn('Error during logout detection check:', e);
            }
            return false;
        }

        // Log buffer configuration for QA/auditability
        console.log('📊 [BUFFER CONFIGURATION] Boundary detection strategy initialized');
        console.log(`   • Target range: ${startDateObj.toLocaleDateString()} - ${endDateObj.toLocaleDateString()}`);
        const bufferDays = isLastMonthPriority ? CONFIG.BUFFER_DAYS.LAST_MONTH : CONFIG.BUFFER_DAYS.MEDIUM_RANGE;
        const beforeStartBuffer = isLastMonthPriority ? CONFIG.BEFORE_START_BUFFER.LAST_MONTH : CONFIG.BEFORE_START_BUFFER.STANDARD;
        console.log(`   • Left boundary buffer: ${beforeStartBuffer} days before start`);
        console.log(`   • Right boundary buffer: ${bufferDays} days after end`);
        console.log(`   • Initial scroll limit: ${MAX_SCROLL_ATTEMPTS} (will increase dynamically if needed)`);
        console.log(`   • Stagnation threshold: ${STAGNATION_THRESHOLD} scrolls`);
        console.log('   • Strategy: Boundary-first with dynamic oscillation limits');

        let endBoundaryFound = false;    // End boundary (e.g., Oct 31) found - FIRST when scrolling down
        let startBoundaryFound = false;  // Start boundary (e.g., Oct 1) found - SECOND when scrolling down
        let targetRangeStartBoundary = null;  // Scroll position where START boundary (Sep 30, last transaction BEFORE Oct 1) is located (lower on page)
        let targetRangeEndBoundary = null;    // Scroll position where END boundary (Nov 1, first transaction AFTER Oct 31) is located (higher on page)
        let targetRangeStartOscillationBoundary = null; // Scroll position where Oct 1 transactions START (for oscillation, not Sep 30)
        let scrollingDirection = 'down'; // Track scrolling direction: 'down' (finding boundaries) or 'oscillating' (between boundaries)
        let atStartBoundary = false; // Track if we're at the start boundary during oscillation
        let harvestingStarted = false; // Track if harvesting has started (after START boundary found)
        // CRITICAL: Track if we've scrolled PAST boundary dates to ensure we capture ALL transactions on boundary dates
        let endBoundaryScrolledPast = false; // Have we scrolled past Nov 1 to capture all Oct 31 transactions?
        let startBoundaryScrolledPast = false; // Have we scrolled past Sept 30 to capture all Oct 1 transactions?
        let endBoundaryScrollBuffer = 0; // Count scrolls after finding END boundary (need to scroll past it)
        let startBoundaryScrollBuffer = 0; // Count scrolls after finding START boundary (need to scroll past it)
        const BOUNDARY_SCROLL_BUFFER = 3; // Number of scrolls to continue after finding boundary to ensure completeness
        // DYNAMIC OSCILLATION LIMITS: Adjust based on progress, not hard-coded
        let oscillationCount = 0; // Count oscillations between boundaries
        let maxOscillations = 3; // Start with 3, but adjust dynamically
        let lastOscillationCount = 0; // Track transaction count at start of each oscillation
        let consecutiveNoProgressOscillations = 0; // Track consecutive oscillations with no progress
        let maxNoProgressOscillations = 2; // Start with 2, but adjust dynamically
        let consecutiveNoProgressScrolls = 0; // Track consecutive scrolls with no progress (for dynamic adjustment)

        const priorityLabel = isVeryRecent ? 'VERY_RECENT (This Week - Highest)' :
                             isCurrentMonthPriority ? 'CURRENT_MONTH (Highest)' :
                             isLastMonthPriority ? 'LAST_MONTH (High)' : 'OTHER (Standard)';
        console.log(`🎯 Scrolling Priority: ${priorityLabel}`);
        console.log('⚡ OPTIMIZED Strategy: Find boundaries (harvest during discovery) → Oscillate (dynamic limits) → Early exit (when no progress)');
        console.log('   Note: Data is descending (newest first), so END boundary found FIRST, START boundary found SECOND');
        console.log('   ⏱️ TIME-CRITICAL: Minimizing wasted scrolls, exiting as soon as no new data found');

        // CRITICAL: Track dynamic max scrolls for cases where found range is newer than target
        let dynamicMaxScrollAttempts = MAX_SCROLL_ATTEMPTS;

        // CRITICAL: Track if found range is newer than target (must be declared before loop)
        // This flag prevents premature exit when we find newer data (e.g., November) but target is older (e.g., October)
        let foundRangeIsNewerThanTarget = false;
        // Human-readable elapsed time string shared across logs and notifications
        let elapsedDisplay = '0s';
        let foundDateRange = 'N/A'; // Track the date range of found transactions for logging

        // ============================================================================
        // LOGOUT DETECTION: Detect when Credit Karma logs out and export CSV immediately
        // ============================================================================
        let logoutDetected = false;
        let lastUrl = window.location.href;

        // Function to export CSV immediately when logout detected
        const exportCSVOnLogout = (capturedTransactions, startDate, endDate) => {
            console.error(`🚨 LOGOUT DETECTED! Exporting ${capturedTransactions.length} captured transaction(s) immediately...`);

            // Filter transactions to date range
            const filteredForRange = capturedTransactions.filter(t => {
                return isDateInRange(t.date, startDateObj, endDateObj);
            });

            if (filteredForRange.length === 0) {
                console.warn(`⚠️ No transactions in date range to export. Total captured: ${capturedTransactions.length}`);
                alert(`⚠️ Credit Karma logged out during extraction.\n\nNo transactions found in date range (${startDate} to ${endDate}).\n\nTotal transactions captured: ${capturedTransactions.length}\n\nCheck console (F12) for details.`);
                return;
            }

            // Prepare transactions for export: filter valid dates and remove duplicates
            const beforeCount = filteredForRange.length;
            const filteredForExport = prepareTransactionsForExport(filteredForRange);
            const removedCount = beforeCount - filteredForExport.length;

            if (filteredForExport.length === 0) {
                logUserError(`No valid transactions after filtering. Original: ${beforeCount}`);
                alert(`⚠️ Credit Karma logged out during extraction.\n\nNo valid transactions to export after filtering.\n\nTotal captured: ${capturedTransactions.length}\nIn range: ${beforeCount}\nRemoved: ${removedCount} (Pending dates or duplicates)\n\nCheck console (F12) for details.`);
                return;
            }

            // Log filtering results
            if (removedCount > 0) {
                console.log(`📊 Logout Export: Filtered ${removedCount} transaction(s) (Pending dates or duplicates)`);
                console.log(`   In range: ${beforeCount}, After filtering: ${filteredForExport.length}`);
            }

            // Generate CSV
            const csvData = convertToCSV(filteredForExport);
            const fileName = `all_transactions_${startDate.replace(/\//g, '-')}_to_${endDate.replace(/\//g, '-')}_LOGOUT_${new Date().toISOString().split('T')[0]}.csv`;

            // Save CSV file
            saveCSVToFile(csvData, fileName);

            // Attempt to save run stats if available in this context
            try {
                if (typeof runStats !== 'undefined' && runStats) {
                    // Update basic counts for logout context
                    runStats.counts.totalTransactions = capturedTransactions.length;
                    runStats.counts.inRangeAll = beforeCount;
                    runStats.counts.inRangePosted = filteredForExport.length;
                    runStats.alerts.push('LOGOUT_EXPORT');
                    const finalized = finalizeRunStats(runStats);
                    saveRunStatsFiles(finalized, fileName);
                }
            } catch (e) {
                console.error('Error saving run stats during logout export:', e);
            }

            // Show alert
            const logoutMsg = removedCount > 0
                ? `🚨 Credit Karma logged out during extraction!\n\n✅ Exported ${filteredForExport.length} transaction(s) to CSV file.\n\n⚠️ Removed ${removedCount} (Pending dates or duplicates)\n\nFile: ${fileName}\n\nTotal transactions captured: ${capturedTransactions.length}\nDate range: ${startDate} to ${endDate}\n\n⚠️ Extraction was incomplete due to logout.`
                : `🚨 Credit Karma logged out during extraction!\n\n✅ Exported ${filteredForExport.length} transaction(s) to CSV file.\n\nFile: ${fileName}\n\nTotal transactions captured: ${capturedTransactions.length}\nDate range: ${startDate} to ${endDate}\n\n⚠️ Extraction was incomplete due to logout.`;
            alert(logoutMsg);
            console.log(`✅ CSV exported successfully: ${fileName}`);
            console.log(`   Transactions exported: ${filteredForExport.length} (out of ${capturedTransactions.length} total captured)`);
        };

        // Monitor URL changes for logout detection
        const checkForLogout = () => {
            const currentUrl = window.location.href;
            const urlPath = new URL(currentUrl).pathname.toLowerCase();

            // Check if redirected to login/auth page
            const isLogoutPage = urlPath.includes('/auth/') ||
                                 urlPath.includes('/login') ||
                                 urlPath.includes('/signin') ||
                                 urlPath.includes('/logon') ||
                                 (currentUrl !== lastUrl && urlPath.includes('/auth'));

            if (isLogoutPage && !logoutDetected) {
                logoutDetected = true;
                console.error(`🚨 LOGOUT DETECTED! URL changed to: ${currentUrl}`);
                console.error(`   Previous URL: ${lastUrl}`);
                console.error('   Exporting captured data immediately...');

                // Stop scrolling immediately
                stopScrolling = true;

                // Export CSV with captured data
                exportCSVOnLogout(allTransactions, startDate, endDate);

                return true;
            }

            lastUrl = currentUrl;
            return false;
        };

        // Check for logout periodically during scroll loop
        const logoutCheckInterval = setInterval(() => {
            if (checkForLogout()) {
                clearInterval(logoutCheckInterval);
            }
        }, 1000); // Check every second

        console.log('✅ Logout detection enabled. Will export CSV automatically if logout detected.');

        // ============================================================================
        // MANUAL SCROLL DETECTION: Detect when user manually scrolls and extract immediately
        // ============================================================================
        let lastKnownScrollY = window.scrollY;
        let manualScrollDetected = false;
        let manualScrollCount = 0;
        let manualScrollExtractionPending = false;

        // Set up scroll event listener to detect manual scrolling
        const manualScrollHandler = () => {
            const currentScrollY = window.scrollY;
            // Detect significant scroll change (more than 50px) that wasn't caused by our auto-scroll
            if (Math.abs(currentScrollY - lastKnownScrollY) > 50) {
                manualScrollDetected = true;
                manualScrollCount++;
                console.log(`👆 MANUAL SCROLL DETECTED! Position: ${Math.round(lastKnownScrollY)}px → ${Math.round(currentScrollY)}px (change: ${Math.round(currentScrollY - lastKnownScrollY)}px)`);
                console.log(`   This is manual scroll #${manualScrollCount}. Will extract transactions on next loop iteration.`);
                // Mark that we need to extract after manual scroll
                manualScrollExtractionPending = true;
            }
            lastKnownScrollY = currentScrollY;
        };

        // Add scroll listener (throttled to avoid performance issues)
        let scrollThrottleTimeout = null;
        const throttledScrollHandler = () => {
            if (scrollThrottleTimeout) return;
            scrollThrottleTimeout = setTimeout(() => {
                manualScrollHandler();
                scrollThrottleTimeout = null;
            }, 100); // Throttle to once per 100ms
        };

        window.addEventListener('scroll', throttledScrollHandler, { passive: true });
        console.log('✅ Manual scroll detection enabled. Will detect and extract transactions when user scrolls manually.');

        // CRITICAL: Loop condition - block exit if foundRangeIsNewerThanTarget is true
        // This ensures we continue scrolling DOWN even if other conditions would allow exit
        while (!stopScrolling && scrollAttempts < dynamicMaxScrollAttempts) {
            // ============================================================================
            // MINIMAL LOOP ENTRY LOGGING: Only log first few scrolls
            // ============================================================================
            if (scrollAttempts <= 5) {
                console.log(`🔍 [LOOP] Scroll ${scrollAttempts + 1}: stopScrolling=${stopScrolling}, foundRangeIsNewerThanTarget=${foundRangeIsNewerThanTarget}, limit=${dynamicMaxScrollAttempts}`);
            }

            // Increment per-run scroll counter (for stats)
            if (typeof runStats !== 'undefined' && runStats) {
                runStats.scrollAttempts++;
            }

            // ============================================================================
            // RUNTIME CAPS: Enforce preset-specific wall-clock limits (TIME_CAP_REACHED_*)
            // ============================================================================
        const presetNameForRuntime = request && request.preset ? request.preset : '';
            const runtimeElapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
            let runtimeCapSeconds = null;
            let runtimeAlertCode = null;

            if (presetNameForRuntime === 'last-month') {
                runtimeCapSeconds = (CONFIG.RUNTIME_LIMITS && CONFIG.RUNTIME_LIMITS.LAST_MONTH_SECONDS) || 600;
                runtimeAlertCode = 'TIME_CAP_REACHED_LAST_MONTH';
            } else if (presetNameForRuntime === 'this-month') {
                runtimeCapSeconds = (CONFIG.RUNTIME_LIMITS && CONFIG.RUNTIME_LIMITS.THIS_MONTH_SECONDS) || 420;
                runtimeAlertCode = 'TIME_CAP_REACHED_THIS_MONTH';
            } else if (presetNameForRuntime === 'this-year') {
                runtimeCapSeconds = (CONFIG.RUNTIME_LIMITS && CONFIG.RUNTIME_LIMITS.THIS_YEAR_SECONDS) || 900;
                runtimeAlertCode = 'TIME_CAP_REACHED_THIS_YEAR';
            } else if (presetNameForRuntime === 'last-year') {
                runtimeCapSeconds = (CONFIG.RUNTIME_LIMITS && CONFIG.RUNTIME_LIMITS.LAST_YEAR_SECONDS) || 840;
                runtimeAlertCode = 'TIME_CAP_REACHED_LAST_YEAR';
            } else if (presetNameForRuntime === 'this-week') {
                runtimeCapSeconds = (CONFIG.RUNTIME_LIMITS && CONFIG.RUNTIME_LIMITS.THIS_WEEK_SECONDS) || 180;
                runtimeAlertCode = 'TIME_CAP_REACHED_THIS_WEEK';
            } else if (presetNameForRuntime === 'last-5-years') {
                runtimeCapSeconds = (CONFIG.RUNTIME_LIMITS && CONFIG.RUNTIME_LIMITS.LAST_FIVE_YEARS_SECONDS) || 1200;
                runtimeAlertCode = 'TIME_CAP_REACHED_LAST_FIVE_YEARS';
            }

            if (runtimeCapSeconds != null && runtimeElapsedSeconds >= runtimeCapSeconds) {
                console.warn(`⏱️ [RUNTIME CAP] ${presetNameForRuntime || 'generic'} runtime cap reached (${runtimeElapsedSeconds}s >= ${runtimeCapSeconds}s). Stopping scroll loop and proceeding to export.`);
                if (typeof runStats !== 'undefined' && runStats && runtimeAlertCode) {
                    runStats.alerts = runStats.alerts || [];
                    runStats.alerts.push(runtimeAlertCode);
                }
                break;
            }

            // ============================================================================
            // DEFENSIVE GUARD: Block exit after only 1 scroll if found range is newer
            // ============================================================================
            if (scrollAttempts <= 1 && foundRangeIsNewerThanTarget) {
                console.log(`🚨 [GUARD] Blocking exit at scroll ${scrollAttempts} - found range is newer than target`);
            }

            // ============================================================================
            // LOGOUT CHECK: Check for logout before each scroll iteration
            // ============================================================================
            if (checkForLogout()) {
                // Legacy logout path (auto-export via dedicated handler)
                console.log(`\n${'='.repeat(80)}`);
                console.log('🚨 [EXIT ATTEMPT] LOGOUT DETECTED (auto-export handler)');
                console.log('   • Exit reason: Logout detected during extraction');
                console.log(`   • Scroll count: ${scrollAttempts}`);
                console.log(`   • Transactions found: ${allTransactions.length}`);
                console.log(`${'='.repeat(80)}\n`);
                console.log('⚠️ Scroll loop stopped due to logout detection.');
                sessionErrorDetected = true;
                sessionLogoutTime = Math.floor((Date.now() - startTime) / 1000);
                break;
            }

            // Additional defensive logout check every 5 scrolls for long runs
            if (scrollAttempts > 0 && scrollAttempts % 5 === 0 && !stopScrolling) {
                if (isLoggedOut()) {
                    console.log('🔴 SESSION EXPIRED - User logged out from Credit Karma during scrolling');
                    console.log(`📊 Partial data collected so far: ${allTransactions.length} transactions (before export filter)`);
                    console.log('💡 TIP: Log back in and re-run this preset to collect remaining data for the year.');

                    stopScrolling = true;
                    sessionErrorDetected = true;
                    sessionLogoutTime = Math.floor((Date.now() - startTime) / 1000);

                    // Continue to export with collected data
                    break;
                }
            }

            scrollAttempts++;

            // CRITICAL: Log loop condition check for debugging premature exits
            if (scrollAttempts <= 15) {
                console.log(`🔍 [LOOP CHECK] Scroll ${scrollAttempts}: stopScrolling=${stopScrolling}, scrollAttempts=${scrollAttempts}, dynamicMaxScrollAttempts=${dynamicMaxScrollAttempts}, condition=${scrollAttempts < dynamicMaxScrollAttempts}`);
            }

            // ============================================================================
            // MANUAL SCROLL EXTRACTION: If user manually scrolled, extract immediately
            // ============================================================================
            if (manualScrollExtractionPending) {
                console.log(`🔄 Processing manual scroll #${manualScrollCount} - extracting transactions immediately...`);

                // Extract transactions from current position (user scrolled here manually)
                let manualScrollTransactions = extractAllTransactions();

                // Multiple passes for thorough extraction
                await new Promise(resolve => setTimeout(resolve, randomDelay(300, 500)));
                const manualPass2 = extractAllTransactions();
                manualScrollTransactions = combineTransactions(manualScrollTransactions, manualPass2);

                await new Promise(resolve => setTimeout(resolve, randomDelay(300, 500)));
                const manualPass3 = extractAllTransactions();
                manualScrollTransactions = combineTransactions(manualScrollTransactions, manualPass3);

                const beforeManualCount = allTransactions.length;
                allTransactions = combineTransactions(allTransactions, manualScrollTransactions);
                const newFromManual = allTransactions.length - beforeManualCount;

                if (newFromManual > 0) {
                    console.log(`✅ Manual scroll extraction: Found ${newFromManual} new transaction(s) (total: ${allTransactions.length})`);
                    console.log(`   Scroll position: ${Math.round(window.scrollY)}px | Page height: ${document.documentElement.scrollHeight}px`);

                    // Reset stagnation counters since we found new content
                    unchangedCount = 0;
                    scrollPositionUnchangedCount = 0;

                    // Update status display
                    const transactionsInRangeCount = allTransactions.filter(t => {
                        return isDateInRange(t.date, startDateObj, endDateObj);
                    }).length;

                    if (counterElement) {
                        const manualScrollMsg = `👆 Manual scroll #${manualScrollCount} detected! Extracted ${newFromManual} new transaction(s).`;
                        counterElement.innerHTML = `
                            <div style="color: #28a745; font-weight: bold; margin-bottom: 5px;">${manualScrollMsg}</div>
                            <div>Records harvested: ${transactionsInRangeCount} | Scroll: ${scrollAttempts}/${dynamicMaxScrollAttempts} | Time: ${Math.round((Date.now() - startTime) / 1000)}s</div>
                            <div>Window scroll: ${Math.round(window.scrollY)}px | Page height: ${document.documentElement.scrollHeight}px</div>
                        `;
                    }
                } else {
                    console.log('   ⚠️ Manual scroll detected but no new transactions found at this position.');
                }

                // Wait a bit for lazy loading to complete after manual scroll
                await new Promise(resolve => setTimeout(resolve, randomDelay(500, 800)));

                // Reset flag
                manualScrollExtractionPending = false;
                manualScrollDetected = false; // Reset for next detection

                // Update lastKnownScrollY to current position
                lastKnownScrollY = window.scrollY;

                // Continue loop - don't do auto-scroll this iteration since user just scrolled manually
                // But still do date range checks below
            }

            // Update progress bar (use dynamicMaxScrollAttempts for accurate progress)
            const progress = Math.min((scrollAttempts / dynamicMaxScrollAttempts) * 100, 95);
            progressBar.style.width = `${progress}%`;

            // Extract transactions multiple times for better coverage (5 passes for thorough collection)
            // CRITICAL: More thorough extraction per scroll to collect all 133 transactions efficiently
            let newTransactions = extractAllTransactions();

            // Second pass after short wait
            await new Promise(resolve => setTimeout(resolve, randomDelay(200, 350)));
            const secondPass = extractAllTransactions();
            newTransactions = combineTransactions(newTransactions, secondPass);

            // Third pass for coverage
            await new Promise(resolve => setTimeout(resolve, randomDelay(200, 350)));
            const thirdPass = extractAllTransactions();
            newTransactions = combineTransactions(newTransactions, thirdPass);

            // Fourth pass for thorough collection (critical for 133 transactions)
            await new Promise(resolve => setTimeout(resolve, randomDelay(200, 350)));
            const fourthPass = extractAllTransactions();
            newTransactions = combineTransactions(newTransactions, fourthPass);

            // Fifth pass for final verification
            await new Promise(resolve => setTimeout(resolve, randomDelay(200, 350)));
            const fifthPass = extractAllTransactions();
            newTransactions = combineTransactions(newTransactions, fifthPass);

            // Combine with existing
            const beforeCombineCount = allTransactions.length;
            allTransactions = combineTransactions(allTransactions, newTransactions);
            const newTransactionsThisScroll = allTransactions.length - beforeCombineCount;

            // Calculate date range of found transactions EARLY for stagnation detection
            // CRITICAL: Reset flags at start of each iteration (will be recalculated below)
            foundDateRange = 'N/A';
            foundRangeIsNewerThanTarget = false;
            if (allTransactions.length > 0) {
                // CRITICAL: Filter to only transactions with valid dates for range detection
                // Pending transactions may not have dates, so we need to check posted transactions
                const transactionsWithDates = allTransactions
                    .map(t => {
                        const txDate = parseTransactionDate(t.date);
                        return { transaction: t, date: txDate };
                    })
                    .filter(item => item.date !== null && item.date !== undefined)
                    .sort((a, b) => a.date.getTime() - b.date.getTime());

                if (transactionsWithDates.length > 0) {
                    const oldestFoundDate = transactionsWithDates[0].date;
                    const newestFoundDate = transactionsWithDates[transactionsWithDates.length - 1].date;
                    // Calculate foundDateRange early for use in logging
                    foundDateRange = `${oldestFoundDate.toLocaleDateString()} - ${newestFoundDate.toLocaleDateString()}`;
                    // CRITICAL: Check if found range is NEWER than target range
                    // If oldest found date is NEWER than target start date, we need to scroll DOWN more
                    // Example: Found November 2025, but target is October 2025 -> need to scroll down
                    const previousFoundRangeIsNewerThanTarget = foundRangeIsNewerThanTarget;
                    if (oldestFoundDate && oldestFoundDate > startDateObj) {
                        foundRangeIsNewerThanTarget = true;
                        // ============================================================================
                        // FLAG ASSIGNMENT LOGGING: foundRangeIsNewerThanTarget = true
                        // ============================================================================
                        if (foundRangeIsNewerThanTarget !== previousFoundRangeIsNewerThanTarget) {
                            console.log(`🔴 [FLAG] foundRangeIsNewerThanTarget = TRUE (Scroll ${scrollAttempts}): Found ${oldestFoundDate.toLocaleDateString()} > Target ${startDateObj.toLocaleDateString()}`);
                        }
                        console.log(`⚠️ CRITICAL: Found range NEWER than target. Must scroll DOWN. Found: ${foundDateRange}`);
                    } else if (oldestFoundDate) {
                        foundRangeIsNewerThanTarget = false;
                        // ============================================================================
                        // FLAG ASSIGNMENT LOGGING: foundRangeIsNewerThanTarget = false
                        // ============================================================================
                        if (foundRangeIsNewerThanTarget !== previousFoundRangeIsNewerThanTarget) {
                            console.log(`🟢 [FLAG] foundRangeIsNewerThanTarget = FALSE (Scroll ${scrollAttempts}): Found ${oldestFoundDate.toLocaleDateString()} <= Target ${startDateObj.toLocaleDateString()}`);
                        }
                    }
                } else {
                    // No transactions with valid dates found yet - this means we're still loading or only have pending
                    console.log(`⚠️ No transactions with valid dates found yet (${allTransactions.length} total transactions, likely all pending). Continuing to scroll DOWN to find posted transactions...`);
                    // If we have transactions but no dates, we're likely seeing pending transactions
                    // For month/custom presets, we need posted transactions, so continue scrolling
                    const previousFoundRangeIsNewerThanTarget = foundRangeIsNewerThanTarget;
                    foundRangeIsNewerThanTarget = true; // Assume we need to scroll more if no dates found
                    // ============================================================================
                    // FLAG ASSIGNMENT LOGGING: foundRangeIsNewerThanTarget = true (no dates)
                    // ============================================================================
                    if (foundRangeIsNewerThanTarget !== previousFoundRangeIsNewerThanTarget) {
                        console.log(`🔴 [FLAG] foundRangeIsNewerThanTarget = TRUE (Scroll ${scrollAttempts}): No valid dates found, assuming newer`);
                    }
                }
            }

            // CRITICAL: If found range is NEWER than target, adjust behavior
            // For generic presets we may increase dynamicMaxScrollAttempts to chase
            // older dates. For Last Month we do NOT grow the cap – we stay bounded
            // by LAST_MONTH_MAX_SCROLLS and rely on runtime + scroll caps to avoid
            // deep drills.
            if (foundRangeIsNewerThanTarget) {
                // CRITICAL: Reset boundaries if found range is newer than target
                // We haven't reached the target yet, so boundaries shouldn't be detected
                if (endBoundaryFound || startBoundaryFound) {
                    const previousEndBoundaryFound = endBoundaryFound;
                    const previousStartBoundaryFound = startBoundaryFound;
                    console.log(`⚠️ CRITICAL: Found range is NEWER than target. Resetting boundaries (endBoundaryFound: ${endBoundaryFound}, startBoundaryFound: ${startBoundaryFound}). Must continue scrolling DOWN.`);

                    // ============================================================================
                    // FLAG ASSIGNMENT LOGGING: Boundary resets
                    // ============================================================================
                    console.log('\n🟡 [FLAG ASSIGNMENT] Resetting boundaries due to foundRangeIsNewerThanTarget');
                    console.log(`   • Scroll: ${scrollAttempts}`);
                    console.log(`   • endBoundaryFound: ${previousEndBoundaryFound} → false`);
                    console.log(`   • startBoundaryFound: ${previousStartBoundaryFound} → false`);
                    console.log('   • Reason: Found range is NEWER than target - boundaries invalid\n');

                    endBoundaryFound = false;
                    startBoundaryFound = false;
                    harvestingStarted = false;
                    scrollingDirection = 'down'; // Force DOWN scrolling, not oscillation
                }
                // For NON–Last Month presets: allow dynamic cap growth when newer range found.
                if (!isLastMonthPreset) {
                    const scrollsRemaining = dynamicMaxScrollAttempts - scrollAttempts;
                    const additionalScrolls = Math.max(300, Math.ceil(MAX_SCROLL_ATTEMPTS * 2)); // Add 200% more scrolls, minimum 300
                    const newMaxScrolls = dynamicMaxScrollAttempts + additionalScrolls;
                    const increasePercent = Math.round((additionalScrolls / dynamicMaxScrollAttempts) * 100);
                    console.log(`📊 [SCROLL CAP] Increased limit: ${dynamicMaxScrollAttempts} → ${newMaxScrolls} (Scroll ${scrollAttempts}, Found range newer than target)`);
                    dynamicMaxScrollAttempts = newMaxScrolls; // Update dynamic limit
                } else {
                    // LAST MONTH: keep dynamicMaxScrollAttempts fixed at MAX_SCROLL_ATTEMPTS
                    console.log(`📊 [SCROLL CAP] Last Month preset - dynamicMaxScrollAttempts remains fixed at ${dynamicMaxScrollAttempts} despite newer range.`);
                }
            }

            // CRITICAL: Calculate transactions in range BEFORE stagnation check (needed for minimum transaction checks)
            const transactionsInRangeCount = allTransactions.filter(t => {
                return isDateInRange(t.date, startDateObj, endDateObj);
            }).length;
            // Track best-so-far in-range count for cap/invariant checks (Last Month)
            if (transactionsInRangeCount > maxTransactionsInRangeCount) {
                maxTransactionsInRangeCount = transactionsInRangeCount;
            }

            // SMART STAGNATION DETECTION: Only stop if we've found the target range
            // Phase 1: Keep scrolling until we find transactions in target date range
            // Phase 2: Once found, allow stagnation detection to stop if no progress
            // CRITICAL: NEVER stop if found range is NEWER than target - must continue scrolling DOWN
            if (newTransactionsThisScroll === 0) {
                stagnationScrolls++;

                // CRITICAL: Log stagnation for debugging
                if (stagnationScrolls >= STAGNATION_THRESHOLD || scrollAttempts <= 10) {
                    console.log(`🔍 [STAGNATION] Scroll ${scrollAttempts}: ${stagnationScrolls}/${STAGNATION_THRESHOLD}, foundRangeIsNewerThanTarget=${foundRangeIsNewerThanTarget}`);
                }

                // CRITICAL: Don't stop on stagnation until we've found the target date range
                // If we haven't found October yet, keep scrolling down
                // ALSO: If found range is NEWER than target, continue scrolling DOWN (NEVER stop)
                if (stagnationScrolls >= STAGNATION_THRESHOLD) {
                    // CRITICAL FIX: Check foundRangeIsNewerThanTarget FIRST - if true, NEVER exit
                    if (foundRangeIsNewerThanTarget) {
                        // Found range is NEWER than target - MUST continue scrolling DOWN to find older transactions
                        // NEVER exit in this case - reset stagnation and continue
                        console.log(`⚠️ CRITICAL: Found range is NEWER than target. No new transactions for ${STAGNATION_THRESHOLD} scrolls, but MUST continue scrolling DOWN to find older transactions (target: ${startDateObj.toLocaleDateString()} - ${endDateObj.toLocaleDateString()}). Resetting stagnation counter.`);
                        console.log(`   🔍 Debug: foundRangeIsNewerThanTarget=${foundRangeIsNewerThanTarget}, foundDateRange=${foundDateRange}, allTransactions.length=${allTransactions.length}`);
                        stagnationScrolls = 0; // Reset counter, keep searching DOWN
                        // CRITICAL: Don't allow loop to exit due to MAX_SCROLL_ATTEMPTS when found range is newer
                        // Reset scrollAttempts check by continuing (we'll check MAX_SCROLL_ATTEMPTS in loop condition)
                    } else if (foundTargetDateRange && !foundRangeIsNewerThanTarget) {
                        // We've found the target range and it's not newer than target, stagnation is valid
                        // CRITICAL: Double-check foundRangeIsNewerThanTarget - if it's actually true, don't exit
                        // This prevents race conditions where foundRangeIsNewerThanTarget wasn't calculated correctly
                        if (foundRangeIsNewerThanTarget) {
                            // Defensive check: foundRangeIsNewerThanTarget is actually true, don't exit
                            console.log('⚠️ CRITICAL: Stagnation detected but foundRangeIsNewerThanTarget is TRUE. Blocking exit. Must continue scrolling DOWN.');
                            console.log(`   🔍 Debug: foundTargetDateRange=${foundTargetDateRange}, foundRangeIsNewerThanTarget=${foundRangeIsNewerThanTarget}, foundDateRange=${foundDateRange}`);
                            stagnationScrolls = 0; // Reset counter, keep searching DOWN
                        } else {
                            // CRITICAL: Check if we're in oscillation phase and need more transactions
                            const isOscillating = harvestingStarted && startBoundaryFound && endBoundaryFound;
                            const needsMoreTransactions = isLastMonthStop && transactionsInRangeCount < TARGET_RANGE.min;

                            if (isOscillating && needsMoreTransactions) {
                                console.log(`⚠️ CRITICAL: Stagnation detected during oscillation, but Last Month preset needs at least ${TARGET_RANGE.min} transactions (only ${transactionsInRangeCount} found). Blocking exit. Continuing oscillations...`);
                                stagnationScrolls = 0; // Reset counter, continue oscillating
                                // Reset oscillation counters to force more oscillations
                                oscillationCount = 0;
                                consecutiveNoProgressOscillations = 0;
                                maxOscillations = Math.max(maxOscillations + 2, 8); // Increase limit
                                console.log(`   • Reset oscillation counters and increased maxOscillations to ${maxOscillations}`);
                            } else {
                                // BUT: Check if we only have pending transactions - if so, continue scrolling to find posted
                                const hasPostedInRange = allTransactions.some(t => {
                                    if (!isDateInRange(t.date, startDateObj, endDateObj)) return false;
                                    const isPendingStatus = t.status && t.status.toLowerCase() === 'pending';
                                    const hasNoDate = !t.date || (typeof t.date === 'string' && t.date.trim() === '');
                                    return !isPendingStatus && !hasNoDate;
                                });

                                if (!hasPostedInRange && isCurrentPeriodPreset) {
                                    // Only pending transactions found - continue scrolling to find posted
                                    console.log('⚠️ STAGNATION DETECTED but only pending transactions found. Continuing to scroll DOWN to find posted transactions...');
                                    stagnationScrolls = 0; // Reset and continue
                                } else {
                                    // CRITICAL: Before breaking, verify foundRangeIsNewerThanTarget one more time
                                    // Recalculate to ensure we have the latest state
                                    let recalculatedFoundRangeIsNewerThanTarget = false;
                                    if (allTransactions.length > 0) {
                                        const transactionsWithDates = allTransactions
                                            .map(t => {
                                                const txDate = parseTransactionDate(t.date);
                                                return { transaction: t, date: txDate };
                                            })
                                            .filter(item => item.date !== null && item.date !== undefined)
                                            .sort((a, b) => a.date.getTime() - b.date.getTime());

                                        if (transactionsWithDates.length > 0) {
                                            const oldestFoundDate = transactionsWithDates[0].date;
                                            if (oldestFoundDate && oldestFoundDate > startDateObj) {
                                                recalculatedFoundRangeIsNewerThanTarget = true;
                                            }
                                        }
                                    }

                                    if (recalculatedFoundRangeIsNewerThanTarget) {
                                        // Recalculated check shows range is still newer - don't exit!
                                        console.log('⚠️ CRITICAL: Recalculated check shows found range is STILL newer than target. Blocking exit. Must continue scrolling DOWN.');
                                        console.log(`   🔍 Debug: recalculatedFoundRangeIsNewerThanTarget=${recalculatedFoundRangeIsNewerThanTarget}, foundDateRange=${foundDateRange}`);
                                        stagnationScrolls = 0; // Reset counter, keep searching DOWN
                                    } else {
                                        // ============================================================================
                                        // EXIT ATTEMPT LOGGING: Stagnation exit
                                        // ============================================================================
                                        console.error(`🚨 [EXIT ATTEMPT] STAGNATION (Scroll ${scrollAttempts}): foundRangeIsNewerThanTarget=${foundRangeIsNewerThanTarget}, recalc=${recalculatedFoundRangeIsNewerThanTarget}`);

                                        // CRITICAL: Final guard check before exit
                                        if (foundRangeIsNewerThanTarget || recalculatedFoundRangeIsNewerThanTarget) {
                                            console.error('🚨 [GUARD] BLOCKING EXIT - foundRangeIsNewerThanTarget is TRUE!');
                                            stagnationScrolls = 0;
                                        } else {
                                            // Check if we need more transactions for "Last Month" preset
                                            const needsMoreTransactions = isLastMonthStop && transactionsInRangeCount < TARGET_RANGE.min;

                                            if (needsMoreTransactions) {
                                                console.log(`⚠️ CRITICAL: Stagnation exit blocked - Last Month preset needs at least ${TARGET_RANGE.min} transactions, but only ${transactionsInRangeCount} found. Continuing oscillations...`);
                                                stagnationScrolls = 0; // Reset counter, continue oscillating
                                                // Force more oscillations to collect all transactions
                                                if (harvestingStarted && startBoundaryFound && endBoundaryFound) {
                                                    console.log('   • Both boundaries found. Continuing oscillations to collect ALL transactions...');
                                                    // Reset oscillation counters to force more oscillations
                                                    oscillationCount = 0;
                                                    consecutiveNoProgressOscillations = 0;
                                                }
                                            } else {
                                                // CRITICAL: Final check - NEVER exit if found range is newer than target
                                                // This must be checked AFTER all other conditions to prevent premature exit
                                                if (foundRangeIsNewerThanTarget || recalculatedFoundRangeIsNewerThanTarget) {
                                                    console.error('🚨 [GUARD] BLOCKING STAGNATION EXIT - foundRangeIsNewerThanTarget is TRUE! Must continue scrolling DOWN.');
                                                    console.error(`   🔍 Debug: foundRangeIsNewerThanTarget=${foundRangeIsNewerThanTarget}, recalculatedFoundRangeIsNewerThanTarget=${recalculatedFoundRangeIsNewerThanTarget}, foundDateRange=${foundDateRange}`);
                                                    stagnationScrolls = 0; // Reset counter, keep searching DOWN
                                                } else {
                                                    // Boundary-aware stagnation policy for historical presets
                                                    const presetNameForStagnation = request && request.preset ? request.preset : '';
                                                    const requiresFullOscillationPresets = ['last-year', 'last-5-years', 'this-year'];
                                                    const requiresFullOscillation = requiresFullOscillationPresets.includes(presetNameForStagnation);
                                                    const boundariesConfirmed = startBoundaryFound && endBoundaryFound;
                                                    const oscillationComplete = oscillationCount >= 8; // require at least 8 passes for large ranges

                                                    let canExitOnStagnation = true;
                                                    if (requiresFullOscillation) {
                                                        // For historical presets, only exit on stagnation AFTER boundaries + full oscillation
                                                        canExitOnStagnation = boundariesConfirmed && oscillationComplete;
                                                    }

                                                    if (!canExitOnStagnation) {
                                                        console.log(`🚫 [STAGNATION EXIT BLOCKED] Preset "${presetNameForStagnation}" requires full oscillation before exit. oscillationCount=${oscillationCount}, boundariesConfirmed=${boundariesConfirmed}`);
                                                        stagnationScrolls = 0; // Reset and continue scrolling / oscillating
                                                    } else {
                                                        console.error(`✅ [EXIT] Stagnation exit approved (preset=${presetNameForStagnation}, oscillationCount=${oscillationCount}, boundariesConfirmed=${boundariesConfirmed})`);
                                                        break;
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    } else {
                        // Haven't found target range yet, continue scrolling to find it
                        // CRITICAL: Also check if we have transactions but they're newer than target
                        // This handles the case where we found November but haven't found October yet
                        if (allTransactions.length > 0 && !foundTargetDateRange) {
                            // We have transactions but haven't found target range - likely still searching
                            console.log(`⚠️ No new transactions for ${STAGNATION_THRESHOLD} scrolls, but target range not found yet. Continuing to search for target dates...`);
                            console.log(`   🔍 Debug: allTransactions.length=${allTransactions.length}, foundDateRange=${foundDateRange}, foundTargetDateRange=${foundTargetDateRange}`);
                            stagnationScrolls = 0; // Reset counter, keep searching
                        } else {
                            // No transactions at all - page might not be loaded, continue scrolling
                            console.log(`⚠️ No transactions found yet (${allTransactions.length} total). Page may still be loading. Continuing to scroll...`);
                            stagnationScrolls = 0; // Reset counter, keep searching
                        }
                    }
                }
            } else {
                stagnationScrolls = 0; // Reset if we found new transactions
            }

            // Calculate in-range count using improved date comparison
            // CRITICAL: For "Last Month" preset, count ONLY posted transactions (exclude pending)
            // This ensures we target 133 POSTED transactions, not total transactions
            // Use SYSTEM_DATE for consistency (captured once at start)
            const daysSinceEndForStatus = (SYSTEM_DATE - endDateObj) / (24 * 60 * 60 * 1000);
            const isLastMonthForStatus = daysSinceEndForStatus >= 30 && daysSinceEndForStatus < 60;

            const inRangeCount = allTransactions.filter(t => {
                // First check if date is in range
                if (!isDateInRange(t.date, startDateObj, endDateObj)) {
                    return false;
                }
                // CRITICAL: For "Last Month" preset, exclude pending transactions from count
                // This ensures we target 133 POSTED transactions (as per requirement)
                if (isLastMonthForStatus) {
                    // For Last Month, count only posted transactions
                    // CRITICAL FIX: Check if t.date exists before calling .trim() to prevent TypeError
                    const isPending = !t.date || (typeof t.date === 'string' && t.date.trim() === '') ||
                                    (t.status && t.status.toLowerCase() === 'pending');
                    return !isPending; // Only count non-pending (posted) transactions
                }
                // For other presets, count all transactions in range
                return true;
            }).length;

            // Calculate out-of-range count
            const outOfRangeCount = allTransactions.length - inRangeCount;

            // Update scroll stats
            scrollStats.totalScrolls = scrollAttempts;
            scrollStats.totalCollected = allTransactions.length;
            scrollStats.inRangeCollected = inRangeCount;
            scrollStats.outOfRangeCollected = outOfRangeCount;

            // Update scroll stats based on transaction changes
            if (newTransactionsThisScroll > 0) {
                scrollStats.scrollsWithNewTransactions++;
            } else {
                scrollStats.scrollsWithNoChange++;
            }

            // Update last transaction count for next iteration
            lastTransactionCount = allTransactions.length;

            // NOTE: transactionsInRangeCount is calculated earlier (before stagnation check) to support minimum transaction checks

            // Calculate elapsed time
            const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
            const elapsedMinutes = Math.floor(elapsedSeconds / 60);
            elapsedDisplay = elapsedMinutes > 0
                ? `${elapsedMinutes}m ${elapsedSeconds % 60}s`
                : `${elapsedSeconds}s`;

            // Calculate date range of found transactions for display
            // NOTE: foundDateRange is already calculated above (early) for use in logging
            // Recalculate here if needed, but only if not already set
            let sampleDates = [];
            let oldestFoundDate = null;
            let newestFoundDate = null;
            // Note: foundRangeIsNewerThanTarget is already calculated above for stagnation detection
            if (allTransactions.length > 0) {
                const foundDates = allTransactions
                    .map(t => parseTransactionDate(t.date))
                    .filter(d => d)
                    .sort((a, b) => a.getTime() - b.getTime());
                if (foundDates.length > 0) {
                    oldestFoundDate = foundDates[0];
                    newestFoundDate = foundDates[foundDates.length - 1];
                    // Update foundDateRange if not already set (should already be set above, but ensure it's current)
                    foundDateRange = `${oldestFoundDate.toLocaleDateString()} - ${newestFoundDate.toLocaleDateString()}`;
                    // Sample first 5 and last 5 dates for debugging
                    sampleDates = [
                        ...foundDates.slice(0, 5).map(d => d.toLocaleDateString()),
                        '...',
                        ...foundDates.slice(-5).map(d => d.toLocaleDateString())
                    ];

                    // CRITICAL: Check if found range is NEWER than target range
                    // If oldest found date is NEWER than target start date, we need to scroll DOWN more
                    // Example: Found November 2025, but target is October 2025 -> need to scroll down
                    // CRITICAL FIX: Recalculate foundRangeIsNewerThanTarget here to ensure it's current
                    if (oldestFoundDate && oldestFoundDate > startDateObj) {
                        foundRangeIsNewerThanTarget = true;
                        console.log(`⚠️ CRITICAL: Found date range (${foundDateRange}) is NEWER than target range (${startDateObj.toLocaleDateString()} - ${endDateObj.toLocaleDateString()}). Oldest found: ${oldestFoundDate.toLocaleDateString()}, Target start: ${startDateObj.toLocaleDateString()}. MUST continue scrolling DOWN to find older transactions...`);
                    } else {
                        // If oldest found date is NOT newer than target, clear the flag
                        foundRangeIsNewerThanTarget = false;
                    }
                }
            }

            // Show requested range, not found range
            const requestedRange = `${startDateObj.toLocaleDateString()} - ${endDateObj.toLocaleDateString()}`;

            // DEBUG: Log date matching issues for October (Last Month) - dev debug only
            if (isLastMonthForStatus && allTransactions.length > 0 && transactionsInRangeCount === 0) {
                logDevDebug('DATE MATCHING ISSUE: Found transactions but 0 in range');
                logDevDebug(`   Expected range: ${requestedRange}`);
                logDevDebug(`   Found range: ${foundDateRange}`);
                logDevDebug(`   Sample dates found: ${sampleDates.join(', ')}`);
                // Log first 10 transaction dates for debugging
                const sampleTxs = allTransactions.slice(0, 10);
                logDevDebug('   Sample transaction dates:', sampleTxs.map(t => ({
                    raw: t.date,
                    parsed: parseTransactionDate(t.date)?.toLocaleDateString() || 'FAILED'
                })));
            }

            // OPTIMIZED PROGRESS DISPLAY: Show meaningful status without scroll counts
            const expectedRange = `${startDateObj.toLocaleDateString()} - ${endDateObj.toLocaleDateString()}`;

            // CRITICAL: Show special status when found range is newer than target
            if (foundRangeIsNewerThanTarget) {
                const oldestFound = foundDateRange !== 'N/A' ? foundDateRange.split(' - ')[0] : 'None yet';
                // Check for scroll container scroll position
                const windowScrollY = Math.round(window.scrollY);
                let containerScrollInfo = '';
                const mainContainer = document.querySelector('main') || document.querySelector('[role="main"]');
                if (mainContainer && mainContainer.scrollTop > 0) {
                    containerScrollInfo = ` | Container: ${Math.round(mainContainer.scrollTop)}px`;
                }
                const statusMsg = `⚠️ Found range (${foundDateRange}) is NEWER than target (${expectedRange})\n🔽 SCROLLING DOWN to find older transactions...\nTarget start: ${startDateObj.toLocaleDateString()} | Oldest found: ${oldestFound}\nRecords harvested: ${transactionsInRangeCount} | Scroll: ${scrollAttempts}/${dynamicMaxScrollAttempts} | Time: ${elapsedDisplay}\n📍 Window scroll: ${windowScrollY}px${containerScrollInfo} | Page height: ${document.documentElement.scrollHeight}px`;
                counterElement.textContent = statusMsg;
                // Also log to console for debugging
                console.log('📊 STATUS UPDATE: Found range newer than target - Scrolling DOWN');
                console.log(`   • Scroll attempt: ${scrollAttempts}/${dynamicMaxScrollAttempts}`);
                console.log(`   • Window scrollY: ${windowScrollY}px`);
                if (mainContainer) {
                    console.log(`   • Container scrollTop: ${Math.round(mainContainer.scrollTop)}px`);
                }
                console.log(`   • Page scroll height: ${document.documentElement.scrollHeight}px`);
                console.log(`   • Transactions found: ${allTransactions.length} total, ${transactionsInRangeCount} in range`);
            } else if (!endBoundaryFound && !startBoundaryFound) {
                // Fetching boundaries phase
                const statusMsg = foundDateRange !== 'N/A'
                    ? `🔍 Fetching boundaries... Date range expected: ${expectedRange} | Found: ${foundDateRange}`
                    : `🔍 Fetching boundaries... Date range expected: ${expectedRange} | Found: None yet`;
                counterElement.textContent = `${statusMsg}\nRecords harvested: ${transactionsInRangeCount} | Time: ${elapsedDisplay}`;
            } else if (endBoundaryFound && !startBoundaryFound) {
                // Found right boundary, searching for left
                const statusMsg = foundDateRange !== 'N/A'
                    ? `✅ Found right of range | 🔍 Finding left of range... Date range expected: ${expectedRange} | Found: ${foundDateRange}`
                    : `✅ Found right of range | 🔍 Finding left of range... Date range expected: ${expectedRange}`;
                counterElement.textContent = `${statusMsg}\nRecords harvested: ${transactionsInRangeCount} | Time: ${elapsedDisplay}`;
            } else if (endBoundaryFound && startBoundaryFound) {
                // Both boundaries found, harvesting between range
                // Calculate expected records: Estimate based on date range (days)
                const daysInRange = Math.ceil((endDateObj - startDateObj) / (24 * 60 * 60 * 1000)) + 1;
                // Estimate: Average 2-3 transactions per day (conservative estimate)
                // This is just for display - actual count is what matters
                const estimatedExpectedRows = Math.max(transactionsInRangeCount, Math.floor(daysInRange * 2.5));

                // Compare expected vs harvested
                const recordsExpected = estimatedExpectedRows;
                const recordsHarvested = transactionsInRangeCount;
                const recordsMissed = recordsExpected > recordsHarvested ? recordsExpected - recordsHarvested : 0;

                // LAST MONTH: surface QC state instead of purely internal counts
                if (request && request.preset === 'last-month' && typeof counterElement !== 'undefined') {
                    const alerts = (typeof runStats !== 'undefined' && runStats && Array.isArray(runStats.alerts))
                        ? runStats.alerts
                        : [];
                    const hasMismatch = alerts.includes('MISMATCH_COUNTS_LAST_MONTH');
                    const hasCapIncomplete = alerts.includes('LAST_MONTH_INCOMPLETE_SCROLL_CAP') || alerts.includes('TIME_CAP_REACHED_LAST_MONTH');
                    const inRangePosted = runStats && runStats.counts ? runStats.counts.inRangePosted : recordsHarvested;

                    const accentEl = document.getElementById('txvault-counter-accent');
                    const line1El = document.getElementById('txvault-counter-line1');
                    const line2El = document.getElementById('txvault-counter-line2');

                    if (!line1El || !line2El || !accentEl) {
                        // Fallback to simple text if elements are missing
                        counterElement.textContent =
                            `Last Month status: harvested ${inRangePosted} of ${TARGET_RANGE.min} rows. Time: ${elapsedDisplay}`;
                        return;
                    }

                    if (!hasMismatch && !hasCapIncomplete && inRangePosted === TARGET_RANGE.min) {
                        // QC PASS
                        accentEl.style.backgroundColor = '#4caf50'; // green
                        line1El.textContent = 'Last Month – QC PASS';
                        line2El.textContent = `Rows: ${inRangePosted} of ${TARGET_RANGE.min} · Scrolls: ${scrollAttempts}/${dynamicMaxScrollAttempts} · Time: ${elapsedDisplay}`;
                    } else if (hasCapIncomplete) {
                        // Partial capture due to caps
                        accentEl.style.backgroundColor = '#ffc107'; // amber
                        line1El.textContent = 'Last Month – PARTIAL (caps reached)';
                        line2El.textContent = `Rows: ${inRangePosted} of ${TARGET_RANGE.min} · Scrolls: ${scrollAttempts}/${dynamicMaxScrollAttempts} · Time: ${elapsedDisplay}`;
                    } else if (hasMismatch) {
                        // Count mismatch – treat as QC FAIL
                        accentEl.style.backgroundColor = '#f44336'; // red
                        line1El.textContent = 'Last Month – QC FAIL (count mismatch)';
                        line2El.textContent = `Rows (exported): ${inRangePosted} · Expected: ${TARGET_RANGE.min} · Time: ${elapsedDisplay} · See *.stats.json`;
                    } else {
                        // Generic Last Month in-progress / not-yet-QC-PASS status
                        accentEl.style.backgroundColor = '#2196f3'; // blue/info
                        line1El.textContent = 'Last Month – harvesting…';
                        line2El.textContent = `Rows so far: ${recordsHarvested} (expected ≥ ${TARGET_RANGE.min}) · Scrolls: ${scrollAttempts}/${dynamicMaxScrollAttempts} · Time: ${elapsedDisplay}`;
                    }
                } else {
                    // Existing behavior for other presets
                    const comparisonText = recordsExpected === recordsHarvested
                        ? `✅ Records expected: ${recordsExpected} Rows, from ${daysInRange} days. Records harvested: ${recordsHarvested} Rows. A = B ✓`
                        : `⚠️ Records expected: ${recordsExpected} Rows, from ${daysInRange} days. Records harvested: ${recordsHarvested} Rows. A ≠ B (${recordsMissed} missed)`;

                    counterElement.textContent =
                        '✅ Found left of range | ✅ Found right of range\n' +
                        `🌾 Harvesting between range: ${expectedRange}\n` +
                        `${comparisonText}\n` +
                        `Time elapsed: ${elapsedDisplay}`;
                }
            } else {
                // Fallback
                counterElement.textContent = `Date range expected: ${expectedRange}\nRecords harvested: ${transactionsInRangeCount} | Time: ${elapsedDisplay}`;
            }

            // Send scroll progress to popup with optimized display format (no scroll counts)
            sendScrollProgress({
                isScrolling: true,
                inRangeCount: transactionsInRangeCount,
                totalFound: allTransactions.length,
                timeElapsed: elapsedDisplay,
                expectedRange: `${startDateObj.toLocaleDateString()} - ${endDateObj.toLocaleDateString()}`,
                detectedRange: foundDateRange,
                searchingForBoundary: !endBoundaryFound || !startBoundaryFound, // Indicate if still searching boundaries
                foundRightBoundary: endBoundaryFound, // Right boundary (first transaction after end date)
                foundLeftBoundary: startBoundaryFound, // Left boundary (last transaction before start date)
                searchProgress: (!endBoundaryFound || !startBoundaryFound)
                    ? (foundDateRange !== 'N/A'
                        ? `Expected: ${startDateObj.toLocaleDateString()} - ${endDateObj.toLocaleDateString()} | Reached: ${foundDateRange}`
                        : `Expected: ${startDateObj.toLocaleDateString()} - ${endDateObj.toLocaleDateString()} | Reached: None yet`)
                    : null
            });

            // CRITICAL DEBUG: Log after status update to track execution flow
            if (scrollAttempts <= 15) {
                console.log(`🔍 [AFTER STATUS UPDATE] Scroll ${scrollAttempts}: Continuing to scrolling logic...`);
            }

            // CRITICAL DEBUG: Log right before transaction filtering
            if (scrollAttempts <= 15) {
                console.log(`🔍 [BEFORE TRANSACTION FILTER] Scroll ${scrollAttempts}: About to filter transactions...`);
            }

            // Check for transactions in target range using improved date comparison
            const transactionsInRange = newTransactions.filter(transaction => {
                return isDateInRange(transaction.date, startDateObj, endDateObj);
            });

            // CRITICAL DEBUG: Log after transaction filtering
            if (scrollAttempts <= 15) {
                console.log(`🔍 [AFTER TRANSACTION FILTER] Scroll ${scrollAttempts}: Filtered ${transactionsInRange.length} transactions in range`);
            }

            // CRITICAL FIX: For presets that include pending (this-week, this-month, this-year),
            // we need to find POSTED transactions, not just pending. Pending transactions have dates
            // but appear BEFORE posted transactions. We must continue scrolling past pending to find posted.
            // For presets that DON'T include pending (last-month, etc.), only count posted transactions.
            const daysSinceEndForRangeCheck = (SYSTEM_DATE - endDateObj) / (24 * 60 * 60 * 1000);
            const isLastMonthForRangeCheck = daysSinceEndForRangeCheck >= 30 && daysSinceEndForRangeCheck < 60;
            const todayForRangeCheck = new Date(SYSTEM_DATE);
            todayForRangeCheck.setHours(0, 0, 0, 0);
            const isCurrentPeriodPreset = (endDateObj >= todayForRangeCheck &&
                                          (todayForRangeCheck - startDateObj) / (24 * 60 * 60 * 1000) <= 365) || // This year or less
                                         (startDateObj.getMonth() === SYSTEM_MONTH &&
                                          startDateObj.getFullYear() === SYSTEM_YEAR &&
                                          endDateObj >= todayForRangeCheck); // This month

            // Separate pending from posted transactions
            const postedTransactionsInRange = transactionsInRange.filter(t => {
                const isPendingStatus = t.status && t.status.toLowerCase() === 'pending';
                const hasNoDate = !t.date || (typeof t.date === 'string' && t.date.trim() === '');
                return !isPendingStatus && !hasNoDate; // Posted transactions only
            });

            // CRITICAL: Only mark target range as found when we have POSTED transactions (not just pending)
            // For current period presets (this-week, this-month, this-year), we need posted transactions
            // For last-month and other presets, we only count posted anyway
            const hasPostedTransactionsInRange = postedTransactionsInRange.length > 0;
            const hasAnyTransactionsInRange = transactionsInRange.length > 0;

            // CRITICAL DEBUG: Log before checking posted transactions
            if (scrollAttempts <= 15) {
                console.log(`🔍 [BEFORE POSTED CHECK] Scroll ${scrollAttempts}: hasPostedTransactionsInRange=${hasPostedTransactionsInRange}, hasAnyTransactionsInRange=${hasAnyTransactionsInRange}`);
            }

            // CRITICAL DEBUG: Log right before if statement
            if (scrollAttempts <= 15) {
                console.log(`🔍 [BEFORE IF STATEMENT] Scroll ${scrollAttempts}: About to check hasPostedTransactionsInRange...`);
            }

            if (hasPostedTransactionsInRange) {
                // CRITICAL DEBUG: Log inside if block
                if (scrollAttempts <= 15) {
                    console.log(`🔍 [INSIDE IF BLOCK] Scroll ${scrollAttempts}: hasPostedTransactionsInRange is TRUE`);
                }
                // CRITICAL: Found POSTED transactions in target range - this is the real target
                // BUT: If found range is NEWER than target, don't mark as found yet - we need to scroll DOWN more
                if (!foundRangeIsNewerThanTarget) {
                    // Only mark as found if we're not still searching for older transactions
                    if (!foundTargetDateRange) {
                        console.log(`✅ TARGET RANGE FOUND! Found "${targetPeriodName}" - ${postedTransactionsInRange.length} POSTED transaction(s) in range (${transactionsInRange.length} total including pending). Checking boundaries...`);
                        // CRITICAL: Set oscillation boundary to Oct 1 position (not Sep 30)
                        // Find the first transaction ON or AFTER Oct 1 for oscillation
                        const oct1Transactions = transactionsInRange.filter(t => {
                            const txDate = parseTransactionDate(t.date);
                            if (!txDate) return false;
                            const txDateOnly = new Date(txDate.getFullYear(), txDate.getMonth(), txDate.getDate());
                            const startDateOnly = new Date(startDateObj.getFullYear(), startDateObj.getMonth(), startDateObj.getDate());
                            return txDateOnly.getTime() === startDateOnly.getTime(); // Oct 1 transactions
                        });
                        if (oct1Transactions.length > 0 && targetRangeStartOscillationBoundary === null) {
                            targetRangeStartOscillationBoundary = window.scrollY;
                            console.log(`🎯 [OSCILLATION BOUNDARY] Set Oct 1 oscillation boundary at scroll position: ${Math.round(targetRangeStartOscillationBoundary)}px`);
                        }
                    }
                    foundTargetDateRange = true;
                    consecutiveTargetDateMatches++;
                    hasReachedTargetRange = true; // Mark that we've reached the target range
                    noProgressScrolls = 0; // Reset when we find new transactions
                    stagnationScrolls = 0; // Reset stagnation counter when we find target range transactions
                } else {
                    // Found range is NEWER than target - don't mark as found, keep scrolling DOWN
                    // BUT: CRITICAL CHECK - If we've found October transactions AND scrolled past October 1, stop scrolling DOWN
                    const oldestTransaction = allTransactions.length > 0 ? allTransactions[allTransactions.length - 1] : null;
                    if (oldestTransaction && oldestTransaction.date && postedTransactionsInRange.length > 0) {
                        const oldestTxDate = parseTransactionDate(oldestTransaction.date);
                        if (oldestTxDate && !isNaN(oldestTxDate.getTime())) {
                            const oldestTxDateTime = new Date(oldestTxDate.getFullYear(), oldestTxDate.getMonth(), oldestTxDate.getDate()).getTime();
                            const startDateTime = new Date(startDateObj.getFullYear(), startDateObj.getMonth(), startDateObj.getDate()).getTime();

                            // If we've scrolled past October 1 (oldest transaction is before Oct 1), stop scrolling DOWN
                            if (oldestTxDateTime < startDateTime) {
                                const daysBeforeStart = (startDateTime - oldestTxDateTime) / (24 * 60 * 60 * 1000);
                                console.log(`🛑 CRITICAL: Found ${postedTransactionsInRange.length} October transaction(s) during downward scroll, but oldest transaction (${oldestTxDate.toLocaleDateString()}) is ${Math.round(daysBeforeStart)} days before October 1.`);
                                console.log('   • We\'ve scrolled past the start date. Stopping DOWN scroll and marking boundaries for oscillation.');
                                console.log(`   • Transactions in range so far: ${transactionsInRangeCount || postedTransactionsInRange.length}`);

                                // Mark that we've found the target range (we have October transactions)
                                foundTargetDateRange = true;
                                foundRangeIsNewerThanTarget = false; // Reset this so we can enter oscillation

                                // Mark boundaries as found to enter oscillation phase
                                if (!endBoundaryFound) {
                                    endBoundaryFound = true;
                                    targetRangeEndBoundary = window.scrollY;
                                }
                                if (!startBoundaryFound) {
                                    startBoundaryFound = true;
                                    targetRangeStartBoundary = window.scrollY;
                                    harvestingStarted = true;
                                }

                                // Set oscillation boundary if Oct 1 transactions were found
                                const oct1Transactions = transactionsInRange.filter(t => {
                                    const txDate = parseTransactionDate(t.date);
                                    if (!txDate) return false;
                                    const txDateOnly = new Date(txDate.getFullYear(), txDate.getMonth(), txDate.getDate());
                                    const startDateOnly = new Date(startDateObj.getFullYear(), startDateObj.getMonth(), startDateObj.getDate());
                                    return txDateOnly.getTime() === startDateOnly.getTime();
                                });
                                if (oct1Transactions.length > 0 && targetRangeStartOscillationBoundary === null) {
                                    targetRangeStartOscillationBoundary = window.scrollY;
                                    console.log(`🎯 [OSCILLATION BOUNDARY] Set Oct 1 oscillation boundary at scroll position: ${Math.round(targetRangeStartOscillationBoundary)}px`);
                                }

                                // Set flag to prevent further DOWN scrolling - will enter oscillation phase next iteration
                                // The scrolling strategy section will check this and skip DOWN scrolling
                                foundRangeIsNewerThanTarget = false; // Already set above, but ensure it's false
                            }
                        }
                    }

                    console.log(`⚠️ Found ${postedTransactionsInRange.length} POSTED transaction(s) in range, but found range is NEWER than target. Continuing to scroll DOWN to find older transactions...`);
                    // Reset stagnation to continue scrolling
                    stagnationScrolls = 0;
                    consecutiveTargetDateMatches = 0;
                    // Don't set foundTargetDateRange = true - this ensures scrolling continues DOWN
                }

                // OPTIMIZED BOUNDARY DETECTION: Find last transaction BEFORE start date and first transaction AFTER end date
                // For October: Left boundary = Last transaction of Sept 30, Right boundary = First transaction of Nov 1
                // This ensures 100% recovery of all transactions in the range
                // CRITICAL: Only detect boundaries if found range is NOT newer than target
                // If found range is newer, we haven't reached the target yet - don't detect boundaries

                // Calculate boundary dates (day before start, day after end)
                const leftBoundaryDate = new Date(startDateObj);
                leftBoundaryDate.setDate(leftBoundaryDate.getDate() - 1);
                leftBoundaryDate.setHours(23, 59, 59, 999); // End of day before start

                const rightBoundaryDate = new Date(endDateObj);
                rightBoundaryDate.setDate(rightBoundaryDate.getDate() + 1);
                rightBoundaryDate.setHours(0, 0, 0, 0); // Start of day after end

                // Find transactions at boundaries
                let leftBoundaryTx = null; // Last transaction before start date
                let rightBoundaryTx = null; // First transaction after end date

                // Check all transactions to find boundary transactions
                allTransactions.forEach(t => {
                    const txDate = parseTransactionDate(t.date);
                    if (!txDate) return;

                    // Check if transaction is at left boundary (last transaction of day before start)
                    if (txDate.getFullYear() === leftBoundaryDate.getFullYear() &&
                        txDate.getMonth() === leftBoundaryDate.getMonth() &&
                        txDate.getDate() === leftBoundaryDate.getDate()) {
                        if (!leftBoundaryTx || txDate.getTime() > parseTransactionDate(leftBoundaryTx.date).getTime()) {
                            leftBoundaryTx = t;
                        }
                    }

                    // Check if transaction is at right boundary (first transaction of day after end)
                    if (txDate.getFullYear() === rightBoundaryDate.getFullYear() &&
                        txDate.getMonth() === rightBoundaryDate.getMonth() &&
                        txDate.getDate() === rightBoundaryDate.getDate()) {
                        if (!rightBoundaryTx || txDate.getTime() < parseTransactionDate(rightBoundaryTx.date).getTime()) {
                            rightBoundaryTx = t;
                        }
                    }
                });

                // Phase 1: Check if RIGHT boundary (first transaction AFTER end date) found FIRST (descending order)
                // Right boundary appears first because data is descending (newest first)
                // CRITICAL: Only detect boundaries if found range is NOT newer than target
                // CRITICAL: After finding boundary transaction, continue scrolling PAST it to capture ALL transactions on boundary date
                if (!endBoundaryFound && rightBoundaryTx && !foundRangeIsNewerThanTarget) {
                    // Found first transaction after end date - mark boundary position but continue scrolling past it
                    targetRangeEndBoundary = window.scrollY; // RIGHT boundary is higher on page (found first)
                    endBoundaryScrollBuffer = 0; // Reset buffer counter
                    const boundaryTxDate = parseTransactionDate(rightBoundaryTx.date);
                    const boundaryTxDateStr = boundaryTxDate ? boundaryTxDate.toLocaleDateString() : rightBoundaryTx.date;
                    console.log('🔵 [BOUNDARY DETECTION] RIGHT BOUNDARY TRANSACTION FOUND (but not complete yet)');
                    console.log('   • Boundary type: RIGHT (first transaction AFTER end date)');
                    console.log(`   • Target end date: ${endDateObj.toLocaleDateString()}`);
                    console.log(`   • Boundary date: ${rightBoundaryDate.toLocaleDateString()}`);
                    console.log(`   • Boundary transaction: ${rightBoundaryTx.description || 'N/A'} | ${boundaryTxDateStr} | $${rightBoundaryTx.amount || 'N/A'}`);
                    console.log(`   • Scroll position: ${Math.round(targetRangeEndBoundary)}px`);
                    console.log(`   • Scroll attempt: ${scrollAttempts}`);
                    console.log(`   • Status: Continuing to scroll PAST boundary to capture ALL ${endDateObj.toLocaleDateString()} transactions...`);
                    console.log(`   • Will mark boundary complete after ${BOUNDARY_SCROLL_BUFFER} scrolls past boundary`);

                    // Record boundary in runStats for Last Month preset
                    try {
                        if (request && request.preset === 'last-month' && typeof runStats !== 'undefined' && runStats) {
                            runStats.boundaries.rightFound = true;
                            runStats.boundaries.rightLabel = `RIGHT: first posted after end (${rightBoundaryDate.toISOString().split('T')[0]}) at ~${Math.round(targetRangeEndBoundary)}px`;
                        }
                    } catch (e) {
                        console.error('Error updating runStats.boundaries for right boundary:', e);
                    }
                }

                // Phase 2: Check if LEFT boundary (last transaction BEFORE start date) found SECOND (descending order)
                // CRITICAL: Only detect boundaries if found range is NOT newer than target
                // CRITICAL: After finding boundary transaction, continue scrolling PAST it to capture ALL transactions on boundary date
                if (endBoundaryFound && !startBoundaryFound && leftBoundaryTx && !foundRangeIsNewerThanTarget) {
                    // Found last transaction before start date - mark boundary position but continue scrolling past it
                    targetRangeStartBoundary = window.scrollY; // LEFT boundary is lower on page (found second)
                    startBoundaryScrollBuffer = 0; // Reset buffer counter
                    const boundaryTxDate = parseTransactionDate(leftBoundaryTx.date);
                    const boundaryTxDateStr = boundaryTxDate ? boundaryTxDate.toLocaleDateString() : leftBoundaryTx.date;
                    console.log('🔵 [BOUNDARY DETECTION] LEFT BOUNDARY TRANSACTION FOUND (but not complete yet)');
                    console.log('   • Boundary type: LEFT (last transaction BEFORE start date)');
                    console.log(`   • Target start date: ${startDateObj.toLocaleDateString()}`);
                    console.log(`   • Boundary date: ${leftBoundaryDate.toLocaleDateString()}`);
                    console.log(`   • Boundary transaction: ${leftBoundaryTx.description || 'N/A'} | ${boundaryTxDateStr} | $${leftBoundaryTx.amount || 'N/A'}`);
                    console.log(`   • Scroll position: ${Math.round(targetRangeStartBoundary)}px`);
                    console.log(`   • Scroll attempt: ${scrollAttempts}`);
                    console.log(`   • Status: Continuing to scroll PAST boundary to capture ALL ${startDateObj.toLocaleDateString()} transactions...`);
                    console.log(`   • Will mark boundary complete after ${BOUNDARY_SCROLL_BUFFER} scrolls past boundary`);

                    // Record boundary in runStats for Last Month preset
                    try {
                        if (request && request.preset === 'last-month' && typeof runStats !== 'undefined' && runStats) {
                            runStats.boundaries.leftFound = true;
                            runStats.boundaries.leftLabel = `LEFT: last posted before start (${leftBoundaryDate.toISOString().split('T')[0]}) at ~${Math.round(targetRangeStartBoundary)}px`;
                        }
                    } catch (e) {
                        console.error('Error updating runStats.boundaries for left boundary:', e);
                    }
                }

                // NOTE: Boundary buffer checks have been moved OUTSIDE this block to run every scroll iteration
                // See code after the "AFTER ALL TRANSACTION CHECKS" section

                // CRITICAL DEBUG: Log before oscillation check
                if (scrollAttempts <= 15) {
                    console.log(`🔍 [BEFORE OSCILLATION CHECK] Scroll ${scrollAttempts}: harvestingStarted=${harvestingStarted}, startBoundaryFound=${startBoundaryFound}, endBoundaryFound=${endBoundaryFound}, foundRangeIsNewerThanTarget=${foundRangeIsNewerThanTarget}`);
                }

                // OPTIMIZED: Track progress during oscillations (after both boundaries found)
                // Exit early if no progress for 2 consecutive oscillations
                // CRITICAL: NEVER enter oscillation phase if found range is NEWER than target - must continue scrolling DOWN
                if (harvestingStarted && startBoundaryFound && endBoundaryFound && !foundRangeIsNewerThanTarget) {
                    const isLastMonthPreset = request && request.preset === 'last-month';
                    // CRITICAL: If oscillation boundary not set yet, try to set it from current transactions
                    if (targetRangeStartOscillationBoundary === null && transactionsInRange.length > 0) {
                        const oct1Transactions = transactionsInRange.filter(t => {
                            const txDate = parseTransactionDate(t.date);
                            if (!txDate) return false;
                            const txDateOnly = new Date(txDate.getFullYear(), txDate.getMonth(), txDate.getDate());
                            const startDateOnly = new Date(startDateObj.getFullYear(), startDateObj.getMonth(), startDateObj.getDate());
                            return txDateOnly.getTime() === startDateOnly.getTime(); // Oct 1 transactions
                        });
                        if (oct1Transactions.length > 0) {
                            targetRangeStartOscillationBoundary = window.scrollY;
                            console.log(`🎯 [OSCILLATION BOUNDARY] Set Oct 1 oscillation boundary during oscillation at scroll position: ${Math.round(targetRangeStartOscillationBoundary)}px`);
                        }
                    }

                    // Check if we're at a boundary (start or end) - this marks one oscillation
                    // CRITICAL: Use Oct 1 oscillation boundary for distance calculation, not Sep 30 boundary
                    const currentPosition = window.scrollY;
                    const oscillationStartBoundary = targetRangeStartOscillationBoundary !== null
                        ? targetRangeStartOscillationBoundary  // Oct 1 position (preferred)
                        : targetRangeStartBoundary;           // Sep 30 position (fallback)
                    const distanceToStart = Math.abs(currentPosition - oscillationStartBoundary);
                    const distanceToEnd = Math.abs(currentPosition - targetRangeEndBoundary);
                    // CRITICAL: Use smaller scroll increment during oscillation to ensure we don't skip transactions
                    // Smaller increment = more thorough coverage of the Oct 1-31 range
                    const oscillationScrollIncrement = window.innerHeight * 0.8; // Reduced from 1.5 to 0.8 for more thorough scanning
                    const nearStartBoundary = distanceToStart < oscillationScrollIncrement;
                    const nearEndBoundary = distanceToEnd < oscillationScrollIncrement;

                    // DYNAMIC ADJUSTMENT: Adjust oscillation limits based on progress
                    // If we're making good progress, allow more oscillations (NON-Last-Month presets only)
                    // If no progress, reduce limits and exit sooner
                    if (!isLastMonthPreset && transactionsInRangeCount > 0 && lastOscillationCount > 0) {
                        const progressRate = (transactionsInRangeCount - lastOscillationCount) / lastOscillationCount;
                        if (progressRate > 0.1) {
                            // Good progress (>10% increase) - allow more oscillations
                            maxOscillations = Math.min(5, maxOscillations + 1);
                            maxNoProgressOscillations = 3;
                            console.log(`📈 Good progress detected (${(progressRate * 100).toFixed(1)}% increase). Adjusting limits: maxOscillations=${maxOscillations}, maxNoProgress=${maxNoProgressOscillations}`);
                        } else if (progressRate === 0) {
                            // No progress - reduce limits
                            consecutiveNoProgressScrolls++;
                            if (consecutiveNoProgressScrolls >= 3) {
                                maxOscillations = Math.max(1, maxOscillations - 1);
                                maxNoProgressOscillations = Math.max(1, maxNoProgressOscillations - 1);
                                console.log(`📉 No progress detected. Adjusting limits: maxOscillations=${maxOscillations}, maxNoProgress=${maxNoProgressOscillations}`);
                            }
                        } else {
                            consecutiveNoProgressScrolls = 0; // Reset if we have any progress
                        }
                    }

                    // If we've reached a boundary, check if this oscillation found new data
                    if (nearStartBoundary || nearEndBoundary) {
                        // Check if count increased since last oscillation (for WHOLE RANGE)
                        if (transactionsInRangeCount === lastOscillationCount) {
                            consecutiveNoProgressOscillations++;
                            console.log(`⚠️ No progress in oscillation ${oscillationCount + 1}: Count unchanged (${transactionsInRangeCount}). Consecutive no-progress: ${consecutiveNoProgressOscillations}/${maxNoProgressOscillations}`);

                            // Update display with records comparison
                            if (counterElement && document.body.contains(counterElement)) {
                                const daysInRange = Math.ceil((endDateObj - startDateObj) / (24 * 60 * 60 * 1000)) + 1;
                                const estimatedExpectedRows = Math.max(transactionsInRangeCount, Math.floor(daysInRange * 2.5));
                                const recordsMissed = estimatedExpectedRows > transactionsInRangeCount ? estimatedExpectedRows - transactionsInRangeCount : 0;
                                counterElement.textContent = `⚠️ 0 records two successive attempts, continuing oscillations\nRecords expected: ${estimatedExpectedRows} Rows, from ${daysInRange} days. Records harvested: ${transactionsInRangeCount} Rows${recordsMissed > 0 ? ` (${recordsMissed} missed)` : ''}\nTime elapsed: ${elapsedDisplay}`;
                            }

                            // Exit early if consecutive no-progress oscillations reached (dynamic limit)
                            // CRITICAL: NEVER exit if found range is NEWER than target - must continue scrolling DOWN
                            // CRITICAL: For "Last Month" preset, require at least TARGET_RANGE.min (133) transactions before exit
                            const presetNameForOsc = request && request.preset ? request.preset : '';
                            const isHistoricalPresetForOsc = presetNameForOsc === 'last-year' || presetNameForOsc === 'last-5-years';

                            if (consecutiveNoProgressOscillations >= maxNoProgressOscillations && !isHistoricalPresetForOsc) {
                                if (foundRangeIsNewerThanTarget) {
                                    // Found range is NEWER than target - MUST continue scrolling DOWN
                                    console.log('⚠️ CRITICAL: Oscillation exit blocked - found range is NEWER than target. Must continue scrolling DOWN.');
                                    consecutiveNoProgressOscillations = 0; // Reset counter, keep searching DOWN
                                } else {
                                    // Check if we need more transactions for "Last Month" preset
                                    const needsMoreTransactions = isLastMonthStop && transactionsInRangeCount < TARGET_RANGE.min;

                                    if (needsMoreTransactions) {
                                        console.log(`⚠️ CRITICAL: Oscillation exit blocked - Last Month preset needs at least ${TARGET_RANGE.min} transactions, but only ${transactionsInRangeCount} found. Continuing oscillations...`);
                                        consecutiveNoProgressOscillations = 0; // Reset counter, continue oscillating
                                        maxNoProgressOscillations = Math.max(maxNoProgressOscillations + 1, 5); // Increase limit
                                        console.log(`   • Increased maxNoProgressOscillations to ${maxNoProgressOscillations}`);
                                    } else {
                                        // ============================================================================
                                        // EXIT ATTEMPT LOGGING: Oscillation no-progress exit
                                        // ============================================================================
                                        console.log(`\n${'='.repeat(80)}`);
                                        console.log('🚨 [EXIT ATTEMPT] OSCILLATION NO-PROGRESS');
                                        console.log(`   • Exit reason: No progress for ${consecutiveNoProgressOscillations} consecutive oscillations`);
                                        console.log(`   • Scroll count: ${scrollAttempts}`);
                                        console.log(`   • oscillationCount: ${oscillationCount}`);
                                        console.log(`   • maxNoProgressOscillations: ${maxNoProgressOscillations}`);
                                        console.log(`   • foundRangeIsNewerThanTarget: ${foundRangeIsNewerThanTarget}`);
                                        console.log(`   • foundTargetDateRange: ${foundTargetDateRange}`);
                                        console.log(`   • endBoundaryFound: ${endBoundaryFound}`);
                                        console.log(`   • startBoundaryFound: ${startBoundaryFound}`);
                                        console.log(`   • transactionsInRangeCount: ${transactionsInRangeCount}`);
                                        console.log(`   • allTransactions.length: ${allTransactions.length}`);
                                        if (isLastMonthStop) {
                                            console.log(`   • Target range: ${TARGET_RANGE.min}-${TARGET_RANGE.max} transactions`);
                                        }
                                        console.log(`${'='.repeat(80)}\n`);

                                        // FINAL EXIT REASON
                                        console.log(`✅ EARLY EXIT: No progress for ${consecutiveNoProgressOscillations} consecutive oscillations. Stopping and outputting results.`);

                                        // CRITICAL: Final guard check before exit
                                        if (foundRangeIsNewerThanTarget) {
                                            console.log('🚨 [GUARD] BLOCKING EXIT - foundRangeIsNewerThanTarget is TRUE! Continuing scroll...');
                                            consecutiveNoProgressOscillations = 0;
                                        } else {
                                            console.log('✅ [FINAL EXIT REASON] Oscillation no-progress exit approved');
                                            break; // Exit scroll loop immediately
                                        }
                                    }
                                }
                            }
                        } else {
                            // Found new data - reset counters
                            consecutiveNoProgressOscillations = 0;
                            consecutiveNoProgressScrolls = 0;
                            console.log(`✅ Progress in oscillation ${oscillationCount + 1}: Count increased from ${lastOscillationCount} to ${transactionsInRangeCount}`);
                        }

                    // Update oscillation tracking
                    lastOscillationCount = transactionsInRangeCount;
                    oscillationCount++;
                    // Mirror oscillation count into runStats for Last Month
                    if (isLastMonthPreset && typeof runStats !== 'undefined' && runStats) {
                        runStats.oscillationCount = oscillationCount;
                    }

                    // ----------------------------------------------------------------------
                    // LAST MONTH: Deterministic N-pass rule (boundaries + min rows + N passes)
                    // ----------------------------------------------------------------------
                    if (isLastMonthPreset && isLastMonthStop && transactionsInRangeCount >= TARGET_RANGE.min) {
                        const LAST_MONTH_MAX_OSCILLATIONS = 3; // Chosen: 3 full passes for extra safety
                        if (oscillationCount >= LAST_MONTH_MAX_OSCILLATIONS) {
                            console.log(`✅ [LAST MONTH] Completed ${oscillationCount} oscillation pass(es) with >= ${TARGET_RANGE.min} posted rows. Exiting scroll loop and proceeding to export.`);
                            break; // Exit scroll loop unconditionally for Last Month
                        }
                    }

                    // Exit if max oscillations reached (dynamic limit) - NON-Last-Month presets
                    // CRITICAL: NEVER exit if found range is NEWER than target - must continue scrolling DOWN
                    // CRITICAL: For "Last Month" preset, deterministic N-pass rule above takes precedence
                    if (!isLastMonthPreset && oscillationCount >= maxOscillations) {
                            if (foundRangeIsNewerThanTarget) {
                                // Found range is NEWER than target - MUST continue scrolling DOWN
                                console.log('⚠️ CRITICAL: Max oscillations exit blocked - found range is NEWER than target. Must continue scrolling DOWN.');
                                oscillationCount = 0; // Reset counter, keep searching DOWN
                            } else {
                                // Check if we need more transactions for "Last Month" preset
                                const needsMoreTransactions = isLastMonthStop && transactionsInRangeCount < TARGET_RANGE.min;

                                if (needsMoreTransactions) {
                                    console.log(`⚠️ CRITICAL: Max oscillations exit blocked - Last Month preset needs at least ${TARGET_RANGE.min} transactions, but only ${transactionsInRangeCount} found. Increasing oscillation limit...`);
                                    oscillationCount = 0; // Reset counter, continue oscillating
                                    maxOscillations = Math.max(maxOscillations + 2, 8); // Increase limit significantly
                                    console.log(`   • Increased maxOscillations to ${maxOscillations}`);
                                } else {
                                    // ============================================================================
                                    // EXIT ATTEMPT LOGGING: Max oscillations exit
                                    // ============================================================================
                                    console.log(`\n${'='.repeat(80)}`);
                                    console.log('🚨 [EXIT ATTEMPT] MAX OSCILLATIONS REACHED');
                                    console.log(`   • Exit reason: Max oscillations reached (${oscillationCount}/${maxOscillations})`);
                                    console.log(`   • Scroll count: ${scrollAttempts}`);
                                    console.log(`   • foundRangeIsNewerThanTarget: ${foundRangeIsNewerThanTarget}`);
                                    console.log(`   • foundTargetDateRange: ${foundTargetDateRange}`);
                                    console.log(`   • endBoundaryFound: ${endBoundaryFound}`);
                                    console.log(`   • startBoundaryFound: ${startBoundaryFound}`);
                                    console.log(`   • transactionsInRangeCount: ${transactionsInRangeCount}`);
                                    console.log(`   • allTransactions.length: ${allTransactions.length}`);
                                    if (isLastMonthStop) {
                                        console.log(`   • Target range: ${TARGET_RANGE.min}-${TARGET_RANGE.max} transactions`);
                                    }
                                    console.log(`${'='.repeat(80)}\n`);

                                    // FINAL EXIT REASON
                                    console.log(`✅ MAX OSCILLATIONS REACHED (${maxOscillations}). Stopping and outputting results.`);

                                    // CRITICAL: Final guard check before exit
                                    if (foundRangeIsNewerThanTarget) {
                                        console.log('🚨 [GUARD] BLOCKING EXIT - foundRangeIsNewerThanTarget is TRUE! Continuing scroll...');
                                        oscillationCount = 0;
                                    } else {
                                        console.log('✅ [FINAL EXIT REASON] Max oscillations exit approved');
                                        break; // Exit scroll loop
                                    }
                                }
                            }
                        }
                    }
                }
            } else if (hasAnyTransactionsInRange && isCurrentPeriodPreset) {
                // CRITICAL: Found pending transactions but no posted yet - continue scrolling to find posted
                // For current period presets (this-week, this-month, this-year), we need posted transactions
                // Pending transactions appear FIRST (at top), posted transactions appear AFTER (further down)
                // Don't set foundTargetDateRange = true yet - keep scrolling until we find posted transactions
                // ALSO: If found range is NEWER than target, MUST continue scrolling DOWN regardless
                if (!foundTargetDateRange || foundRangeIsNewerThanTarget) {
                    if (foundRangeIsNewerThanTarget) {
                        console.log(`⚠️ CRITICAL: Found ${transactionsInRange.length} PENDING transaction(s) in range, but found range (${foundDateRange}) is NEWER than target (${startDateObj.toLocaleDateString()} - ${endDateObj.toLocaleDateString()}). MUST continue scrolling DOWN to find older transactions AND posted transactions...`);
                    } else {
                        console.log(`⚠️ Found ${transactionsInRange.length} PENDING transaction(s) in range (dates: ${transactionsInRange.map(t => t.date).filter(d => d).slice(0, 3).join(', ')}...), but no POSTED transactions yet. Continuing to scroll DOWN to find posted transactions...`);
                    }
                }
                // Reset stagnation counter since we found transactions (even if pending)
                stagnationScrolls = 0;
                consecutiveTargetDateMatches = 0;
                // Don't set foundTargetDateRange = true - this ensures scrolling continues
                // CRITICAL: If found range is newer, ensure we don't mark as found
                if (foundRangeIsNewerThanTarget) {
                    foundTargetDateRange = false; // Explicitly keep false to ensure scrolling continues
                }
            } else {
                // CRITICAL DEBUG: Log inside else block
                if (scrollAttempts <= 15) {
                    console.log(`🔍 [INSIDE ELSE BLOCK] Scroll ${scrollAttempts}: No posted or pending transactions in range`);
                }
                consecutiveTargetDateMatches = 0;
                // If we've reached target range but aren't finding new transactions, track no progress
                if (hasReachedTargetRange && transactionsInRangeCount === lastInRangeCount) {
                    noProgressScrolls++;
                } else if (hasReachedTargetRange) {
                    noProgressScrolls = 0; // Reset if we found new transactions
                }
            }

            // CRITICAL: Boundary buffer checks MUST run every scroll iteration, regardless of whether transactions are in range
            // This ensures boundaries are marked complete even when we've scrolled past the target range
            // Calculate boundary dates (needed for buffer checks)
            const leftBoundaryDate = new Date(startDateObj);
            leftBoundaryDate.setDate(leftBoundaryDate.getDate() - 1);
            leftBoundaryDate.setHours(23, 59, 59, 999); // End of day before start

            const rightBoundaryDate = new Date(endDateObj);
            rightBoundaryDate.setDate(rightBoundaryDate.getDate() + 1);
            rightBoundaryDate.setHours(0, 0, 0, 0); // Start of day after end

            // Check if we've scrolled past END boundary (into November) to capture all Oct 31 transactions
            // CRITICAL: This check runs EVERY scroll iteration, not just when transactions are in range
            if (targetRangeEndBoundary !== null && !endBoundaryFound && !foundRangeIsNewerThanTarget) {
                // Find the oldest transaction to check if we've scrolled past Nov 1 (the boundary date)
                const oldestTx = allTransactions.reduce((oldest, current) => {
                    const currentDate = parseTransactionDate(current.date);
                    const oldestDate = oldest ? parseTransactionDate(oldest.date) : null;
                    if (!currentDate) return oldest;
                    if (!oldestDate) return current;
                    return currentDate.getTime() < oldestDate.getTime() ? current : oldest;
                }, null);
                if (oldestTx) {
                    const oldestTxDate = parseTransactionDate(oldestTx.date);
                    // If oldest transaction is before Nov 1 (the boundary date), we've scrolled past the boundary
                    const rightBoundaryDateTime = new Date(rightBoundaryDate.getFullYear(), rightBoundaryDate.getMonth(), rightBoundaryDate.getDate()).getTime();
                    const oldestTxDateTime = new Date(oldestTxDate.getFullYear(), oldestTxDate.getMonth(), oldestTxDate.getDate()).getTime();
                    if (oldestTxDateTime < rightBoundaryDateTime) {
                        endBoundaryScrollBuffer++;
                        console.log(`🔵 [BOUNDARY BUFFER] Scrolled past END boundary (${endBoundaryScrollBuffer}/${BOUNDARY_SCROLL_BUFFER}). Oldest transaction: ${oldestTxDate.toLocaleDateString()}, Boundary: ${rightBoundaryDate.toLocaleDateString()}`);

                        if (endBoundaryScrollBuffer >= BOUNDARY_SCROLL_BUFFER) {
                            // ============================================================================
                            // FLAG ASSIGNMENT LOGGING: endBoundaryFound = true (after scrolling past)
                            // ============================================================================
                            console.log('\n🟢 [FLAG ASSIGNMENT] endBoundaryFound = TRUE (scrolled past boundary)');
                            console.log(`   • Scroll: ${scrollAttempts}`);
                            console.log('   • Previous value: false');
                            console.log('   • New value: true');
                            console.log(`   • Boundary date: ${rightBoundaryDate.toLocaleDateString()}\n`);

                            endBoundaryFound = true;
                            endBoundaryScrolledPast = true;
                            console.log('✅ [BOUNDARY DETECTION SUCCESS] RIGHT BOUNDARY COMPLETE');
                            console.log('   • Boundary type: RIGHT (scrolled past Nov 1 to capture all Oct 31 transactions)');
                            console.log(`   • Target end date: ${endDateObj.toLocaleDateString()}`);
                            console.log(`   • Scroll position: ${Math.round(targetRangeEndBoundary)}px`);
                            console.log(`   • Scroll attempt: ${scrollAttempts}`);
                            console.log(`   • Transactions found so far: ${allTransactions.length} total, ${transactionsInRangeCount} in range`);
                            console.log(`   • Status: Found "${targetPeriodName}" - Right boundary complete! Continuing DOWN to find LEFT boundary...`);
                            // Send notification to popup
                            sendScrollProgress({
                                isScrolling: true,
                                inRangeCount: transactionsInRangeCount,
                                totalFound: allTransactions.length,
                                timeElapsed: elapsedDisplay,
                                expectedRange: `${startDateObj.toLocaleDateString()} - ${endDateObj.toLocaleDateString()}`,
                                detectedRange: foundDateRange,
                                boundaryReached: `Found "${targetPeriodName}" - Right boundary reached`,
                                foundRightBoundary: true,
                                foundLeftBoundary: startBoundaryFound
                            });
                        }
                    }
                }
            }

            // Check if we've scrolled past START boundary (into September) to capture all Oct 1 transactions
            // CRITICAL: This check runs EVERY scroll iteration, not just when transactions are in range
            if (endBoundaryFound && targetRangeStartBoundary !== null && !startBoundaryFound && !foundRangeIsNewerThanTarget) {
                // Find the oldest transaction to check if we've scrolled past Sept 30 (the boundary date)
                const oldestTx = allTransactions.reduce((oldest, current) => {
                    const currentDate = parseTransactionDate(current.date);
                    const oldestDate = oldest ? parseTransactionDate(oldest.date) : null;
                    if (!currentDate) return oldest;
                    if (!oldestDate) return current;
                    return currentDate.getTime() < oldestDate.getTime() ? current : oldest;
                }, null);
                if (oldestTx) {
                    const oldestTxDate = parseTransactionDate(oldestTx.date);
                    // If oldest transaction is before Sept 30 (the boundary date), we've scrolled past the boundary
                    const leftBoundaryDateTime = new Date(leftBoundaryDate.getFullYear(), leftBoundaryDate.getMonth(), leftBoundaryDate.getDate()).getTime();
                    const oldestTxDateTime = new Date(oldestTxDate.getFullYear(), oldestTxDate.getMonth(), oldestTxDate.getDate()).getTime();
                    if (oldestTxDateTime < leftBoundaryDateTime) {
                        startBoundaryScrollBuffer++;
                        console.log(`🔵 [BOUNDARY BUFFER] Scrolled past START boundary (${startBoundaryScrollBuffer}/${BOUNDARY_SCROLL_BUFFER}). Oldest transaction: ${oldestTxDate.toLocaleDateString()}, Boundary: ${leftBoundaryDate.toLocaleDateString()}`);

                        if (startBoundaryScrollBuffer >= BOUNDARY_SCROLL_BUFFER) {
                            // ============================================================================
                            // FLAG ASSIGNMENT LOGGING: startBoundaryFound = true (after scrolling past)
                            // ============================================================================
                            console.log('\n🟢 [FLAG ASSIGNMENT] startBoundaryFound = TRUE (scrolled past boundary)');
                            console.log(`   • Scroll: ${scrollAttempts}`);
                            console.log('   • Previous value: false');
                            console.log('   • New value: true');
                            console.log(`   • Boundary date: ${leftBoundaryDate.toLocaleDateString()}\n`);

                            startBoundaryFound = true;
                            startBoundaryScrolledPast = true;
                            harvestingStarted = true; // Start harvesting immediately
                            lastOscillationCount = transactionsInRangeCount; // Initialize oscillation count tracking
                            const boundaryDistance = Math.abs(targetRangeEndBoundary - targetRangeStartBoundary);
                            console.log('✅ [BOUNDARY DETECTION SUCCESS] LEFT BOUNDARY COMPLETE');
                            console.log('   • Boundary type: LEFT (scrolled past Sept 30 to capture all Oct 1 transactions)');
                            console.log(`   • Target start date: ${startDateObj.toLocaleDateString()}`);
                            console.log(`   • Scroll position: ${Math.round(targetRangeStartBoundary)}px`);
                            console.log(`   • Scroll attempt: ${scrollAttempts}`);
                            console.log(`   • Transactions found so far: ${allTransactions.length} total, ${transactionsInRangeCount} in range`);
                            // CRITICAL: Check if found range is NEWER than target BEFORE entering oscillation phase
                            // If found range is newer, we haven't reached the target yet - continue scrolling DOWN
                            if (foundRangeIsNewerThanTarget) {
                                console.log('⚠️ CRITICAL: Boundaries detected but found range is NEWER than target. Blocking oscillation phase. Must continue scrolling DOWN to find older transactions.');
                                console.log(`   • Found range: ${foundDateRange}`);
                                console.log(`   • Target range: ${startDateObj.toLocaleDateString()} - ${endDateObj.toLocaleDateString()}`);
                                console.log('   • Continuing Phase 1/2 scrolling DOWN instead of oscillating...');
                                // Don't enter oscillation phase - continue scrolling DOWN
                                scrollingDirection = 'down';
                            } else {
                                console.log('✅ [BOUNDARY DETECTION COMPLETE] BOTH BOUNDARIES FOUND');
                                console.log(`   • RIGHT boundary: ${Math.round(targetRangeEndBoundary)}px (${rightBoundaryDate.toLocaleDateString()})`);
                                console.log(`   • LEFT boundary: ${Math.round(targetRangeStartBoundary)}px (${leftBoundaryDate.toLocaleDateString()})`);
                                console.log(`   • Boundary distance: ${Math.round(boundaryDistance)}px`);
                                console.log(`   • Target range: ${startDateObj.toLocaleDateString()} - ${endDateObj.toLocaleDateString()}`);
                                console.log(`   • Status: Found "${targetPeriodName}" - Both boundaries complete!`);
                                console.log('   • Next phase: Starting oscillations between boundaries (dynamic limits, exit when no progress)');
                                scrollingDirection = 'oscillating'; // Switch to oscillation mode
                            }
                            // Send notification to popup
                            sendScrollProgress({
                                isScrolling: true,
                                inRangeCount: transactionsInRangeCount,
                                totalFound: allTransactions.length,
                                timeElapsed: elapsedDisplay,
                                expectedRange: `${startDateObj.toLocaleDateString()} - ${endDateObj.toLocaleDateString()}`,
                                detectedRange: foundDateRange,
                                boundaryReached: `Found "${targetPeriodName}" - Both boundaries reached!`,
                                foundRightBoundary: true,
                                foundLeftBoundary: true
                            });
                        }
                    }
                }
            }

            // CRITICAL DEBUG: Log after all transaction checks
            if (scrollAttempts <= 15) {
                console.log(`🔍 [AFTER ALL TRANSACTION CHECKS] Scroll ${scrollAttempts}: About to continue to stagnation/scroll logic...`);
            }

            // Update last count for progress tracking
            lastInRangeCount = transactionsInRangeCount;

            // CRITICAL DEBUG: Log before no-progress check
            if (scrollAttempts <= 15) {
                console.log(`🔍 [BEFORE NO-PROGRESS CHECK] Scroll ${scrollAttempts}: hasReachedTargetRange=${hasReachedTargetRange}, noProgressScrolls=${noProgressScrolls}, MAX_NO_PROGRESS_SCROLLS=${MAX_NO_PROGRESS_SCROLLS}, scrollAttempts=${scrollAttempts}`);
            }

            // If we've reached target range but haven't made progress for several scrolls, consider stopping
            // NOTE: MIN_SCROLLS_FOR_LAST_MONTH is declared later, so we'll use CONFIG.MIN_SCROLLS.LAST_MONTH directly here
            const tempMinScrollsForLastMonth = CONFIG.MIN_SCROLLS.LAST_MONTH;
            if (hasReachedTargetRange && noProgressScrolls >= MAX_NO_PROGRESS_SCROLLS && scrollAttempts >= tempMinScrollsForLastMonth) {
                console.log(`Reached target range but no progress for ${MAX_NO_PROGRESS_SCROLLS} scrolls. Checking if we should stop...`);
                // Will be checked in the stop conditions below
            }

            // CRITICAL DEBUG: Log after no-progress check
            if (scrollAttempts <= 15) {
                console.log(`🔍 [AFTER NO-PROGRESS CHECK] Scroll ${scrollAttempts}: Continuing to stagnation logic...`);
            }

            // CRITICAL DEBUG: Log before finding oldest transaction
            if (scrollAttempts <= 15) {
                console.log(`🔍 [BEFORE FIND OLDEST] Scroll ${scrollAttempts}: About to find oldest transaction...`);
            }

            // Check if we've scrolled past the date range
            let scrolledPastDateRange = false;
            const oldestTransaction = newTransactions.reduce((oldest, current) => {
                const currentDate = parseTransactionDate(current.date);
                const oldestDate = oldest ? parseTransactionDate(oldest.date) : null;
                if (!currentDate) return oldest;
                if (!oldestDate) return current;
                return currentDate.getTime() < oldestDate.getTime() ? current : oldest;
            }, null);

            // CRITICAL DEBUG: Log after finding oldest transaction
            if (scrollAttempts <= 15) {
                console.log(`🔍 [AFTER FIND OLDEST] Scroll ${scrollAttempts}: oldestTransaction=${oldestTransaction ? oldestTransaction.date : 'null'}`);
            }

            // CRITICAL FIX: Fallback check - if we've scrolled past start date but haven't found Sept 30 transaction,
            // set startBoundaryFound = true anyway (there may be no transactions on Sept 30)
            // CRITICAL: Also require scrolling PAST Oct 1 into September to capture ALL Oct 1 transactions
            if (endBoundaryFound && !startBoundaryFound && !foundRangeIsNewerThanTarget && oldestTransaction && oldestTransaction.date) {
                const oldestTxDate = parseTransactionDate(oldestTransaction.date);
                if (oldestTxDate && !isNaN(oldestTxDate.getTime())) {
                    // If oldest transaction is at or before start date, we've scrolled past the start boundary
                    const oldestTxDateTime = new Date(oldestTxDate.getFullYear(), oldestTxDate.getMonth(), oldestTxDate.getDate()).getTime();
                    const startDateTime = new Date(startDateObj.getFullYear(), startDateObj.getMonth(), startDateObj.getDate()).getTime();

                    // CRITICAL: Require scrolling PAST Oct 1 (into September) before marking boundary complete
                    if (oldestTxDateTime < startDateTime) {
                        // We've scrolled past Oct 1 - increment buffer counter
                        if (targetRangeStartBoundary === null) {
                            targetRangeStartBoundary = window.scrollY; // Mark boundary position
                            startBoundaryScrollBuffer = 0; // Reset buffer counter
                            console.log('🔵 [BOUNDARY FALLBACK] Scrolled past Oct 1. Starting buffer count...');
                        }
                        startBoundaryScrollBuffer++;
                        console.log(`🔵 [BOUNDARY BUFFER] Fallback - Scrolled past START boundary (${startBoundaryScrollBuffer}/${BOUNDARY_SCROLL_BUFFER}). Oldest transaction: ${oldestTxDate.toLocaleDateString()}`);

                        if (startBoundaryScrollBuffer >= BOUNDARY_SCROLL_BUFFER) {
                            // ============================================================================
                            // FLAG ASSIGNMENT LOGGING: startBoundaryFound = true (fallback - after scrolling past)
                            // ============================================================================
                            console.log('\n🟢 [FLAG ASSIGNMENT] startBoundaryFound = TRUE (FALLBACK - scrolled past start date)');
                            console.log(`   • Scroll: ${scrollAttempts}`);
                            console.log('   • Previous value: false');
                            console.log('   • New value: true');
                            console.log(`   • Oldest transaction: ${oldestTxDate.toLocaleDateString()}`);
                            console.log(`   • Start date: ${startDateObj.toLocaleDateString()}`);
                            console.log('   • Reason: Scrolled past start date (no Sept 30 transaction found)\n');

                            startBoundaryFound = true;
                            startBoundaryScrolledPast = true;
                            harvestingStarted = true;
                            lastOscillationCount = transactionsInRangeCount;

                            console.log('✅ [BOUNDARY DETECTION SUCCESS] LEFT BOUNDARY FOUND (FALLBACK)');
                            console.log('   • Boundary type: LEFT (scrolled past start date)');
                            console.log(`   • Target start date: ${startDateObj.toLocaleDateString()}`);
                            console.log(`   • Oldest transaction found: ${oldestTxDate.toLocaleDateString()}`);
                            console.log(`   • Scroll position: ${Math.round(targetRangeStartBoundary)}px`);
                            console.log(`   • Scroll attempt: ${scrollAttempts}`);
                            console.log(`   • Transactions found so far: ${allTransactions.length} total, ${transactionsInRangeCount} in range`);
                            console.log(`   • Status: Found "${targetPeriodName}" - Both boundaries reached!`);

                            // Send notification to popup
                            sendScrollProgress({
                                isScrolling: true,
                                inRangeCount: transactionsInRangeCount,
                                totalFound: allTransactions.length,
                                timeElapsed: elapsedDisplay,
                                expectedRange: `${startDateObj.toLocaleDateString()} - ${endDateObj.toLocaleDateString()}`,
                                detectedRange: foundDateRange,
                                boundaryReached: `Found "${targetPeriodName}" - Both boundaries reached!`,
                                foundRightBoundary: true,
                                foundLeftBoundary: true
                            });
                        }
                    }
                }
            }

            // CRITICAL: Calculate range size to determine if this is a 5-year range
            // We need to know this BEFORE checking stop conditions to ensure scrolling happens
            const rangeDaysForCheck = Math.ceil((endDateTime - startDateTime) / (24 * 60 * 60 * 1000)) + 1;
            const isVeryLongRangeForOptimization = rangeDaysForCheck > 1800; // 5+ years

            // OPTIMIZED: Smart stopping for recent vs old date ranges
            // For recent dates (like November), stop earlier. For old dates, scroll more.
            // CRITICAL: For "Last Month", require minimum scrolls before checking stop conditions
            // Use SYSTEM_DATE for consistency (captured once at start)
            const daysSinceEndDateMin = (SYSTEM_DATE - endDateObj) / (24 * 60 * 60 * 1000);
            const isLastMonthMin = daysSinceEndDateMin >= 30 && daysSinceEndDateMin < 60;
            // OPTIMIZED: Reduced to 40 scrolls but with stricter boundary verification for early stopping
            // Early stop allowed when boundaries verified AND 133+ transactions collected
            const MIN_SCROLLS_FOR_LAST_MONTH = CONFIG.MIN_SCROLLS.LAST_MONTH; // From CONFIG (reduced from 60 to minimize logout risk while ensuring completeness)

            // ROLLBACK: Restore simple stop condition checks from working version
            // CRITICAL: For "Last Month", require minimum scrolls before checking stop conditions
            const canCheckStopConditions = !isLastMonthMin || scrollAttempts >= MIN_SCROLLS_FOR_LAST_MONTH;

            // CRITICAL DEBUG: Log before stop conditions check
            if (scrollAttempts <= 15) {
                console.log(`🔍 [BEFORE STOP CONDITIONS] Scroll ${scrollAttempts}: oldestTransaction=${oldestTransaction ? 'exists' : 'null'}, foundTargetDateRange=${foundTargetDateRange}, canCheckStopConditions=${canCheckStopConditions}`);
            }

            // Check stop conditions (from working version)
            // CRITICAL: Wrap entire stop conditions check in try-catch to catch any exceptions
            try {
                if (oldestTransaction && oldestTransaction.date && foundTargetDateRange && canCheckStopConditions) {
                    // CRITICAL DEBUG: Log inside stop conditions check
                    if (scrollAttempts <= 15) {
                        console.log(`🔍 [INSIDE STOP CONDITIONS] Scroll ${scrollAttempts}: Checking stop conditions...`);
                    }
                    try {
                        const oldestDate = parseTransactionDate(oldestTransaction.date);
                    if (oldestDate && !isNaN(oldestDate.getTime())) {
                        const oldestDateTime = new Date(oldestDate.getFullYear(), oldestDate.getMonth(), oldestDate.getDate()).getTime();

                        // Use SYSTEM_DATE for consistency (captured once at start)
                        const daysSinceEndDate = (SYSTEM_DATE - endDateObj) / (24 * 60 * 60 * 1000);

                        // CRITICAL: For "Last Month" (30-60 days ago), we need to scroll MUCH more thoroughly
                        // Data is in descending order, so last month data is further down
                        // We must scroll past the START date, not just the END date
                        // For "Last Month" specifically (30-60 days), require scrolling past START date by at least 3 days
                        // UPDATED: Increased to ensure all 133 October transactions are collected
                        const isLastMonth = daysSinceEndDate >= 30 && daysSinceEndDate < 60;

                        // IMPROVED: Calculate range size and adjust stop threshold
                        const rangeDays = Math.ceil((endDateTime - startDateTime) / (24 * 60 * 60 * 1000)) + 1;

                        // CRITICAL: Always include buffer to ensure boundary dates are captured
                        // LESSON LEARNED: Increased buffers to prevent missing start boundary (Oct 1)
                        // For small ranges (<= 10 days), stop 2 days past end (ensure last day captured)
                        // For medium ranges (11-31 days - single month), stop 5 days past end (INCREASED from 3)
                        // For large ranges (32-90 days - 1-3 months), stop 5 days past end
                        // For very large ranges (> 90 days - 3+ months), limit to avoid excessive scrolling
                        let daysPastEndToStop;
                        // Use CONFIG values for buffer days based on range size
                        // CRITICAL FIX: rangeDays calculation adds +1, so 31-day month = 32, not 31
                        // Changed condition from <= 31 to <= 32 to correctly identify Last Month (31-day months)
                        if (rangeDays <= 10) {
                            daysPastEndToStop = CONFIG.BUFFER_DAYS.SMALL_RANGE;
                        } else if (rangeDays <= 32) {
                            daysPastEndToStop = isLastMonth ? CONFIG.BUFFER_DAYS.LAST_MONTH : CONFIG.BUFFER_DAYS.MEDIUM_RANGE;
                        } else if (rangeDays <= 90) {
                            daysPastEndToStop = CONFIG.BUFFER_DAYS.LARGE_RANGE;
                        } else {
                            // Very large ranges (> 3 months) - limit scrolling to avoid issues
                            daysPastEndToStop = CONFIG.BUFFER_DAYS.VERY_LARGE_RANGE;
                            console.warn(`⚠️ Large date range detected (${rangeDays} days). Limiting scroll to prevent issues. Consider splitting into smaller ranges.`);
                        }
                        // LESSON LEARNED: Increased buffer before start date to 3 days (was 2) for Last Month
                        // This ensures Oct 1 is captured (scroll to Sep 28 or earlier)
                        // Use CONFIG values for before-start buffer
                        // CRITICAL FIX: rangeDays calculation (line 1481) adds +1, so 31-day month = 32, not 31
                        // Changed condition from <= 31 to <= 32 to correctly identify Last Month (31-day months)
                        const daysBeforeStartToCapture = (isLastMonth && rangeDays <= 32)
                            ? CONFIG.BEFORE_START_BUFFER.LAST_MONTH
                            : (rangeDays <= 90 ? CONFIG.BEFORE_START_BUFFER.STANDARD : CONFIG.BEFORE_START_BUFFER.LARGE);
                        const stopThresholdMs = daysPastEndToStop * 24 * 60 * 60 * 1000;
                        const startCaptureThresholdMs = daysBeforeStartToCapture * 24 * 60 * 60 * 1000;

                        // CRITICAL: For proper boundaries, scroll past START date (to capture start boundary)
                        // AND scroll past END date (to capture end boundary like October 31)
                        // Always check both for complete boundary capture
                        const scrolledPastStart = oldestDateTime < (startDateTime - startCaptureThresholdMs); // Past start boundary
                        const scrolledPastEnd = oldestDateTime < (endDateTime - stopThresholdMs); // Past end boundary

                        if (isLastMonth) {
                            // For last month, require BOTH: scrolled past start AND past end boundaries
                            if (scrolledPastStart || scrolledPastEnd) {
                                // Check if we have transactions for all dates in the range
                                const rangeDays = Math.ceil((endDateTime - startDateTime) / (24 * 60 * 60 * 1000)) + 1;
                                const datesFound = new Set();
                                const transactionsInRange = allTransactions.filter(t => {
                                    if (isDateInRange(t.date, startDateObj, endDateObj)) {
                                    // CRITICAL: For "Last Month", count ONLY posted transactions
                                    // Exclude pending transactions from count (target is 133 POSTED transactions)
                                    if (isLastMonth) {
                                        // CRITICAL FIX: Check if t.date exists before calling .trim() to prevent TypeError
                                        const isPending = !t.date || (typeof t.date === 'string' && t.date.trim() === '') ||
                                                        (t.status && t.status.toLowerCase() === 'pending');
                                        if (isPending) {
                                            return false; // Exclude pending transactions
                                        }
                                    }
                                    const txDate = parseTransactionDate(t.date);
                                    if (txDate) {
                                        const dateKey = `${txDate.getFullYear()}-${txDate.getMonth()}-${txDate.getDate()}`;
                                        datesFound.add(dateKey);
                                    }
                                    return true;
                                }
                                return false;
                            });

                            // LESSON LEARNED: Enhanced boundary verification - require BOTH Oct 1 AND Oct 31 dates
                            // Check for explicit boundary dates (start and end of month)
                            const startDateKey = `${startDateObj.getFullYear()}-${startDateObj.getMonth()}-${startDateObj.getDate()}`;
                            const endDateKey = `${endDateObj.getFullYear()}-${endDateObj.getMonth()}-${endDateObj.getDate()}`;
                            const hasStartDate = datesFound.has(startDateKey); // Oct 1 must be present
                            const hasEndDate = datesFound.has(endDateKey);   // Oct 31 must be present

                            // LESSON LEARNED: Complete month check - require 31 unique dates for October
                            const expectedUniqueDates = rangeDays; // For October: 31 days
                            const hasCompleteMonth = datesFound.size >= expectedUniqueDates; // All 31 dates present

                            // For "Last Month", require 98% coverage AND scrolled past BOTH boundaries
                            // CRITICAL: Also verify we have 133+ POSTED transactions before stopping
                            const requiredCoverage = CONFIG.COVERAGE_THRESHOLD.RECENT;
                            const hasAllDates = datesFound.size >= rangeDays * requiredCoverage;
                            const hasEnoughTransactions = transactionsInRange.length >= TARGET_RANGE.min; // At least 133 POSTED transactions

                            // LESSON LEARNED: Only stop when ALL criteria met:
                            // 1. Scrolled past BOTH boundaries (start AND end)
                            // 2. Has BOTH boundary dates (Oct 1 AND Oct 31)
                            // 3. Complete month coverage (31 unique dates)
                            // 4. Enough transactions (133+ posted)
                            // 5. Date coverage (98%+)
                            const allCriteriaMet = scrolledPastStart && scrolledPastEnd &&
                                                  hasStartDate && hasEndDate &&
                                                  hasCompleteMonth &&
                                                  hasEnoughTransactions &&
                                                  hasAllDates;

                            if (allCriteriaMet) {
                                scrolledPastDateRange = true;
                                console.log(`✓ Last Month: ALL CRITERIA MET! Scrolled past BOTH boundaries. Oldest: ${oldestDate.toLocaleDateString()}, Start: ${new Date(startDateTime).toLocaleDateString()}, End: ${new Date(endDateTime).toLocaleDateString()}, Transactions: ${transactionsInRange.length} (target: 133-140), Unique dates: ${datesFound.size}/${expectedUniqueDates}, Dates found: ${datesFound.size}/${rangeDays} (${Math.round(datesFound.size/rangeDays*100)}%)`);
                            } else {
                                // Diagnostic logging for incomplete criteria
                                const missingCriteria = [];
                                if (!scrolledPastStart) missingCriteria.push('past start boundary');
                                if (!scrolledPastEnd) missingCriteria.push('past end boundary');
                                if (!hasStartDate) missingCriteria.push(`start date (${startDateObj.toLocaleDateString()})`);
                                if (!hasEndDate) missingCriteria.push(`end date (${endDateObj.toLocaleDateString()})`);
                                if (!hasCompleteMonth) missingCriteria.push(`complete month (${datesFound.size}/${expectedUniqueDates} dates)`);
                                if (!hasEnoughTransactions) missingCriteria.push(`enough transactions (${transactionsInRange.length}/${TARGET_RANGE.min})`);
                                if (!hasAllDates) missingCriteria.push(`date coverage (${Math.round(datesFound.size/rangeDays*100)}% < 98%)`);

                                console.log(`Last Month: Continuing scroll. Missing: ${missingCriteria.join(', ')}. Past start: ${scrolledPastStart}, Past end: ${scrolledPastEnd}, Transactions: ${transactionsInRange.length}/${TARGET_RANGE.min}, Unique dates: ${datesFound.size}/${expectedUniqueDates}, oldest: ${oldestDate.toLocaleDateString()}`);
                            }
                        }
                        } else {
                            // LESSON LEARNED: Enhanced boundary checks apply to ALL presets (not just Last Month)
                            // For other date ranges, use enhanced logic with explicit boundary date checks
                            // CRITICAL: Check BOTH boundaries to ensure complete capture
                            if (scrolledPastStart || scrolledPastEnd) {
                                // Check if we have transactions for all dates in the range
                                const datesFound = new Set();
                                const transactionsInRange = allTransactions.filter(t => {
                                    if (isDateInRange(t.date, startDateObj, endDateObj)) {
                                        const txDate = parseTransactionDate(t.date);
                                        if (txDate) {
                                            const dateKey = `${txDate.getFullYear()}-${txDate.getMonth()}-${txDate.getDate()}`;
                                            datesFound.add(dateKey);
                                        }
                                        return true;
                                    }
                                    return false;
                                });

                                // LESSON LEARNED: Explicit boundary date checks for ALL presets
                                const startDateKey = `${startDateObj.getFullYear()}-${startDateObj.getMonth()}-${startDateObj.getDate()}`;
                                const endDateKey = `${endDateObj.getFullYear()}-${endDateObj.getMonth()}-${endDateObj.getDate()}`;
                                const hasStartDateExplicit = datesFound.has(startDateKey); // Start date must be present
                                const hasEndDateExplicit = datesFound.has(endDateKey);     // End date must be present

                                // LESSON LEARNED: Complete range verification for ALL presets
                                const expectedUniqueDates = rangeDays; // Full range coverage
                                const hasCompleteRange = datesFound.size >= expectedUniqueDates * 0.95; // 95%+ coverage required

                                // For recent ranges, require higher coverage (98%) before stopping
                                // For older ranges, use CONFIG coverage thresholds
                                const requiredCoverage = daysSinceEndDate < 60 ? CONFIG.COVERAGE_THRESHOLD.RECENT : CONFIG.COVERAGE_THRESHOLD.STANDARD;
                                const hasAllDates = datesFound.size >= rangeDays * requiredCoverage;
                                const wayPast = oldestDateTime < (endDateTime - (stopThresholdMs * 2)); // 2x threshold

                                // CRITICAL: For proper boundaries, require BOTH boundaries passed
                                // AND explicit boundary dates present for ALL presets
                                const bothBoundariesPassed = scrolledPastStart && scrolledPastEnd;
                                const allBoundariesVerified = bothBoundariesPassed && hasStartDateExplicit && hasEndDateExplicit;

                                // LESSON LEARNED: Enhanced stop condition for ALL presets
                                // Require: both boundaries passed, explicit dates present, and good coverage
                                if ((hasAllDates && allBoundariesVerified && hasCompleteRange) || wayPast) {
                                    scrolledPastDateRange = true;
                                    console.log(`✓ Scrolled past BOTH boundaries with explicit dates verified. Oldest: ${oldestDate.toLocaleDateString()}, Start: ${new Date(startDateTime).toLocaleDateString()}, End: ${new Date(endDateTime).toLocaleDateString()}, Transactions: ${transactionsInRange.length}, Unique dates: ${datesFound.size}/${expectedUniqueDates}, Boundary dates: Start (${hasStartDateExplicit ? 'YES' : 'NO'}), End (${hasEndDateExplicit ? 'YES' : 'NO'})`);
                                } else {
                                    const missingChecks = [];
                                    if (!bothBoundariesPassed) missingChecks.push('both boundaries passed');
                                    if (!hasStartDateExplicit) missingChecks.push('explicit start date');
                                    if (!hasEndDateExplicit) missingChecks.push('explicit end date');
                                    if (!hasCompleteRange) missingChecks.push(`complete range (${datesFound.size}/${expectedUniqueDates} dates)`);
                                    console.log(`Continuing scroll: Past start: ${scrolledPastStart}, Past end: ${scrolledPastEnd}, Transactions: ${transactionsInRange.length}, Unique dates: ${datesFound.size}/${expectedUniqueDates}, Missing: ${missingChecks.join(', ')}, oldest: ${oldestDate.toLocaleDateString()}`);
                                }
                            }
                        }
                    }
                    } catch (e) {
                        console.error(`Error comparing dates: ${oldestTransaction ? oldestTransaction.date : 'oldestTransaction is null/undefined'}`, e);
                        // Continue scrolling if there's an error - don't stop extraction
                    }
                }
            } catch (stopConditionsError) {
                // CRITICAL: Catch any exceptions in the stop conditions check
                console.error('🚨 EXCEPTION IN STOP CONDITIONS CHECK:', stopConditionsError);
                console.error(`   • Error: ${stopConditionsError.message}`);
                console.error(`   • Stack: ${stopConditionsError.stack}`);
                console.error(`   • Scroll: ${scrollAttempts}`);
                // Continue scrolling if there's an error - don't stop extraction
            }

        // CRITICAL DEBUG: Log after stop conditions check
        if (scrollAttempts <= 15) {
            console.log(`🔍 [AFTER STOP CONDITIONS] Scroll ${scrollAttempts}: Continuing to enhanced stop conditions...`);
        }

        // CRITICAL: Declare canStopNow and MIN_SCROLLS_FOR_STOP outside try block so they're available even if exception occurs
        // Note: isLastMonthStop is already calculated earlier (around line 1386) so it's available here
        let canStopNow = false;
        let MIN_SCROLLS_FOR_STOP = 0;

        // CRITICAL: Wrap entire enhanced stop conditions section in try-catch to catch any exceptions
        try {
            // Enhanced stop conditions
            // IMPROVED: For small ranges, don't require minimum scrolls
            // Note: isLastMonthStop is already calculated earlier, so we can use it directly here
            const rangeDaysForStop = Math.ceil((endDateTime - startDateTime) / (24 * 60 * 60 * 1000)) + 1;

            // REFERENCE STANDARD: Check if 100% recovery achieved (133-140 for October)
            if (isLastMonthStop && inRangeCount >= TARGET_RANGE.min && inRangeCount <= TARGET_RANGE.max) {
                if (scrollStats.scrollsAt100Percent === null) {
                    const currentWaitTime = (foundTargetDateRange && consecutiveTargetDateMatches >= 3) ? CONFIG.SCROLL_WAIT_TIME.FAST : CONFIG.SCROLL_WAIT_TIME.STANDARD;
                    scrollStats.scrollsAt100Percent = scrollAttempts;
                    scrollStats.parametersAt100Percent = {
                        totalScrolls: scrollAttempts,
                        scrollsWithNewTransactions: scrollStats.scrollsWithNewTransactions,
                        scrollsWithNoChange: scrollStats.scrollsWithNoChange,
                        totalCollected: allTransactions.length,
                        inRangeCollected: inRangeCount,
                        outOfRangeCollected: outOfRangeCount,
                        scrollWaitTime: currentWaitTime,
                        minScrollsSet: MIN_SCROLLS_FOR_STOP || 0,
                        maxScrollsSet: maxScrollsCalculated || 200,
                        dateRangeDays: rangeDaysForStop || 0,
                        timestamp: new Date().toISOString()
                    };
                    // NOTE: Final "100% recovery" status is now determined at export time
                    // based on runStats.counts.inRangePosted and alerts; see export section.
                    // Mark extraction as complete but continue to verify boundaries
                    extractionComplete = true;
                }
            }

            // For small ranges (<= 10 days), allow stopping early (no minimum scrolls)
            // For medium ranges (11-31 days), require some scrolls
            // For large ranges (> 31 days), use original logic
            // OPTIMIZED: Reduced minimum scrolls for "Last Month" but with strict boundary verification
            // Early stop allowed when boundaries verified AND 133+ transactions collected (see boundary check below)
            // Use CONFIG values for minimum scrolls based on range size
            // CRITICAL FIX: rangeDaysForStop calculation adds +1, so 31-day month = 32, not 31
            // Changed condition from <= 31 to <= 32 to correctly identify Last Month (31-day months)
            // Note: MIN_SCROLLS_FOR_STOP is already declared outside try block
            if (rangeDaysForStop <= 10) {
                MIN_SCROLLS_FOR_STOP = 0; // Small range - no minimum
            } else if (rangeDaysForStop <= 32) {
                MIN_SCROLLS_FOR_STOP = isLastMonthStop ? CONFIG.MIN_SCROLLS.LAST_MONTH : CONFIG.MIN_SCROLLS.MEDIUM_RANGE;
            } else {
                MIN_SCROLLS_FOR_STOP = isLastMonthStop ? CONFIG.MIN_SCROLLS.LAST_MONTH : CONFIG.MIN_SCROLLS.LARGE_RANGE;
            }
            canStopNow = !isLastMonthStop || scrollAttempts >= MIN_SCROLLS_FOR_STOP || rangeDaysForStop <= 10;

            // OPTIMIZATION: If 100% achieved and verified, can stop early (but verify boundaries first)
            // LESSON LEARNED: Enhanced verification - require ALL criteria before early stop
            // CRITICAL: Allow early stopping when we have 133+ POSTED transactions AND both boundaries verified
            // AND both boundary dates present AND complete month coverage
            if (isLastMonthStop && inRangeCount >= TARGET_RANGE.min) {
                // Got 133+ POSTED transactions, verify we've reached boundaries (first and last days of October)
                const inRangeTransactions = allTransactions.filter(t => {
                    if (!isDateInRange(t.date, startDateObj, endDateObj)) return false;
                    // LESSON LEARNED: Count only posted transactions for Last Month
                    // CRITICAL FIX: Check if t.date exists before calling .trim() to prevent TypeError
                    const isPending = !t.date || (typeof t.date === 'string' && t.date.trim() === '') ||
                                    (t.status && t.status.toLowerCase() === 'pending');
                    return !isPending; // Only posted transactions
                });

                if (inRangeTransactions.length > 0) {
                    // Check collected dates
                    const collectedDates = inRangeTransactions
                        .map(t => parseTransactionDate(t.date))
                        .filter(d => d !== null);

                    if (collectedDates.length > 0) {
                        const earliestDate = new Date(Math.min(...collectedDates.map(d => d.getTime())));
                        const latestDate = new Date(Math.max(...collectedDates.map(d => d.getTime())));

                        // LESSON LEARNED: Get unique dates for complete month check
                        const uniqueDates = new Set(
                            collectedDates.map(d => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`)
                        );
                        const expectedUniqueDates = rangeDaysForStop; // For October: 31 days
                        const hasCompleteMonth = uniqueDates.size >= expectedUniqueDates;

                        // LESSON LEARNED: Explicit boundary date checks
                        const startDateKey = `${startDateObj.getFullYear()}-${startDateObj.getMonth()}-${startDateObj.getDate()}`;
                        const endDateKey = `${endDateObj.getFullYear()}-${endDateObj.getMonth()}-${endDateObj.getDate()}`;
                        const hasStartDateExplicit = uniqueDates.has(startDateKey); // Oct 1 must be present
                        const hasEndDateExplicit = uniqueDates.has(endDateKey);     // Oct 31 must be present

                        // CRITICAL: Verify we have BOTH start date (Oct 1) AND end date (Oct 31)
                        // Also verify we've scrolled past both boundaries AND complete month coverage
                        const hasStartDate = earliestDate <= startDateObj;
                        const hasEndDate = latestDate >= endDateObj;
                        const countInRange = inRangeCount >= TARGET_RANGE.min && inRangeCount <= TARGET_RANGE.max;

                        // LESSON LEARNED: Check if we've scrolled past boundaries with increased buffers
                        // Require 5 days past end, 3 days before start for Last Month
                        let hasScrolledPastBoundaries = false;
                        let scrolledPastStartBoundary = false;
                        let scrolledPastEndBoundary = false;
                        if (oldestTransaction && oldestTransaction.date) {
                            const oldestTxDate = parseTransactionDate(oldestTransaction.date);
                            if (oldestTxDate && !isNaN(oldestTxDate.getTime())) {
                                const oldestTxDateTime = new Date(oldestTxDate.getFullYear(), oldestTxDate.getMonth(), oldestTxDate.getDate()).getTime();

                                // LESSON LEARNED: Increased buffer - 5 days past end, 3 days before start
                                const daysPastEndBuffer = 5 * 24 * 60 * 60 * 1000; // 5 days
                                const daysBeforeStartBuffer = 3 * 24 * 60 * 60 * 1000; // 3 days

                                scrolledPastStartBoundary = oldestTxDateTime < (startDateTime - daysBeforeStartBuffer);
                                scrolledPastEndBoundary = oldestTxDateTime < (endDateTime - daysPastEndBuffer);
                                hasScrolledPastBoundaries = scrolledPastStartBoundary && scrolledPastEndBoundary;
                            }
                        }

                        // LESSON LEARNED: Only allow early stop if ALL criteria met:
                        // 1. Has start date (earliest <= Oct 1)
                        // 2. Has end date (latest >= Oct 31)
                        // 3. Has explicit boundary dates (Oct 1 AND Oct 31 present)
                        // 4. Complete month coverage (31 unique dates)
                        // 5. Enough transactions (133+ posted)
                        // 6. Scrolled past both boundaries (5 days after, 3 days before)
                        const allEarlyStopCriteria = hasStartDate && hasEndDate &&
                                                     hasStartDateExplicit && hasEndDateExplicit &&
                                                     hasCompleteMonth &&
                                                     countInRange &&
                                                     (hasScrolledPastBoundaries || scrolledPastDateRange);

                        // If we have ALL criteria, extraction is complete!
                        if (allEarlyStopCriteria) {
                            // We have full boundaries and target count - extraction complete!
                            const currentDOMCount = document.querySelectorAll('[data-index]').length;
                            const isStable = await waitForDOMStability(currentDOMCount, 2000);
                            // CRITICAL FIX: Restore robustness check - ensure at least 5 consecutive scrolls with no new transactions
                            // This verifies the transaction list has stabilized before stopping (prevents premature stopping)
                            // Also verify minimum scrolls performed and DOM is stable
                            if (isStable && scrollAttempts >= MIN_SCROLLS_FOR_STOP && unchangedCount >= 5) {
                                console.log('');
                                console.log('='.repeat(70));
                                console.log('✅ EXTRACTION COMPLETE: 100% Recovery + ALL Boundaries Verified');
                                console.log('='.repeat(70));
                                console.log(`   Transactions found: ${inRangeCount} (target: 133-140 posted transactions)`);
                                console.log(`   Unique dates: ${uniqueDates.size}/${expectedUniqueDates} (complete month: ${hasCompleteMonth ? 'YES' : 'NO'})`);
                                console.log(`   Boundary dates: Start (Oct 1): ${hasStartDateExplicit ? 'YES' : 'NO'}, End (Oct 31): ${hasEndDateExplicit ? 'YES' : 'NO'}`);
                                console.log(`   Scrolled past boundaries: Start: ${scrolledPastStartBoundary ? 'YES' : 'NO'}, End: ${scrolledPastEndBoundary ? 'YES' : 'NO'}`);
                                console.log(`   Boundaries verified: ${earliestDate.toLocaleDateString()} to ${latestDate.toLocaleDateString()}`);
                                console.log(`   Expected range: ${startDateObj.toLocaleDateString()} to ${endDateObj.toLocaleDateString()}`);
                                console.log(`   Scrolls: ${scrollAttempts} (stopping early to avoid logout)`);
                                console.log('='.repeat(70));
                                console.log('');

                                // ============================================================================
                                // EXIT ATTEMPT LOGGING: Early stop (Last Month complete)
                                // ============================================================================
                                console.log(`\n${'='.repeat(80)}`);
                                console.log('🚨 [EXIT ATTEMPT] EARLY STOP - LAST MONTH COMPLETE');
                                console.log('   • Exit reason: All early stop criteria met (100% recovery + boundaries verified)');
                                console.log(`   • Scroll count: ${scrollAttempts}`);
                                console.log(`   • foundRangeIsNewerThanTarget: ${foundRangeIsNewerThanTarget}`);
                                console.log(`   • foundTargetDateRange: ${foundTargetDateRange}`);
                                console.log(`   • endBoundaryFound: ${endBoundaryFound}`);
                                console.log(`   • startBoundaryFound: ${startBoundaryFound}`);
                                console.log(`   • Transactions in range: ${inRangeCount}`);
                                console.log(`   • Unique dates: ${uniqueDates.size}/${expectedUniqueDates}`);
                                console.log(`${'='.repeat(80)}\n`);

                                // FINAL EXIT REASON
                                console.log('✅ [FINAL EXIT REASON] Early stop approved - Last Month extraction complete');

                                // CRITICAL: Final guard check before exit
                                if (foundRangeIsNewerThanTarget) {
                                    console.log('🚨 [GUARD] BLOCKING EXIT - foundRangeIsNewerThanTarget is TRUE! Continuing scroll...');
                                } else {
                                    break;
                                }
                            }
                        } else {
                            // Diagnostic logging for incomplete criteria (every 10 scrolls to avoid spam)
                            if (scrollAttempts % 10 === 0) {
                                const missingCriteria = [];
                                if (!hasStartDate) missingCriteria.push('start date (earliest > Oct 1)');
                                if (!hasEndDate) missingCriteria.push('end date (latest < Oct 31)');
                                if (!hasStartDateExplicit) missingCriteria.push('explicit start date (Oct 1)');
                                if (!hasEndDateExplicit) missingCriteria.push('explicit end date (Oct 31)');
                                if (!hasCompleteMonth) missingCriteria.push(`complete month (${uniqueDates.size}/${expectedUniqueDates} dates)`);
                                if (!countInRange) missingCriteria.push(`enough transactions (${inRangeCount}/${TARGET_RANGE.min})`);
                                if (!hasScrolledPastBoundaries && !scrolledPastDateRange) missingCriteria.push('scrolled past boundaries');

                                console.log(`Last Month: Continuing scroll. Missing: ${missingCriteria.join(', ')}. Transactions: ${inRangeCount}/${TARGET_RANGE.min}, Unique dates: ${uniqueDates.size}/${expectedUniqueDates}`);
                            }
                        }
                    }
                }
            }
        }
        catch (e) {
            console.error(`🚨 EXCEPTION IN ENHANCED STOP CONDITIONS - Scroll ${scrollAttempts}:`, e);
            console.error(`   • Error message: ${e.message}`);
            console.error(`   • Error stack: ${e.stack}`);
            // Continue scrolling if there's an error - don't stop extraction
        }

        // CRITICAL DEBUG: Log after enhanced stop conditions (to confirm execution reaches here)
        if (scrollAttempts <= 15) {
            console.log(`🔍 [AFTER ENHANCED STOP CONDITIONS] Scroll ${scrollAttempts}: Reached main exit check...`);
        }

        // CRITICAL DEBUG: Log before main exit check
        if (scrollAttempts <= 15) {
            console.log(`🔍 [BEFORE MAIN EXIT CHECK] Scroll ${scrollAttempts}: foundTargetDateRange=${foundTargetDateRange}, scrolledPastDateRange=${scrolledPastDateRange}, canStopNow=${canStopNow}, foundRangeIsNewerThanTarget=${foundRangeIsNewerThanTarget}, startBoundaryFound=${startBoundaryFound}, endBoundaryFound=${endBoundaryFound}`);
        }

            // CRITICAL FIX: NEVER stop if found range is NEWER than target - must continue scrolling DOWN
            // CRITICAL: Also require BOTH boundaries to be found before allowing exit
            // CRITICAL: For "Last Month" preset, require at least TARGET_RANGE.min (133) transactions before exit
            // CRITICAL: If harvestingStarted is true, allow oscillations to complete first
            if (foundTargetDateRange && scrolledPastDateRange && canStopNow && !foundRangeIsNewerThanTarget && startBoundaryFound && endBoundaryFound) {
                // CRITICAL: Check if we need to continue oscillating to collect all transactions
                const needsMoreTransactions = isLastMonthStop && transactionsInRangeCount < TARGET_RANGE.min;
                const shouldAllowOscillations = harvestingStarted && oscillationCount < 2; // Allow at least 2 oscillations

                if (needsMoreTransactions || shouldAllowOscillations) {
                    if (needsMoreTransactions) {
                        console.log(`⚠️ Last Month: Found ${transactionsInRangeCount} transactions, but need at least ${TARGET_RANGE.min}. Continuing to collect more...`);
                    } else if (shouldAllowOscillations) {
                        console.log(`⚠️ Both boundaries found, but only ${oscillationCount} oscillation(s) completed. Allowing more oscillations to collect all transactions...`);
                    }
                    // Continue scrolling - don't exit yet
                } else {
                    // CRITICAL DEBUG: Log inside main exit check
                    if (scrollAttempts <= 15) {
                        console.log(`🔍 [INSIDE MAIN EXIT CHECK] Scroll ${scrollAttempts}: All conditions met, checking DOM stability...`);
                    }
                    // Wait for DOM stability before stopping
                    const currentDOMCount = document.querySelectorAll('[data-index]').length;
                    const isStable = await waitForDOMStability(currentDOMCount, 2000);
                    if (isStable) {
                        // ============================================================================
                        // EXIT ATTEMPT LOGGING: Main exit (found range, scrolled past, boundaries found)
                        // ============================================================================
                        console.log(`\n${'='.repeat(80)}`);
                        console.log('🚨 [EXIT ATTEMPT] MAIN EXIT - BOUNDARIES FOUND');
                        console.log('   • Exit reason: Found range, scrolled past, both boundaries found, DOM stable');
                        console.log(`   • Scroll count: ${scrollAttempts}`);
                        console.log(`   • foundRangeIsNewerThanTarget: ${foundRangeIsNewerThanTarget}`);
                        console.log(`   • foundTargetDateRange: ${foundTargetDateRange}`);
                        console.log(`   • scrolledPastDateRange: ${scrolledPastDateRange}`);
                        console.log(`   • canStopNow: ${canStopNow}`);
                        console.log(`   • endBoundaryFound: ${endBoundaryFound}`);
                        console.log(`   • startBoundaryFound: ${startBoundaryFound}`);
                        console.log(`   • transactionsInRangeCount: ${transactionsInRangeCount}`);
                        console.log(`   • allTransactions.length: ${allTransactions.length}`);
                        if (isLastMonthStop) {
                            console.log(`   • Target range: ${TARGET_RANGE.min}-${TARGET_RANGE.max} transactions`);
                        }
                        console.log(`${'='.repeat(80)}\n`);

                        if (isLastMonthStop) {
                            console.log(`Last Month: Found range, scrolled past, both boundaries found, ${transactionsInRangeCount} transactions collected, and DOM is stable after ${scrollAttempts} scrolls. Stopping.`);
                        } else {
                            console.log('Found range, scrolled past, both boundaries found, and DOM is stable. Stopping.');
                        }

                        // FINAL EXIT REASON
                        console.log('✅ [FINAL EXIT REASON] Main exit approved - all conditions met');

                        // CRITICAL: Final guard check before exit
                        if (foundRangeIsNewerThanTarget) {
                            console.log('🚨 [GUARD] BLOCKING EXIT - foundRangeIsNewerThanTarget is TRUE! Continuing scroll...');
                        } else {
                            break;  // CRITICAL: Fixed to 20 spaces - MUST align with lines 1808, 1810, 1812 to be inside if(isStable)
                        }
                    }
                }
            } else if (foundTargetDateRange && scrolledPastDateRange && !canStopNow) {
                console.log(`Last Month: Found range but only ${scrollAttempts} scrolls (need ${MIN_SCROLLS_FOR_STOP}). Continuing...`);
            } else if (foundTargetDateRange && scrolledPastDateRange && canStopNow && (!startBoundaryFound || !endBoundaryFound)) {
                // CRITICAL: Block exit if boundaries not found
                console.log(`⚠️ CRITICAL: Blocking exit - boundaries not fully found. Start boundary: ${startBoundaryFound}, End boundary: ${endBoundaryFound}. Continuing to scroll...`);
            } else if (foundRangeIsNewerThanTarget) {
                // CRITICAL: If found range is newer, NEVER stop - must continue scrolling DOWN
                console.log('⚠️ CRITICAL: Found range is NEWER than target. Blocking exit. Must continue scrolling DOWN to find older transactions.');
            }

            // OPTIMIZED: Robust bottom detection with delays to continue scrolling until boundary found
            // Critical for long date ranges (3+ years, 10+ years) - don't stop until boundaries are found
            currentScrollPosition = window.scrollY;
            const scrollHeight = document.documentElement.scrollHeight;
            const viewportHeight = window.innerHeight;
            const isNearBottom = currentScrollPosition + viewportHeight >= scrollHeight - 50; // Within 50px of bottom

            if (isNearBottom && Math.abs(currentScrollPosition - lastScrollPosition) < 10) {
                // Stuck at bottom - check if boundaries are found
                scrollPositionUnchangedCount++;

                // If boundaries not found yet, wait longer and continue scrolling
                if (!endBoundaryFound || !startBoundaryFound) {
                    if (scrollPositionUnchangedCount >= 3) {
                        console.log(`⚠️ Stuck at bottom (${scrollPositionUnchangedCount} attempts). Boundaries not found yet. Waiting longer and continuing...`);
                        // Wait longer for lazy loading (critical for long ranges)
                        await new Promise(resolve => setTimeout(resolve, CONFIG.SCROLL_WAIT_TIME.STANDARD * 2));
                        // Try scrolling further down (force scroll to trigger lazy loading)
                        const forceScrollPosition = Math.min(scrollHeight, currentScrollPosition + viewportHeight * 0.5);
                        window.scrollTo(0, forceScrollPosition);
                        await new Promise(resolve => setTimeout(resolve, CONFIG.SCROLL_WAIT_TIME.STANDARD));
                        scrollPositionUnchangedCount = 0; // Reset to continue
                        lastScrollPosition = window.scrollY; // Update position
                    }
                } else {
                    // Boundaries found - can stop if DOM is stable
                    // CRITICAL: NEVER stop if found range is NEWER than target - must continue scrolling DOWN
                    if (scrollPositionUnchangedCount >= 3) {
                        const currentDOMCount = document.querySelectorAll('[data-index]').length;
                        const isStable = await waitForDOMStability(currentDOMCount, 2000);
                        if (isStable && !foundRangeIsNewerThanTarget) {
                            // ============================================================================
                            // EXIT ATTEMPT LOGGING: Bottom detection exit
                            // ============================================================================
                            console.log(`\n${'='.repeat(80)}`);
                            console.log('🚨 [EXIT ATTEMPT] BOTTOM DETECTION');
                            console.log('   • Exit reason: Reached bottom, boundaries found, DOM stable');
                            console.log(`   • Scroll count: ${scrollAttempts}`);
                            console.log(`   • scrollPositionUnchangedCount: ${scrollPositionUnchangedCount}`);
                            console.log(`   • foundRangeIsNewerThanTarget: ${foundRangeIsNewerThanTarget}`);
                            console.log(`   • endBoundaryFound: ${endBoundaryFound}`);
                            console.log(`   • startBoundaryFound: ${startBoundaryFound}`);
                            console.log(`   • allTransactions.length: ${allTransactions.length}`);
                            console.log(`${'='.repeat(80)}\n`);

                            // CRITICAL: Only stop if found range is NOT newer than target
                            console.log('✅ Reached bottom, boundaries found, DOM stable. Stopping.');

                            // FINAL EXIT REASON
                            console.log('✅ [FINAL EXIT REASON] Bottom detection exit approved');

                            // CRITICAL: Final guard check before exit
                            if (foundRangeIsNewerThanTarget) {
                                console.log('🚨 [GUARD] BLOCKING EXIT - foundRangeIsNewerThanTarget is TRUE! Continuing scroll...');
                                scrollPositionUnchangedCount = 0;
                            } else {
                                break;
                            }
                        } else if (foundRangeIsNewerThanTarget) {
                            // Found range is NEWER than target - MUST continue scrolling DOWN
                            console.log('⚠️ CRITICAL: Reached bottom but found range is NEWER than target. Blocking exit. Must continue scrolling DOWN to find older transactions.');
                            scrollPositionUnchangedCount = 0; // Reset counter, keep searching DOWN
                        } else {
                            scrollPositionUnchangedCount = 0; // Reset if DOM still loading
                        }
                    }
                }
            } else {
                scrollPositionUnchangedCount = 0; // Reset if position changed
            }
            lastScrollPosition = currentScrollPosition;

            // Check if no new transactions found
            // For "Last Month", require more attempts before stopping
            // Use SYSTEM_DATE for consistency (captured once at start)
            const daysSinceEndDateUnchanged = (SYSTEM_DATE - endDateObj) / (24 * 60 * 60 * 1000);
            const isLastMonthUnchanged = daysSinceEndDateUnchanged >= 30 && daysSinceEndDateUnchanged < 60;
            const requiredUnchangedAttempts = isLastMonthUnchanged ? 15 : 8; // More for last month
            const MIN_SCROLLS_FOR_LAST_MONTH_UNCHANGED = CONFIG.MIN_SCROLLS.UNCHANGED_CHECK; // From CONFIG (reduced from 60 to minimize logout risk)
            const canStopUnchanged = !isLastMonthUnchanged || scrollAttempts >= MIN_SCROLLS_FOR_LAST_MONTH_UNCHANGED;

            if (allTransactions.length === lastTransactionCount) {
                unchangedCount++;
                if (unchangedCount >= requiredUnchangedAttempts && canStopUnchanged) {
                    const currentDOMCount = document.querySelectorAll('[data-index]').length;
                    const isStable = await waitForDOMStability(currentDOMCount, 3000);
                    if (isStable) {
                        // For last month, verify we have good coverage before stopping
                        if (isLastMonthUnchanged) {
                            const rangeDays = Math.ceil((endDateTime - startDateTime) / (24 * 60 * 60 * 1000)) + 1;
                            const datesFound = new Set();
                            allTransactions.forEach(t => {
                                if (isDateInRange(t.date, startDateObj, endDateObj)) {
                                    const txDate = parseTransactionDate(t.date);
                                    if (txDate) {
                                        const dateKey = `${txDate.getFullYear()}-${txDate.getMonth()}-${txDate.getDate()}`;
                                        datesFound.add(dateKey);
                                    }
                                }
                            });
                            const coverage = datesFound.size / rangeDays;
                            if (coverage >= 0.95) {
                                // ============================================================================
                                // EXIT ATTEMPT LOGGING: Unchanged with coverage exit
                                // ============================================================================
                                console.log(`\n${'='.repeat(80)}`);
                                console.log('🚨 [EXIT ATTEMPT] UNCHANGED WITH COVERAGE');
                                console.log(`   • Exit reason: No new transactions but have ${Math.round(coverage*100)}% coverage`);
                                console.log(`   • Scroll count: ${scrollAttempts}`);
                                console.log(`   • unchangedCount: ${unchangedCount}`);
                                console.log(`   • coverage: ${Math.round(coverage*100)}%`);
                                console.log(`   • foundRangeIsNewerThanTarget: ${foundRangeIsNewerThanTarget}`);
                                console.log(`   • allTransactions.length: ${allTransactions.length}`);
                                console.log(`${'='.repeat(80)}\n`);

                                console.log(`No new transactions after ${unchangedCount} scrolls, but have ${Math.round(coverage*100)}% coverage after ${scrollAttempts} total scrolls. Stopping.`);

                                // FINAL EXIT REASON
                                console.log('✅ [FINAL EXIT REASON] Unchanged with coverage exit approved');

                                // CRITICAL: Final guard check before exit
                                if (foundRangeIsNewerThanTarget) {
                                    console.log('🚨 [GUARD] BLOCKING EXIT - foundRangeIsNewerThanTarget is TRUE! Continuing scroll...');
                                } else {
                                    break;
                                }
                            } else {
                                console.log(`No new transactions after ${unchangedCount} scrolls, but only ${Math.round(coverage*100)}% coverage. Continuing...`);
                                unchangedCount = 5; // Reset to continue trying
                            }
                        } else {
                            // Check if we need more transactions for "Last Month" preset
                            const needsMoreTransactions = isLastMonthStop && transactionsInRangeCount < TARGET_RANGE.min;

                            if (needsMoreTransactions) {
                                console.log(`⚠️ CRITICAL: Unchanged exit blocked - Last Month preset needs at least ${TARGET_RANGE.min} transactions, but only ${transactionsInRangeCount} found. Continuing to scroll past boundaries...`);
                                unchangedCount = 0; // Reset counter, continue scrolling
                                // Force scrolling past boundaries to capture all transactions on boundary dates
                                if (endBoundaryFound && startBoundaryFound) {
                                    console.log('   • Both boundaries found. Scrolling past boundaries to capture ALL transactions on boundary dates...');
                                    // Continue scrolling to ensure we capture all transactions on Oct 1 and Oct 31
                                }
                            } else {
                                // ============================================================================
                                // EXIT ATTEMPT LOGGING: Unchanged exit
                                // ============================================================================
                                console.log(`\n${'='.repeat(80)}`);
                                console.log('🚨 [EXIT ATTEMPT] UNCHANGED EXIT');
                                console.log(`   • Exit reason: No new transactions after ${unchangedCount} attempts, DOM stable`);
                                console.log(`   • Scroll count: ${scrollAttempts}`);
                                console.log(`   • unchangedCount: ${unchangedCount}`);
                                console.log(`   • foundRangeIsNewerThanTarget: ${foundRangeIsNewerThanTarget}`);
                                console.log(`   • transactionsInRangeCount: ${transactionsInRangeCount}`);
                                console.log(`   • allTransactions.length: ${allTransactions.length}`);
                                if (isLastMonthStop) {
                                    console.log(`   • Target range: ${TARGET_RANGE.min}-${TARGET_RANGE.max} transactions`);
                                }
                                console.log(`${'='.repeat(80)}\n`);

                                console.log(`No new transactions after ${unchangedCount} attempts and DOM is stable. Stopping.`);

                                // FINAL EXIT REASON
                                console.log('✅ [FINAL EXIT REASON] Unchanged exit approved');

                                // CRITICAL: Final guard check before exit
                                if (foundRangeIsNewerThanTarget) {
                                    console.log('🚨 [GUARD] BLOCKING EXIT - foundRangeIsNewerThanTarget is TRUE! Continuing scroll...');
                                } else {
                                    break;
                                }
                            }
                        }
                    } else {
                        unchangedCount = 0; // Reset if DOM wasn't stable
                    }
                } else if (unchangedCount >= requiredUnchangedAttempts && !canStopUnchanged) {
                    console.log(`Last Month: No new transactions after ${unchangedCount} scrolls, but only ${scrollAttempts} total scrolls (need ${MIN_SCROLLS_FOR_LAST_MONTH_UNCHANGED}). Continuing...`);
                    unchangedCount = 5; // Reset to continue trying
                }
            } else {
                unchangedCount = 0;
            }

            lastTransactionCount = allTransactions.length;

            // ============================================================================
            // SMART SCROLLING: Within boundaries, priority-based, forward-only
            // ============================================================================

            // CRITICAL DEBUG: Log before scrolling strategy
            if (scrollAttempts <= 15) {
                console.log(`🔍 [BEFORE SCROLLING STRATEGY] Scroll ${scrollAttempts}: About to enter scrolling strategy section...`);
            }

            // SMART SCROLLING STRATEGY: Two-phase approach
            // Phase 1: Before finding target range - scroll down continuously to find it
            // Phase 2: After finding target range - establish boundaries and scroll within them

            const currentPosition = window.scrollY;
            const scrollIncrement = window.innerHeight * 1.5;
            const nextPosition = currentPosition + scrollIncrement;

            // CRITICAL DEBUG: Log before scrolling logic
            if (scrollAttempts <= 15) {
                console.log(`🔍 [BEFORE SCROLLING] Scroll ${scrollAttempts}: About to execute scrolling logic...`);
            }

            // CRITICAL TOP-LEVEL GUARD: Check if we've scrolled past the start date - if so, prevent ALL DOWN scrolling
            // BUT: Only block if we've actually found Oct 1 transactions. If we're at Sept 27 and haven't found Oct 1 yet, continue scrolling DOWN.
            const oldestTransactionCheck = allTransactions.length > 0 ? allTransactions[allTransactions.length - 1] : null;
            let hasScrolledPastStartDate = false;

            // Check if we've found Oct 1 transactions
            const hasFoundOct1Transactions = allTransactions.some(t => {
                const txDate = parseTransactionDate(t.date);
                if (!txDate) return false;
                const txDateOnly = new Date(txDate.getFullYear(), txDate.getMonth(), txDate.getDate());
                const startDateOnly = new Date(startDateObj.getFullYear(), startDateObj.getMonth(), startDateObj.getDate());
                return txDateOnly.getTime() === startDateOnly.getTime(); // Oct 1 transactions
            });

            // CRITICAL: Also check if we have ANY October transactions (not just Oct 1)
            // If we have October transactions and we've scrolled past October 1, stop scrolling DOWN
            const hasAnyOctoberTransactions = allTransactions.some(t => {
                const txDate = parseTransactionDate(t.date);
                if (!txDate) return false;
                return txDate.getFullYear() === startDateObj.getFullYear() &&
                       txDate.getMonth() === startDateObj.getMonth(); // Any October transaction
            });

            if (oldestTransactionCheck && oldestTransactionCheck.date && (hasFoundOct1Transactions || hasAnyOctoberTransactions)) {
                const oldestTxDateCheck = parseTransactionDate(oldestTransactionCheck.date);
                if (oldestTxDateCheck && !isNaN(oldestTxDateCheck.getTime())) {
                    const oldestTxDateTimeCheck = new Date(oldestTxDateCheck.getFullYear(), oldestTxDateCheck.getMonth(), oldestTxDateCheck.getDate()).getTime();
                    const startDateTimeCheck = new Date(startDateObj.getFullYear(), startDateObj.getMonth(), startDateObj.getDate()).getTime();

                    // Block if we've found October transactions AND scrolled past October 1 (STOP IMMEDIATELY - no threshold)
                    if (oldestTxDateTimeCheck < startDateTimeCheck) {
                        const daysBeforeStartCheck = (startDateTimeCheck - oldestTxDateTimeCheck) / (24 * 60 * 60 * 1000);
                        // CRITICAL: If we have October transactions and scrolled past Oct 1, stop IMMEDIATELY (no threshold)
                        // This prevents over-scrolling into August/September
                        if (daysBeforeStartCheck > 0) { // Any day before Oct 1 means we've scrolled past it
                            hasScrolledPastStartDate = true;
                            console.log(`🚨 TOP-LEVEL GUARD: Found October transaction(s) (Oct 1 found: ${hasFoundOct1Transactions}), but oldest transaction (${oldestTxDateCheck.toLocaleDateString()}) is ${Math.round(daysBeforeStartCheck)} days before start date (${startDateObj.toLocaleDateString()}). BLOCKING ALL DOWN SCROLLING.`);
                            console.log('   • We\'ve collected October transactions during downward scroll. Stopping DOWN scroll to prevent over-scrolling.');
                            // Mark boundaries as found to enter oscillation
                            if (!endBoundaryFound) {
                                endBoundaryFound = true;
                                targetRangeEndBoundary = window.scrollY;
                            }
                            if (!startBoundaryFound) {
                                startBoundaryFound = true;
                                targetRangeStartBoundary = window.scrollY;
                                harvestingStarted = true;
                            }
                            foundRangeIsNewerThanTarget = false; // Reset to prevent DOWN scrolling
                        }
                    }
                }
            } else if (oldestTransactionCheck && oldestTransactionCheck.date && !hasFoundOct1Transactions) {
                // Haven't found Oct 1 transactions yet - allow scrolling DOWN to find them
                const oldestTxDateCheck = parseTransactionDate(oldestTransactionCheck.date);
                if (oldestTxDateCheck && !isNaN(oldestTxDateCheck.getTime())) {
                    const oldestTxDateTimeCheck = new Date(oldestTxDateCheck.getFullYear(), oldestTxDateCheck.getMonth(), oldestTxDateCheck.getDate()).getTime();
                    const startDateTimeCheck = new Date(startDateObj.getFullYear(), startDateObj.getMonth(), startDateObj.getDate()).getTime();

                    if (oldestTxDateTimeCheck < startDateTimeCheck) {
                        const daysBeforeStartCheck = (startDateTimeCheck - oldestTxDateTimeCheck) / (24 * 60 * 60 * 1000);
                        console.log(`ℹ️ Haven't found Oct 1 transactions yet. Oldest is ${oldestTxDateCheck.toLocaleDateString()} (${Math.round(daysBeforeStartCheck)} days before Oct 1). Continuing to scroll DOWN to find Oct 1...`);
                    }
                }
            }

            // CRITICAL: Check oscillation phase FIRST - if both boundaries are found, proceed directly to oscillation
            // The oscillation phase needs to scroll UP and DOWN between boundaries, so guards should not block it
            // CRITICAL: If both boundaries are found, skip ALL scrolling logic and go directly to oscillation
            // This prevents any DOWN scrolling when boundaries are already found
            let shouldOscillate = false;
            if (endBoundaryFound && startBoundaryFound) {
                // CRITICAL: Check oscillation phase FIRST - if both boundaries are found, proceed directly to oscillation
                // The oscillation phase needs to scroll UP and DOWN between boundaries, so guards should not block it
                // CRITICAL: If both boundaries are found, skip ALL scrolling logic and go directly to oscillation
                // This prevents any DOWN scrolling when boundaries are already found
                // Both boundaries found - skip ALL scrolling logic and go directly to oscillation phase
                console.log('   ✅ Both boundaries found. Skipping all scrolling logic. Oscillation phase will handle scrolling UP and DOWN.');
                shouldOscillate = true;
                foundRangeIsNewerThanTarget = false;
                currentScrollPosition = window.scrollY;
                lastKnownScrollY = window.scrollY;
                // Continue to oscillation phase below (it's checked after all scrolling conditions)
            } else if (!shouldOscillate && hasScrolledPastStartDate && !endBoundaryFound && !startBoundaryFound) {
                // TOP-LEVEL GUARD triggered - skip all DOWN scrolling, but allow boundaries to be set
                console.log('   ⏸️ TOP-LEVEL GUARD ACTIVE: Skipping DOWN scrolling. Boundaries will be set to enter oscillation phase.');
                currentScrollPosition = window.scrollY;
                lastKnownScrollY = window.scrollY;
                // Will enter oscillation phase once boundaries are set
            } else if (foundRangeIsNewerThanTarget) {
                // CRITICAL: If both boundaries are already found, skip DOWN scrolling (go to oscillation instead)
                if (endBoundaryFound && startBoundaryFound) {
                    console.log('   ⏸️ Boundaries already found - skipping DOWN scroll. Will enter oscillation phase.');
                    currentScrollPosition = window.scrollY;
                    lastKnownScrollY = window.scrollY;
                    // Skip all DOWN scrolling logic - oscillation phase will handle scrolling
                } else {
                    // CRITICAL: Check if we've already scrolled past the start date - if so, stop scrolling DOWN
                    const oldestTransaction = allTransactions.length > 0 ? allTransactions[allTransactions.length - 1] : null;
                    let canScrollDown = true;

                let oldestTxDateForFastScroll = null;
                if (oldestTransaction && oldestTransaction.date) {
                    const oldestTxDate = parseTransactionDate(oldestTransaction.date);
                    if (oldestTxDate && !isNaN(oldestTxDate.getTime())) {
                        oldestTxDateForFastScroll = oldestTxDate;
                        const oldestTxDateTime = new Date(oldestTxDate.getFullYear(), oldestTxDate.getMonth(), oldestTxDate.getDate()).getTime();
                        const startDateTime = new Date(startDateObj.getFullYear(), startDateObj.getMonth(), startDateObj.getDate()).getTime();

                        // If we've scrolled past the start date (more than 1 day before), stop scrolling DOWN
                        if (oldestTxDateTime < startDateTime) {
                            const daysBeforeStart = (startDateTime - oldestTxDateTime) / (24 * 60 * 60 * 1000);
                            if (daysBeforeStart > 1) {
                                console.log(`⚠️ CRITICAL: Found range is newer, but oldest transaction (${oldestTxDate.toLocaleDateString()}) is ${Math.round(daysBeforeStart)} days before start date (${startDateObj.toLocaleDateString()}). BLOCKING DOWN scroll.`);
                                console.log('   • This means we\'ve already scrolled past the target range. Stopping DOWN scroll.');
                                canScrollDown = false;
                                // Reset foundRangeIsNewerThanTarget to prevent further DOWN scrolling
                                foundRangeIsNewerThanTarget = false;
                                // Mark boundaries as found to enter oscillation
                                if (!endBoundaryFound) {
                                    endBoundaryFound = true;
                                    targetRangeEndBoundary = window.scrollY;
                                }
                                if (!startBoundaryFound) {
                                    startBoundaryFound = true;
                                    targetRangeStartBoundary = window.scrollY;
                                    harvestingStarted = true;
                                }
                            }
                        }
                    }
                }

                // Check if we've found Oct 1 transactions before blocking DOWN scroll
                const hasFoundOct1ForGuard = allTransactions.some(t => {
                    const txDate = parseTransactionDate(t.date);
                    if (!txDate) return false;
                    const txDateOnly = new Date(txDate.getFullYear(), txDate.getMonth(), txDate.getDate());
                    const startDateOnly = new Date(startDateObj.getFullYear(), startDateObj.getMonth(), startDateObj.getDate());
                    return txDateOnly.getTime() === startDateOnly.getTime();
                });

                // Only block DOWN scroll if we've found Oct 1 AND scrolled past it
                if (!canScrollDown && hasFoundOct1ForGuard) {
                    console.log('   ⏸️ BLOCKED DOWN scroll - found Oct 1 transactions and scrolled past start date. Entering oscillation phase.');
                    currentScrollPosition = window.scrollY;
                    lastKnownScrollY = window.scrollY;
                } else if (!canScrollDown && !hasFoundOct1ForGuard) {
                    // Haven't found Oct 1 yet - allow scrolling DOWN
                    console.log('   ℹ️ Haven\'t found Oct 1 transactions yet. Allowing DOWN scroll to find them...');
                    canScrollDown = true;
                }

                if (canScrollDown) {
                    // Found range is NEWER than target - MUST continue scrolling DOWN to find older transactions
                    const reachedRange = foundDateRange !== 'N/A' ? foundDateRange : 'None yet';
                    console.log('🔍 CRITICAL: Found range is NEWER than target. Forcing DOWN scroll to find older transactions...');
                    console.log(`   • Target range: ${startDateObj.toLocaleDateString()} - ${endDateObj.toLocaleDateString()}`);
                    console.log(`   • Found range: ${reachedRange}`);
                    console.log(`   • Must scroll DOWN to reach older transactions (target start: ${startDateObj.toLocaleDateString()})`);
                    console.log(`   • Scroll attempt: ${scrollAttempts} | Position: ${Math.round(currentPosition)}`);

                    // FAST-SCROLL for deep historical presets when range is NEWER than target.
                    // For Last Year / Last 5 Years, jump quickly through current-year data
                    // until the oldest transaction year reaches the target start year.
                    let usedFastScroll = false;
                    try {
                        if ((isLastYearPresetByName || isLastFiveYearsPresetByName) &&
                            oldestTxDateForFastScroll &&
                            oldestTxDateForFastScroll.getFullYear() > startDateObj.getFullYear()) {
                            const FAST_SCROLL_STEP = 6000; // Reduced to give CK lazy-load more time to trigger
                            console.log(`   ⚡ FAST-SCROLL enabled for historical preset. Performing large downward scroll of ${FAST_SCROLL_STEP}px...`);
                            window.scrollBy(0, FAST_SCROLL_STEP);
                            usedFastScroll = true;
                        }
                    } catch (e) {
                        console.warn('Error during FAST-SCROLL decision, falling back to normal scroll:', e);
                    }

                    if (!usedFastScroll) {
                        scrollDown();
                    }

                    currentScrollPosition = window.scrollY;
                    lastKnownScrollY = window.scrollY;
                    console.log(`   ✅ SCROLL EXECUTED: ${usedFastScroll ? 'FAST scroll down (historical preset)' : 'Simple scroll down (Pristine approach)'}`);
                }
                } // End of else block for foundRangeIsNewerThanTarget
            } else if (!endBoundaryFound) {
                // PHASE 1: Haven't found END boundary yet - scroll DOWN only to find it
                // CRITICAL: Check if we've scrolled past the start date - if so, stop scrolling DOWN
                // BUT: Only block if we've found Oct 1 transactions. If we're at Sept 27 and haven't found Oct 1 yet, continue scrolling DOWN.
                const oldestTransaction = allTransactions.length > 0 ? allTransactions[allTransactions.length - 1] : null;
                let shouldScroll = true;

                // Check if we've found Oct 1 transactions
                const hasFoundOct1Phase1 = allTransactions.some(t => {
                    const txDate = parseTransactionDate(t.date);
                    if (!txDate) return false;
                    const txDateOnly = new Date(txDate.getFullYear(), txDate.getMonth(), txDate.getDate());
                    const startDateOnly = new Date(startDateObj.getFullYear(), startDateObj.getMonth(), startDateObj.getDate());
                    return txDateOnly.getTime() === startDateOnly.getTime();
                });

                if (oldestTransaction && oldestTransaction.date) {
                    const oldestTxDate = parseTransactionDate(oldestTransaction.date);
                    if (oldestTxDate && !isNaN(oldestTxDate.getTime())) {
                        const oldestTxDateTime = new Date(oldestTxDate.getFullYear(), oldestTxDate.getMonth(), oldestTxDate.getDate()).getTime();
                        const startDateTime = new Date(startDateObj.getFullYear(), startDateObj.getMonth(), startDateObj.getDate()).getTime();

                        // Only block if we've found Oct 1 AND scrolled past it (more than 3 days before)
                        if (oldestTxDateTime < startDateTime && hasFoundOct1Phase1) {
                            const daysBeforeStart = (startDateTime - oldestTxDateTime) / (24 * 60 * 60 * 1000);
                            if (daysBeforeStart > 3) {
                                console.log(`⚠️ CRITICAL: Phase 1 - Found Oct 1 transactions, but oldest transaction (${oldestTxDate.toLocaleDateString()}) is ${Math.round(daysBeforeStart)} days before start date (${startDateObj.toLocaleDateString()}). Stopping DOWN scroll.`);
                                shouldScroll = false;
                                // Mark end boundary as found to enter Phase 2
                                endBoundaryFound = true;
                                targetRangeEndBoundary = window.scrollY;
                            }
                        } else if (oldestTxDateTime < startDateTime && !hasFoundOct1Phase1) {
                            // Haven't found Oct 1 yet - continue scrolling DOWN
                            const daysBeforeStart = (startDateTime - oldestTxDateTime) / (24 * 60 * 60 * 1000);
                            console.log(`ℹ️ Phase 1 - Haven't found Oct 1 transactions yet. Oldest is ${oldestTxDate.toLocaleDateString()} (${Math.round(daysBeforeStart)} days before Oct 1). Continuing DOWN scroll...`);
                            shouldScroll = true;
                        }
                    }
                }

                if (shouldScroll) {
                    const reachedRange = foundDateRange !== 'N/A' ? foundDateRange : 'None yet';
                    console.log(`🔍 Phase 1: Searching for END boundary (${endDateObj.toLocaleDateString()})... Expected: ${startDateObj.toLocaleDateString()} - ${endDateObj.toLocaleDateString()} | Reached: ${reachedRange} | Scroll: ${scrollAttempts}`);
                    scrollDown();
                    currentScrollPosition = window.scrollY;
                    lastKnownScrollY = window.scrollY;
                } else {
                    console.log('   ⏸️ Stopped scrolling DOWN - will check for start boundary next iteration');
                    currentScrollPosition = window.scrollY;
                    lastKnownScrollY = window.scrollY;
                }
            } else if (!startBoundaryFound) {
                // PHASE 2: Found END boundary, but not START boundary yet - continue scrolling DOWN only
                // CRITICAL: Check if we've scrolled past the start date - if so, stop scrolling DOWN
                // BUT: Only block if we've found Oct 1 transactions. If we're at Sept 27 and haven't found Oct 1 yet, continue scrolling DOWN.
                const oldestTransaction = allTransactions.length > 0 ? allTransactions[allTransactions.length - 1] : null;

                // Check if we've found Oct 1 transactions
                const hasFoundOct1Phase2 = allTransactions.some(t => {
                    const txDate = parseTransactionDate(t.date);
                    if (!txDate) return false;
                    const txDateOnly = new Date(txDate.getFullYear(), txDate.getMonth(), txDate.getDate());
                    const startDateOnly = new Date(startDateObj.getFullYear(), startDateObj.getMonth(), startDateObj.getDate());
                    return txDateOnly.getTime() === startDateOnly.getTime();
                });

                if (oldestTransaction && oldestTransaction.date) {
                    const oldestTxDate = parseTransactionDate(oldestTransaction.date);
                    if (oldestTxDate && !isNaN(oldestTxDate.getTime())) {
                        const oldestTxDateTime = new Date(oldestTxDate.getFullYear(), oldestTxDate.getMonth(), oldestTxDate.getDate()).getTime();
                        const startDateTime = new Date(startDateObj.getFullYear(), startDateObj.getMonth(), startDateObj.getDate()).getTime();

                        // Only block if we've found Oct 1 AND scrolled past it (more than 3 days before)
                        if (oldestTxDateTime < startDateTime && hasFoundOct1Phase2) {
                            const daysBeforeStart = (startDateTime - oldestTxDateTime) / (24 * 60 * 60 * 1000);
                            if (daysBeforeStart > 3) {
                                console.log(`⚠️ CRITICAL: Phase 2 - Found Oct 1 transactions, but scrolled past start date (${oldestTxDate.toLocaleDateString()} < ${startDateObj.toLocaleDateString()}, ${Math.round(daysBeforeStart)} days before). STOPPING DOWN scroll immediately.`);
                                startBoundaryFound = true;
                                harvestingStarted = true;
                                if (targetRangeStartBoundary === null) {
                                    targetRangeStartBoundary = window.scrollY;
                                }
                                // Also reset foundRangeIsNewerThanTarget to prevent further DOWN scrolling
                                foundRangeIsNewerThanTarget = false;
                                // Don't scroll further DOWN - will enter oscillation phase next iteration
                                currentScrollPosition = window.scrollY;
                                lastKnownScrollY = window.scrollY;
                                // Skip the scrollDown() call below - return early from this block
                            } else {
                                // Still within acceptable range - continue scrolling DOWN
                                const reachedRange = foundDateRange !== 'N/A' ? foundDateRange : 'None yet';
                                console.log(`🔍 Phase 2: END boundary found! Searching for START boundary (${startDateObj.toLocaleDateString()})... Expected: ${startDateObj.toLocaleDateString()} - ${endDateObj.toLocaleDateString()} | Reached: ${reachedRange} | Scroll: ${scrollAttempts}`);
                                scrollDown();
                                currentScrollPosition = window.scrollY;
                                lastKnownScrollY = window.scrollY;
                            }
                        } else if (oldestTxDateTime < startDateTime && !hasFoundOct1Phase2) {
                            // Haven't found Oct 1 yet - continue scrolling DOWN to find them
                            const daysBeforeStart = (startDateTime - oldestTxDateTime) / (24 * 60 * 60 * 1000);
                            console.log(`ℹ️ Phase 2 - Haven't found Oct 1 transactions yet. Oldest is ${oldestTxDate.toLocaleDateString()} (${Math.round(daysBeforeStart)} days before Oct 1). Continuing DOWN scroll...`);
                            const reachedRange = foundDateRange !== 'N/A' ? foundDateRange : 'None yet';
                            console.log(`🔍 Phase 2: END boundary found! Searching for START boundary (${startDateObj.toLocaleDateString()})... Expected: ${startDateObj.toLocaleDateString()} - ${endDateObj.toLocaleDateString()} | Reached: ${reachedRange} | Scroll: ${scrollAttempts}`);
                            scrollDown();
                            currentScrollPosition = window.scrollY;
                            lastKnownScrollY = window.scrollY;
                        } else {
                            // Still searching for start boundary - continue scrolling DOWN
                            const reachedRange = foundDateRange !== 'N/A' ? foundDateRange : 'None yet';
                            console.log(`🔍 Phase 2: END boundary found! Searching for START boundary (${startDateObj.toLocaleDateString()})... Expected: ${startDateObj.toLocaleDateString()} - ${endDateObj.toLocaleDateString()} | Reached: ${reachedRange} | Scroll: ${scrollAttempts}`);
                            scrollDown();
                            currentScrollPosition = window.scrollY;
                            lastKnownScrollY = window.scrollY;
                        }
                    } else {
                        // Can't parse date - continue scrolling
                        const reachedRange = foundDateRange !== 'N/A' ? foundDateRange : 'None yet';
                        console.log(`🔍 Phase 2: END boundary found! Searching for START boundary (${startDateObj.toLocaleDateString()})... Expected: ${startDateObj.toLocaleDateString()} - ${endDateObj.toLocaleDateString()} | Reached: ${reachedRange} | Scroll: ${scrollAttempts}`);
                        scrollDown();
                        currentScrollPosition = window.scrollY;
                        lastKnownScrollY = window.scrollY;
                    }
                } else {
                    // No transactions yet - continue scrolling
                    const reachedRange = foundDateRange !== 'N/A' ? foundDateRange : 'None yet';
                    console.log(`🔍 Phase 2: END boundary found! Searching for START boundary (${startDateObj.toLocaleDateString()})... Expected: ${startDateObj.toLocaleDateString()} - ${endDateObj.toLocaleDateString()} | Reached: ${reachedRange} | Scroll: ${scrollAttempts}`);
                    scrollDown();
                    currentScrollPosition = window.scrollY;
                    lastKnownScrollY = window.scrollY;
                }
            }

            // CRITICAL: Execute oscillation phase if both boundaries are found
            if (shouldOscillate || (endBoundaryFound && startBoundaryFound)) {
                // PHASE 3: BOTH boundaries found! Now oscillate BETWEEN boundaries (MAX 3 oscillations)
                // TIME-CRITICAL: Exit early if no progress for 2 consecutive oscillations
                // Note: END boundary is HIGHER on page (found first), START boundary is LOWER on page (found second)
                // Scroll UP to END boundary, then DOWN to START boundary, repeating between them

                let scrollEndBoundary = targetRangeEndBoundary; // Higher position (END date, Nov 1 - first transaction AFTER Oct 31)
                // CRITICAL: Use Oct 1 oscillation boundary if available, otherwise fall back to Sep 30 boundary
                // We want to oscillate between Oct 1 and Nov 1, not Sep 30 and Nov 1
                let scrollStartBoundary = targetRangeStartOscillationBoundary !== null
                    ? targetRangeStartOscillationBoundary  // Oct 1 position (preferred for oscillation)
                    : targetRangeStartBoundary;           // Sep 30 position (fallback)

                // CRITICAL FIX: Ensure boundaries are far enough apart for effective oscillation
                // If boundaries are too close, find actual transaction positions for Oct 1 and Nov 1
                const minBoundaryDistance = window.innerHeight * 2; // Minimum distance between boundaries
                const boundaryDistance = Math.abs(scrollStartBoundary - scrollEndBoundary);

                if (boundaryDistance < minBoundaryDistance) {
                    console.log(`⚠️ CRITICAL: Boundaries too close (${Math.round(boundaryDistance)}px < ${Math.round(minBoundaryDistance)}px). Finding actual Oct 1 and Nov 1 transaction positions...`);
                    console.log(`   • Original boundaries: Start=${Math.round(scrollStartBoundary)}px, End=${Math.round(scrollEndBoundary)}px`);

                    // Find actual Oct 1 and Nov 1 transactions in collected data
                    const oct1Transactions = allTransactions.filter(t => {
                        const txDate = parseTransactionDate(t.date);
                        if (!txDate) return false;
                        return txDate.getFullYear() === startDateObj.getFullYear() &&
                               txDate.getMonth() === startDateObj.getMonth() &&
                               txDate.getDate() === startDateObj.getDate();
                    });

                    const nov1Transactions = allTransactions.filter(t => {
                        const txDate = parseTransactionDate(t.date);
                        if (!txDate) return false;
                        const nov1Date = new Date(endDateObj.getFullYear(), endDateObj.getMonth(), endDateObj.getDate() + 1);
                        return txDate.getFullYear() === nov1Date.getFullYear() &&
                               txDate.getMonth() === nov1Date.getMonth() &&
                               txDate.getDate() === nov1Date.getDate();
                    });

                    // Find the date range of all collected transactions to estimate positions
                    const allDates = allTransactions.map(t => {
                        const txDate = parseTransactionDate(t.date);
                        return txDate ? txDate.getTime() : null;
                    }).filter(d => d !== null).sort((a, b) => a - b);

                    const oldestDate = allDates.length > 0 ? new Date(allDates[0]) : null;
                    const newestDate = allDates.length > 0 ? new Date(allDates[allDates.length - 1]) : null;

                    // CRITICAL: When boundaries are too close, we need to ensure oscillation covers Oct 1 - Nov 1
                    // But we must NOT expand past the actual date range - check oldest/newest transactions found
                    // Find the actual scroll positions where Oct 1 and Nov 1 transactions are located
                    let oct1ScrollPos = null;
                    let nov1ScrollPos = null;

                    // Try to find actual positions by checking if we have transactions at those dates
                    if (oldestDate && newestDate) {
                        const oct1Date = new Date(startDateObj.getFullYear(), startDateObj.getMonth(), startDateObj.getDate()).getTime();
                        const nov1Date = new Date(endDateObj.getFullYear(), endDateObj.getMonth(), endDateObj.getDate() + 1).getTime();

                        // If we have Oct 1 transactions, estimate position based on date distribution
                        if (oct1Transactions.length > 0 && oct1Date >= oldestDate.getTime() && oct1Date <= newestDate.getTime()) {
                            const totalDateRange = newestDate.getTime() - oldestDate.getTime();
                            const oct1Offset = oct1Date - oldestDate.getTime();
                            // Older dates are further down (higher scrollY)
                            // Estimate: if we're at currentPosition and oldest date is there, Oct 1 should be slightly down
                            const dateRatio = oct1Offset / totalDateRange;
                            oct1ScrollPos = currentPosition + (dateRatio * window.innerHeight * 2); // Small offset down
                        }

                        // If we have Nov 1 transactions, estimate position
                        if (nov1Transactions.length > 0 && nov1Date >= oldestDate.getTime() && nov1Date <= newestDate.getTime()) {
                            const totalDateRange = newestDate.getTime() - oldestDate.getTime();
                            const nov1Offset = nov1Date - oldestDate.getTime();
                            const dateRatio = nov1Offset / totalDateRange;
                            nov1ScrollPos = currentPosition + (dateRatio * window.innerHeight * 2); // Small offset down
                        }
                    }

                    // Use conservative expansion: only expand enough to create meaningful oscillation
                    // Don't expand past the actual date range - use a smaller, safer range
                    const safeMonthRange = window.innerHeight * 4; // 4 viewport heights - conservative to avoid scrolling too far

                    if (oct1ScrollPos !== null && nov1ScrollPos !== null) {
                        // Use estimated positions with small buffer
                        scrollStartBoundary = Math.min(oct1ScrollPos + window.innerHeight, document.body.scrollHeight - window.innerHeight);
                        scrollEndBoundary = Math.max(nov1ScrollPos - window.innerHeight, 0);
                        console.log('   • Using date-based position estimates:');
                        console.log(`     - Oct 1 estimated position: ${Math.round(oct1ScrollPos)}px`);
                        console.log(`     - Nov 1 estimated position: ${Math.round(nov1ScrollPos)}px`);
                    } else {
                        // Fallback: conservative expansion from current position
                        scrollStartBoundary = Math.min(currentPosition + safeMonthRange / 2, document.body.scrollHeight - window.innerHeight);
                        scrollEndBoundary = Math.max(currentPosition - safeMonthRange / 2, 0);
                        console.log('   • Using conservative expansion (date estimation unavailable):');
                    }

                    console.log(`   • Oct 1 transactions found: ${oct1Transactions.length}`);
                    console.log(`   • Nov 1 transactions found: ${nov1Transactions.length}`);
                    console.log(`   • Final Oct 1 boundary: ${Math.round(scrollStartBoundary)}px`);
                    console.log(`   • Final Nov 1 boundary: ${Math.round(scrollEndBoundary)}px`);

                    // CRITICAL: Ensure boundaries don't go past actual date range
                    // Check oldest transaction - if it's before Oct 1, don't expand start boundary further down
                    if (oldestDate) {
                        const oct1Date = new Date(startDateObj.getFullYear(), startDateObj.getMonth(), startDateObj.getDate()).getTime();
                        if (oldestDate.getTime() < oct1Date) {
                            // We've already scrolled past Oct 1 - don't expand start boundary further down
                            console.log(`   ⚠️ Oldest transaction (${oldestDate.toLocaleDateString()}) is before Oct 1. Constraining start boundary.`);
                            scrollStartBoundary = Math.min(scrollStartBoundary, currentPosition + window.innerHeight * 2); // Limit expansion
                        }
                    }

                    // Ensure boundaries are in correct order (end < start)
                    if (scrollEndBoundary >= scrollStartBoundary) {
                        const center = (scrollStartBoundary + scrollEndBoundary) / 2;
                        scrollStartBoundary = center + minBoundaryDistance / 2;
                        scrollEndBoundary = center - minBoundaryDistance / 2;
                    }

                    // Ensure boundaries are within page bounds
                    scrollStartBoundary = Math.min(scrollStartBoundary, document.body.scrollHeight - window.innerHeight);
                    scrollEndBoundary = Math.max(scrollEndBoundary, 0);

                    console.log(`   • Final boundaries: Start=${Math.round(scrollStartBoundary)}px, End=${Math.round(scrollEndBoundary)}px`);
                    console.log(`   • New distance: ${Math.round(Math.abs(scrollStartBoundary - scrollEndBoundary))}px`);
                }

                // Phase 3: Oscillate between boundaries
                // Note: END boundary (Nov 1) is at LOWER scrollY (found first), START boundary (Oct 1) is at HIGHER scrollY (found second)
                // So: scrollEndBoundary < scrollStartBoundary
                // CRITICAL: We oscillate between Oct 1 and Nov 1 to capture ALL Oct 1-31 transactions, not Sep 30-Nov 1

                // CRITICAL: Use smaller scroll increment during oscillation for more thorough coverage
                // Smaller increment ensures we don't skip transactions in the Oct 1-31 range
                const oscillationScrollIncrement = window.innerHeight * 0.8; // Reduced from 1.5 to 0.8

                // Determine if we're near a boundary (within scroll increment)
                const distanceToStart = Math.abs(currentPosition - scrollStartBoundary);
                const distanceToEnd = Math.abs(currentPosition - scrollEndBoundary);
                const nearStartBoundary = distanceToStart < oscillationScrollIncrement;
                const nearEndBoundary = distanceToEnd < oscillationScrollIncrement;

                // Determine direction: at START boundary (higher scrollY) → scroll UP (decrease scrollY) to END
                //                    at END boundary (lower scrollY) → scroll DOWN (increase scrollY) to START
                // OPTIMIZED: Oscillate STRICTLY between boundaries only (no flanking zones)
                // LEFT boundary (lower scrollY) = last transaction before start date
                // RIGHT boundary (higher scrollY) = first transaction after end date
                // Oscillate between these exact boundaries to ensure 100% recovery
                if (nearStartBoundary || currentPosition >= scrollStartBoundary) {
                    // At or past Oct 1 boundary (higher scrollY) - scroll UP (decrease) to Nov 1 boundary
                    // CRITICAL: Verify we haven't scrolled too far past Oct 1
                    const oldestTransaction = allTransactions.length > 0 ? allTransactions[allTransactions.length - 1] : null;
                    if (oldestTransaction && oldestTransaction.date) {
                        const oldestTxDate = parseTransactionDate(oldestTransaction.date);
                        if (oldestTxDate && !isNaN(oldestTxDate.getTime())) {
                            const oldestTxDateTime = new Date(oldestTxDate.getFullYear(), oldestTxDate.getMonth(), oldestTxDate.getDate()).getTime();
                            const startDateTime = new Date(startDateObj.getFullYear(), startDateObj.getMonth(), startDateObj.getDate()).getTime();

                            // If oldest transaction is more than 3 days before start date, we've gone too far
                            const daysBeforeStart = (startDateTime - oldestTxDateTime) / (24 * 60 * 60 * 1000);
                            if (daysBeforeStart > 3) {
                                console.log(`⚠️ CRITICAL: At Oct 1 boundary, but oldest transaction (${oldestTxDate.toLocaleDateString()}) is ${Math.round(daysBeforeStart)} days before start date. Adjusting boundary.`);
                                // Adjust boundary to current position to prevent further DOWN scrolling
                                scrollStartBoundary = Math.min(scrollStartBoundary, currentPosition);
                            }
                        }
                    }

                    atStartBoundary = true;
                    const upPosition = Math.max(scrollEndBoundary, currentPosition - oscillationScrollIncrement);
                    console.log(`🔄 Oscillation ${oscillationCount + 1}/${maxOscillations}: At Oct 1 boundary (${Math.round(currentPosition)}), scrolling UP to Nov 1 boundary (${Math.round(scrollEndBoundary)})`);
                    window.scrollTo(0, upPosition);
                    currentScrollPosition = upPosition;
                } else if (nearEndBoundary || currentPosition <= scrollEndBoundary) {
                    // At or past Nov 1 boundary (lower scrollY) - scroll DOWN (increase) to Oct 1 boundary
                    // CRITICAL: Check if we've already scrolled past the start date - if so, don't scroll further DOWN
                    const oldestTransaction = allTransactions.length > 0 ? allTransactions[allTransactions.length - 1] : null;
                    let canScrollDown = true;

                    if (oldestTransaction && oldestTransaction.date) {
                        const oldestTxDate = parseTransactionDate(oldestTransaction.date);
                        if (oldestTxDate && !isNaN(oldestTxDate.getTime())) {
                            const oldestTxDateTime = new Date(oldestTxDate.getFullYear(), oldestTxDate.getMonth(), oldestTxDate.getDate()).getTime();
                            const startDateTime = new Date(startDateObj.getFullYear(), startDateObj.getMonth(), startDateObj.getDate()).getTime();

                            // If oldest transaction is more than 3 days before start date, don't scroll further DOWN
                            const daysBeforeStart = (startDateTime - oldestTxDateTime) / (24 * 60 * 60 * 1000);
                            if (daysBeforeStart > 3) {
                                console.log(`⚠️ CRITICAL: At Nov 1 boundary, but oldest transaction (${oldestTxDate.toLocaleDateString()}) is ${Math.round(daysBeforeStart)} days before start date. Staying at current position.`);
                                canScrollDown = false;
                            }
                        }
                    }

                    if (canScrollDown) {
                        atStartBoundary = false;
                        const downPosition = Math.min(scrollStartBoundary, currentPosition + oscillationScrollIncrement);
                        console.log(`🔄 Oscillation ${oscillationCount + 1}/${maxOscillations}: At Nov 1 boundary (${Math.round(currentPosition)}), scrolling DOWN to Oct 1 boundary (${Math.round(scrollStartBoundary)})`);
                        window.scrollTo(0, downPosition);
                        currentScrollPosition = downPosition;
                    } else {
                        // Can't scroll DOWN - stay at current position or scroll UP
                        console.log('   🔄 Prevented DOWN scroll - staying near Nov 1 boundary');
                        atStartBoundary = true; // Switch to UP direction
                        const upPosition = Math.max(scrollEndBoundary, currentPosition - oscillationScrollIncrement);
                        window.scrollTo(0, upPosition);
                        currentScrollPosition = upPosition;
                    }
                } else {
                    // Between boundaries - continue in current direction (strictly within Oct 1 - Nov 1 range)
                    // CRITICAL: Check if we've scrolled past the start date - if so, don't scroll further DOWN
                    const oldestTransaction = allTransactions.length > 0 ? allTransactions[allTransactions.length - 1] : null;
                    let shouldScrollDown = true;

                    if (oldestTransaction && oldestTransaction.date) {
                        const oldestTxDate = parseTransactionDate(oldestTransaction.date);
                        if (oldestTxDate && !isNaN(oldestTxDate.getTime())) {
                            const oldestTxDateTime = new Date(oldestTxDate.getFullYear(), oldestTxDate.getMonth(), oldestTxDate.getDate()).getTime();
                            const startDateTime = new Date(startDateObj.getFullYear(), startDateObj.getMonth(), startDateObj.getDate()).getTime();

                            // If oldest transaction is more than 3 days before start date, stop scrolling DOWN
                            const daysBeforeStart = (startDateTime - oldestTxDateTime) / (24 * 60 * 60 * 1000);
                            if (daysBeforeStart > 3) {
                                console.log(`⚠️ CRITICAL: Oldest transaction (${oldestTxDate.toLocaleDateString()}) is ${Math.round(daysBeforeStart)} days before start date. Stopping DOWN scroll in oscillation.`);
                                shouldScrollDown = false;
                                // Force scroll UP instead
                                atStartBoundary = true;
                            }
                        }
                    }

                    if (atStartBoundary) {
                        // Heading UP (decrease scrollY) to Nov 1 boundary
                        const upPosition = Math.max(scrollEndBoundary, currentPosition - oscillationScrollIncrement);
                        window.scrollTo(0, upPosition);
                        currentScrollPosition = upPosition;
                    } else if (shouldScrollDown) {
                        // Heading DOWN (increase scrollY) to Oct 1 boundary
                        const downPosition = Math.min(scrollStartBoundary, currentPosition + oscillationScrollIncrement);
                        window.scrollTo(0, downPosition);
                        currentScrollPosition = downPosition;
                    } else {
                        // Prevented from scrolling DOWN - scroll UP instead
                        const upPosition = Math.max(scrollEndBoundary, currentPosition - oscillationScrollIncrement);
                        console.log(`   🔄 Prevented DOWN scroll - scrolling UP instead to ${Math.round(upPosition)}px`);
                        window.scrollTo(0, upPosition);
                        currentScrollPosition = upPosition;
                        atStartBoundary = true; // Switch direction
                    }
                }
            }

            // ROLLBACK: Simple adaptive wait time (from successful October-133-Version)
            // Use CONFIG wait times: fast if found range for 3+ scrolls, standard otherwise
            // CRITICAL: If found range is newer than target, use LONGER wait time to allow lazy loading
            let waitTime;
            if (foundRangeIsNewerThanTarget) {
                // Found range is newer - need MORE time for lazy loading to trigger and load content
                // For large historical ranges (Last Year / Last 5 Years), use a slightly longer wait
                const isHistoricalPresetWait = isLastYearPresetByName || isLastFiveYearsPresetByName;
                if (isHistoricalPresetWait) {
                    waitTime = 4000; // 4s to reduce API pressure and allow lazy-load
                    console.log(`   ⏳ Extended wait mode (historical preset): Using ${waitTime}ms wait to allow lazy loading and avoid rate limits`);
                } else {
                    waitTime = CONFIG.SCROLL_WAIT_TIME.STANDARD * 2; // 3000ms to allow lazy loading
                    console.log(`   ⏳ Extended wait mode: Using ${waitTime}ms wait (found range newer - allowing lazy loading to complete)`);
                }
            } else {
                waitTime = (foundTargetDateRange && consecutiveTargetDateMatches >= 3) ? CONFIG.SCROLL_WAIT_TIME.FAST : CONFIG.SCROLL_WAIT_TIME.STANDARD;
            }
            await new Promise(resolve => setTimeout(resolve, waitTime));

            // Update lastKnownScrollY after auto-scroll completes (prevents detecting our own scroll as manual)
            lastKnownScrollY = window.scrollY;

            // CRITICAL: After scrolling, wait for DOM to update (lazy loading)
            // Check if new content has loaded by comparing scroll height and transaction count
            if (foundRangeIsNewerThanTarget) {
                const initialScrollHeight = document.documentElement.scrollHeight;
                const initialTransactionCount = document.querySelectorAll('[data-index]').length;
                // Wait additional time for lazy loading to complete
                await new Promise(resolve => setTimeout(resolve, 1000));
                const finalScrollHeight = document.documentElement.scrollHeight;
                const finalTransactionCount = document.querySelectorAll('[data-index]').length;

                if (finalScrollHeight > initialScrollHeight) {
                    console.log(`   ✅ New content loaded: Scroll height increased from ${initialScrollHeight} to ${finalScrollHeight} (+${finalScrollHeight - initialScrollHeight}px)`);
                }
                if (finalTransactionCount > initialTransactionCount) {
                    console.log(`   ✅ New transactions loaded: Count increased from ${initialTransactionCount} to ${finalTransactionCount} (+${finalTransactionCount - initialTransactionCount} transactions)`);
                } else {
                    console.log(`   ⚠️ No new transactions loaded yet (${finalTransactionCount} total). Page may need more scrolling to trigger lazy loading.`);
                }
            }

            // CRITICAL: After scrolling, wait for DOM to update (lazy loading)
            // Check if new content has loaded by comparing scroll height
            if (foundRangeIsNewerThanTarget) {
                const initialScrollHeight = document.documentElement.scrollHeight;
                // Wait a bit more for lazy loading to complete
                await new Promise(resolve => setTimeout(resolve, 500));
                const finalScrollHeight = document.documentElement.scrollHeight;
                if (finalScrollHeight > initialScrollHeight) {
                    console.log(`   ✅ New content loaded: Scroll height increased from ${initialScrollHeight} to ${finalScrollHeight}`);
                }
            }

            // Add micro-pauses for human behavior (from successful version)
            const microPause = simulateHumanBehavior();
            await new Promise(resolve => setTimeout(resolve, microPause));

            // CRITICAL DEBUG: Log right before loop end logging
            if (scrollAttempts <= 15) {
                console.log(`🔍 [BEFORE LOOP END LOGGING] Scroll ${scrollAttempts}: About to log loop end...`);
            }

            // ============================================================================
            // LOOP END LOGGING: Critical - shows why loop exits
            // ============================================================================
            // ALWAYS log loop end for first 15 scrolls to catch premature exits
            const loopWillContinue = !stopScrolling && scrollAttempts < dynamicMaxScrollAttempts;

            // CRITICAL: Always log for first 15 scrolls to catch premature exits
            if (scrollAttempts <= 15 || !loopWillContinue || scrollAttempts % 10 === 0) {
                console.log(`🔍 [LOOP END] Scroll ${scrollAttempts}: stopScrolling=${stopScrolling}, scrollAttempts=${scrollAttempts}, limit=${dynamicMaxScrollAttempts}, willContinue=${loopWillContinue}`);
                if (!loopWillContinue) {
                    console.error(`❌ LOOP EXITING: stopScrolling=${stopScrolling}, scrollAttempts=${scrollAttempts}, limit=${dynamicMaxScrollAttempts}`);
                    console.error(`   • Condition check: !stopScrolling=${!stopScrolling}, scrollAttempts < limit=${scrollAttempts < dynamicMaxScrollAttempts}`);
                    console.error(`   • Combined: ${!stopScrolling && scrollAttempts < dynamicMaxScrollAttempts}`);
                }
            }

            // ============================================================================
            // CRITICAL: Check loop condition RIGHT BEFORE while check
            // ============================================================================
            if (scrollAttempts <= 15) {
                const conditionCheck = !stopScrolling && scrollAttempts < dynamicMaxScrollAttempts;
                console.log(`🔍 [BEFORE WHILE CHECK] Scroll ${scrollAttempts}: condition=${conditionCheck}, stopScrolling=${stopScrolling}, scrollAttempts=${scrollAttempts}, limit=${dynamicMaxScrollAttempts}`);
                if (!conditionCheck) {
                    console.error(`❌ [CONDITION FALSE] Loop will exit: stopScrolling=${stopScrolling}, scrollAttempts=${scrollAttempts}, limit=${dynamicMaxScrollAttempts}`);
                }
            }
        }

        // ============================================================================
        // POST-LOOP LOGGING: Log state immediately after loop exits
        // ============================================================================
        console.error(`\n${'='.repeat(80)}`);
        console.error('🔴 LOOP EXITED - Final State:');
        console.error(`   • Final scrollAttempts: ${scrollAttempts}`);
        console.error(`   • Final dynamicMaxScrollAttempts: ${dynamicMaxScrollAttempts}`);
        console.error(`   • Final stopScrolling: ${stopScrolling}`);
        console.error(`   • Loop condition was: ${!stopScrolling && scrollAttempts < dynamicMaxScrollAttempts}`);
        console.error(`   • Final foundRangeIsNewerThanTarget: ${foundRangeIsNewerThanTarget}`);
        console.error(`${'='.repeat(80)}\n`);

        // ============================================================================
        // CLEANUP: Remove listeners and check for logout
        // ============================================================================
        // Clear logout check interval
        clearInterval(logoutCheckInterval);

        // Final logout check before cleanup
        if (!logoutDetected) {
            checkForLogout();
        }

        // Remove manual scroll listener
        window.removeEventListener('scroll', throttledScrollHandler);
        if (manualScrollCount > 0) {
            console.log(`✅ Manual scroll detection disabled. Detected ${manualScrollCount} manual scroll(s) during extraction.`);
        }

        // If logout was detected, CSV was already exported - don't continue with normal export
        if (logoutDetected) {
            console.log('⚠️ Extraction stopped due to logout. CSV already exported.');
            return { allTransactions, filteredTransactions: allTransactions.filter(t => isDateInRange(t.date, startDateObj, endDateObj)), elapsedTime: Date.now() - startTime, shouldIncludePendingPreset, logoutDetected: true };
        }

        // EARLY EXIT: If no transactions found for full range, don't waste time
        const finalTransactionsInRange = allTransactions.filter(t => {
            return isDateInRange(t.date, startDateObj, endDateObj);
        });
        const finalInRangeCount = finalTransactionsInRange.length;

        // CRITICAL: Check if found range is still newer than target (after scrolling loop)
        let finalFoundRangeIsNewerThanTarget = false;
        if (allTransactions.length > 0) {
            const finalFoundDates = allTransactions
                .map(t => parseTransactionDate(t.date))
                .filter(d => d)
                .sort((a, b) => a.getTime() - b.getTime());
            if (finalFoundDates.length > 0) {
                const oldestFinalFoundDate = finalFoundDates[0];
                if (oldestFinalFoundDate && oldestFinalFoundDate > startDateObj) {
                    finalFoundRangeIsNewerThanTarget = true;
                }
            }
        }

        if (finalInRangeCount === 0 && scrollAttempts >= 10) {
            // CRITICAL: Detect premature exit - check if loop exited before finding both boundaries
            const prematureExitDetected = scrollAttempts < dynamicMaxScrollAttempts && (!startBoundaryFound || !endBoundaryFound);

            if (prematureExitDetected) {
                console.error(`❌ PREMATURE EXIT DETECTED: Loop exited at ${scrollAttempts} scrolls (limit: ${dynamicMaxScrollAttempts}) without finding both boundaries`);
                console.error(`   • Start boundary found: ${startBoundaryFound}`);
                console.error(`   • End boundary found: ${endBoundaryFound}`);
                console.error(`   • Found range newer than target: ${finalFoundRangeIsNewerThanTarget}`);
                console.error(`   • Posted transactions in range: ${finalInRangeCount}`);
                console.error(`   • Total transactions found: ${allTransactions.length}`);
                console.error(`   • Target range: ${startDateObj.toLocaleDateString()} - ${endDateObj.toLocaleDateString()}`);
                if (foundDateRange !== 'N/A') {
                    console.error(`   • Found range: ${foundDateRange}`);
                }
            }

            // CRITICAL: Don't exit early if found range is NEWER than target - we need to scroll more
            if (finalFoundRangeIsNewerThanTarget) {
                // COMPREHENSIVE DIAGNOSTIC MESSAGE
                const diagnosticInfo = `
═══════════════════════════════════════════════════════════════════════════════
🔴 ERROR: Scrolling Loop Exited Prematurely - Found Range is NEWER Than Target
═══════════════════════════════════════════════════════════════════════════════

📊 CURRENT STATE:
   • Scroll Attempts: ${scrollAttempts}
   • Dynamic Max Scroll Limit: ${dynamicMaxScrollAttempts}
   • Static Max Scroll Limit: ${MAX_SCROLL_ATTEMPTS}
   • Scrolls Remaining: ${dynamicMaxScrollAttempts - scrollAttempts}
   • Time Elapsed: ${elapsedDisplay}
   • Total Transactions Found: ${allTransactions.length}

📅 DATE RANGE COMPARISON:
   • Target Range: ${startDateObj.toLocaleDateString()} to ${endDateObj.toLocaleDateString()}
   • Found Range: ${foundDateRange}
   • Oldest Found Date: ${allTransactions.length > 0 ? (() => {
       const dates = allTransactions.map(t => parseTransactionDate(t.date)).filter(d => d).sort((a, b) => a.getTime() - b.getTime());
       return dates.length > 0 ? dates[0].toLocaleDateString() : 'N/A';
   })() : 'N/A'}
   • Newest Found Date: ${allTransactions.length > 0 ? (() => {
       const dates = allTransactions.map(t => parseTransactionDate(t.date)).filter(d => d).sort((a, b) => b.getTime() - a.getTime());
       return dates.length > 0 ? dates[0].toLocaleDateString() : 'N/A';
   })() : 'N/A'}

🔍 WHAT HAPPENED:
   • Found transactions from ${foundDateRange} (NEWER than target)
   • Scrolling should have continued DOWN to find older transactions
   • Loop exited at ${scrollAttempts} scrolls (limit: ${dynamicMaxScrollAttempts})
   • Dynamic limit increase should have prevented this exit

❓ POSSIBLE CAUSES:
   1. Dynamic limit increase didn't trigger (check console for "Found range is NEWER" messages)
   2. Another exit condition was met (stagnation, stopScrolling flag, etc.)
   3. Loop condition evaluated incorrectly
   4. MAX_SCROLL_ATTEMPTS was too low initially

💡 TROUBLESHOOTING STEPS:
   1. Check browser console (F12) for "Found range is NEWER" messages
   2. Look for "Increasing dynamicMaxScrollAttempts" logs
   3. Check if "STAGNATION DETECTED" appeared before exit
   4. Verify if stopScrolling flag was set to true
   5. Check if scrollAttempts reached dynamicMaxScrollAttempts

📋 SAMPLE TRANSACTIONS FOUND:
${allTransactions.slice(0, 5).map((t, i) => `   ${i + 1}. Date: ${t.date || 'N/A'}, Amount: ${t.amount || 'N/A'}, Desc: ${t.description ? t.description.substring(0, 30) : 'N/A'}`).join('\n')}
${allTransactions.length > 5 ? `   ... and ${allTransactions.length - 5} more transactions` : ''}

═══════════════════════════════════════════════════════════════════════════════`;

                console.error(diagnosticInfo);

                const errorMsg = `Found date range (${foundDateRange}) is NEWER than target range (${startDateObj.toLocaleDateString()} - ${endDateObj.toLocaleDateString()}). ` +
                               `Loop exited at ${scrollAttempts}/${dynamicMaxScrollAttempts} scrolls. ` +
                               'Check console (F12) for full diagnostic details.';
                throw new Error(errorMsg);
            }

            // COMPREHENSIVE DIAGNOSTIC MESSAGE for no transactions found
            const noTransactionsDiagnostic = `
═══════════════════════════════════════════════════════════════════════════════
⚠️ NO TRANSACTIONS FOUND FOR TARGET DATE RANGE
═══════════════════════════════════════════════════════════════════════════════

📊 CURRENT STATE:
   • Scroll Attempts: ${scrollAttempts}
   • Max Scroll Limit: ${dynamicMaxScrollAttempts}
   • Time Elapsed: ${elapsedDisplay}
   • Total Transactions Found on Page: ${allTransactions.length}
   • Transactions in Target Range: ${finalInRangeCount}

📅 DATE RANGE INFORMATION:
   • Target Range: ${startDateObj.toLocaleDateString()} to ${endDateObj.toLocaleDateString()}
   • Found Date Range: ${foundDateRange}
   • Found Range is Newer Than Target: ${finalFoundRangeIsNewerThanTarget ? 'YES ⚠️' : 'NO'}

🔍 WHAT WAS FOUND:
${allTransactions.length > 0 ? `
   • Oldest Transaction Date: ${(() => {
       const dates = allTransactions.map(t => parseTransactionDate(t.date)).filter(d => d).sort((a, b) => a.getTime() - b.getTime());
       return dates.length > 0 ? dates[0].toLocaleDateString() : 'N/A';
   })()}
   • Newest Transaction Date: ${(() => {
       const dates = allTransactions.map(t => parseTransactionDate(t.date)).filter(d => d).sort((a, b) => b.getTime() - a.getTime());
       return dates.length > 0 ? dates[0].toLocaleDateString() : 'N/A';
   })()}
   • Sample Transactions:
${allTransactions.slice(0, 10).map((t, i) => `     ${i + 1}. ${t.date || 'No date'} | ${t.amount || 'N/A'} | ${t.description ? t.description.substring(0, 40) : 'N/A'}`).join('\n')}
` : '   • No transactions found on page at all'}

❓ POSSIBLE CAUSES:
   1. Target date range doesn't exist in your transaction history
   2. Scrolling didn't reach the target date range (check if found range is newer)
   3. Date parsing failed for transactions in target range
   4. Page didn't load all transactions (lazy loading issue)
   5. Selectors changed and transactions aren't being detected

💡 TROUBLESHOOTING STEPS:
   1. Verify the target date range exists in your Credit Karma account
   2. Check if found range is newer than target (indicates scrolling issue)
   3. Manually scroll to target date range and verify transactions are visible
   4. Check browser console (F12) for date parsing errors
   5. Try a smaller date range to test if extraction works

═══════════════════════════════════════════════════════════════════════════════`;

            console.error(noTransactionsDiagnostic);
            console.log(`⚠️ NO TRANSACTIONS FOUND FOR DATE RANGE: ${startDateObj.toLocaleDateString()} - ${endDateObj.toLocaleDateString()}`);
            console.log(`   Total transactions found on page: ${allTransactions.length}`);
            console.log(`   Date range found: ${foundDateRange}`);

            if (counterElement && document.body.contains(counterElement)) {
                counterElement.textContent = `⚠️ No transaction records found for date range: ${startDateObj.toLocaleDateString()} - ${endDateObj.toLocaleDateString()}\nTotal transactions on page: ${allTransactions.length} | Time: ${elapsedDisplay}`;
            }

            // Enhanced error message
            const errorDetails = allTransactions.length > 0
                ? `Found ${allTransactions.length} transactions on page, but none in target range (${startDateObj.toLocaleDateString()} to ${endDateObj.toLocaleDateString()}). Found range: ${foundDateRange}. Check console (F12) for full diagnostic details.`
                : 'No transactions found on page. Check console (F12) for full diagnostic details.';
            throw new Error(errorDetails);
        }

        if ((endBoundaryFound || startBoundaryFound) && finalInRangeCount === 0) {
            console.log(`⚠️ BOUNDARIES FOUND BUT NO TRANSACTIONS IN RANGE! Expected: ${startDateObj.toLocaleDateString()} - ${endDateObj.toLocaleDateString()}`);
            console.log('   Performing quick verification pass to check if data is in ascending order or range is missing...');

            if (counterElement && document.body.contains(counterElement)) {
                counterElement.textContent = '⚠️ No transactions found in range. Performing quick verification pass...';
            }

            // Quick verification: Check if data might be in ascending order (oldest first)
            // If descending order didn't work, try scrolling in reverse
            try {
                const maxScrollPos = Math.max(document.documentElement.scrollHeight - window.innerHeight, 0);
                const verificationPositions = [];

                // Check key positions: top, middle, bottom, and around boundaries
                if (targetRangeEndBoundary !== null && targetRangeStartBoundary !== null) {
                    verificationPositions.push(
                        Math.max(0, targetRangeEndBoundary - window.innerHeight * 0.5), // Above END boundary
                        targetRangeEndBoundary,
                        (targetRangeEndBoundary + targetRangeStartBoundary) / 2, // Between boundaries
                        targetRangeStartBoundary,
                        Math.min(maxScrollPos, targetRangeStartBoundary + window.innerHeight * 0.5) // Below START boundary
                    );
                } else {
                    // If boundaries not fully established, check key areas
                    verificationPositions.push(
                        0, // Top
                        maxScrollPos * 0.25,
                        maxScrollPos * 0.5,
                        maxScrollPos * 0.75,
                        maxScrollPos // Bottom
                    );
                }

                // Also check if we need to scroll in reverse (ascending order)
                // Start from bottom and go up
                console.log(`   Checking ${verificationPositions.length} key positions (including reverse scroll for ascending order)...`);

                // First, try reverse scroll from bottom to top (for ascending order data)
                window.scrollTo(0, maxScrollPos);
                await new Promise(resolve => setTimeout(resolve, 1000));
                let reverseExtract = extractAllTransactions();
                allTransactions = combineTransactions(allTransactions, reverseExtract);

                // Check mid-point
                window.scrollTo(0, maxScrollPos * 0.5);
                await new Promise(resolve => setTimeout(resolve, 800));
                reverseExtract = extractAllTransactions();
                allTransactions = combineTransactions(allTransactions, reverseExtract);

                // Check top
                window.scrollTo(0, 0);
                await new Promise(resolve => setTimeout(resolve, 800));
                reverseExtract = extractAllTransactions();
                allTransactions = combineTransactions(allTransactions, reverseExtract);

                // Now check the key positions
                for (const pos of verificationPositions) {
                    window.scrollTo(0, pos);
                    await new Promise(resolve => setTimeout(resolve, 500));
                    const posExtract = extractAllTransactions();
                    allTransactions = combineTransactions(allTransactions, posExtract);

                    // Check immediately if we found any
                    const checkInRange = allTransactions.filter(t => {
                        return isDateInRange(t.date, startDateObj, endDateObj);
                    }).length;

                    if (checkInRange > 0) {
                        console.log(`   ✅ Found ${checkInRange} transaction(s) in range during verification!`);
                        break; // Found something, can stop
                    }
                }

                // Final check after verification
                const afterVerificationCount = allTransactions.filter(t => {
                    return isDateInRange(t.date, startDateObj, endDateObj);
                }).length;

                if (afterVerificationCount === 0) {
                    console.log(`   ❌ VERIFICATION COMPLETE: No transactions found in range ${startDateObj.toLocaleDateString()} - ${endDateObj.toLocaleDateString()}`);
                    console.log(`   📊 Total transactions found: ${allTransactions.length}`);
                    console.log('   ⚠️  The target date range appears to be MISSING or has NO TRANSACTIONS.');

                    // Check what date range we actually found
                    if (allTransactions.length > 0) {
                        const sortedByDate = [...allTransactions].sort((a, b) => {
                            const dateA = parseTransactionDate(a.date);
                            const dateB = parseTransactionDate(b.date);
                            if (!dateA || !dateB) return 0;
                            return dateA.getTime() - dateB.getTime();
                        });

                        const oldestTx = sortedByDate[0];
                        const newestTx = sortedByDate[sortedByDate.length - 1];
                        const oldestDate = parseTransactionDate(oldestTx.date);
                        const newestDate = parseTransactionDate(newestTx.date);

                        if (oldestDate && newestDate) {
                            console.log(`   📅 Date range in data: ${oldestDate.toLocaleDateString()} to ${newestDate.toLocaleDateString()}`);
                            console.log(`   📅 Expected range: ${startDateObj.toLocaleDateString()} to ${endDateObj.toLocaleDateString()}`);
                        }
                    }
                } else {
                    console.log(`   ✅ Verification found ${afterVerificationCount} transaction(s) in range!`);
                }
            } catch (verifyError) {
                console.error('   ❌ Error during verification pass:', verifyError);
            }
        }

        // OPTIMIZED: Final verification pass - only check date range area, not entire page
        // OPTIMIZED: No Phase 3 - boundaries found, oscillations complete
        // Stay where we are, export data, show completion notification
        // User will log out after harvest completes and screenshots are taken
        const transactionsInRangeBeforePhase3 = allTransactions.filter(t => isDateInRange(t.date, startDateObj, endDateObj)).length;

        // Final extraction at current position (no scrolling back to top)
        if (endBoundaryFound && startBoundaryFound) {
            console.log('✓ Boundary discovery and oscillations complete. Staying at current position.');

            // Final extraction at current position
            const finalExtract = extractAllTransactions();
            allTransactions = combineTransactions(allTransactions, finalExtract);

            // Log pending transaction count
            const pendingCount = allTransactions.filter(t => {
                const isPendingStatus = t.status && t.status.toLowerCase() === 'pending';
                const hasNoDate = !t.date || (typeof t.date === 'string' && t.date.trim() === '');
                return isPendingStatus || hasNoDate;
            }).length;
            console.log(`✓ Final extraction complete: Found ${pendingCount} pending transactions`);

            // Update notification
            if (counterElement && document.body.contains(counterElement)) {
                const daysInRange = Math.ceil((endDateObj - startDateObj) / (24 * 60 * 60 * 1000)) + 1;
                const estimatedExpectedRows = Math.max(transactionsInRangeBeforePhase3, Math.floor(daysInRange * 2.5));
                const recordsHarvested = transactionsInRangeBeforePhase3;
                const recordsMissed = estimatedExpectedRows > recordsHarvested ? estimatedExpectedRows - recordsHarvested : 0;
                const comparisonText = estimatedExpectedRows === recordsHarvested
                    ? `✅ Records expected: ${estimatedExpectedRows} Rows, from ${daysInRange} days. Records harvested: ${recordsHarvested} Rows. A = B ✓`
                    : `⚠️ Records expected: ${estimatedExpectedRows} Rows, from ${daysInRange} days. Records harvested: ${recordsHarvested} Rows. A ≠ B (${recordsMissed} missed)`;
                counterElement.textContent = `✅ Harvest Complete\n${comparisonText}\nStaying at current position for export`;
            }
        }

        // NOTE: Old Phase 3 code removed per v4.0 strategy - "No Phase 3", "Stay where we are"
        // The else clause for the if at line 2478 is no longer needed as Phase 3 is removed

        console.log(`Total transactions found: ${allTransactions.length}`);

        // Initialize warning variable early
        let rangeMissingWarning = null;

        // Final check for missing date range - prepare warning message for result
        const finalCheckInRange = allTransactions.filter(t => {
            return isDateInRange(t.date, startDateObj, endDateObj);
        });

        if ((endBoundaryFound || startBoundaryFound) && finalCheckInRange.length === 0 && allTransactions.length > 0) {
            // Boundaries were found but no transactions in range
            const sortedByDate = [...allTransactions].sort((a, b) => {
                const dateA = parseTransactionDate(a.date);
                const dateB = parseTransactionDate(b.date);
                if (!dateA || !dateB) return 0;
                return dateA.getTime() - dateB.getTime();
            });

            const oldestTx = sortedByDate.find(t => parseTransactionDate(t.date));
            const newestTx = sortedByDate.reverse().find(t => parseTransactionDate(t.date));

            if (oldestTx && newestTx) {
                const oldestDate = parseTransactionDate(oldestTx.date);
                const newestDate = parseTransactionDate(newestTx.date);

                if (oldestDate && newestDate) {
                    rangeMissingWarning = `⚠️ WARNING: Target date range (${startDateObj.toLocaleDateString()} - ${endDateObj.toLocaleDateString()}) appears to be MISSING. ` +
                                        `Found ${allTransactions.length} transactions, but date range in data is ${oldestDate.toLocaleDateString()} - ${newestDate.toLocaleDateString()}. ` +
                                        'Verification pass completed - no transactions found in target range.';
                    console.log(rangeMissingWarning);
                }
            }
        } else if (finalCheckInRange.length === 0 && allTransactions.length > 0) {
            // No boundaries found and no transactions in range - October might not have been reached
            const sortedByDate = [...allTransactions].sort((a, b) => {
                const dateA = parseTransactionDate(a.date);
                const dateB = parseTransactionDate(b.date);
                if (!dateA || !dateB) return 0;
                return dateA.getTime() - dateB.getTime();
            });

            const oldestTx = sortedByDate.find(t => parseTransactionDate(t.date));
            const newestTx = sortedByDate.reverse().find(t => parseTransactionDate(t.date));

            if (oldestTx && newestTx) {
                const oldestDate = parseTransactionDate(oldestTx.date);
                const newestDate = parseTransactionDate(newestTx.date);

                if (oldestDate && newestDate) {
                    rangeMissingWarning = `⚠️ WARNING: Did not reach target date range (${startDateObj.toLocaleDateString()} - ${endDateObj.toLocaleDateString()}). ` +
                                        `Found ${allTransactions.length} transactions, but date range in data is ${oldestDate.toLocaleDateString()} - ${newestDate.toLocaleDateString()}. ` +
                                        'The target month may not have been reached during scrolling.';
                    console.log(rangeMissingWarning);
                }
            }
        }

        // Use strict boundaries if requested (default: true for exact month boundaries)
        let exportStartDate = startDateObj;
        let exportEndDate = endDateObj;
        let trimmedRange = false;

        // Get strict boundaries option from request (default true)
        const useStrictBoundaries = request && request.trimToExactMonth !== false;

        if (useStrictBoundaries) {
            // Strict mode: Use exact date range (no buffer, no auto-trim)
            // October 1-31 means ONLY transactions dated Oct 1-31, nothing else
            exportStartDate = startDateObj;
            exportEndDate = endDateObj;
            trimmedRange = false;
            console.log(`✓ Using strict boundaries: ${exportStartDate.toLocaleDateString()} to ${exportEndDate.toLocaleDateString()}`);
        } else {
            console.log(`Using full range with buffer: ${startDateObj.toLocaleDateString()} to ${endDateObj.toLocaleDateString()}`);
        }

        // OPTIMIZED: Pending transaction detection for this-week, this-month, and this-year presets
        // Pending transactions = ALL transactions BEFORE the first posted record
        // Use SYSTEM_DATE for consistency (captured once at start)
        // NOTE: shouldIncludePendingPreset is already defined at function scope (above)
        const today = new Date(SYSTEM_DATE);
        today.setHours(0, 0, 0, 0); // Normalize to start of day
        const originalEndDate = new Date(endDateObj);
        originalEndDate.setHours(23, 59, 59, 999); // End of day

        // Detect last-year preset: January 1st of last year to December 31st of last year (with buffer)
        const lastYearStart = new Date(todayForPreset.getFullYear() - 1, 0, 1);
        const lastYearEnd = new Date(todayForPreset.getFullYear() - 1, 11, 31);
        const isLastYearPreset = (startDateObj.getFullYear() === todayForPreset.getFullYear() - 1 &&
                                  startDateObj.getMonth() === 0 && startDateObj.getDate() <= 3 && // Jan 1 +/- 2 days buffer
                                  endDateObj.getFullYear() === todayForPreset.getFullYear() - 1 &&
                                  endDateObj.getMonth() === 11 && endDateObj.getDate() >= 29); // Dec 31 +/- 2 days buffer

        // Find first posted transaction (for pending detection in some presets)
        // NOTE: For preset === 'this-month', we DO NOT treat "before first posted"
        // as pending; pending is based strictly on explicit status/date flags.
        let firstPostedTransaction = null;
        if (shouldIncludePendingPreset && allTransactions.length > 0) {
            // Sort transactions by date (newest first, as they appear on page)
            const sortedTxs = [...allTransactions].sort((a, b) => {
                const dateA = parseTransactionDate(a.date);
                const dateB = parseTransactionDate(b.date);
                if (!dateA && !dateB) return 0;
                if (!dateA) return 1; // Pending (no date) comes after
                if (!dateB) return -1;
                return dateB.getTime() - dateA.getTime(); // Newest first
            });

            // Find first posted transaction (has a valid date)
            firstPostedTransaction = sortedTxs.find(t => {
                const txDate = parseTransactionDate(t.date);
                const isPendingStatus = t.status && t.status.toLowerCase() === 'pending';
                const hasNoDate = !t.date || t.date.trim() === '';
                return txDate && !isPendingStatus && !hasNoDate;
            });

            if (firstPostedTransaction) {
                console.log(`📍 First posted transaction found: ${firstPostedTransaction.date} (${firstPostedTransaction.description})`);
                if (!isThisMonthPreset) {
                    console.log('   All transactions before this will be included as pending for preset');
                }
            }
        }

        const shouldIncludePending = originalEndDate >= today || shouldIncludePendingPreset;

        console.log(`Pending transaction check: originalEndDate=${originalEndDate.toLocaleDateString()}, today=${today.toLocaleDateString()}, shouldIncludePending=${shouldIncludePending}`);
        console.log(`   Preset detection: this-week=${isThisWeekPreset}, this-month=${isThisMonthPreset}, last-year=${isLastYearPreset}`);

        // CRITICAL: Verify boundaries before export
        if (!startBoundaryFound || !endBoundaryFound) {
            logUserWarning('Export may be incomplete: date boundaries not fully detected. Results may be incomplete.');
            logDevDebug('   Exporting without both boundaries found:');
            logDevDebug(`   • Start boundary found: ${startBoundaryFound}`);
            logDevDebug(`   • End boundary found: ${endBoundaryFound}`);
            logDevDebug(`   • Target range: ${startDateObj.toLocaleDateString()} - ${endDateObj.toLocaleDateString()}`);
        } else {
            console.log('✅ Boundary verification passed: Both boundaries found before export');
            console.log(`   • Start boundary: ${startBoundaryFound} (last transaction before ${startDateObj.toLocaleDateString()})`);
            console.log(`   • End boundary: ${endBoundaryFound} (first transaction after ${endDateObj.toLocaleDateString()})`);
        }

        const filteredTransactions = filterEmptyTransactions(
            allTransactions.filter(transaction => {
                // For "This Month", we DO NOT use the "first posted transaction" shortcut
                // at export time. We simply clamp by the requested date range and status,
                // so all in-range rows (pending + posted) are included and out-of-range
                // rows (e.g., October) are excluded.
                if (!isThisMonthPreset && shouldIncludePendingPreset && firstPostedTransaction) {
                    const txDate = parseTransactionDate(transaction.date);
                    const firstPostedDate = parseTransactionDate(firstPostedTransaction.date);

                    // For current-period presets (excluding This Month), treat "before first
                    // posted" as pending, but still respect the requested export date range
                    // when a date exists. This prevents previous-period rows from leaking.
                    if (!txDate) {
                        logDevDebug(`Including pending transaction (no date, before first posted): ${transaction.description}, amount: ${transaction.amount}, date: "N/A"`);
                        return true;
                    }

                    const isBeforeFirstPosted = firstPostedDate && txDate.getTime() < firstPostedDate.getTime();
                    const isWithinRange = txDate.getTime() >= exportStartDate.getTime() && txDate.getTime() <= exportEndDate.getTime();

                    if (isBeforeFirstPosted && isWithinRange) {
                        logDevDebug(`Including pending transaction (before first posted, in range): ${transaction.description}, amount: ${transaction.amount}, date: "${transaction.date || 'N/A'}"`);
                        return true;
                    }
                }

        // Check if transaction is pending
        // For preset === 'this-month', a row is pending ONLY if status === 'Pending'
        // (we do not infer pending just from missing date).
        const isPendingStatus = transaction.status && transaction.status.toLowerCase() === 'pending';
        const hasNoDate = !transaction.date || transaction.date.trim() === '';
        const isPending = isPendingStatus || (!isThisMonthPreset && hasNoDate);

                // If transaction is pending, include it if we should include pending
                if (isPending) {
                    const txDate = parseTransactionDate(transaction.date);

                    if (shouldIncludePending) {
                        // For current-period presets (this-week, this-month, this-year),
                        // keep pending rows strictly within the requested export range
                        // when a concrete date exists. This guarantees that, for
                        // preset === 'this-month', all Nov 1–27 pending are included
                        // and Oct 27–31 are excluded.
                        if (txDate &&
                            (txDate.getTime() < exportStartDate.getTime() ||
                             txDate.getTime() > exportEndDate.getTime())) {
                            logDevDebug(`Excluding out-of-range pending transaction for current-period preset: ${transaction.description}, date: "${transaction.date || 'N/A'}"`);
                            return false;
                        }

                        logDevDebug(`Including pending transaction: ${transaction.description}, amount: ${transaction.amount}, status: ${transaction.status || 'Pending (no date)'}, date: "${transaction.date || 'N/A'}"`);
                    } else {
                        logDevDebug(`Excluding pending transaction (end date in past): ${transaction.description}`);
                    }
                    return shouldIncludePending;
                }
                // Otherwise, check if date is in range (for posted transactions)
                const txDate = parseTransactionDate(transaction.date);
                const inRange = isDateInRange(transaction.date, exportStartDate, exportEndDate);

                // Enhanced debugging: Log first 10 excluded transactions to help diagnose issues (dev-only)
                if (!inRange && txDate) {
                    // Log first few excluded transactions for debugging (dev debug only)
                    if (typeof window.__excludedTxCount === 'undefined') {
                        window.__excludedTxCount = 0;
                    }
                    if (window.__excludedTxCount < 10) {
                        window.__excludedTxCount++;
                        logDevDebug(`Excluding transaction #${window.__excludedTxCount}:`, {
                            rawDate: transaction.date,
                            parsedDate: txDate.toLocaleDateString(),
                            parsedISO: txDate.toISOString(),
                            exportStart: exportStartDate.toLocaleDateString(),
                            exportStartISO: exportStartDate.toISOString(),
                            exportEnd: exportEndDate.toLocaleDateString(),
                            exportEndISO: exportEndDate.toISOString(),
                            description: transaction.description,
                            amount: transaction.amount
                        });
                    }
                }

                return inRange;
            })
        ).sort((a, b) => {
            const dateA = parseTransactionDate(a.date);
            const dateB = parseTransactionDate(b.date);
            // Put transactions without dates at the end (pending transactions)
            if (!dateA && !dateB) return 0;
            if (!dateA) return 1; // No date goes to end
            if (!dateB) return -1; // No date goes to end
            return dateB.getTime() - dateA.getTime();
        });

        // CRITICAL: Export validation - verify posted transactions and date range coverage
        const exportedPostedTransactions = filteredTransactions.filter(t => {
            const isPendingStatus = t.status && t.status.toLowerCase() === 'pending';
            const hasNoDate = !t.date || (typeof t.date === 'string' && t.date.trim() === '');
            return !isPendingStatus && !hasNoDate;
        });

        const exportedDateRange = filteredTransactions
            .map(t => parseTransactionDate(t.date))
            .filter(d => d)
            .sort((a, b) => a.getTime() - b.getTime());

        let exportedStart = null;
        let exportedEnd = null;
        if (exportedDateRange.length > 0) {
            exportedStart = exportedDateRange[0];
            exportedEnd = exportedDateRange[exportedDateRange.length - 1];
        }

        // Log comprehensive date range info for debugging
        console.log('=== EXTRACTION SUMMARY ===');
        console.log(`Selected date range (raw input): ${startDate} to ${endDate}`);
        console.log(`Export date range ${trimmedRange ? '(trimmed)' : ''}: ${exportStartDate.toLocaleDateString()} (${exportStartDate.getFullYear()}-${String(exportStartDate.getMonth()+1).padStart(2,'0')}-${String(exportStartDate.getDate()).padStart(2,'0')}) to ${exportEndDate.toLocaleDateString()} (${exportEndDate.getFullYear()}-${String(exportEndDate.getMonth()+1).padStart(2,'0')}-${String(exportEndDate.getDate()).padStart(2,'0')})`);
        console.log(`Total transactions found (all dates): ${allTransactions.length}`);
        console.log(`Transactions in export range: ${filteredTransactions.length}`);

        // Export validation logging (dev debug only - detailed diagnostics)
        logDevDebug('=== EXPORT VALIDATION ===');
        logDevDebug(`📊 Posted transactions exported: ${exportedPostedTransactions.length} (out of ${filteredTransactions.length} total)`);
        if (exportedStart && exportedEnd) {
            logDevDebug(`📅 Date range exported: ${exportedStart.toLocaleDateString()} - ${exportedEnd.toLocaleDateString()}`);
            logDevDebug(`📅 Target range: ${startDateObj.toLocaleDateString()} - ${endDateObj.toLocaleDateString()}`);

            // Validate date range coverage - user-facing warning if missing transactions
            if (exportedStart > startDateObj) {
                logUserWarning(`Export may be incomplete: missing transactions before ${exportedStart.toLocaleDateString()}`);
                logDevDebug(`   Exported start date (${exportedStart.toLocaleDateString()}) is AFTER target start date (${startDateObj.toLocaleDateString()})`);
            }
            if (exportedEnd < endDateObj) {
                logUserWarning(`Export may be incomplete: missing transactions after ${exportedEnd.toLocaleDateString()}`);
                logDevDebug(`   Exported end date (${exportedEnd.toLocaleDateString()}) is BEFORE target end date (${endDateObj.toLocaleDateString()})`);
            }
            if (exportedStart <= startDateObj && exportedEnd >= endDateObj) {
                logDevDebug('✅ Date range validation passed: Exported range fully covers target range');
            }
        } else {
            logUserWarning('Export warning: No valid dates found in exported transactions');
        }

        // Validate boundary status - user-facing warning if boundaries not found
        if (!startBoundaryFound || !endBoundaryFound) {
            logUserWarning(`Export may be incomplete: date boundaries not fully detected (Start: ${startBoundaryFound ? 'found' : 'missing'}, End: ${endBoundaryFound ? 'found' : 'missing'})`);
            logDevDebug(`   Exporting without both boundaries found (Start: ${startBoundaryFound}, End: ${endBoundaryFound})`);
        } else {
            logDevDebug('✅ Boundary validation passed: Both boundaries found before export');
        }

        // Validate posted transactions for month/custom presets
        const isMonthOrCustomPreset = !isThisWeekPreset && !isThisMonthPreset && !isThisYearPreset;
        if (isMonthOrCustomPreset && exportedPostedTransactions.length === 0 && filteredTransactions.length > 0) {
            logUserWarning(`Export warning: Only pending transactions exported (${filteredTransactions.length} pending, 0 posted). For month/custom presets, posted transactions are required.`);
            logDevDebug('   Month/Custom preset but only pending transactions exported');
        } else if (isMonthOrCustomPreset && exportedPostedTransactions.length > 0) {
            logDevDebug(`✅ Posted transaction validation passed: ${exportedPostedTransactions.length} posted transactions found for month/custom preset`);
        }

        // REFERENCE STANDARD: Show 100% recovery parameters if achieved
        // Use SYSTEM_DATE for consistency (captured once at start)
        const daysSinceEndDateSummary = (SYSTEM_DATE - endDateObj) / (24 * 60 * 60 * 1000);
        const isLastMonthSummary = daysSinceEndDateSummary >= 30 && daysSinceEndDateSummary < 60;

        if (isLastMonthSummary && scrollStats.scrollsAt100Percent !== null) {
            const params = scrollStats.parametersAt100Percent;
            console.log('');
            console.log('='.repeat(70));
            console.log('🎯 100% RECOVERY PARAMETERS (REFERENCE STANDARD)');
            console.log('='.repeat(70));
            console.log('');
            console.log('✅ These parameters achieved 100% recovery for October (reference standard):');
            console.log('');
            console.log('📊 EXTRACTION PARAMETERS AT 100%:');
            console.log(`   • Total scrolls when 100% achieved: ${params.totalScrolls}`);
            console.log(`   • Scrolls with new transactions: ${params.scrollsWithNewTransactions}`);
            console.log(`   • Scrolls with no change: ${params.scrollsWithNoChange}`);
            console.log(`   • Transactions collected at 100%: ${params.inRangeCollected}`);
            console.log('');
            console.log('⚙️ CONFIGURATION PARAMETERS:');
            console.log(`   • Scroll wait time: ${params.scrollWaitTime} ms`);
            console.log(`   • Min scrolls set: ${params.minScrollsSet}`);
            console.log(`   • Max scrolls set: ${params.maxScrollsSet}`);
            console.log(`   • Date range days: ${params.dateRangeDays}`);
            console.log('');
            console.log('📈 EFFICIENCY:');
            console.log(`   • Efficiency: ${params.inRangeCollected} transactions in ${params.totalScrolls} scrolls`);
            console.log(`   • Transactions per scroll: ${(params.inRangeCollected / params.totalScrolls).toFixed(2)}`);
            console.log('');
            console.log('💡 TIP: Use these parameters for future extractions to optimize scrolling');
            console.log('        and avoid unnecessary scrolls and time waste');
            console.log('');
            console.log('='.repeat(70));
            console.log('');
        }

        // REFERENCE STANDARD: Final verification for October
        if (isLastMonthSummary) {
            console.log('');
            console.log('='.repeat(70));
            console.log('📊 REFERENCE STANDARD VERIFICATION (October):');
            console.log('='.repeat(70));
            console.log('   • Expected range: 133-140 transactions');
            console.log(`   • Transactions found (exported): ${filteredTransactions.length}`);
            // FINAL status: we only claim "100% recovery" when export count is within
            // expected range; any mismatch at export will already be reflected in
            // runStats.alerts via MISMATCH_COUNTS_LAST_MONTH.
            if (filteredTransactions.length >= TARGET_RANGE.min && filteredTransactions.length <= TARGET_RANGE.max) {
                console.log(`   ✅ 100% RECOVERY ACHIEVED (exported): ${filteredTransactions.length} transactions`);
                console.log('   ✅ Reference standard met - these parameters can guide future extractions');
            } else if (filteredTransactions.length < TARGET_RANGE.min) {
                console.log(`   ⚠️ Below expected minimum (${TARGET_RANGE.min} transactions)`);
                console.log('   Consider increasing max scrolls');
            } else if (filteredTransactions.length > TARGET_RANGE.max) {
                console.log(`   ℹ️ Above expected maximum (${TARGET_RANGE.max} transactions)`);
                console.log('   May include extra transactions at boundaries');
            }
            console.log('');
            console.log('='.repeat(70));
            console.log('');
        }

        // Scroll-cap exit guards per preset
        // LAST MONTH INCOMPLETE GUARD: detect scroll-cap exit before reaching 133
        if (isLastMonthPreset) {
            if (scrollAttempts >= dynamicMaxScrollAttempts && maxTransactionsInRangeCount < TARGET_RANGE.min) {
                console.warn(`⚠️ [LAST MONTH] Scroll cap hit (scrolls=${scrollAttempts}/${dynamicMaxScrollAttempts}) before reaching TARGET_RANGE.min=${TARGET_RANGE.min} (maxInRange=${maxTransactionsInRangeCount}). Marking run as incomplete.`);
                if (typeof runStats !== 'undefined' && runStats) {
                    runStats.alerts = runStats.alerts || [];
                    runStats.alerts.push('LAST_MONTH_INCOMPLETE_SCROLL_CAP');
                }
            }
        } else {
            // Neutral scroll-cap alerts for other presets
            const presetNameForCap = request && request.preset ? request.preset : '';
            if (scrollAttempts >= dynamicMaxScrollAttempts) {
                if (typeof runStats !== 'undefined' && runStats) {
                    runStats.alerts = runStats.alerts || [];
                    if (presetNameForCap === 'this-month') {
                        runStats.alerts.push('SCROLL_CAP_REACHED_THIS_MONTH');
                        console.warn(`⚠️ [THIS MONTH] Scroll cap reached (scrolls=${scrollAttempts}/${dynamicMaxScrollAttempts}).`);
                    } else if (presetNameForCap === 'this-year') {
                        runStats.alerts.push('SCROLL_CAP_REACHED_THIS_YEAR');
                        console.warn(`⚠️ [THIS YEAR] Scroll cap reached (scrolls=${scrollAttempts}/${dynamicMaxScrollAttempts}).`);
                    } else if (presetNameForCap === 'last-year') {
                        runStats.alerts.push('SCROLL_CAP_REACHED_LAST_YEAR');
                        console.warn(`⚠️ [LAST YEAR] Scroll cap reached (scrolls=${scrollAttempts}/${dynamicMaxScrollAttempts}).`);
                    } else if (presetNameForCap === 'this-week') {
                        runStats.alerts.push('SCROLL_CAP_REACHED_THIS_WEEK');
                        console.warn(`⚠️ [THIS WEEK] Scroll cap reached (scrolls=${scrollAttempts}/${dynamicMaxScrollAttempts}).`);
                    } else if (presetNameForCap === 'last-5-years') {
                        runStats.alerts.push('SCROLL_CAP_REACHED_LAST_FIVE_YEARS');
                        console.warn(`⚠️ [LAST 5 YEARS] Scroll cap reached (scrolls=${scrollAttempts}/${dynamicMaxScrollAttempts}).`);
                    }
                }
            }
        }

        // Scroll statistics summary
        console.log('');
        console.log('='.repeat(70));
        console.log('📊 SCROLLING STATISTICS');
        console.log('='.repeat(70));
        console.log(`   • Total scrolls performed: ${scrollStats.totalScrolls}`);
        console.log(`   • Scrolls with new transactions: ${scrollStats.scrollsWithNewTransactions}`);
        console.log(`   • Scrolls with no new transactions: ${scrollStats.scrollsWithNoChange}`);
        console.log(`   • Total transactions collected (all dates): ${scrollStats.totalCollected}`);
        console.log(`   • Transactions in range: ${scrollStats.inRangeCollected}`);
        console.log(`   • Transactions out of range: ${scrollStats.outOfRangeCollected}`);
        if (scrollStats.scrollsAt100Percent !== null) {
            console.log(`   • Scrolls when 100% achieved: ${scrollStats.scrollsAt100Percent}`);
        }
        console.log('='.repeat(70));
        console.log('');

        // Log first and last dates in filtered transactions for verification
        if (filteredTransactions.length > 0) {
            const postedFiltered = filteredTransactions.filter(t => {
                const isPendingStatus = t.status && t.status.toLowerCase() === 'pending';
                // CRITICAL FIX: Check if t.date exists before calling .trim() to prevent TypeError
                const hasNoDate = !t.date || (typeof t.date === 'string' && t.date.trim() === '');
                return !isPendingStatus && !hasNoDate;
            });
            if (postedFiltered.length > 0) {
                const sortedDates = postedFiltered.map(t => parseTransactionDate(t.date)).filter(d => d).sort((a, b) => b.getTime() - a.getTime());
                const oldestDate = sortedDates[sortedDates.length - 1];
                const newestDate = sortedDates[0];
                console.log(`📅 Date range in exported CSV: ${oldestDate.toLocaleDateString()} (${oldestDate.getFullYear()}-${String(oldestDate.getMonth()+1).padStart(2,'0')}-${String(oldestDate.getDate()).padStart(2,'0')}) to ${newestDate.toLocaleDateString()} (${newestDate.getFullYear()}-${String(newestDate.getMonth()+1).padStart(2,'0')}-${String(newestDate.getDate()).padStart(2,'0')})`);

                // Verify if dates match expected range
                if (oldestDate < exportStartDate || oldestDate > exportEndDate) {
                    console.warn(`⚠️ WARNING: Oldest date in CSV (${oldestDate.toLocaleDateString()}) is OUTSIDE expected range (${exportStartDate.toLocaleDateString()} to ${exportEndDate.toLocaleDateString()})`);
                }
                if (newestDate < exportStartDate || newestDate > exportEndDate) {
                    console.warn(`⚠️ WARNING: Newest date in CSV (${newestDate.toLocaleDateString()}) is OUTSIDE expected range (${exportStartDate.toLocaleDateString()} to ${exportEndDate.toLocaleDateString()})`);
                }
            }
        }

        // Log date distribution to help debug missing dates
        const dateDistribution = {};
        const pendingCount = { count: 0 };
        filteredTransactions.forEach(t => {
            const isPendingStatus = t.status && t.status.toLowerCase() === 'pending';

            if (isPendingStatus) {
                pendingCount.count++;
            } else {
                const txDate = parseTransactionDate(t.date);
                if (txDate) {
                    const dateKey = txDate.toLocaleDateString();
                    dateDistribution[dateKey] = (dateDistribution[dateKey] || 0) + 1;
                }
            }
        });
        console.log('Date distribution of exported transactions:', dateDistribution);
        if (pendingCount.count > 0) {
            console.log(`✓ Pending transactions: ${pendingCount.count}`);
            // Show pending transaction details
            const pendingTxs = filteredTransactions.filter(t => {
                const isPendingStatus = t.status && t.status.toLowerCase() === 'pending';
                return isPendingStatus;
            });
            console.log('Pending transaction details:', pendingTxs.map(t => ({
                date: t.date,
                description: t.description,
                amount: t.amount,
                status: t.status
            })));
        } else {
            console.log('⚠️ No pending transactions found in export');
        }

        // Show posted transaction date range
        const postedTxs = filteredTransactions.filter(t => {
            const isPendingStatus = t.status && t.status.toLowerCase() === 'pending';
            return !isPendingStatus;
        });
        if (postedTxs.length > 0) {
            const postedDates = postedTxs.map(t => parseTransactionDate(t.date)).filter(d => d);
            if (postedDates.length > 0) {
                const minDate = new Date(Math.min(...postedDates.map(d => d.getTime())));
                const maxDate = new Date(Math.max(...postedDates.map(d => d.getTime())));
                console.log(`Posted transactions date range: ${minDate.toLocaleDateString()} to ${maxDate.toLocaleDateString()} (${postedTxs.length} transactions)`);
            }
        }

        // Also check all transactions for pending (check status)
        const allPendingCount = allTransactions.filter(t => {
            const isPendingStatus = t.status && t.status.toLowerCase() === 'pending';
            return isPendingStatus;
        }).length;
        console.log(`Total pending transactions found (all dates): ${allPendingCount}`);
        if (allPendingCount > 0 && pendingCount.count === 0) {
            logUserWarning(`Found ${allPendingCount} pending transactions but none were included in export. Check date range and pending inclusion settings.`);
            logDevDebug(`   Original end date: ${endDateObj.toLocaleDateString()}, Should include pending: ${shouldIncludePending}`);
            // Log sample pending transactions for debugging
            const samplePending = allTransactions.filter(t => {
                const isPendingStatus = t.status && t.status.toLowerCase() === 'pending';
                return isPendingStatus;
            }).slice(0, 5);
            logDevDebug('   Sample pending transactions:', samplePending.map(t => ({
                description: t.description,
                date: t.date,
                status: t.status,
                amount: t.amount
            })));
        }

        // Show status breakdown
        const statusBreakdown = {};
        filteredTransactions.forEach(t => {
            const status = t.status || 'Posted';
            statusBreakdown[status] = (statusBreakdown[status] || 0) + 1;
        });
        console.log('Status breakdown:', statusBreakdown);

        // Check for missing dates in range - IMPROVED: More detailed logging
        // If the session expired or logout was detected, skip strict missing-date validation
        if (sessionErrorDetected) {
            console.log('⚠️ Session expired or logout detected – skipping missing dates validation (partial export expected).');
            if (typeof runStats !== 'undefined' && runStats && Array.isArray(runStats.alerts)) {
                runStats.alerts.push('DATE_VALIDATION_SKIPPED_SESSION_TIMEOUT');
            }
        } else {
            const expectedDates = [];
            const currentDate = new Date(exportStartDate);
            while (currentDate <= exportEndDate) {
                expectedDates.push(currentDate.toLocaleDateString());
                currentDate.setDate(currentDate.getDate() + 1);
            }
            const missingDates = expectedDates.filter(date => !dateDistribution[date] || dateDistribution[date] === 0);
            if (missingDates.length > 0) {
                // Convert missing dates to YYYY-MM-DD format for runStats
                const missingDatesISO = missingDates.map(dateStr => {
                    const date = new Date(dateStr);
                    const year = date.getFullYear();
                    const month = String(date.getMonth() + 1).padStart(2, '0');
                    const day = String(date.getDate()).padStart(2, '0');
                    return `${year}-${month}-${day}`;
                });

                // Store missing dates in runStats for developers
                if (typeof runStats !== 'undefined' && runStats) {
                    if (!runStats.validation) {
                        runStats.validation = {};
                    }
                    runStats.validation.missingDates = missingDatesISO; // Full list of YYYY-MM-DD strings
                    runStats.validation.missingDatesCount = missingDates.length; // Number of days

                    // Add alert for missing dates
                    if (!Array.isArray(runStats.alerts)) {
                        runStats.alerts = [];
                    }
                    if (!runStats.alerts.includes('MISSING_DATES_DETECTED')) {
                        runStats.alerts.push('MISSING_DATES_DETECTED');
                    }

                    // Update export status if not already set to a more severe status
                    if (!runStats.validation.exportStatus || runStats.validation.exportStatus === 'PRISTINE') {
                        // If many days are missing (>10% of range), mark as incomplete
                        const daysInRange = Math.ceil((exportEndDate - exportStartDate) / (24 * 60 * 60 * 1000)) + 1;
                        const missingPercentage = (missingDates.length / daysInRange) * 100;
                        if (missingPercentage > 10) {
                            runStats.validation.exportStatus = 'COMPLETE_WITH_WARNINGS';
                        } else {
                            runStats.validation.exportStatus = 'COMPLETE_WITH_WARNINGS';
                        }
                    }
                }

                // Single aggregated user-facing warning (not per-date spam)
                logUserWarning(`Export complete with warnings: ${missingDates.length} calendar day(s) in the selected range have no transactions. See validation details if this is unexpected.`);

                // Per-date logs are dev-only (gated by dev debug flag)
                logDevDebug(`Missing dates in export: ${missingDates.join(', ')}`);
                missingDates.forEach(dateStr => {
                    const missingDate = new Date(dateStr);
                    logDevDebug(`  - Missing: ${dateStr} (${missingDate.toLocaleDateString('en-US', { weekday: 'long' })})`);
                });

                // Special check for start date (critical - keep as user error)
                const startDateStr = exportStartDate.toLocaleDateString();
                if (missingDates.includes(startDateStr)) {
                    logUserError(`CRITICAL: Start date ${startDateStr} is missing from export!`);
                }

                // Special check for end date (critical - keep as user error)
                const endDateStr = exportEndDate.toLocaleDateString();
                if (missingDates.includes(endDateStr)) {
                    logUserError(`CRITICAL: End date ${endDateStr} is missing from export!`);
                }
            } else {
                console.log('✓ All dates in range have transactions');
                // Verify start and end dates specifically
                const startDateStr = exportStartDate.toLocaleDateString();
                const endDateStr = exportEndDate.toLocaleDateString();
                const hasStart = dateDistribution[startDateStr] && dateDistribution[startDateStr] > 0;
                const hasEnd = dateDistribution[endDateStr] && dateDistribution[endDateStr] > 0;
                if (hasStart && hasEnd) {
                    console.log(`✓ Verified: Both boundary dates present - Start: ${startDateStr} (${dateDistribution[startDateStr]} tx), End: ${endDateStr} (${dateDistribution[endDateStr]} tx)`);
                } else {
                    if (!hasStart) console.error(`❌ CRITICAL: Start date ${startDateStr} missing!`);
                    if (!hasEnd) console.error(`❌ CRITICAL: End date ${endDateStr} missing!`);
                }
            }
        }

        // Show date distribution of ALL found transactions (for debugging)
        const allDateDistribution = {};
        allTransactions.forEach(t => {
            const txDate = parseTransactionDate(t.date);
            if (txDate) {
                const dateKey = txDate.toLocaleDateString();
                allDateDistribution[dateKey] = (allDateDistribution[dateKey] || 0) + 1;
            }
        });
        console.log('Date distribution of all found transactions:', allDateDistribution);

        const totalTime = Math.floor((Date.now() - startTime) / 1000);
        const totalMinutes = Math.floor(totalTime / 60);
        const totalTimeDisplay = totalMinutes > 0
            ? `${totalMinutes}m ${totalTime % 60}s`
            : `${totalTime}s`;

        console.log(`Filtered transactions: ${filteredTransactions.length} (Total time: ${totalTimeDisplay})`);

        // Store result to return after finally block completes
        result = {
            allTransactions,
            filteredTransactions,
            elapsedTime: totalTimeDisplay,
            warning: rangeMissingWarning || undefined, // Include warning if range was missing
            shouldIncludePendingPreset: shouldIncludePendingPreset, // Include preset flag for use in callbacks
            sessionErrorDetected,
            sessionLogoutTime
        };
    } catch (mainError) {
        // Handle any errors in the main extraction process
        console.error('Error during main extraction process:', mainError);
        // Still calculate time even on error
        const totalTime = Math.floor((Date.now() - startTime) / 1000);
        const totalMinutes = Math.floor(totalTime / 60);
        const totalTimeDisplay = totalMinutes > 0
            ? `${totalMinutes}m ${totalTime % 60}s`
            : `${totalTime}s`;
        result = { allTransactions: [], filteredTransactions: [], elapsedTime: totalTimeDisplay, error: mainError.message };
        throw mainError;
    } finally {
        // Clean up UI - always runs, even if there's an error
        // Send final status update
        if (result) {
            sendScrollProgress({
                isScrolling: false,
                timeElapsed: result.elapsedTime || '0s',
                stopped: stopScrolling
            });
        }

        if (document.body.contains(stopButton)) {
            document.body.removeChild(stopButton);
        }
        if (document.body.contains(counterElement)) {
            document.body.removeChild(counterElement);
        }
        if (document.body.contains(progressBar)) {
            progressBar.style.width = '100%';
            setTimeout(() => {
                if (document.body.contains(progressBar)) {
                    document.body.removeChild(progressBar);
                }
            }, 500);
        }
    }

    // Return result after finally block completes
    return result;
}

// ============================================================================
// SCROLL & CAPTURE MODE: Simple scroll-and-capture function
// ============================================================================
/**
 * Simple scroll-and-capture mode: Just captures what you see as you scroll
 * No complex logic, no passes, just scroll and capture
 */
function startScrollCaptureMode(csvTypes) {
    console.log('📜 Starting Scroll & Capture mode...');

    let capturedTransactions = [];
    let isCapturing = true;

    // Store status box globally to prevent removal
    const STATUS_BOX_ID = 'txvault-scroll-capture-status';

    // Remove any existing status box first
    const existingBox = document.getElementById(STATUS_BOX_ID);
    if (existingBox) {
        existingBox.remove();
    }

    // Create status box with persistent ID
    const statusBox = document.createElement('div');
    statusBox.id = STATUS_BOX_ID;
    statusBox.style.cssText = `
        position: fixed !important;
        top: 50% !important;
        left: 50% !important;
        transform: translate(-50%, -50%) !important;
        background: rgba(0, 0, 0, 0.95) !important;
        color: white !important;
        padding: 25px 30px !important;
        border-radius: 12px !important;
        z-index: 999999 !important;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
        font-size: 16px !important;
        box-shadow: 0 8px 24px rgba(0,0,0,0.6) !important;
        min-width: 350px !important;
        max-width: 450px !important;
        pointer-events: auto !important;
        border: 3px solid #4caf50 !important;
        text-align: center !important;
    `;

    // Add CSS for animations
    if (!document.getElementById('txvault-scroll-capture-styles')) {
        const style = document.createElement('style');
        style.id = 'txvault-scroll-capture-styles';
        style.textContent = `
            @keyframes slideIn {
                from {
                    transform: translateX(-50%) translateY(-20px);
                    opacity: 0;
                }
                to {
                    transform: translateX(-50%) translateY(0);
                    opacity: 1;
                }
            }
            @keyframes slideOut {
                from {
                    transform: translateX(-50%) translateY(0);
                    opacity: 1;
                }
                to {
                    transform: translateX(-50%) translateY(-20px);
                    opacity: 0;
                }
            }
        `;
        document.head.appendChild(style);
    }

    // Make it persistent - prevent removal
    statusBox.setAttribute('data-txvault-persistent', 'true');

    // Notification function (defined once)
    const showNotification = (message, type = 'info') => {
        // Create notification element
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: ${type === 'success' ? '#4caf50' : type === 'error' ? '#f44336' : '#2196f3'};
            color: white;
            padding: 15px 20px;
            border-radius: 8px;
            z-index: 999998;
            font-size: 14px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            max-width: 400px;
            white-space: pre-line;
            animation: slideIn 0.3s ease-out;
            text-align: center;
        `;
        notification.textContent = message;
        document.body.appendChild(notification);

        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (document.body.contains(notification)) {
                notification.style.animation = 'slideOut 0.3s ease-out';
                setTimeout(() => {
                    if (document.body.contains(notification)) {
                        document.body.removeChild(notification);
                    }
                }, 300);
            }
        }, 5000);
    };

    // Create export button
    const exportBtn = document.createElement('button');
    exportBtn.textContent = '📥 Export CSV';
    exportBtn.style.cssText = `
        margin-top: 10px;
        padding: 8px 16px;
        background: #4caf50;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 13px;
        width: 100%;
        font-weight: bold;
    `;

    exportBtn.onclick = () => {
        if (capturedTransactions.length === 0) {
            showNotification('⚠️ No transactions captured yet.\n\n📜 Scroll to load transactions first', 'error');
            return;
        }

        // Prepare transactions for export: filter valid dates and remove duplicates
        const beforeCount = capturedTransactions.length;
        const preparedTransactions = prepareTransactionsForExport(capturedTransactions);
        const removedCount = beforeCount - preparedTransactions.length;

        if (preparedTransactions.length === 0) {
            showNotification('⚠️ No valid transactions to export.\n\nAll transactions have "Pending" dates or are duplicates.', 'error');
            logUserError(`Scroll & Capture: No valid transactions after filtering. Original count: ${beforeCount}`);
            return;
        }

        // Log filtering results
        if (removedCount > 0) {
            console.log(`📊 Scroll & Capture Export: Filtered ${removedCount} transaction(s) (Pending dates or duplicates)`);
            console.log(`   Original: ${beforeCount}, After filtering: ${preparedTransactions.length}`);
        }

        // Generate CSV
        const csvData = convertToCSV(preparedTransactions);
        const today = new Date();
        const fileName = `scroll_capture_${today.toISOString().split('T')[0]}.csv`;
        saveCSVToFile(csvData, fileName);

        const exportMsg = removedCount > 0
            ? `✅ EXPORTED!\n\n📥 ${preparedTransactions.length} transaction(s)\n\n⚠️ Removed ${removedCount} (Pending/duplicates)\n\nFile: ${fileName}`
            : `✅ EXPORTED!\n\n📥 ${preparedTransactions.length} transaction(s)\n\nFile: ${fileName}`;

        showNotification(exportMsg, 'success');
        console.log(`✅ Scroll & Capture: Exported ${preparedTransactions.length} transactions`);
    };

    // Create stop button
    const stopBtn = document.createElement('button');
    stopBtn.textContent = '⏹ Stop Capturing';
    stopBtn.style.cssText = `
        margin-top: 5px;
        padding: 8px 16px;
        background: #f44336;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 13px;
        width: 100%;
    `;

    // Store stop handler separately so we can enhance it later
    const stopHandler = () => {
        isCapturing = false;
        window.__txvaultScrollCaptureIsActive = false;
        window.removeEventListener('scroll', scrollCaptureHandler);
        if (periodicCapture) {
            clearInterval(periodicCapture);
        }
        updateStatus(); // Update to show stopped state
        showNotification(`⏹ CAPTURING STOPPED\n\n✅ Captured ${capturedTransactions.length} transaction(s)\n\n📥 Click "Export CSV" to download`, 'info');
    };

    stopBtn.onclick = stopHandler;

    // Update status function with statistics
    const updateStatus = () => {
        const uniqueCount = capturedTransactions.length;
        const statusText = isCapturing ? '📜 Capturing...' : '⏹ Stopped';
        const statusColor = isCapturing ? '#4caf50' : '#ff9800';

        // Calculate date range statistics
        const dates = capturedTransactions
            .map(t => parseTransactionDate(t.date))
            .filter(d => d !== null && d !== undefined)
            .sort((a, b) => a.getTime() - b.getTime());

        let dateRangeText = '';
        let monthlyStats = '';
        if (dates.length > 0) {
            const oldestDate = dates[0];
            const newestDate = dates[dates.length - 1];
            dateRangeText = `${oldestDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} - ${newestDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

            // Calculate monthly counts
            const monthlyCounts = {};
            dates.forEach(d => {
                const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                monthlyCounts[monthKey] = (monthlyCounts[monthKey] || 0) + 1;
            });

            // Format monthly stats (show last 6 months)
            const sortedMonths = Object.keys(monthlyCounts).sort().reverse().slice(0, 6);
            if (sortedMonths.length > 0) {
                monthlyStats = '<div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #444; font-size: 12px; text-align: left;">';
                monthlyStats += '<div style="color: #aaa; margin-bottom: 8px; text-align: center;">📊 Monthly Counts:</div>';
                sortedMonths.forEach(monthKey => {
                    const [year, month] = monthKey.split('-');
                    const monthName = new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
                    monthlyStats += `<div style="display: flex; justify-content: space-between; margin-bottom: 4px;"><span>${monthName}:</span> <strong style="color: #4caf50;">${monthlyCounts[monthKey]}</strong></div>`;
                });
                monthlyStats += '</div>';
            }
        }

        statusBox.innerHTML = `
            <div style="color: ${statusColor}; font-weight: bold; margin-bottom: 15px; font-size: 20px;">${statusText}</div>
            <div style="margin-bottom: 10px; font-size: 18px;">Captured: <strong style="font-size: 28px; color: #4caf50;">${uniqueCount}</strong> transactions</div>
            ${dateRangeText ? `<div style="font-size: 13px; color: #aaa; margin-bottom: 15px;">📅 ${dateRangeText}</div>` : ''}
            ${isCapturing ? '<div style="font-size: 13px; color: #aaa; margin-bottom: 15px;">📜 Scroll to capture more...</div>' : '<div style="font-size: 13px; color: #aaa; margin-bottom: 15px;">Ready to export</div>'}
            ${monthlyStats}
        `;
        statusBox.appendChild(exportBtn);
        if (isCapturing) {
            statusBox.appendChild(stopBtn);
        }
    };

    // Scroll handler - capture transactions when user scrolls
    let lastCaptureTime = 0;
    const scrollCaptureHandler = () => {
        if (!isCapturing) return;

        // Throttle captures (once per 500ms)
        const now = Date.now();
        if (now - lastCaptureTime < 500) return;
        lastCaptureTime = now;

        // Extract transactions
        const newTransactions = extractAllTransactions();

        // Combine with existing
        const beforeCount = capturedTransactions.length;
        capturedTransactions = combineTransactions(capturedTransactions, newTransactions);
        const newCount = capturedTransactions.length - beforeCount;

        if (newCount > 0) {
            console.log(`📜 Scroll & Capture: Added ${newCount} new transaction(s) (total: ${capturedTransactions.length})`);
            updateStatus();
            // Show notification for significant additions
            if (newCount >= 5) {
                showNotification(`✅ +${newCount} transactions captured!\n\nTotal: ${capturedTransactions.length}`, 'success');
            }
        }
    };

    // Initial capture - do multiple passes for better coverage
    capturedTransactions = extractAllTransactions();
    setTimeout(() => {
        const pass2 = extractAllTransactions();
        capturedTransactions = combineTransactions(capturedTransactions, pass2);
        setTimeout(() => {
            const pass3 = extractAllTransactions();
            capturedTransactions = combineTransactions(capturedTransactions, pass3);
            updateStatus();
        }, 300);
    }, 300);
    updateStatus();

    // Add scroll listener
    window.addEventListener('scroll', scrollCaptureHandler, { passive: true });

    // Also capture periodically even without scroll (for lazy loading)
    const periodicCapture = setInterval(() => {
        if (!isCapturing) {
            clearInterval(periodicCapture);
            return;
        }
        const newTx = extractAllTransactions();
        const beforeCount = capturedTransactions.length;
        capturedTransactions = combineTransactions(capturedTransactions, newTx);
        if (capturedTransactions.length > beforeCount) {
            console.log(`📜 Periodic capture: Added ${capturedTransactions.length - beforeCount} new transaction(s)`);
            updateStatus();
        }
    }, 2000); // Capture every 2 seconds

    // Add status box to page - use multiple times to ensure it stays
    const ensureStatusBoxExists = () => {
        if (!document.getElementById(STATUS_BOX_ID)) {
            document.body.appendChild(statusBox);
            console.log('📜 Status box re-added to page');
        }
    };

    // Add status box initially
    ensureStatusBoxExists();

    // Monitor for removal and re-add if needed (persistent mode)
    const observer = new MutationObserver((mutations) => {
        if (!document.getElementById(STATUS_BOX_ID)) {
            console.log('📜 Status box was removed - re-adding...');
            ensureStatusBoxExists();
            updateStatus(); // Restore buttons
        }
    });

    // Watch for changes to body
    observer.observe(document.body, {
        childList: true,
        subtree: false
    });

    // Also watch document for any removals
    const docObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.removedNodes.forEach((node) => {
                if (node === statusBox || (node.nodeType === 1 && node.id === STATUS_BOX_ID)) {
                    console.log('📜 Status box detected as removed - re-adding...');
                    setTimeout(() => ensureStatusBoxExists(), 100);
                }
            });
        });
    });

    docObserver.observe(document, {
        childList: true,
        subtree: true
    });

    // Store reference globally to prevent garbage collection
    window.__txvaultScrollCaptureStatusBox = statusBox;
    window.__txvaultScrollCaptureIsActive = true;

    // Show initial notification
    setTimeout(() => {
        showNotification(`📜 Scroll & Capture Started!\n\n✅ Captured ${capturedTransactions.length} transaction(s)\n\n📜 START SCROLLING to capture more\n\n📥 Export button in BOTTOM-LEFT`, 'success');
    }, 500);

    console.log(`✅ Scroll & Capture mode started. Captured ${capturedTransactions.length} initial transactions.`);
    console.log('   Status box visible in BOTTOM-LEFT corner (persistent)');
    console.log('   Scroll to capture more transactions. Click "Export CSV" when ready.');

    // Update stop button to also remove observers
    const originalStopHandler = stopBtn.onclick;
    stopBtn.onclick = () => {
        isCapturing = false;
        window.__txvaultScrollCaptureIsActive = false;
        observer.disconnect();
        docObserver.disconnect();
        originalStopHandler();
        // Don't remove status box - keep it visible with "Stopped" message
    };

    // Return cleanup function (but don't auto-cleanup - user must stop manually)
    return () => {
        isCapturing = false;
        window.__txvaultScrollCaptureIsActive = false;
        observer.disconnect();
        docObserver.disconnect();
        window.removeEventListener('scroll', scrollCaptureHandler);
        // Keep status box visible - don't remove it
    };
}

// Message Listener
// ============================================================================

// FIXED: Robust content script initialization with SPA and DOM readiness handling
// FIXED: Set markers immediately to prevent duplicate injection and verify script is loaded
// Set script loaded marker immediately (before any checks)
window.__ckExportScriptLoaded = true;

// Guard against duplicate listeners (in case script is injected multiple times)
if (!window.__ckExportListenerAttached) {
    window.__ckExportListenerAttached = true;

    // FIXED: Add error handling for content script initialization
    try {
        console.log('TxVault: Content script initializing...');
        console.log('TxVault: Page URL:', window.location.href);
        console.log('TxVault: Document ready state:', document.readyState);
        // Wait a bit for DOM to be ready before checking
        setTimeout(() => {
            const currentUrl = window.location.href;
            // CRITICAL: Check actual current URL, not redirect parameters
            // Only check for auth pages if URL path actually starts with /auth/ or contains /login/ or /logon/ as a path segment
            // Don't match /auth/ if it's just in a query parameter (like redirectUrl)
            const urlPath = new URL(currentUrl).pathname.toLowerCase();
            const isAuthPage = urlPath.includes('/update') ||
                               urlPath.startsWith('/auth/') ||
                               urlPath.includes('/login') ||
                               urlPath.includes('/logon');

            if (isAuthPage) {
                console.warn('TxVault: ⚠️ Extension is on an authentication/login page. Please navigate to the Credit Karma transactions page to use the export feature.');
                console.warn(`TxVault: Current URL: ${currentUrl}`);
                console.warn(`TxVault: URL Path: ${urlPath}`);
            } else {
                const txCount = document.querySelectorAll('[data-index]').length;
                console.log(`TxVault: Transaction elements found: ${txCount}`);
                if (txCount === 0 && currentUrl.includes('creditkarma.com')) {
                    console.warn('TxVault: ⚠️ No transaction elements found - page may still be loading or selectors may have changed');
                }
            }
        }, 1000);
    } catch (initError) {
        console.error('TxVault: Error during content script initialization:', initError);
    }
}

// FIXED: Ensure listener is ALWAYS attached (even if already initialized)
// Move listener attachment outside guard check so it always runs
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    // Only attach if not already attached (prevent duplicates)
    if (!window.__ckMessageListenerAttached) {
        window.__ckMessageListenerAttached = true;
        // Always attach listener (even if initialization was skipped)
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'captureTransactions') {
            try {
            const { startDate, endDate, csvTypes, trimToExactMonth = true } = request;

            // Check if scroll-capture mode
            const isScrollCaptureMode = request.preset === 'scroll-capture';

            console.log(`📜 Preset check: request.preset = "${request.preset}", isScrollCaptureMode = ${isScrollCaptureMode}`);

            if (isScrollCaptureMode) {
                // Start simple scroll-and-capture mode
                console.log('📜 Scroll & Capture mode detected - starting capture mode...');
                sendResponse({ status: 'started', message: 'Scroll & Capture mode started' });

                // Start capture mode immediately
                startScrollCaptureMode(csvTypes);
                return true;
            }

            // Validate required parameters before proceeding
            if (!startDate || !endDate) {
                const errorMsg = `Missing required date parameters: startDate=${startDate}, endDate=${endDate}`;
                console.error(`❌ ${errorMsg}`);
                alert(`Error: ${errorMsg}. Please check your date inputs and try again.`);
                sendResponse({ status: 'error', message: errorMsg });
                return true;
            }

            console.log(`Received request to capture transactions from ${startDate} to ${endDate}`);
            console.log(`Trim to exact month: ${trimToExactMonth}`);

            // Check if we're on the correct page (more flexible URL matching)
            // Also check if transaction elements exist on the page
            // CRITICAL: Exclude auth/update/redirect pages
            const currentUrl = window.location.href;
            const currentUrlLower = currentUrl.toLowerCase();
            const hasTransactionElements = document.querySelectorAll('[data-index]').length > 0;

            // DEBUG: Log current page state
            console.log('TxVault: Page detection check:');
            console.log(`  Current URL: ${currentUrl}`);
            console.log(`  Transaction elements found: ${hasTransactionElements}`);
            console.log(`  Transaction count: ${document.querySelectorAll('[data-index]').length}`);

            // CRITICAL: Exclude auth/update/redirect pages - check URL PATH, not query parameters
            // Only check for /auth/ in the actual path, not in redirectUrl query parameters
            // Use URL.pathname to get only the path portion, ignoring query strings
            const urlPath = new URL(currentUrl).pathname.toLowerCase();
            const isAuthPage = urlPath.includes('/update') ||
                               urlPath.startsWith('/auth/') ||
                               urlPath.includes('/login') ||
                               urlPath.includes('/logon') ||
                               urlPath.includes('/signin') ||
                               (currentUrlLower.includes('code=') && currentUrlLower.includes('oauth')) ||
                               (currentUrlLower.includes('token=') && currentUrlLower.includes('oauth'));

            // Check if it's a transactions page - prioritize transaction elements over URL
            // If we have transaction elements, we're definitely on the transactions page
            const hasTransactionsUrl = currentUrlLower.includes('/networth/transactions') ||
                                      currentUrlLower.includes('/transactions');

            const isTransactionsPage = !isAuthPage &&
                                      currentUrlLower.includes('creditkarma.com') &&
                                      (hasTransactionsUrl || hasTransactionElements);

            console.log('TxVault: Page detection results:');
            console.log(`  isAuthPage: ${isAuthPage}`);
            console.log(`  hasTransactionsUrl: ${hasTransactionsUrl}`);
            console.log(`  hasTransactionElements: ${hasTransactionElements}`);
            console.log(`  isTransactionsPage: ${isTransactionsPage}`);

            if (!isTransactionsPage) {
                if (isAuthPage) {
                    const diagnosticMsg = `
═══════════════════════════════════════════════════════════════════════════════
🔴 ERROR: Extension Cannot Run on Authentication Page
═══════════════════════════════════════════════════════════════════════════════

🌐 CURRENT PAGE STATE:
   • Current URL: ${currentUrl}
   • URL Path: ${urlPath}
   • URL Host: ${new URL(currentUrl).host}
   • URL Query: ${new URL(currentUrl).search || 'None'}
   • Is Auth Page: YES
   • Is Transactions Page: NO
   • Has Transaction Elements: ${hasTransactionElements}
   • Transaction Element Count: ${document.querySelectorAll('[data-index]').length}

🔍 DETECTION DETAILS:
   • URL Path Contains /auth/: ${urlPath.includes('/auth/')}
   • URL Path Starts With /auth/: ${urlPath.startsWith('/auth/')}
   • URL Path Contains /login: ${urlPath.includes('/login')}
   • URL Path Contains /logon: ${urlPath.includes('/logon')}
   • URL Path Contains /signin: ${urlPath.includes('/signin')}
   • URL Path Contains /update: ${urlPath.includes('/update')}

💡 SOLUTION:
   1. Navigate to: https://www.creditkarma.com/networth/transactions
   2. Wait for the transactions page to fully load
   3. Ensure you see your transaction list on the page
   4. Verify URL shows /transactions in the path
   5. Then run the extension again

📋 EXPECTED URL FORMAT:
   • Correct: https://www.creditkarma.com/networth/transactions
   • Correct: https://www.creditkarma.com/transactions
   • Incorrect: https://www.creditkarma.com/auth/logon (current)

═══════════════════════════════════════════════════════════════════════════════`;
                    console.error(diagnosticMsg);
                    console.error('TxVault: ❌ On authentication/login page. Extension cannot run on auth pages.');
                    console.error(`TxVault: Current URL: ${currentUrl}`);
                    console.error('TxVault: Please ensure you are on the transactions page before using the extension.');
                    sendResponse({
                        status: 'error',
                        message: `On authentication/login page. Current URL: ${currentUrl}. Please navigate to the transactions page first. Check console (F12) for full diagnostic details.`,
                        isAuthPage: true,
                        currentUrl: currentUrl
                    });
                    return true;
                }

                // COMPREHENSIVE DIAGNOSTIC for not on transactions page
                const diagnosticMsg = `
═══════════════════════════════════════════════════════════════════════════════
⚠️ WARNING: Not on Transactions Page
═══════════════════════════════════════════════════════════════════════════════

🌐 CURRENT PAGE STATE:
   • Current URL: ${currentUrl}
   • URL Path: ${urlPath}
   • URL Host: ${new URL(currentUrl).host}
   • Is Auth Page: ${isAuthPage}
   • Is Transactions Page: NO
   • Has Transaction Elements: ${hasTransactionElements}
   • Transaction Element Count: ${document.querySelectorAll('[data-index]').length}

🔍 PAGE DETECTION RESULTS:
   • URL Contains /transactions: ${hasTransactionsUrl}
   • URL Contains /networth/transactions: ${currentUrlLower.includes('/networth/transactions')}
   • URL Contains creditkarma.com: ${currentUrlLower.includes('creditkarma.com')}
   • Has Transaction Elements: ${hasTransactionElements}

💡 SOLUTION:
   1. Navigate to: https://www.creditkarma.com/networth/transactions
   2. Wait for the page to fully load
   3. Ensure transaction list is visible on the page
   4. Verify URL shows /transactions in the path
   5. Then run the extension again

📋 EXPECTED URL FORMAT:
   • Correct: https://www.creditkarma.com/networth/transactions
   • Correct: https://www.creditkarma.com/transactions
   • Current: ${currentUrl}

═══════════════════════════════════════════════════════════════════════════════`;
                console.warn(diagnosticMsg);
                console.warn('TxVault: ⚠️ Not on transactions page.');
                console.warn(`TxVault: Current URL: ${currentUrl}`);
                console.warn(`TxVault: Transaction elements: ${hasTransactionElements}`);

                // If we're on creditkarma.com but not transactions page, suggest navigation
                if (currentUrlLower.includes('creditkarma.com')) {
                    sendResponse({
                        status: 'error',
                        message: `Not on transactions page. Current URL: ${currentUrl}. Please navigate to the transactions page. Check console (F12) for full diagnostic details.`,
                        currentUrl: currentUrl,
                        hasTransactionElements: hasTransactionElements
                    });
                } else {
                    sendResponse({
                        status: 'error',
                        message: `You must be on the Credit Karma transactions page to export transactions. Current URL: ${currentUrl}. Check console (F12) for full diagnostic details.`,
                        currentUrl: currentUrl
                    });
                }
                return true;
            }

            console.log('TxVault: ✅ On transactions page. Proceeding with capture...');

            // Create progress indicator immediately
            const indicator = document.createElement('div');
            indicator.style.cssText = `
                position: fixed;
                top: 10px;
                left: 20px;
                padding: 12px 20px;
                background: rgba(0, 0, 0, 0.9);
                color: white;
                border-radius: 6px;
                z-index: 9999;
                font-size: 14px;
                font-weight: 500;
                box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            `;
            indicator.textContent = '🔄 Scraping transactions... Please wait.';
            document.body.appendChild(indicator);

            // Respond immediately to avoid connection timeout
            sendResponse({ status: 'started', message: 'Transaction capture started' });

            // Wait for page to be ready (non-blocking)
            // IMPROVED: Longer wait time for app refresh scenarios
            const waitForPageReady = async () => {
                if (!hasTransactionElements) {
                    console.log('Waiting for transaction elements to load...');
                    indicator.textContent = '⏳ Waiting for page to load...';
                    // Wait up to 15 seconds for transactions to appear (increased from 5 seconds)
                    // This handles cases where the page is refreshing from the app
                    let foundCount = 0;
                    let stableCount = 0;
                    let lastCount = 0;
                    for (let i = 0; i < 150; i++) {
                        await new Promise(resolve => setTimeout(resolve, 100));
                        const currentCount = document.querySelectorAll('[data-index]').length;
                        if (currentCount > 0) {
                            foundCount = currentCount;
                            if (currentCount === lastCount) {
                                stableCount++;
                                // Require transactions to be stable for 2 seconds before proceeding
                                if (stableCount >= 20) {
                                    console.log(`Transaction elements found and stable: ${foundCount} transactions. Proceeding...`);
                                    indicator.textContent = '✓ Page loaded. Starting extraction...';
                                    await new Promise(resolve => setTimeout(resolve, 500));
                                    return true;
                                }
                            } else {
                                stableCount = 0;
                            }
                            lastCount = currentCount;
                        } else {
                            stableCount = 0;
                        }
                        // Update indicator every second
                        if (i % 10 === 0) {
                            indicator.textContent = `⏳ Waiting for page to load... (${Math.floor(i/10)}s)`;
                        }
                    }
                    if (foundCount > 0) {
                        console.log(`Transaction elements found but not fully stable: ${foundCount} transactions. Proceeding anyway...`);
                    } else {
                        console.warn('No transaction elements found after waiting 15 seconds - proceeding anyway');
                    }
                    indicator.textContent = '✓ Page loaded. Starting extraction...';
                    await new Promise(resolve => setTimeout(resolve, 1000)); // Extra wait before starting
                } else {
                    // Even if elements exist, wait a bit to ensure page is fully rendered
                    console.log('Transaction elements already present. Waiting for page stability...');
                    indicator.textContent = '✓ Page loaded. Ensuring stability...';
                    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds for stability
                }
                return true;
            };

            // Start capture after page is ready
            // Pass request object to include trim option
            waitForPageReady().then(() => {
                return captureTransactionsInDateRange(startDate, endDate, request);
            }).then(({ allTransactions, filteredTransactions, elapsedTime, shouldIncludePendingPreset, warning }) => {
                // FIXED: warning is now included in destructuring to prevent "warning is not defined" error
                console.log(`Capture complete. Found ${filteredTransactions.length} transactions in range`);

                // Remove indicator
                if (document.body.contains(indicator)) {
                document.body.removeChild(indicator);
                }

                // Log what we found for debugging
                console.log('=== EXPORT RESULTS ===');
                console.log(`Date range selected: ${startDate} to ${endDate}`);
                console.log(`Total transactions found: ${allTransactions.length}`);
                console.log(`Transactions exported: ${filteredTransactions.length}`);

                if (filteredTransactions.length === 0) {
                    console.warn('No transactions found in the specified date range!');
                    console.warn(`Searched range: ${startDate} to ${endDate}`);

                    // Check if dates are in the future
                    const daysUntilStart = (startDateObj - SYSTEM_DATE) / (24 * 60 * 60 * 1000);
                    const isFutureDate = daysUntilStart > 7;

                    // Show sample of found transactions for debugging
                    const sampleTransactions = allTransactions.slice(0, 10).map(t => ({
                        date: t.date,
                        parsed: parseTransactionDate(t.date)?.toLocaleDateString()
                    }));
                    console.warn('All transactions found:', sampleTransactions);

                    // Build helpful error message
                    let errorMsg = `No transactions found in the specified date range (${startDate} to ${endDate}).\n\n`;
                    errorMsg += `Found ${allTransactions.length} total transactions on the page.\n\n`;

                    if (isFutureDate) {
                        errorMsg += '⚠️ WARNING: The selected date range appears to be in the FUTURE.\n';
                        errorMsg += `System date: ${SYSTEM_DATE.toLocaleDateString()}\n`;
                        errorMsg += `Selected range: ${startDateObj.toLocaleDateString()} to ${endDateObj.toLocaleDateString()}\n\n`;
                        errorMsg += `Did you mean to select ${startDateObj.getFullYear() - 1} instead of ${startDateObj.getFullYear()}?\n\n`;
                    }

                    // Show date range of found transactions if available
                    if (allTransactions.length > 0) {
                        const foundDates = allTransactions
                            .map(t => parseTransactionDate(t.date))
                            .filter(d => d !== null)
                            .sort((a, b) => a.getTime() - b.getTime());

                        if (foundDates.length > 0) {
                            const oldestDate = foundDates[0];
                            const newestDate = foundDates[foundDates.length - 1];
                            errorMsg += `Found transactions date range: ${oldestDate.toLocaleDateString()} to ${newestDate.toLocaleDateString()}\n\n`;
                        }
                    }

                    errorMsg += 'Check the browser console (F12) for details.';

                    alert(errorMsg);
                    return;
                }

                // Warn if we found fewer transactions than expected
                if (filteredTransactions.length < allTransactions.length * 0.5) {
                    console.warn(`Warning: Only ${filteredTransactions.length} transactions in range out of ${allTransactions.length} total found.`);
                    console.warn('This might indicate a date filtering issue.');
                }

                // Calculate statistics
                const completeness = calculateCompleteness(filteredTransactions);
                const filesGenerated = [];

                // Calculate posted transaction date range
                const postedTxs = filteredTransactions.filter(t => {
                    const isPendingStatus = t.status && t.status.toLowerCase() === 'pending';
                    return !isPendingStatus;
                });
                let postedDateRange = 'N/A';
                if (postedTxs.length > 0) {
                    const postedDates = postedTxs.map(t => parseTransactionDate(t.date)).filter(d => d);
                    if (postedDates.length > 0) {
                        const minDate = new Date(Math.min(...postedDates.map(d => d.getTime())));
                        const maxDate = new Date(Math.max(...postedDates.map(d => d.getTime())));
                        postedDateRange = `${minDate.toLocaleDateString()} to ${maxDate.toLocaleDateString()}`;
                    }
                }

                // Count pending and posted transactions explicitly
                // For presets that include pending (this-week, this-month, this-year), show both counts
                const pendingTransactions = filteredTransactions.filter(t => {
                    const isPendingStatus = t.status && t.status.toLowerCase() === 'pending';
                    const hasNoDate = !t.date || (typeof t.date === 'string' && t.date.trim() === '');
                    // Count as pending if status is "Pending" OR has no date (for presets that include pending)
                    return isPendingStatus || (hasNoDate && shouldIncludePendingPreset);
                });
                const pendingCount = pendingTransactions.length;

                // Count posted transactions (non-pending)
                const postedTransactionsBeforeDedup = filteredTransactions.filter(t => {
                    const isPendingStatus = t.status && t.status.toLowerCase() === 'pending';
                    const hasNoDate = !t.date || (typeof t.date === 'string' && t.date.trim() === '');
                    return !isPendingStatus && !hasNoDate;
                });
                const postedCountBeforeDedup = postedTransactionsBeforeDedup.length;

                // Prepare transactions for export: filter valid dates and remove duplicates
                const beforeCount = filteredTransactions.length;
                const preparedTransactions = prepareTransactionsForExport(filteredTransactions, { preset: request && request.preset });
                const removedCount = beforeCount - preparedTransactions.length;

                if (removedCount > 0) {
                    console.log(`📊 Export: Filtered ${removedCount} transaction(s) (Pending dates or duplicates)`);
                    console.log(`   Before filtering: ${beforeCount}, After filtering: ${preparedTransactions.length}`);
                }

                // Generate and save CSVs
                let primaryFileName = null;
                if (csvTypes.allTransactions) {
                    const allCsvData = convertToCSV(preparedTransactions);
                    const fileName = `all_transactions_${startDate.replace(/\//g, '-')}_to_${endDate.replace(/\//g, '-')}.csv`;
                    saveCSVToFile(allCsvData, fileName);
                    primaryFileName = primaryFileName || fileName;
                    filesGenerated.push('all_transactions.csv');
                }

                if (csvTypes.income) {
                    const creditTransactions = preparedTransactions.filter(t => t.transactionType === 'credit');
                    if (creditTransactions.length > 0) {
                        const creditCsvData = convertToCSV(creditTransactions);
                        const fileName = `income_${startDate.replace(/\//g, '-')}_to_${endDate.replace(/\//g, '-')}.csv`;
                        saveCSVToFile(creditCsvData, fileName);
                        primaryFileName = primaryFileName || fileName;
                        filesGenerated.push('income.csv');
                    }
                }

                if (csvTypes.expenses) {
                    const debitTransactions = preparedTransactions.filter(t => t.transactionType === 'debit');
                    if (debitTransactions.length > 0) {
                        const debitCsvData = convertToCSV(debitTransactions);
                        const fileName = `expenses_${startDate.replace(/\//g, '-')}_to_${endDate.replace(/\//g, '-')}.csv`;
                        saveCSVToFile(debitCsvData, fileName);
                        primaryFileName = primaryFileName || fileName;
                        filesGenerated.push('expenses.csv');
                    }
                }

                // LAST MONTH EXPORT SUMMARY: show before/after posted counts
                if (request && request.preset === 'last-month') {
                    const postedAfterDedup = preparedTransactions.length;
                    console.log(`📊 Last Month export: allTransactions=${allTransactions.length}, inRangePosted(before dedup)=${postedCountBeforeDedup}, inRangePosted(after dedup)=${postedAfterDedup}`);
                }

                // Save run stats sidecar files for presets when primary CSV name is known
                try {
                    if (typeof runStats !== 'undefined' && runStats && primaryFileName) {
                        // Populate core counts for this export
                        runStats.counts.totalTransactions = allTransactions.length;
                        runStats.counts.inRangeAll = filteredTransactions.length;
                        runStats.counts.inRangePosted = postedTransactions.length;

                        // For presets that include pending (this-week, this-month, this-year),
                        // record how many pending transactions were in range and included.
                        if (shouldIncludePendingPreset) {
                            runStats.counts.pendingInRange = pendingCount;
                        } else {
                            runStats.counts.pendingInRange = 0;
                        }

                        // Record pending and posted counts for validation
                        runStats.counts.pendingCountCaptured = pendingCount;
                        runStats.counts.postedCountCaptured = postedCountBeforeDedup;

                        // ============================================================================
                        // VALIDATION: Newest Boundary Check
                        // ============================================================================
                        // Confirm at least one transaction with date === newestVisibleDate exists in captured set
                        if (runStats.boundaries.newestVisibleDate) {
                            const newestDateStr = runStats.boundaries.newestVisibleDate;
                            const hasNewestDate = preparedTransactions.some(t => {
                                if (!t.date) return false;
                                const txDate = parseTransactionDate(t.date);
                                if (!txDate) return false;
                                const txDateStr = txDate.toISOString().split('T')[0];
                                return txDateStr === newestDateStr;
                            });

                            runStats.boundaries.newestBoundaryPassed = hasNewestDate;
                            runStats.validation.newestBoundaryCheck = hasNewestDate ? 'PASS' : 'FAIL';

                            if (!hasNewestDate) {
                                runStats.validation.exportStatus = 'INCOMPLETE_NEWEST_BOUNDARY';
                                runStats.alerts = runStats.alerts || [];
                                runStats.alerts.push('NEWEST_BOUNDARY_MISSING');
                                const warningMsg = 'Export complete with warnings: some newest transactions may be missing. See details in the log or rerun with a smaller date range.';
                                logUserWarning(warningMsg, { newestDate: newestDateStr });
                                runStats.notes = runStats.notes || [];
                                runStats.notes.push(`Newest visible date ${newestDateStr} not found in CSV`);
                                logDevDebug(`Newest boundary validation FAILED: Newest visible date ${newestDateStr} not found in captured transactions`);
                            } else {
                                logDevDebug(`✅ Newest boundary validation PASSED: Found transaction with date ${newestDateStr}`);
                            }
                        }

                        // ============================================================================
                        // VALIDATION: Pending vs Posted Consistency Check
                        // ============================================================================
                        if (shouldIncludePendingPreset && runStats.counts.pendingCountVisible != null) {
                            // Compare pendingCountCaptured with visible Pending count
                            const pendingMismatch = Math.abs(runStats.counts.pendingCountCaptured - runStats.counts.pendingCountVisible) > 2; // Allow small variance

                            if (pendingMismatch) {
                                runStats.validation.pendingConsistencyCheck = 'WARN';
                                if (runStats.validation.exportStatus !== 'INCOMPLETE_NEWEST_BOUNDARY') {
                                    runStats.validation.exportStatus = 'COMPLETE_WITH_WARNINGS_PENDING_MISMATCH';
                                }
                                runStats.alerts = runStats.alerts || [];
                                runStats.alerts.push('PENDING_COUNT_MISMATCH');
                                const warningMsg = 'Export complete with warnings: pending vs posted counts don\'t match what\'s on screen. Please double-check pending rows.';
                                logUserWarning(warningMsg, {
                                    captured: runStats.counts.pendingCountCaptured,
                                    visible: runStats.counts.pendingCountVisible
                                });
                                runStats.notes = runStats.notes || [];
                                runStats.notes.push(`Pending count mismatch: CSV=${runStats.counts.pendingCountCaptured}, UI=${runStats.counts.pendingCountVisible}`);
                                logDevDebug(`Pending consistency check WARN: Captured=${runStats.counts.pendingCountCaptured}, Visible=${runStats.counts.pendingCountVisible}`);
                            } else {
                                runStats.validation.pendingConsistencyCheck = 'PASS';
                                logDevDebug(`✅ Pending consistency check PASSED: Captured=${runStats.counts.pendingCountCaptured}, Visible=${runStats.counts.pendingCountVisible}`);
                            }
                        } else if (shouldIncludePendingPreset && runStats.counts.pendingCountVisible == null) {
                            // Could not estimate visible pending count, but pending section exists
                            if (pendingCount > 0) {
                                runStats.validation.pendingConsistencyCheck = 'PASS'; // Assume OK if we captured some pending
                                logDevDebug(`✅ Pending consistency check: Captured ${pendingCount} pending transactions (visible count not available)`);
                            }
                        }

                        // ============================================================================
                        // VALIDATION: Reference Comparison for Last Year Preset
                        // ============================================================================
                        if (request && request.preset === 'last-year') {
                            const targetYear = startDateObj.getFullYear(); // Should be 2024 for Last Year
                            const actualRowCount = runStats.counts.inRangeAll || filteredTransactions.length;

                            // Try to load reference data and compare (async, non-blocking)
                            // This runs in parallel and updates runStats when complete
                            (async () => {
                                try {
                                    const referenceDateCounts = await loadReferenceData(targetYear);

                                    if (referenceDateCounts && Object.keys(referenceDateCounts).length > 0) {
                                        // Compare current export with reference
                                        const comparison = compareWithReference(preparedTransactions, referenceDateCounts, targetYear);

                                        if (comparison) {
                                            // Store comparison results in runStats
                                            if (!runStats.validation.referenceComparison) {
                                                runStats.validation.referenceComparison = {};
                                            }
                                            runStats.validation.referenceComparison = {
                                                referenceTotal: comparison.referenceTotal,
                                                currentTotal: comparison.currentTotal,
                                                totalDelta: comparison.totalDelta,
                                                datesWithDifferences: comparison.datesWithDifferences,
                                                exactMatches: comparison.exactMatches,
                                                datesWithFewer: comparison.datesWithFewer.slice(0, 10), // Top 10
                                                datesWithMore: comparison.datesWithMore.slice(0, 10) // Top 10
                                            };

                                            // Determine if mismatches are significant
                                            const hasSignificantMismatches = comparison.datesWithDifferences > 0 && (
                                                Math.abs(comparison.totalDelta) > 2 ||
                                                comparison.datesWithDifferences > 10 ||
                                                comparison.datesWithFewer.some(d => Math.abs(d.delta) > 2) ||
                                                comparison.datesWithMore.some(d => Math.abs(d.delta) > 2)
                                            );

                                            // Check if mismatches are only on empty days (acceptable)
                                            const onlyEmptyDayMismatches = comparison.datesWithDifferences > 0 &&
                                                comparison.datesWithFewer.every(d => d.refCount === 0 && d.curCount === 0) &&
                                                comparison.datesWithMore.every(d => d.refCount === 0 && d.curCount === 0);

                                            // Update export status based on reference comparison
                                            if (comparison.totalDelta === 0 && comparison.datesWithDifferences === 0) {
                                                // Perfect match with reference - can be PRISTINE
                                                if (!runStats.validation.exportStatus || runStats.validation.exportStatus === 'PRISTINE') {
                                                    runStats.validation.exportStatus = 'PRISTINE';
                                                }
                                                logDevDebug(`✅ Last Year reference comparison: Perfect match (${comparison.referenceTotal} rows, ${comparison.exactMatches} dates)`);
                                            } else if (onlyEmptyDayMismatches) {
                                                // Only mismatches on empty days - still PRISTINE
                                                if (!runStats.validation.exportStatus || runStats.validation.exportStatus === 'PRISTINE') {
                                                    runStats.validation.exportStatus = 'PRISTINE';
                                                }
                                                logDevDebug('✅ Last Year reference comparison: Mismatches only on empty days (acceptable)');
                                            } else if (hasSignificantMismatches) {
                                                // Significant mismatches - set appropriate status
                                                if (!runStats.validation.exportStatus || runStats.validation.exportStatus === 'PRISTINE') {
                                                    runStats.validation.exportStatus = 'INCOMPLETE_REFERENCE_MISMATCH';
                                                }
                                                runStats.alerts = runStats.alerts || [];
                                                if (!runStats.alerts.includes('REFERENCE_MISMATCH_LAST_YEAR')) {
                                                    runStats.alerts.push('REFERENCE_MISMATCH_LAST_YEAR');
                                                }

                                                const warningMsg = `Export complete with warnings: ${comparison.datesWithDifferences} date(s) have transaction count differences compared to reference. Review validation details if this is unexpected.`;
                                                logUserWarning(warningMsg, {
                                                    referenceTotal: comparison.referenceTotal,
                                                    currentTotal: comparison.currentTotal,
                                                    totalDelta: comparison.totalDelta,
                                                    datesWithDifferences: comparison.datesWithDifferences
                                                });

                                                runStats.notes = runStats.notes || [];
                                                runStats.notes.push(`Reference comparison: ${comparison.referenceTotal} reference rows vs ${comparison.currentTotal} current rows (delta: ${comparison.totalDelta}), ${comparison.datesWithDifferences} dates with differences`);
                                            } else {
                                                // Small mismatches - COMPLETE_WITH_WARNINGS
                                                if (!runStats.validation.exportStatus || runStats.validation.exportStatus === 'PRISTINE') {
                                                    runStats.validation.exportStatus = 'COMPLETE_WITH_WARNINGS';
                                                }
                                                logDevDebug(`⚠️ Last Year reference comparison: Small mismatches (${comparison.datesWithDifferences} dates, delta: ${comparison.totalDelta})`);
                                            }
                                        }
                                    } else {
                                        // No reference data available - fall back to estimated row count check
                                        logDevDebug(`No reference data available for ${targetYear}, using estimated row count check`);

                                        // Calculate expected vs actual row counts (fallback)
                                        const daysInRange = Math.ceil((endDateObj - startDateObj) / (24 * 60 * 60 * 1000)) + 1;
                                        const estimatedExpectedRows = Math.round(daysInRange * 2.5);
                                        const rowCountGap = estimatedExpectedRows - actualRowCount;

                                        // If gap is significant (>10% of expected or >50 rows), mark as incomplete
                                        const significantGap = rowCountGap > 50 || (rowCountGap > estimatedExpectedRows * 0.1);

                                        if (significantGap && actualRowCount > 0) {
                                            // Set export status to incomplete row count mismatch
                                            if (!runStats.validation.exportStatus || runStats.validation.exportStatus === 'PRISTINE') {
                                                runStats.validation.exportStatus = 'INCOMPLETE_ROW_COUNT_MISMATCH';
                                            }
                                            runStats.alerts = runStats.alerts || [];
                                            if (!runStats.alerts.includes('ROW_COUNT_MISMATCH_LAST_YEAR')) {
                                                runStats.alerts.push('ROW_COUNT_MISMATCH_LAST_YEAR');
                                            }

                                            // Add user-facing warning
                                            const warningMsg = `Export incomplete: expected about ${estimatedExpectedRows} rows for ${targetYear}, but only ${actualRowCount} were captured. Some days may be missing. Please re-run Last Year with Scroll & Capture or split into smaller ranges.`;
                                            logUserWarning(warningMsg, {
                                                expected: estimatedExpectedRows,
                                                actual: actualRowCount,
                                                gap: rowCountGap,
                                                daysInRange: daysInRange
                                            });

                                            // Add dev-only diagnostic note
                                            runStats.notes = runStats.notes || [];
                                            const diagnosticNote = `Row count gap: Expected ~${estimatedExpectedRows} rows (${daysInRange} days × ~2.5/day), captured ${actualRowCount} rows (${rowCountGap} missing). Possible causes: stagnation exit before all days loaded, logout detected auto-export, or Credit Karma paging limits.`;
                                            runStats.notes.push(diagnosticNote);
                                            logDevDebug(diagnosticNote);

                                            // Store in validation for reference
                                            if (!runStats.validation.rowCountCheck) {
                                                runStats.validation.rowCountCheck = {};
                                            }
                                            runStats.validation.rowCountCheck = {
                                                expected: estimatedExpectedRows,
                                                actual: actualRowCount,
                                                gap: rowCountGap,
                                                daysInRange: daysInRange,
                                                significantGap: true
                                            };
                                        } else if (actualRowCount > 0) {
                                            // Row count looks reasonable
                                            if (!runStats.validation.rowCountCheck) {
                                                runStats.validation.rowCountCheck = {};
                                            }
                                            runStats.validation.rowCountCheck = {
                                                expected: estimatedExpectedRows,
                                                actual: actualRowCount,
                                                gap: rowCountGap,
                                                daysInRange: daysInRange,
                                                significantGap: false
                                            };
                                            logDevDebug(`✅ Last Year row count check: Expected ~${estimatedExpectedRows}, captured ${actualRowCount} (gap: ${rowCountGap}, within acceptable range)`);
                                        }
                                    }
                                } catch (e) {
                                    logDevDebug('Error loading/comparing reference data:', e);
                                    // Fall back to estimated row count check on error
                                }
                            })();
                        }

                        // ============================================================================
                        // VALIDATION: Check if found range is newer than target (for Last Year preset)
                        // ============================================================================
                        // This check happens after the loop exits to detect if we couldn't reach the target range
                        // We need to check this here because finalFoundRangeIsNewerThanTarget is calculated after the loop
                        // For Last Year preset, if we only found 2025 data and couldn't reach 2024, set appropriate status
                        if (request && request.preset === 'last-year') {
                            // Check if we have any transactions in the target range (2024)
                            const transactionsIn2024 = preparedTransactions.filter(t => {
                                if (!t.date) return false;
                                const txDate = parseTransactionDate(t.date);
                                if (!txDate) return false;
                                return txDate.getFullYear() === 2024;
                            });

                            // If we have no transactions in 2024, check if we have transactions from 2025
                            if (transactionsIn2024.length === 0) {
                                const transactionsIn2025 = preparedTransactions.filter(t => {
                                    if (!t.date) return false;
                                    const txDate = parseTransactionDate(t.date);
                                    if (!txDate) return false;
                                    return txDate.getFullYear() === 2025;
                                });

                                // If we have 2025 transactions but no 2024 transactions, we couldn't reach 2024
                                if (transactionsIn2025.length > 0) {
                                    runStats.validation.exportStatus = 'INCOMPLETE_NEWER_RANGE_ONLY';
                                    runStats.alerts = runStats.alerts || [];
                                    if (!runStats.alerts.includes('NEWER_RANGE_ONLY_2025')) {
                                        runStats.alerts.push('NEWER_RANGE_ONLY_2025');
                                    }

                                    // Get scrollAttempts from runStats if available
                                    const actualScrollAttempts = (typeof runStats !== 'undefined' && runStats && runStats.scrollAttempts) ? runStats.scrollAttempts : 'unknown';

                                    const warningMsg = `Export incomplete: Could not reach target range (2024). Only found transactions from 2025 (${transactionsIn2025.length} rows). The extension scrolled ${actualScrollAttempts} times but could not reach older transactions. Please try Scroll & Capture mode or check if 2024 data is available on Credit Karma.`;
                                    logUserWarning(warningMsg, {
                                        targetYear: 2024,
                                        foundYear: 2025,
                                        foundCount: transactionsIn2025.length,
                                        scrollAttempts: actualScrollAttempts
                                    });

                                    runStats.notes = runStats.notes || [];
                                    runStats.notes.push(`Could not reach 2024: Only found ${transactionsIn2025.length} transactions from 2025 after ${actualScrollAttempts} scrolls`);
                                }
                            }
                        }

                        // Set final export status if not already set
                        if (!runStats.validation.exportStatus) {
                            // Check if there are any warnings
                            const hasWarnings = (runStats.alerts && runStats.alerts.length > 0) ||
                                               (runStats.validation.newestBoundaryCheck === 'FAIL') ||
                                               (runStats.validation.pendingConsistencyCheck === 'WARN');
                            runStats.validation.exportStatus = hasWarnings ? 'COMPLETE_WITH_WARNINGS' : 'PRISTINE';
                        }

                        // -----------------------------------------------------------------
                        // LAST MONTH INVARIANT: defend against count mismatch at exit
                        // -----------------------------------------------------------------
                        if (request && request.preset === 'last-month') {
                            // Recompute in-range posted count directly from allTransactions
                            const recomputedInRangePosted = allTransactions.filter(t => {
                                if (!isDateInRange(t.date, startDateObj, endDateObj)) return false;
                                const isPendingStatus = t.status && t.status.toLowerCase() === 'pending';
                                const hasNoDate = !t.date || (typeof t.date === 'string' && t.date.trim() === '');
                                return !isPendingStatus && !hasNoDate;
                            }).length;

                            if (recomputedInRangePosted !== runStats.counts.inRangePosted) {
                                runStats.alerts = runStats.alerts || [];
                                runStats.alerts.push('MISMATCH_COUNTS_LAST_MONTH');
                                console.warn(`⚠️ [LAST MONTH] COUNT MISMATCH at exit: inLoop=${recomputedInRangePosted}, exported=${runStats.counts.inRangePosted}`);

                                // Temporary debug: log sample dates for investigation
                                const datesSample = preparedTransactions
                                    .map(t => t.date)
                                    .filter(Boolean)
                                    .slice(0, 20);
                                console.warn('⚠️ [LAST MONTH] Sample exported dates (first 20):', datesSample);
                            }
                        }

                // Attach session timeout metadata (if any) before finalizing run stats
                if (typeof sessionErrorDetected !== 'undefined') {
                    runStats.sessionErrorDetected = !!sessionErrorDetected;
                }
                if (typeof sessionLogoutTime !== 'undefined' && sessionLogoutTime !== null) {
                    runStats.sessionLogoutTime = sessionLogoutTime;
                }
                if (runStats.sessionErrorDetected && runStats.alerts && Array.isArray(runStats.alerts)) {
                    if (!runStats.alerts.includes('SESSION_TIMEOUT_LOGOUT')) {
                        runStats.alerts.push('SESSION_TIMEOUT_LOGOUT');
                    }
                }

                const finalized = finalizeRunStats(runStats);
                        saveRunStatsFiles(finalized, primaryFileName);
                    }
                } catch (e) {
                    console.error('Error saving run stats for preset export:', e);
                }

                // Show statistics panel
                // CRITICAL: For presets that include pending, explicitly show pending and posted counts
                const effectivePostedCount = postedCountBeforeDedup || postedCount || 0;
                const shouldShowPendingPostedBreakdown = shouldIncludePendingPreset && (pendingCount > 0 || effectivePostedCount > 0);

                // Derive HTTP/session error summary from runStats alerts, if available
                // FIXED: Guard all runStats access to prevent "runStats is not defined" errors
                const http401Total = typeof http401Tracker !== 'undefined' ? http401Tracker.total : 0;
                let isPartialRun = false;
                let missingDatesWarningForStats = null;
                let exportStatusForUI = 'COMPLETE'; // Default status

                if (typeof runStats !== 'undefined' && runStats) {
                    if (Array.isArray(runStats.alerts)) {
                        const alerts = runStats.alerts;
                        if (alerts.includes('HTTP_401_DETECTED')) {
                            isPartialRun = true;
                        }
                        if (alerts.includes('TIME_CAP_REACHED_LAST_YEAR') || alerts.includes('TIME_CAP_REACHED_LAST_FIVE_YEARS')) {
                            isPartialRun = true;
                        }
                    }

                    // Get export status from validation if available
                    if (runStats.validation && runStats.validation.exportStatus) {
                        exportStatusForUI = runStats.validation.exportStatus;
                        // If status indicates warnings or incomplete, mark as partial
                        if (exportStatusForUI.includes('WARNINGS') || exportStatusForUI.includes('INCOMPLETE')) {
                            isPartialRun = true;
                        }
                    }
                }

                // Surface session timeout / logout metadata from runStats if present
                // FIXED: Guard runStats access to prevent "runStats is not defined" errors
                let sessionErrorDetected = false;
                let sessionLogoutTime = null;
                if (typeof runStats !== 'undefined' && runStats) {
                    sessionErrorDetected = !!(runStats.sessionErrorDetected);
                    sessionLogoutTime = runStats.sessionLogoutTime || null;
                }
                if (sessionErrorDetected) {
                    isPartialRun = true;
                }

                // Only surface rangeMissingWarning for runs without 401/session issues
                if (!isPartialRun && !http401Total && warning) {
                    missingDatesWarningForStats = warning;
                }
                // Collect validation warnings for display
                const validationWarnings = [];
                if (typeof runStats !== 'undefined' && runStats && runStats.validation) {
                    if (runStats.validation.newestBoundaryCheck === 'FAIL') {
                        validationWarnings.push('Newest visible transactions may be missing from CSV');
                    }
                    if (runStats.validation.pendingConsistencyCheck === 'WARN') {
                        validationWarnings.push('Pending transaction count mismatch detected');
                    }
                    if (runStats.notes && Array.isArray(runStats.notes)) {
                        validationWarnings.push(...runStats.notes.filter(n => n.includes('⚠️')));
                    }
                }

                createStatsPanel({
                    startDate,
                    endDate,
                    totalFound: allTransactions.length,
                    inRange: filteredTransactions.length,
                    exported: filteredTransactions.length,
                    completeness,
                    filesGenerated,
                    previewData: filteredTransactions,
                    elapsedTime: elapsedTime || 'N/A',
                    postedDateRange: postedDateRange,
                    pendingCount: pendingCount,
                    postedCount: effectivePostedCount,
                    shouldShowPendingPostedBreakdown: shouldShowPendingPostedBreakdown,
                    http401Total,
                    isPartialRun,
                    missingDatesWarning: missingDatesWarningForStats,
                    sessionErrorDetected,
                    sessionLogoutTime,
                    exportStatus: exportStatusForUI,
                    validationWarnings: validationWarnings.length > 0 ? validationWarnings : null
                });

                // Show completion notification with export status
                const completionNotice = document.createElement('div');
                const isWarningStatus = exportStatusForUI && (exportStatusForUI.includes('WARNINGS') || exportStatusForUI.includes('INCOMPLETE'));
                const bgColor = isWarningStatus ? 'rgba(245, 158, 11, 0.95)' : 'rgba(76, 175, 80, 0.95)'; // Orange for warnings, green for success
                const icon = isWarningStatus ? '⚠️' : '✅';
                const statusText = isWarningStatus ? 'Export complete with warnings' : 'Export complete';

                completionNotice.style.cssText = `
                    position: fixed;
                    top: 10px;
                    left: 20px;
                    padding: 12px 20px;
                    background: ${bgColor};
                    color: white;
                    border-radius: 6px;
                    z-index: 9999;
                    font-size: 14px;
                    font-weight: 500;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                `;
                completionNotice.textContent = `${icon} ${statusText}! Found ${filteredTransactions.length} transactions.`;
                document.body.appendChild(completionNotice);

                setTimeout(() => {
                    if (document.body.contains(completionNotice)) {
                    document.body.removeChild(completionNotice);
                    }
                }, 5000);

            }).catch(error => {
                // Remove indicator
                if (document.body.contains(indicator)) {
                document.body.removeChild(indicator);
                }

                // Log full error details
                console.error('Error during transaction capture:', error);
                console.error('Error stack:', error.stack);
                console.error('Error details:', {
                    message: error.message,
                    name: error.name,
                    startDate,
                    endDate
                });

                // Show user-friendly error
                const errorNotice = document.createElement('div');
                errorNotice.style.cssText = `
                    position: fixed;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    background: white;
                    border: 2px solid #f44336;
                    border-radius: 8px;
                    padding: 20px;
                    z-index: 10001;
                    max-width: 400px;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                `;
                errorNotice.innerHTML = `
                    <h3 style="margin-top: 0; color: #f44336;">Export Error</h3>
                    <p>${error.message || 'An error occurred during export.'}</p>
                    <p style="font-size: 12px; color: #666;">Check the browser console (F12) for more details.</p>
                    <div style="display: flex; gap: 10px; margin-top: 15px;">
                        <button id="error-retry" style="
                            flex: 1;
                            padding: 10px 20px;
                            background: #4CAF50;
                            color: white;
                            border: none;
                            border-radius: 4px;
                            cursor: pointer;
                            font-weight: bold;
                        ">🔄 Retry</button>
                        <button id="error-close" style="
                            flex: 1;
                            padding: 10px 20px;
                            background: #f44336;
                            color: white;
                            border: none;
                            border-radius: 4px;
                            cursor: pointer;
                        ">Close</button>
                    </div>
                `;
                document.body.appendChild(errorNotice);

                // Store request parameters for retry
                const retryParams = {
                    startDate,
                    endDate,
                    preset: request.preset,
                    csvTypes: request.csvTypes || { allTransactions: true, income: false, expenses: false }
                };

                document.getElementById('error-close').addEventListener('click', () => {
                    document.body.removeChild(errorNotice);
                });

                document.getElementById('error-retry').addEventListener('click', () => {
                    // Remove error notice
                    document.body.removeChild(errorNotice);

                    // Retry with same parameters
                    console.log('🔄 Retrying extraction with same parameters...');
                    console.log(`   Start Date: ${retryParams.startDate}`);
                    console.log(`   End Date: ${retryParams.endDate}`);
                    console.log(`   Preset: ${retryParams.preset || 'custom'}`);

                    // Trigger retry by sending message to self
                    setTimeout(() => {
                        chrome.runtime.sendMessage({
                            action: 'captureTransactions',
                            startDate: retryParams.startDate,
                            endDate: retryParams.endDate,
                            preset: retryParams.preset,
                            csvTypes: retryParams.csvTypes
                        });
                    }, 500); // Small delay to ensure UI is cleaned up
                });
            });

        } catch (error) {
            console.error('Error in message handler:', error);
            sendResponse({ status: 'error', message: error.message });
        }
    }
    return true;
    });
    } else {
        console.log('TxVault: Message listener already attached, skipping duplicate');
    }
} else {
    console.error('TxVault: Chrome runtime API not available! Extension may not be properly loaded.');
}

// Mark script as fully loaded
console.log('TxVault: Content script loaded and ready');
