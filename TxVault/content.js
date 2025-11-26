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
    }
};

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
    // Include status in hash for better deduplication (same transaction can be pending then posted)
    const key = `${transaction.date}|${transaction.description}|${transaction.amount}|${transaction.status || ''}`;
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

// Date and Number Parsing
// ============================================================================

function convertDateFormat(inputDate) {
    var parsedDate;
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
    
    var day = ("0" + parsedDate.getDate()).slice(-2);
    var month = ("0" + (parsedDate.getMonth() + 1)).slice(-2);
    var year = parsedDate.getFullYear();
    return month + "/" + day + "/" + year;
}

function extractNumber(inputString) {
    if (!inputString) return NaN;
    // Enhanced regex to handle more formats
    var match = inputString.match(/^-?\$?(\d{1,3}(,\d{3})*(\.\d+)?|\.\d+)$/);
    if (match) {
        var numberString = match[1].replace(/,/g, '');
        var extractedNumber = parseFloat(numberString);
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
                    let txElements = [];
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
        
        return true;
    });
}

/**
 * Remove duplicates from transactions before export
 * Uses same logic as combineTransactions but operates on a single array
 */
function removeDuplicates(transactions) {
    if (transactions.length === 0) {
        return [];
    }
    
    const seenHashes = new Set();
    const seenDataIndices = new Set();
    const seenCompositeKeys = new Set();
    const uniqueTransactions = [];
    
    for (const transaction of transactions) {
        // Check by hash first (most reliable)
        if (transaction.hash && seenHashes.has(transaction.hash)) {
            continue;
        }
        
        // Check by data-index as fallback
        if (transaction.dataIndex && seenDataIndices.has(transaction.dataIndex)) {
            continue;
        }
        
        // Check by composite key (date + description + amount + transactionType + status)
        const date = parseTransactionDate(transaction.date);
        const dateStr = date ? `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}` : '';
        const statusStr = (transaction.status || '').toLowerCase();
        const typeStr = (transaction.transactionType || '').toLowerCase();
        const compositeKey = `${dateStr}|${transaction.description}|${transaction.amount}|${typeStr}|${statusStr}`.toLowerCase().trim();
        
        if (seenCompositeKeys.has(compositeKey)) {
            continue;
        }
        
        // Add to seen sets and unique array
        if (transaction.hash) seenHashes.add(transaction.hash);
        if (transaction.dataIndex) seenDataIndices.add(transaction.dataIndex);
        seenCompositeKeys.add(compositeKey);
        uniqueTransactions.push(transaction);
    }
    
    return uniqueTransactions;
}

/**
 * Prepare transactions for export: filter valid dates and remove duplicates
 */
function prepareTransactionsForExport(transactions) {
    // First filter out transactions with invalid or "Pending" dates
    const validDateTransactions = filterValidDates(transactions);
    
    // Then remove duplicates
    const uniqueTransactions = removeDuplicates(validDateTransactions);
    
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
        border: 2px solid #3f51b5;
        border-radius: 8px;
        padding: 20px;
        z-index: 10001;
        max-width: 500px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;
    
    panel.innerHTML = `
        <h2 style="margin-top: 0; color: #3f51b5;">Export Summary</h2>
        <div style="margin-bottom: 15px;">
            <strong>Date Range:</strong> ${stats.startDate} to ${stats.endDate}
        </div>
        <div style="margin-bottom: 10px;">
            <strong>Total Transactions Found:</strong> ${stats.totalFound}
        </div>
        <div style="margin-bottom: 10px;">
            <strong>Transactions in Range:</strong> ${stats.inRange}
        </div>
        <div style="margin-bottom: 10px;">
            <strong>Transactions Exported:</strong> ${stats.exported}
        </div>
        ${stats.shouldShowPendingPostedBreakdown ? `
        <div style="margin-bottom: 10px; padding: 10px; background: #f5f5f5; border-radius: 4px; border-left: 4px solid #3f51b5;">
            <div style="margin-bottom: 5px; font-weight: 600; color: #3f51b5;">Transaction Breakdown:</div>
            <div style="margin-bottom: 3px;">
                <strong>Pending Transactions:</strong> ${stats.pendingCount || 0}
            </div>
            <div style="margin-bottom: 3px;">
                <strong>Posted Transactions:</strong> ${stats.postedCount || 0}
            </div>
            <div style="margin-top: 5px; font-size: 12px; color: #666;">
                Total: ${(stats.pendingCount || 0) + (stats.postedCount || 0)} transactions
            </div>
        </div>
        ` : ''}
        ${stats.postedDateRange && stats.postedDateRange !== 'N/A' && !stats.shouldShowPendingPostedBreakdown ? `
        <div style="margin-bottom: 10px; font-size: 13px; color: #666;">
            <strong>Posted Transactions:</strong> ${stats.postedDateRange} (${stats.exported - (stats.pendingCount || 0)} transactions)
        </div>
        ` : ''}
        ${stats.pendingCount && stats.pendingCount > 0 && !stats.shouldShowPendingPostedBreakdown ? `
        <div style="margin-bottom: 10px; font-size: 13px; color: #666;">
            <strong>Pending Transactions:</strong> ${stats.pendingCount}
        </div>
        ` : ''}
        <div style="margin-bottom: 10px;">
            <strong>Data Completeness:</strong> ${stats.completeness}%
        </div>
        <div style="margin-bottom: 10px;">
            <strong>Time Elapsed:</strong> ${stats.elapsedTime}
        </div>
        <div style="margin-bottom: 15px;">
            <strong>Files Generated:</strong> ${stats.filesGenerated.join(', ')}
        </div>
        <div style="display: flex; gap: 10px;">
            <button id="ck-stats-close" style="
                flex: 1;
                padding: 10px;
                background: #3f51b5;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
            ">Close</button>
            <button id="ck-stats-preview" style="
                flex: 1;
                padding: 10px;
                background: #4caf50;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
            ">Preview Data</button>
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
    let totalFields = transactions.length * 4; // date, description, amount, category
    
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
                    console.warn(`Warning: Extraction callback failed after forced scroll:`, e);
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
                console.warn(`Warning: Final extraction callback failed:`, e);
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
    
    console.log(`=== STARTING EXTRACTION ===`);
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
    let finalVerificationScrolls = 0; // Initialize early to avoid scope issues
    
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
    
    // Enhanced progress counter
    const counterElement = document.createElement('div');
    counterElement.style.cssText = `
        position: fixed;
        bottom: 80px;
        left: 20px;
        z-index: 10000;
        padding: 14px 18px;
        background-color: rgba(0,0,0,0.85);
        color: white;
        border-radius: 6px;
        font-size: 16px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-weight: 500;
        min-width: 350px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        line-height: 1.5;
    `;
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
        const isCurrentMonthPriority = daysSinceEndForInitial < 30 && startDateObj.getMonth() === SYSTEM_MONTH && startDateObj.getFullYear() === SYSTEM_YEAR;
        const isLastMonthPriority = daysSinceEndForInitial >= 30 && daysSinceEndForInitial < 60;
        
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
        
        // Log buffer configuration for QA/auditability
        console.log(`📊 [BUFFER CONFIGURATION] Boundary detection strategy initialized`);
        console.log(`   • Target range: ${startDateObj.toLocaleDateString()} - ${endDateObj.toLocaleDateString()}`);
        const bufferDays = isLastMonthPriority ? CONFIG.BUFFER_DAYS.LAST_MONTH : CONFIG.BUFFER_DAYS.MEDIUM_RANGE;
        const beforeStartBuffer = isLastMonthPriority ? CONFIG.BEFORE_START_BUFFER.LAST_MONTH : CONFIG.BEFORE_START_BUFFER.STANDARD;
        console.log(`   • Left boundary buffer: ${beforeStartBuffer} days before start`);
        console.log(`   • Right boundary buffer: ${bufferDays} days after end`);
        console.log(`   • Initial scroll limit: ${MAX_SCROLL_ATTEMPTS} (will increase dynamically if needed)`);
        console.log(`   • Stagnation threshold: ${STAGNATION_THRESHOLD} scrolls`);
        console.log(`   • Strategy: Boundary-first with dynamic oscillation limits`);
        
        let endBoundaryFound = false;    // End boundary (e.g., Oct 31) found - FIRST when scrolling down
        let startBoundaryFound = false;  // Start boundary (e.g., Oct 1) found - SECOND when scrolling down
        let targetRangeStartBoundary = null;  // Scroll position where START boundary (Oct 1) is located (lower on page)
        let targetRangeEndBoundary = null;    // Scroll position where END boundary (Oct 31) is located (higher on page)
        let scrollingDirection = 'down'; // Track scrolling direction: 'down' (finding boundaries) or 'oscillating' (between boundaries)
        let atStartBoundary = false; // Track if we're at the start boundary during oscillation
        let harvestingStarted = false; // Track if harvesting has started (after START boundary found)
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
        console.log(`⚡ OPTIMIZED Strategy: Find boundaries (harvest during discovery) → Oscillate (dynamic limits) → Early exit (when no progress)`);
        console.log(`   Note: Data is descending (newest first), so END boundary found FIRST, START boundary found SECOND`);
        console.log(`   ⏱️ TIME-CRITICAL: Minimizing wasted scrolls, exiting as soon as no new data found`);
        
        // CRITICAL: Track dynamic max scrolls for cases where found range is newer than target
        let dynamicMaxScrollAttempts = MAX_SCROLL_ATTEMPTS;
        
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
                console.warn(`⚠️ No valid transactions after filtering. Original: ${beforeCount}`);
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
                console.error(`   Exporting captured data immediately...`);
                
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
        
        console.log(`✅ Logout detection enabled. Will export CSV automatically if logout detected.`);
        
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
        console.log(`✅ Manual scroll detection enabled. Will detect and extract transactions when user scrolls manually.`);
        
        while (!stopScrolling && scrollAttempts < dynamicMaxScrollAttempts) {
            
            // ============================================================================
            // LOGOUT CHECK: Check for logout before each scroll iteration
            // ============================================================================
            if (checkForLogout()) {
                // Logout detected - CSV already exported, exit loop
                console.log(`⚠️ Scroll loop stopped due to logout detection.`);
                break;
            }
            
            scrollAttempts++;
            
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
                    console.log(`   ⚠️ Manual scroll detected but no new transactions found at this position.`);
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
            // CRITICAL: Declare foundDateRange early so it can be used in logging below
            let foundDateRange = 'N/A';
            let foundRangeIsNewerThanTarget = false;
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
                    if (oldestFoundDate && oldestFoundDate > startDateObj) {
                        foundRangeIsNewerThanTarget = true;
                        console.log(`⚠️ CRITICAL: Found range is NEWER than target. Oldest found: ${oldestFoundDate.toLocaleDateString()}, Target start: ${startDateObj.toLocaleDateString()}. Must continue scrolling DOWN.`);
                        console.log(`   📊 Debug: Transactions with dates: ${transactionsWithDates.length}/${allTransactions.length}, Found date range: ${foundDateRange}`);
                    } else if (oldestFoundDate) {
                        console.log(`✅ Found range is NOT newer than target. Oldest found: ${oldestFoundDate.toLocaleDateString()}, Target start: ${startDateObj.toLocaleDateString()}`);
                    }
                } else {
                    // No transactions with valid dates found yet - this means we're still loading or only have pending
                    console.log(`⚠️ No transactions with valid dates found yet (${allTransactions.length} total transactions, likely all pending). Continuing to scroll DOWN to find posted transactions...`);
                    // If we have transactions but no dates, we're likely seeing pending transactions
                    // For month/custom presets, we need posted transactions, so continue scrolling
                    foundRangeIsNewerThanTarget = true; // Assume we need to scroll more if no dates found
                }
            }
            
            // CRITICAL: If found range is NEWER than target, increase dynamicMaxScrollAttempts IMMEDIATELY
            // This ensures we have enough scrolls to reach older transactions
            // Increase aggressively and frequently to prevent premature exit
            if (foundRangeIsNewerThanTarget) {
                // CRITICAL FIX: Increase limit IMMEDIATELY when found range is newer - don't wait for conditions
                // This prevents premature exit at low scroll counts (e.g., 10 scrolls)
                const scrollsRemaining = dynamicMaxScrollAttempts - scrollAttempts;
                if (scrollAttempts <= 20 || scrollsRemaining <= 30) {
                    // Early scrolls OR close to limit - increase significantly
                    const additionalScrolls = Math.max(200, Math.ceil(MAX_SCROLL_ATTEMPTS * 1.5)); // Add 150% more scrolls, minimum 200
                    const newMaxScrolls = dynamicMaxScrollAttempts + additionalScrolls;
                    const increasePercent = Math.round((additionalScrolls / dynamicMaxScrollAttempts) * 100);
                    console.log(`📊 [SCROLL CAP INCREASE] IMMEDIATE - Found range newer than target detected`);
                    console.log(`   • Previous limit: ${dynamicMaxScrollAttempts} scrolls`);
                    console.log(`   • New limit: ${newMaxScrolls} scrolls (+${additionalScrolls}, +${increasePercent}%)`);
                    console.log(`   • Current scroll: ${scrollAttempts} | Remaining: ${scrollsRemaining}`);
                    console.log(`   • Reason: Found range is NEWER than target - must continue scrolling DOWN`);
                    console.log(`   • Target range: ${startDateObj.toLocaleDateString()} - ${endDateObj.toLocaleDateString()}`);
                    console.log(`   • Found range: ${foundDateRange || 'N/A'}`);
                    dynamicMaxScrollAttempts = newMaxScrolls; // Update dynamic limit
                } else if (scrollAttempts % 5 === 0) {
                    // Every 5 scrolls (more frequent), increase limit proactively if still newer
                    const additionalScrolls = Math.max(100, Math.ceil(MAX_SCROLL_ATTEMPTS * 0.5)); // Add 50% more scrolls, minimum 100
                    const newMaxScrolls = dynamicMaxScrollAttempts + additionalScrolls;
                    const increasePercent = Math.round((additionalScrolls / dynamicMaxScrollAttempts) * 100);
                    console.log(`📊 [SCROLL CAP INCREASE] PROACTIVE (every 5 scrolls) - Found range still newer than target`);
                    console.log(`   • Previous limit: ${dynamicMaxScrollAttempts} scrolls`);
                    console.log(`   • New limit: ${newMaxScrolls} scrolls (+${additionalScrolls}, +${increasePercent}%)`);
                    console.log(`   • Current scroll: ${scrollAttempts} | Remaining: ${dynamicMaxScrollAttempts - scrollAttempts}`);
                    console.log(`   • Reason: Found range is still NEWER than target after ${scrollAttempts} scrolls`);
                    console.log(`   • Target range: ${startDateObj.toLocaleDateString()} - ${endDateObj.toLocaleDateString()}`);
                    console.log(`   • Found range: ${foundDateRange || 'N/A'}`);
                    dynamicMaxScrollAttempts = newMaxScrolls;
                }
            }
            
            // SMART STAGNATION DETECTION: Only stop if we've found the target range
            // Phase 1: Keep scrolling until we find transactions in target date range
            // Phase 2: Once found, allow stagnation detection to stop if no progress
            // CRITICAL: NEVER stop if found range is NEWER than target - must continue scrolling DOWN
            if (newTransactionsThisScroll === 0) {
                stagnationScrolls++;
                // CRITICAL: Don't stop on stagnation until we've found the target date range
                // If we haven't found October yet, keep scrolling down
                // ALSO: If found range is NEWER than target, continue scrolling DOWN (NEVER stop)
                if (stagnationScrolls >= STAGNATION_THRESHOLD) {
                    // CRITICAL FIX: Check foundRangeIsNewerThanTarget FIRST - if true, NEVER exit
                    if (foundRangeIsNewerThanTarget) {
                        // Found range is NEWER than target - MUST continue scrolling DOWN to find older transactions
                        // NEVER exit in this case - reset stagnation and continue
                        console.log(`⚠️ CRITICAL: Found range is NEWER than target. No new transactions for ${STAGNATION_THRESHOLD} scrolls, but MUST continue scrolling DOWN to find older transactions (target: ${startDateObj.toLocaleDateString()} - ${endDateObj.toLocaleDateString()}). Resetting stagnation counter.`);
                        stagnationScrolls = 0; // Reset counter, keep searching DOWN
                        // CRITICAL: Don't allow loop to exit due to MAX_SCROLL_ATTEMPTS when found range is newer
                        // Reset scrollAttempts check by continuing (we'll check MAX_SCROLL_ATTEMPTS in loop condition)
                    } else if (foundTargetDateRange && !foundRangeIsNewerThanTarget) {
                        // We've found the target range and it's not newer than target, stagnation is valid
                        // BUT: Check if we only have pending transactions - if so, continue scrolling to find posted
                        const hasPostedInRange = allTransactions.some(t => {
                            if (!isDateInRange(t.date, startDateObj, endDateObj)) return false;
                            const isPendingStatus = t.status && t.status.toLowerCase() === 'pending';
                            const hasNoDate = !t.date || (typeof t.date === 'string' && t.date.trim() === '');
                            return !isPendingStatus && !hasNoDate;
                        });
                        
                        if (!hasPostedInRange && isCurrentPeriodPreset) {
                            // Only pending transactions found - continue scrolling to find posted
                            console.log(`⚠️ STAGNATION DETECTED but only pending transactions found. Continuing to scroll DOWN to find posted transactions...`);
                            stagnationScrolls = 0; // Reset and continue
                        } else {
                            console.log(`⚠️ STAGNATION DETECTED: No new transactions for ${STAGNATION_THRESHOLD} consecutive scrolls. Target range found. Exiting scroll loop.`);
                            break;
                        }
                    } else {
                        // Haven't found target range yet, continue scrolling to find it
                        console.log(`⚠️ No new transactions for ${STAGNATION_THRESHOLD} scrolls, but target range not found yet. Continuing to search for target dates...`);
                        stagnationScrolls = 0; // Reset counter, keep searching
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
            
            // Calculate transactions in range for progress display
            const transactionsInRangeCount = allTransactions.filter(t => {
                return isDateInRange(t.date, startDateObj, endDateObj);
            }).length;
            
            // Calculate elapsed time
            const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
            const elapsedMinutes = Math.floor(elapsedSeconds / 60);
            const elapsedDisplay = elapsedMinutes > 0 
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
            
            // DEBUG: Log date matching issues for October (Last Month)
            if (isLastMonthForStatus && allTransactions.length > 0 && transactionsInRangeCount === 0) {
                console.warn('⚠️ DATE MATCHING ISSUE: Found transactions but 0 in range');
                console.warn(`   Expected range: ${requestedRange}`);
                console.warn(`   Found range: ${foundDateRange}`);
                console.warn(`   Sample dates found: ${sampleDates.join(', ')}`);
                // Log first 10 transaction dates for debugging
                const sampleTxs = allTransactions.slice(0, 10);
                console.warn('   Sample transaction dates:', sampleTxs.map(t => ({
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
                console.log(`📊 STATUS UPDATE: Found range newer than target - Scrolling DOWN`);
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
                const comparisonText = recordsExpected === recordsHarvested 
                    ? `✅ Records expected: ${recordsExpected} Rows, from ${daysInRange} days. Records harvested: ${recordsHarvested} Rows. A = B ✓`
                    : `⚠️ Records expected: ${recordsExpected} Rows, from ${daysInRange} days. Records harvested: ${recordsHarvested} Rows. A ≠ B (${recordsMissed} missed)`;
                
                counterElement.textContent = `✅ Found left of range | ✅ Found right of range\n🌾 Harvesting between range: ${expectedRange}\n${comparisonText}\nTime elapsed: ${elapsedDisplay}`;
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
            
            // Check for transactions in target range using improved date comparison
            const transactionsInRange = newTransactions.filter(transaction => {
                return isDateInRange(transaction.date, startDateObj, endDateObj);
            });
            
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
            
            if (hasPostedTransactionsInRange) {
                // CRITICAL: Found POSTED transactions in target range - this is the real target
                // BUT: If found range is NEWER than target, don't mark as found yet - we need to scroll DOWN more
                if (!foundRangeIsNewerThanTarget) {
                    // Only mark as found if we're not still searching for older transactions
                    if (!foundTargetDateRange) {
                        console.log(`✅ TARGET RANGE FOUND! Found "${targetPeriodName}" - ${postedTransactionsInRange.length} POSTED transaction(s) in range (${transactionsInRange.length} total including pending). Checking boundaries...`);
                    }
                    foundTargetDateRange = true;
                    consecutiveTargetDateMatches++;
                    hasReachedTargetRange = true; // Mark that we've reached the target range
                    noProgressScrolls = 0; // Reset when we find new transactions
                    stagnationScrolls = 0; // Reset stagnation counter when we find target range transactions
                } else {
                    // Found range is NEWER than target - don't mark as found, keep scrolling DOWN
                    console.log(`⚠️ Found ${postedTransactionsInRange.length} POSTED transaction(s) in range, but found range is NEWER than target. Continuing to scroll DOWN to find older transactions...`);
                    // Reset stagnation to continue scrolling
                    stagnationScrolls = 0;
                    consecutiveTargetDateMatches = 0;
                    // Don't set foundTargetDateRange = true - this ensures scrolling continues DOWN
                }
                
                // OPTIMIZED BOUNDARY DETECTION: Find last transaction BEFORE start date and first transaction AFTER end date
                // For October: Left boundary = Last transaction of Sept 30, Right boundary = First transaction of Nov 1
                // This ensures 100% recovery of all transactions in the range
                
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
                if (!endBoundaryFound && rightBoundaryTx) {
                    endBoundaryFound = true;
                    targetRangeEndBoundary = window.scrollY; // RIGHT boundary is higher on page (found first)
                    const boundaryTxDate = parseTransactionDate(rightBoundaryTx.date);
                    const boundaryTxDateStr = boundaryTxDate ? boundaryTxDate.toLocaleDateString() : rightBoundaryTx.date;
                    console.log(`✅ [BOUNDARY DETECTION SUCCESS] RIGHT BOUNDARY FOUND`);
                    console.log(`   • Boundary type: RIGHT (first transaction AFTER end date)`);
                    console.log(`   • Target end date: ${endDateObj.toLocaleDateString()}`);
                    console.log(`   • Boundary date: ${rightBoundaryDate.toLocaleDateString()}`);
                    console.log(`   • Boundary transaction: ${rightBoundaryTx.description || 'N/A'} | ${boundaryTxDateStr} | $${rightBoundaryTx.amount || 'N/A'}`);
                    console.log(`   • Scroll position: ${Math.round(targetRangeEndBoundary)}px`);
                    console.log(`   • Scroll attempt: ${scrollAttempts}`);
                    console.log(`   • Transactions found so far: ${allTransactions.length} total, ${transactionsInRangeCount} in range`);
                    console.log(`   • Status: Found "${targetPeriodName}" - Right boundary reached! Continuing DOWN to find LEFT boundary...`);
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
                
                // Phase 2: Check if LEFT boundary (last transaction BEFORE start date) found SECOND (descending order)
                if (endBoundaryFound && !startBoundaryFound && leftBoundaryTx) {
                    startBoundaryFound = true;
                    targetRangeStartBoundary = window.scrollY; // LEFT boundary is lower on page (found second)
                    harvestingStarted = true; // Start harvesting immediately
                    lastOscillationCount = transactionsInRangeCount; // Initialize oscillation count tracking
                    const boundaryTxDate = parseTransactionDate(leftBoundaryTx.date);
                    const boundaryTxDateStr = boundaryTxDate ? boundaryTxDate.toLocaleDateString() : leftBoundaryTx.date;
                    const boundaryDistance = Math.abs(targetRangeEndBoundary - targetRangeStartBoundary);
                    console.log(`✅ [BOUNDARY DETECTION SUCCESS] LEFT BOUNDARY FOUND`);
                    console.log(`   • Boundary type: LEFT (last transaction BEFORE start date)`);
                    console.log(`   • Target start date: ${startDateObj.toLocaleDateString()}`);
                    console.log(`   • Boundary date: ${leftBoundaryDate.toLocaleDateString()}`);
                    console.log(`   • Boundary transaction: ${leftBoundaryTx.description || 'N/A'} | ${boundaryTxDateStr} | $${leftBoundaryTx.amount || 'N/A'}`);
                    console.log(`   • Scroll position: ${Math.round(targetRangeStartBoundary)}px`);
                    console.log(`   • Scroll attempt: ${scrollAttempts}`);
                    console.log(`   • Transactions found so far: ${allTransactions.length} total, ${transactionsInRangeCount} in range`);
                    console.log(`✅ [BOUNDARY DETECTION COMPLETE] BOTH BOUNDARIES FOUND`);
                    console.log(`   • RIGHT boundary: ${Math.round(targetRangeEndBoundary)}px (${rightBoundaryDate.toLocaleDateString()})`);
                    console.log(`   • LEFT boundary: ${Math.round(targetRangeStartBoundary)}px (${leftBoundaryDate.toLocaleDateString()})`);
                    console.log(`   • Boundary distance: ${Math.round(boundaryDistance)}px`);
                    console.log(`   • Target range: ${startDateObj.toLocaleDateString()} - ${endDateObj.toLocaleDateString()}`);
                    console.log(`   • Status: Found "${targetPeriodName}" - Both boundaries reached!`);
                    console.log(`   • Next phase: Starting oscillations between boundaries (dynamic limits, exit when no progress)`);
                    scrollingDirection = 'oscillating'; // Switch to oscillation mode
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
                
                // OPTIMIZED: Track progress during oscillations (after both boundaries found)
                // Exit early if no progress for 2 consecutive oscillations
                if (harvestingStarted && startBoundaryFound && endBoundaryFound) {
                    // Check if we're at a boundary (start or end) - this marks one oscillation
                    const currentPosition = window.scrollY;
                    const distanceToStart = Math.abs(currentPosition - targetRangeStartBoundary);
                    const distanceToEnd = Math.abs(currentPosition - targetRangeEndBoundary);
                    const scrollIncrement = window.innerHeight * 1.5;
                    const nearStartBoundary = distanceToStart < scrollIncrement;
                    const nearEndBoundary = distanceToEnd < scrollIncrement;
                    
                    // DYNAMIC ADJUSTMENT: Adjust oscillation limits based on progress
                    // If we're making good progress, allow more oscillations
                    // If no progress, reduce limits and exit sooner
                    if (transactionsInRangeCount > 0 && lastOscillationCount > 0) {
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
                                counterElement.textContent = `⚠️ 0 records two successive attempts, aborting\nRecords expected: ${estimatedExpectedRows} Rows, from ${daysInRange} days. Records harvested: ${transactionsInRangeCount} Rows${recordsMissed > 0 ? ` (${recordsMissed} missed)` : ''}\nTime elapsed: ${elapsedDisplay}`;
                            }
                            
                            // Exit early if consecutive no-progress oscillations reached (dynamic limit)
                            if (consecutiveNoProgressOscillations >= maxNoProgressOscillations) {
                                console.log(`✅ EARLY EXIT: No progress for ${consecutiveNoProgressOscillations} consecutive oscillations. Stopping and outputting results.`);
                                break; // Exit scroll loop immediately
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
                        
                        // Exit if max oscillations reached (dynamic limit)
                        if (oscillationCount >= maxOscillations) {
                            console.log(`✅ MAX OSCILLATIONS REACHED (${maxOscillations}). Stopping and outputting results.`);
                            break; // Exit scroll loop
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
                consecutiveTargetDateMatches = 0;
                // If we've reached target range but aren't finding new transactions, track no progress
                if (hasReachedTargetRange && transactionsInRangeCount === lastInRangeCount) {
                    noProgressScrolls++;
                } else if (hasReachedTargetRange) {
                    noProgressScrolls = 0; // Reset if we found new transactions
                }
            }
            
            // Update last count for progress tracking
            lastInRangeCount = transactionsInRangeCount;
            
            // If we've reached target range but haven't made progress for several scrolls, consider stopping
            if (hasReachedTargetRange && noProgressScrolls >= MAX_NO_PROGRESS_SCROLLS && scrollAttempts >= MIN_SCROLLS_FOR_LAST_MONTH) {
                console.log(`Reached target range but no progress for ${MAX_NO_PROGRESS_SCROLLS} scrolls. Checking if we should stop...`);
                // Will be checked in the stop conditions below
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
            let canCheckStopConditions = !isLastMonthMin || scrollAttempts >= MIN_SCROLLS_FOR_LAST_MONTH;
            
            // Check stop conditions (from working version)
            if (oldestTransaction && oldestTransaction.date && foundTargetDateRange && canCheckStopConditions) {
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
            
            // Enhanced stop conditions
            // IMPROVED: For small ranges, don't require minimum scrolls
            // Use SYSTEM_DATE for consistency (captured once at start)
            const daysSinceEndDateStop = (SYSTEM_DATE - endDateObj) / (24 * 60 * 60 * 1000);
            const isLastMonthStop = daysSinceEndDateStop >= 30 && daysSinceEndDateStop < 60;
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
                        minScrollsSet: MIN_SCROLLS || 0,
                        maxScrollsSet: maxScrollsCalculated || 200,
                        dateRangeDays: rangeDaysForStop || 0,
                        timestamp: new Date().toISOString()
                    };
                    console.log('');
                    console.log('='.repeat(70));
                    console.log(`🎯 100% RECOVERY ACHIEVED! (${inRangeCount} transactions)`);
                    console.log('='.repeat(70));
                    console.log(`   Reference standard: October with ${inRangeCount} transactions`);
                    console.log(`   Scrolls needed: ${scrollStats.scrollsAt100Percent}`);
                    console.log(`   Parameters saved for future optimizations`);
                    console.log('='.repeat(70));
                    console.log('');
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
            let MIN_SCROLLS_FOR_STOP = 0;
            if (rangeDaysForStop <= 10) {
                MIN_SCROLLS_FOR_STOP = 0; // Small range - no minimum
            } else if (rangeDaysForStop <= 32) {
                MIN_SCROLLS_FOR_STOP = isLastMonthStop ? CONFIG.MIN_SCROLLS.LAST_MONTH : CONFIG.MIN_SCROLLS.MEDIUM_RANGE;
            } else {
                MIN_SCROLLS_FOR_STOP = isLastMonthStop ? CONFIG.MIN_SCROLLS.LAST_MONTH : CONFIG.MIN_SCROLLS.LARGE_RANGE;
            }
            const canStopNow = !isLastMonthStop || scrollAttempts >= MIN_SCROLLS_FOR_STOP || rangeDaysForStop <= 10;
            
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
                                break;
                        } else {
                            // Diagnostic logging for incomplete criteria (every 10 scrolls to avoid spam)
                            if (scrollAttempts % 10 === 0) {
                                const missingCriteria = [];
                                if (!hasStartDate) missingCriteria.push('start date (earliest > Oct 1)');
                                if (!hasEndDate) missingCriteria.push('end date (latest < Oct 31)');
                                if (!hasStartDateExplicit) missingCriteria.push(`explicit start date (Oct 1)`);
                                if (!hasEndDateExplicit) missingCriteria.push(`explicit end date (Oct 31)`);
                                if (!hasCompleteMonth) missingCriteria.push(`complete month (${uniqueDates.size}/${expectedUniqueDates} dates)`);
                                if (!countInRange) missingCriteria.push(`enough transactions (${inRangeCount}/${TARGET_RANGE.min})`);
                                if (!hasScrolledPastBoundaries && !scrolledPastDateRange) missingCriteria.push('scrolled past boundaries');
                                
                                console.log(`Last Month: Continuing scroll. Missing: ${missingCriteria.join(', ')}. Transactions: ${inRangeCount}/${TARGET_RANGE.min}, Unique dates: ${uniqueDates.size}/${expectedUniqueDates}`);
                            }
                        }
                    }
                }
            }
            
            // CRITICAL FIX: NEVER stop if found range is NEWER than target - must continue scrolling DOWN
            // CRITICAL: Also require BOTH boundaries to be found before allowing exit
            if (foundTargetDateRange && scrolledPastDateRange && canStopNow && !foundRangeIsNewerThanTarget && startBoundaryFound && endBoundaryFound) {
                // Wait for DOM stability before stopping
                const currentDOMCount = document.querySelectorAll('[data-index]').length;
                const isStable = await waitForDOMStability(currentDOMCount, 2000);
                if (isStable) {
                    if (isLastMonthStop) {
                        console.log(`Last Month: Found range, scrolled past, both boundaries found, and DOM is stable after ${scrollAttempts} scrolls. Stopping.`);
                    } else {
                        console.log('Found range, scrolled past, both boundaries found, and DOM is stable. Stopping.');
                    }
                    break;  // CRITICAL: Fixed to 20 spaces - MUST align with lines 1808, 1810, 1812 to be inside if(isStable)
                }
            } else if (foundTargetDateRange && scrolledPastDateRange && !canStopNow) {
                console.log(`Last Month: Found range but only ${scrollAttempts} scrolls (need ${MIN_SCROLLS_FOR_STOP}). Continuing...`);
            } else if (foundTargetDateRange && scrolledPastDateRange && canStopNow && (!startBoundaryFound || !endBoundaryFound)) {
                // CRITICAL: Block exit if boundaries not found
                console.log(`⚠️ CRITICAL: Blocking exit - boundaries not fully found. Start boundary: ${startBoundaryFound}, End boundary: ${endBoundaryFound}. Continuing to scroll...`);
            } else if (foundRangeIsNewerThanTarget) {
                // CRITICAL: If found range is newer, NEVER stop - must continue scrolling DOWN
                console.log(`⚠️ CRITICAL: Found range is NEWER than target. Blocking exit. Must continue scrolling DOWN to find older transactions.`);
            }
            
            // OPTIMIZED: Robust bottom detection with delays to continue scrolling until boundary found
            // Critical for long date ranges (3+ years, 10+ years) - don't stop until boundaries are found
            const currentScrollPosition = window.scrollY;
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
                    if (scrollPositionUnchangedCount >= 3) {
                        const currentDOMCount = document.querySelectorAll('[data-index]').length;
                        const isStable = await waitForDOMStability(currentDOMCount, 2000);
                        if (isStable) {
                            console.log('✅ Reached bottom, boundaries found, DOM stable. Stopping.');
                            break;
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
                                console.log(`No new transactions after ${unchangedCount} scrolls, but have ${Math.round(coverage*100)}% coverage after ${scrollAttempts} total scrolls. Stopping.`);
                                break;
                            } else {
                                console.log(`No new transactions after ${unchangedCount} scrolls, but only ${Math.round(coverage*100)}% coverage. Continuing...`);
                                unchangedCount = 5; // Reset to continue trying
                            }
                        } else {
                            console.log(`No new transactions after ${unchangedCount} attempts and DOM is stable. Stopping.`);
                            break;
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
            
            // SMART SCROLLING STRATEGY: Two-phase approach
            // Phase 1: Before finding target range - scroll down continuously to find it
            // Phase 2: After finding target range - establish boundaries and scroll within them
            
            const currentPosition = window.scrollY;
            const scrollIncrement = window.innerHeight * 1.5;
            const nextPosition = currentPosition + scrollIncrement;
            
            // CRITICAL: If found range is NEWER than target, ALWAYS scroll DOWN (Phase 1 behavior)
            // This ensures we continue scrolling down to find older transactions, regardless of boundary status
            if (foundRangeIsNewerThanTarget) {
                // Found range is NEWER than target - MUST continue scrolling DOWN to find older transactions
                const reachedRange = foundDateRange !== 'N/A' ? foundDateRange : 'None yet';
                console.log(`🔍 CRITICAL: Found range is NEWER than target. Forcing DOWN scroll to find older transactions...`);
                console.log(`   • Target range: ${startDateObj.toLocaleDateString()} - ${endDateObj.toLocaleDateString()}`);
                console.log(`   • Found range: ${reachedRange}`);
                console.log(`   • Must scroll DOWN to reach older transactions (target start: ${startDateObj.toLocaleDateString()})`);
                console.log(`   • Scroll attempt: ${scrollAttempts} | Position: ${Math.round(currentPosition)} → ${Math.round(nextPosition)}`);
                // Always scroll DOWN - never up, never oscillate
                // CRITICAL: Use multiple scroll methods to ensure Credit Karma's lazy loading triggers
                const scrollStartY = window.scrollY;
                const maxScroll = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) - window.innerHeight;
                const targetScroll = Math.min(nextPosition, maxScroll);
                
                console.log(`   📊 Scroll Debug: Start=${Math.round(scrollStartY)}, Target=${Math.round(targetScroll)}, Max=${Math.round(maxScroll)}, ScrollHeight=${document.documentElement.scrollHeight}`);
                
                // CRITICAL: Credit Karma requires ACTUAL visual scrolling to trigger lazy loading
                // Use element-based scrolling (scrollIntoView) which actually moves the page
                
                // Find the last transaction element on the page (oldest transaction)
                const allTxElements = document.querySelectorAll('[data-index]');
                let lastTxElement = null;
                if (allTxElements.length > 0) {
                    // Get the last element (should be oldest transaction)
                    lastTxElement = allTxElements[allTxElements.length - 1];
                }
                
                // CRITICAL: Use scrollIntoView on actual elements - this triggers lazy loading
                if (lastTxElement) {
                    console.log(`   🎯 Scrolling last transaction element into view to trigger lazy loading...`);
                    // Scroll the last transaction into view - this should trigger loading more
                    lastTxElement.scrollIntoView({ 
                        behavior: 'smooth', 
                        block: 'end',
                        inline: 'nearest'
                    });
                    
                    // Also try scrolling a few elements before the last one
                    if (allTxElements.length > 5) {
                        const elementBeforeLast = allTxElements[allTxElements.length - 5];
                        setTimeout(() => {
                            elementBeforeLast.scrollIntoView({ 
                                behavior: 'smooth', 
                                block: 'center',
                                inline: 'nearest'
                            });
                        }, 500);
                    }
                } else {
                    // No elements found - use incremental scroll to bottom
                    console.log(`   ⚠️ No transaction elements found - using incremental scroll to bottom...`);
                    const scrollHeight = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
                    const currentScroll = window.scrollY;
                    const scrollStep = window.innerHeight * 0.8; // Scroll 80% of viewport at a time
                    const targetScroll = Math.min(currentScroll + scrollStep, scrollHeight);
                    
                    // Use smooth scroll which actually moves the page
                    window.scrollTo({ 
                        top: targetScroll, 
                        behavior: 'smooth' 
                    });
                }
                
                // Also try scrolling window directly as backup
                window.scrollTo({ top: targetScroll, behavior: 'smooth' });
                document.documentElement.scrollTop = targetScroll;
                
                // Find and scroll main container if it exists
                const mainContainer = document.querySelector('main') || document.querySelector('[role="main"]');
                if (mainContainer && mainContainer.scrollHeight > mainContainer.clientHeight) {
                    const containerMax = mainContainer.scrollHeight - mainContainer.clientHeight;
                    mainContainer.scrollTop = Math.min(targetScroll, containerMax);
                    console.log(`   📍 Scrolling main container to: ${Math.round(Math.min(targetScroll, containerMax))}px`);
                }
                
                // CRITICAL: Verify scroll happened and check if new content loaded
                setTimeout(() => {
                    const actualScrollY = window.scrollY;
                    const initialTxCount = allTxElements.length;
                    const newTxElements = document.querySelectorAll('[data-index]');
                    const newTxCount = newTxElements.length;
                    
                    console.log(`   📍 Scroll verification:`);
                    console.log(`      • Window scrollY: ${Math.round(actualScrollY)}px (was: ${Math.round(scrollStartY)}px)`);
                    console.log(`      • Transaction elements: ${newTxCount} (was: ${initialTxCount})`);
                    
                    // Check if new transactions loaded
                    if (newTxCount > initialTxCount) {
                        console.log(`   ✅ SUCCESS: New transactions loaded! Count increased from ${initialTxCount} to ${newTxCount} (+${newTxCount - initialTxCount})`);
                    } else {
                        console.log(`   ⚠️ No new transactions loaded yet. May need more scrolling or wait time.`);
                    }
                    
                    // If scroll position didn't change, try more aggressive methods
                    if (Math.abs(actualScrollY - scrollStartY) < 10) {
                        console.log(`   ⚠️ Scroll position didn't change - trying incremental scroll...`);
                        // Try scrolling in smaller increments using requestAnimationFrame
                        let currentPos = scrollStartY;
                        const targetPos = Math.min(scrollStartY + scrollIncrement, document.documentElement.scrollHeight - window.innerHeight);
                        const steps = 10;
                        const stepSize = (targetPos - currentPos) / steps;
                        
                        for (let i = 0; i < steps; i++) {
                            setTimeout(() => {
                                currentPos += stepSize;
                                window.scrollTo({ top: currentPos, behavior: 'auto' });
                                // Also scroll last element if available
                                if (lastTxElement && i === steps - 1) {
                                    lastTxElement.scrollIntoView({ behavior: 'auto', block: 'end' });
                                }
                            }, i * 50);
                        }
                    }
                }, 500);
                
                currentScrollPosition = targetScroll;
                lastKnownScrollY = window.scrollY; // Update to prevent detecting our own scroll as manual
                console.log(`   ✅ SCROLL EXECUTED: Position ${Math.round(scrollStartY)} → ${Math.round(targetScroll)} (increment: ${Math.round(scrollIncrement)})`);
            } else if (!endBoundaryFound) {
                // PHASE 1: Haven't found END boundary yet - scroll DOWN only to find it
                const reachedRange = foundDateRange !== 'N/A' ? foundDateRange : 'None yet';
                console.log(`🔍 Phase 1: Searching for END boundary (${endDateObj.toLocaleDateString()})... Expected: ${startDateObj.toLocaleDateString()} - ${endDateObj.toLocaleDateString()} | Reached: ${reachedRange} | Scroll: ${scrollAttempts}`);
                // PRISTINE VERSION: Simple scroll
                scrollDown();
                currentScrollPosition = window.scrollY;
                lastKnownScrollY = window.scrollY; // Update to prevent detecting our own scroll as manual
            } else if (!startBoundaryFound) {
                // PHASE 2: Found END boundary, but not START boundary yet - continue scrolling DOWN only
                const reachedRange = foundDateRange !== 'N/A' ? foundDateRange : 'None yet';
                console.log(`🔍 Phase 2: END boundary found! Searching for START boundary (${startDateObj.toLocaleDateString()})... Expected: ${startDateObj.toLocaleDateString()} - ${endDateObj.toLocaleDateString()} | Reached: ${reachedRange} | Scroll: ${scrollAttempts}`);
                // PRISTINE VERSION: Simple scroll
                scrollDown();
                currentScrollPosition = window.scrollY;
                lastKnownScrollY = window.scrollY; // Update to prevent detecting our own scroll as manual
            } else {
                // PHASE 3: BOTH boundaries found! Now oscillate BETWEEN boundaries (MAX 3 oscillations)
                // TIME-CRITICAL: Exit early if no progress for 2 consecutive oscillations
                // Note: END boundary is HIGHER on page (found first), START boundary is LOWER on page (found second)
                // Scroll UP to END boundary, then DOWN to START boundary, repeating between them
                
                const scrollEndBoundary = targetRangeEndBoundary; // Higher position (END date, Oct 31)
                const scrollStartBoundary = targetRangeStartBoundary; // Lower position (START date, Oct 1)
                
                // Phase 3: Oscillate between boundaries
                // Note: END boundary (Oct 31) is at LOWER scrollY (found first), START boundary (Oct 1) is at HIGHER scrollY (found second)
                // So: scrollEndBoundary < scrollStartBoundary
                
                // Determine if we're near a boundary (within scroll increment)
                const distanceToStart = Math.abs(currentPosition - scrollStartBoundary);
                const distanceToEnd = Math.abs(currentPosition - scrollEndBoundary);
                const nearStartBoundary = distanceToStart < scrollIncrement;
                const nearEndBoundary = distanceToEnd < scrollIncrement;
                
                // Determine direction: at START boundary (higher scrollY) → scroll UP (decrease scrollY) to END
                //                    at END boundary (lower scrollY) → scroll DOWN (increase scrollY) to START
                // OPTIMIZED: Oscillate STRICTLY between boundaries only (no flanking zones)
                // LEFT boundary (lower scrollY) = last transaction before start date
                // RIGHT boundary (higher scrollY) = first transaction after end date
                // Oscillate between these exact boundaries to ensure 100% recovery
                if (nearStartBoundary || currentPosition >= scrollStartBoundary) {
                    // At or past LEFT boundary (higher scrollY) - scroll UP (decrease) to RIGHT boundary
                    atStartBoundary = true;
                    const upPosition = Math.max(scrollEndBoundary, currentPosition - scrollIncrement);
                    console.log(`🔄 Oscillation ${oscillationCount + 1}/${maxOscillations}: At LEFT boundary (${Math.round(currentPosition)}), scrolling UP to RIGHT boundary (${Math.round(scrollEndBoundary)})`);
                    window.scrollTo(0, upPosition);
                    currentScrollPosition = upPosition;
                } else if (nearEndBoundary || currentPosition <= scrollEndBoundary) {
                    // At or past RIGHT boundary (lower scrollY) - scroll DOWN (increase) to LEFT boundary
                    atStartBoundary = false;
                    const downPosition = Math.min(scrollStartBoundary, currentPosition + scrollIncrement);
                    console.log(`🔄 Oscillation ${oscillationCount + 1}/${maxOscillations}: At RIGHT boundary (${Math.round(currentPosition)}), scrolling DOWN to LEFT boundary (${Math.round(scrollStartBoundary)})`);
                    window.scrollTo(0, downPosition);
                    currentScrollPosition = downPosition;
                } else {
                    // Between boundaries - continue in current direction (strictly within boundaries)
                    if (atStartBoundary) {
                        // Heading UP (decrease scrollY) to RIGHT boundary
                        const upPosition = Math.max(scrollEndBoundary, currentPosition - scrollIncrement);
                        window.scrollTo(0, upPosition);
                        currentScrollPosition = upPosition;
                    } else {
                        // Heading DOWN (increase scrollY) to LEFT boundary
                        const downPosition = Math.min(scrollStartBoundary, currentPosition + scrollIncrement);
                        window.scrollTo(0, downPosition);
                        currentScrollPosition = downPosition;
                    }
                }
            }
            
            // ROLLBACK: Simple adaptive wait time (from successful October-133-Version)
            // Use CONFIG wait times: fast if found range for 3+ scrolls, standard otherwise
            // CRITICAL: If found range is newer than target, use LONGER wait time to allow lazy loading
            let waitTime;
            if (foundRangeIsNewerThanTarget) {
                // Found range is newer - need MORE time for lazy loading to trigger and load content
                waitTime = CONFIG.SCROLL_WAIT_TIME.STANDARD * 2; // 3000ms to allow lazy loading
                console.log(`   ⏳ Extended wait mode: Using ${waitTime}ms wait (found range newer - allowing lazy loading to complete)`);
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
        }
        
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
            console.log(`⚠️ Extraction stopped due to logout. CSV already exported.`);
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
                               `Check console (F12) for full diagnostic details.`;
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
                : `No transactions found on page. Check console (F12) for full diagnostic details.`;
            throw new Error(errorDetails);
        }
        
        if ((endBoundaryFound || startBoundaryFound) && finalInRangeCount === 0) {
            console.log(`⚠️ BOUNDARIES FOUND BUT NO TRANSACTIONS IN RANGE! Expected: ${startDateObj.toLocaleDateString()} - ${endDateObj.toLocaleDateString()}`);
            console.log(`   Performing quick verification pass to check if data is in ascending order or range is missing...`);
            
            if (counterElement && document.body.contains(counterElement)) {
                counterElement.textContent = `⚠️ No transactions found in range. Performing quick verification pass...`;
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
                    console.log(`   ⚠️  The target date range appears to be MISSING or has NO TRANSACTIONS.`);
                    
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
                console.error(`   ❌ Error during verification pass:`, verifyError);
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
                                        `Verification pass completed - no transactions found in target range.`;
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
                                        `The target month may not have been reached during scrolling.`;
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
        
        // Find first posted transaction (for pending detection)
        // Pending = all transactions before first posted transaction
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
                console.log(`   All transactions before this will be included as pending for preset`);
            }
        }
        
        const shouldIncludePending = originalEndDate >= today || shouldIncludePendingPreset;
        
        console.log(`Pending transaction check: originalEndDate=${originalEndDate.toLocaleDateString()}, today=${today.toLocaleDateString()}, shouldIncludePending=${shouldIncludePending}`);
        console.log(`   Preset detection: this-week=${isThisWeekPreset}, this-month=${isThisMonthPreset}, last-year=${isLastYearPreset}`);
        
        // CRITICAL: Verify boundaries before export
        if (!startBoundaryFound || !endBoundaryFound) {
            console.warn(`⚠️ EXPORT WARNING: Exporting without both boundaries found:`);
            console.warn(`   • Start boundary found: ${startBoundaryFound}`);
            console.warn(`   • End boundary found: ${endBoundaryFound}`);
            console.warn(`   • This may indicate incomplete data extraction. Proceeding with export, but results may be incomplete.`);
            console.warn(`   • Target range: ${startDateObj.toLocaleDateString()} - ${endDateObj.toLocaleDateString()}`);
        } else {
            console.log(`✅ Boundary verification passed: Both boundaries found before export`);
            console.log(`   • Start boundary: ${startBoundaryFound} (last transaction before ${startDateObj.toLocaleDateString()})`);
            console.log(`   • End boundary: ${endBoundaryFound} (first transaction after ${endDateObj.toLocaleDateString()})`);
        }
        
        const filteredTransactions = filterEmptyTransactions(
            allTransactions.filter(transaction => {
                // OPTIMIZED: For this-week, this-month, and this-year presets, include ALL transactions before first posted transaction
                if (shouldIncludePendingPreset && firstPostedTransaction) {
                    const txDate = parseTransactionDate(transaction.date);
                    const firstPostedDate = parseTransactionDate(firstPostedTransaction.date);
                    
                    // If transaction has no date or is before first posted transaction, it's pending - include it
                    if (!txDate || (firstPostedDate && txDate.getTime() < firstPostedDate.getTime())) {
                        console.log(`Including pending transaction (before first posted): ${transaction.description}, amount: ${transaction.amount}, date: "${transaction.date || 'N/A'}"`);
                        return true; // Include all pending transactions for these presets
                    }
                }
                
                // Check if transaction is pending (status is Pending OR has no date)
                const isPendingStatus = transaction.status && transaction.status.toLowerCase() === 'pending';
                const hasNoDate = !transaction.date || transaction.date.trim() === '';
                const isPending = isPendingStatus || hasNoDate;
                
                // If transaction is pending, include it if we should include pending
                if (isPending) {
                    if (shouldIncludePending) {
                        console.log(`Including pending transaction: ${transaction.description}, amount: ${transaction.amount}, status: ${transaction.status || 'Pending (no date)'}, date: "${transaction.date || 'N/A'}"`);
                    } else {
                        console.log(`Excluding pending transaction (end date in past): ${transaction.description}`);
                    }
                    return shouldIncludePending;
                }
                // Otherwise, check if date is in range (for posted transactions)
                const txDate = parseTransactionDate(transaction.date);
                const inRange = isDateInRange(transaction.date, exportStartDate, exportEndDate);
                
                // Enhanced debugging: Log first 10 excluded transactions to help diagnose issues
                if (!inRange && txDate) {
                    // Log first few excluded transactions for debugging
                    if (typeof window.__excludedTxCount === 'undefined') {
                        window.__excludedTxCount = 0;
                    }
                    if (window.__excludedTxCount < 10) {
                        window.__excludedTxCount++;
                        console.warn(`⚠️ Excluding transaction #${window.__excludedTxCount}:`, {
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
        console.log(`=== EXTRACTION SUMMARY ===`);
        console.log(`Selected date range (raw input): ${startDate} to ${endDate}`);
        console.log(`Export date range ${trimmedRange ? '(trimmed)' : ''}: ${exportStartDate.toLocaleDateString()} (${exportStartDate.getFullYear()}-${String(exportStartDate.getMonth()+1).padStart(2,'0')}-${String(exportStartDate.getDate()).padStart(2,'0')}) to ${exportEndDate.toLocaleDateString()} (${exportEndDate.getFullYear()}-${String(exportEndDate.getMonth()+1).padStart(2,'0')}-${String(exportEndDate.getDate()).padStart(2,'0')})`);
        console.log(`Total transactions found (all dates): ${allTransactions.length}`);
        console.log(`Transactions in export range: ${filteredTransactions.length}`);
        
        // Export validation logging
        console.log(`=== EXPORT VALIDATION ===`);
        console.log(`📊 Posted transactions exported: ${exportedPostedTransactions.length} (out of ${filteredTransactions.length} total)`);
        if (exportedStart && exportedEnd) {
            console.log(`📅 Date range exported: ${exportedStart.toLocaleDateString()} - ${exportedEnd.toLocaleDateString()}`);
            console.log(`📅 Target range: ${startDateObj.toLocaleDateString()} - ${endDateObj.toLocaleDateString()}`);
            
            // Validate date range coverage
            if (exportedStart > startDateObj) {
                console.warn(`⚠️ EXPORT WARNING: Exported start date (${exportedStart.toLocaleDateString()}) is AFTER target start date (${startDateObj.toLocaleDateString()})`);
                console.warn(`   • Missing transactions before ${exportedStart.toLocaleDateString()}`);
            }
            if (exportedEnd < endDateObj) {
                console.warn(`⚠️ EXPORT WARNING: Exported end date (${exportedEnd.toLocaleDateString()}) is BEFORE target end date (${endDateObj.toLocaleDateString()})`);
                console.warn(`   • Missing transactions after ${exportedEnd.toLocaleDateString()}`);
            }
            if (exportedStart <= startDateObj && exportedEnd >= endDateObj) {
                console.log(`✅ Date range validation passed: Exported range fully covers target range`);
            }
        } else {
            console.warn(`⚠️ EXPORT WARNING: No valid dates found in exported transactions`);
        }
        
        // Validate boundary status
        if (!startBoundaryFound || !endBoundaryFound) {
            console.warn(`⚠️ EXPORT WARNING: Exporting without both boundaries found (Start: ${startBoundaryFound}, End: ${endBoundaryFound})`);
        } else {
            console.log(`✅ Boundary validation passed: Both boundaries found before export`);
        }
        
        // Validate posted transactions for month/custom presets
        const isMonthOrCustomPreset = !isThisWeekPreset && !isThisMonthPreset && !isThisYearPreset;
        if (isMonthOrCustomPreset && exportedPostedTransactions.length === 0 && filteredTransactions.length > 0) {
            console.warn(`⚠️ EXPORT WARNING: Month/Custom preset but only pending transactions exported (${filteredTransactions.length} pending, 0 posted)`);
            console.warn(`   • For month/custom presets, posted transactions are required`);
        } else if (isMonthOrCustomPreset && exportedPostedTransactions.length > 0) {
            console.log(`✅ Posted transaction validation passed: ${exportedPostedTransactions.length} posted transactions found for month/custom preset`);
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
            console.log(`📊 EXTRACTION PARAMETERS AT 100%:`);
            console.log(`   • Total scrolls when 100% achieved: ${params.totalScrolls}`);
            console.log(`   • Scrolls with new transactions: ${params.scrollsWithNewTransactions}`);
            console.log(`   • Scrolls with no change: ${params.scrollsWithNoChange}`);
            console.log(`   • Transactions collected at 100%: ${params.inRangeCollected}`);
            console.log('');
            console.log(`⚙️ CONFIGURATION PARAMETERS:`);
            console.log(`   • Scroll wait time: ${params.scrollWaitTime} ms`);
            console.log(`   • Min scrolls set: ${params.minScrollsSet}`);
            console.log(`   • Max scrolls set: ${params.maxScrollsSet}`);
            console.log(`   • Date range days: ${params.dateRangeDays}`);
            console.log('');
            console.log(`📈 EFFICIENCY:`);
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
            console.log(`   • Expected range: 133-140 transactions`);
            console.log(`   • Transactions found: ${filteredTransactions.length}`);
            if (filteredTransactions.length >= TARGET_RANGE.min && filteredTransactions.length <= TARGET_RANGE.max) {
                console.log(`   ✅ 100% RECOVERY ACHIEVED! (${filteredTransactions.length} transactions)`);
                console.log(`   ✅ Reference standard met - these parameters can guide future extractions`);
            } else if (filteredTransactions.length < TARGET_RANGE.min) {
                console.log(`   ⚠️ Below expected minimum (${TARGET_RANGE.min} transactions)`);
                console.log(`   Consider increasing max scrolls`);
            } else if (filteredTransactions.length > TARGET_RANGE.max) {
                console.log(`   ℹ️ Above expected maximum (${TARGET_RANGE.max} transactions)`);
                console.log(`   May include extra transactions at boundaries`);
            }
            console.log('');
            console.log('='.repeat(70));
            console.log('');
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
        console.log(`Date distribution of exported transactions:`, dateDistribution);
        if (pendingCount.count > 0) {
            console.log(`✓ Pending transactions: ${pendingCount.count}`);
            // Show pending transaction details
            const pendingTxs = filteredTransactions.filter(t => {
                const isPendingStatus = t.status && t.status.toLowerCase() === 'pending';
                return isPendingStatus;
            });
            console.log(`Pending transaction details:`, pendingTxs.map(t => ({
                date: t.date,
                description: t.description,
                amount: t.amount,
                status: t.status
            })));
        } else {
            console.log(`⚠️ No pending transactions found in export`);
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
            console.warn(`⚠️ Found ${allPendingCount} pending transactions but none were included in export!`);
            console.warn(`   Original end date: ${endDateObj.toLocaleDateString()}, Should include pending: ${shouldIncludePending}`);
            // Log sample pending transactions for debugging
            const samplePending = allTransactions.filter(t => {
                const isPendingStatus = t.status && t.status.toLowerCase() === 'pending';
                return isPendingStatus;
            }).slice(0, 5);
            console.warn(`   Sample pending transactions:`, samplePending.map(t => ({
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
        console.log(`Status breakdown:`, statusBreakdown);
        
        // Check for missing dates in range - IMPROVED: More detailed logging
        const expectedDates = [];
        const currentDate = new Date(exportStartDate);
        while (currentDate <= exportEndDate) {
            expectedDates.push(currentDate.toLocaleDateString());
            currentDate.setDate(currentDate.getDate() + 1);
        }
        const missingDates = expectedDates.filter(date => !dateDistribution[date] || dateDistribution[date] === 0);
        if (missingDates.length > 0) {
            console.warn(`⚠️ Missing dates in export: ${missingDates.join(', ')}`);
            // Log specific missing dates with their day of week for debugging
            missingDates.forEach(dateStr => {
                const missingDate = new Date(dateStr);
                console.warn(`  - Missing: ${dateStr} (${missingDate.toLocaleDateString('en-US', { weekday: 'long' })})`);
            });
            
            // Special check for start date
            const startDateStr = exportStartDate.toLocaleDateString();
            if (missingDates.includes(startDateStr)) {
                console.error(`❌ CRITICAL: Start date ${startDateStr} is missing from export!`);
            }
            
            // Special check for end date
            const endDateStr = exportEndDate.toLocaleDateString();
            if (missingDates.includes(endDateStr)) {
                console.error(`❌ CRITICAL: End date ${endDateStr} is missing from export!`);
            }
        } else {
            console.log(`✓ All dates in range have transactions`);
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
            shouldIncludePendingPreset: shouldIncludePendingPreset // Include preset flag for use in callbacks
        };
        }
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
            console.warn(`⚠️ Scroll & Capture: No valid transactions after filtering. Original count: ${beforeCount}`);
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
    let stopHandler = () => {
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
    console.log(`   Status box visible in BOTTOM-LEFT corner (persistent)`);
    console.log(`   Scroll to capture more transactions. Click "Export CSV" when ready.`);
    
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
            
            console.log(`TxVault: Page detection results:`);
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
            }).then(({ allTransactions, filteredTransactions, elapsedTime, shouldIncludePendingPreset }) => {
                console.log(`Capture complete. Found ${filteredTransactions.length} transactions in range`);
                
                // Remove indicator
                if (document.body.contains(indicator)) {
                document.body.removeChild(indicator);
                }
                
                // Log what we found for debugging
                console.log(`=== EXPORT RESULTS ===`);
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
                    console.warn(`All transactions found:`, sampleTransactions);
                    
                    // Build helpful error message
                    let errorMsg = `No transactions found in the specified date range (${startDate} to ${endDate}).\n\n`;
                    errorMsg += `Found ${allTransactions.length} total transactions on the page.\n\n`;
                    
                    if (isFutureDate) {
                        errorMsg += `⚠️ WARNING: The selected date range appears to be in the FUTURE.\n`;
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
                    
                    errorMsg += `Check the browser console (F12) for details.`;
                    
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
                const postedTransactions = filteredTransactions.filter(t => {
                    const isPendingStatus = t.status && t.status.toLowerCase() === 'pending';
                    const hasNoDate = !t.date || (typeof t.date === 'string' && t.date.trim() === '');
                    return !isPendingStatus && !hasNoDate;
                });
                const postedCount = postedTransactions.length;
                
                // Prepare transactions for export: filter valid dates and remove duplicates
                const beforeCount = filteredTransactions.length;
                const preparedTransactions = prepareTransactionsForExport(filteredTransactions);
                const removedCount = beforeCount - preparedTransactions.length;
                
                if (removedCount > 0) {
                    console.log(`📊 Export: Filtered ${removedCount} transaction(s) (Pending dates or duplicates)`);
                    console.log(`   Before filtering: ${beforeCount}, After filtering: ${preparedTransactions.length}`);
                }
                
                // Generate and save CSVs
                if (csvTypes.allTransactions) {
                    const allCsvData = convertToCSV(preparedTransactions);
                    const fileName = `all_transactions_${startDate.replace(/\//g, '-')}_to_${endDate.replace(/\//g, '-')}.csv`;
                    saveCSVToFile(allCsvData, fileName);
                    filesGenerated.push('all_transactions.csv');
                }

                if (csvTypes.income) {
                    const creditTransactions = preparedTransactions.filter(t => t.transactionType === 'credit');
                    if (creditTransactions.length > 0) {
                    const creditCsvData = convertToCSV(creditTransactions);
                        const fileName = `income_${startDate.replace(/\//g, '-')}_to_${endDate.replace(/\//g, '-')}.csv`;
                        saveCSVToFile(creditCsvData, fileName);
                        filesGenerated.push('income.csv');
                    }
                }

                if (csvTypes.expenses) {
                    const debitTransactions = preparedTransactions.filter(t => t.transactionType === 'debit');
                    if (debitTransactions.length > 0) {
                    const debitCsvData = convertToCSV(debitTransactions);
                        const fileName = `expenses_${startDate.replace(/\//g, '-')}_to_${endDate.replace(/\//g, '-')}.csv`;
                        saveCSVToFile(debitCsvData, fileName);
                        filesGenerated.push('expenses.csv');
                    }
                }
                
                // Show statistics panel
                // CRITICAL: For presets that include pending, explicitly show pending and posted counts
                const shouldShowPendingPostedBreakdown = shouldIncludePendingPreset && (pendingCount > 0 || postedCount > 0);
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
                    postedCount: postedCount,
                    shouldShowPendingPostedBreakdown: shouldShowPendingPostedBreakdown
                });
                
                // Show completion notification
                const completionNotice = document.createElement('div');
                completionNotice.style.cssText = `
                    position: fixed;
                    top: 10px;
                    left: 20px;
                    padding: 12px 20px;
                    background: rgba(76, 175, 80, 0.95);
                    color: white;
                    border-radius: 6px;
                    z-index: 9999;
                    font-size: 14px;
                    font-weight: 500;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                `;
                completionNotice.textContent = `✅ Export complete! Found ${filteredTransactions.length} transactions.`;
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
                    <button id="error-close" style="
                        margin-top: 15px;
                        padding: 10px 20px;
                        background: #f44336;
                        color: white;
                        border: none;
                        border-radius: 4px;
                        cursor: pointer;
                        width: 100%;
                    ">Close</button>
                `;
                document.body.appendChild(errorNotice);
                
                document.getElementById('error-close').addEventListener('click', () => {
                    document.body.removeChild(errorNotice);
                });
                
                // Also show alert as backup
                alert(`Error during transaction capture: ${error.message || 'Unknown error'}\n\nCheck the browser console (F12) for details.`);
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
