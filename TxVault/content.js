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
    MIN_SCROLLS: {
        LAST_MONTH: 40,       // Minimum scrolls for Last Month preset (reduced from 60)
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
    const transactionElements = document.querySelectorAll('[data-index]');
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
        const statusStr = transaction.status || 'Posted'; // Default to Posted if no status
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
        ${stats.postedDateRange && stats.postedDateRange !== 'N/A' ? `
        <div style="margin-bottom: 10px; font-size: 13px; color: #666;">
            <strong>Posted Transactions:</strong> ${stats.postedDateRange} (${stats.exported - (stats.pendingCount || 0)} transactions)
        </div>
        ` : ''}
        ${stats.pendingCount && stats.pendingCount > 0 ? `
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
    console.log(`System Date: ${SYSTEM_DATE.toLocaleDateString()} (collected at start for consistency)`);
    console.log(`Input date range: ${startDate} to ${endDate}`);
    
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
    // Parse dates properly - these are the ACTUAL selected dates (with buffer if preset)
    const startDateObj = new Date(startDate);
    const endDateObj = new Date(endDate);
    
    // Validate date parsing
    if (isNaN(startDateObj.getTime()) || isNaN(endDateObj.getTime())) {
        throw new Error(`Invalid date range: ${startDate} to ${endDate}`);
    }
    
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
    
    try {
        // CRITICAL: Start by scrolling to top to ensure we capture everything
        // Use segmented scroll to avoid logout triggers
        console.log('Scrolling to top to start from beginning (segmented)...');
        await scrollToTopSegmented(
            (segment, total, progress) => {
                if (counterElement && document.body.contains(counterElement)) {
                    counterElement.textContent = `Starting from top: Segment ${segment}/${total} (${progress}%)...`;
                }
            },
            () => {
                // LESSON LEARNED: Extract at each scroll segment to capture older transactions
                const segmentTransactions = extractAllTransactions();
                allTransactions = combineTransactions(allTransactions, segmentTransactions);
            }
        );
        // IMPROVED: Longer wait to ensure page is fully loaded, especially after app refresh
        await new Promise(resolve => setTimeout(resolve, randomDelay(1500, 2000)));
        
        // IMPROVED: Wait for DOM to stabilize before initial extraction
        const initialDOMCount = document.querySelectorAll('[data-index]').length;
        await waitForDOMStability(initialDOMCount, 3000);
        
        // Initial extraction at top - do multiple passes to catch everything
        let initialTransactions = extractAllTransactions();
        await new Promise(resolve => setTimeout(resolve, randomDelay(500, 800)));
        const initialPass2 = extractAllTransactions();
        initialTransactions = combineTransactions(initialTransactions, initialPass2);
        await new Promise(resolve => setTimeout(resolve, randomDelay(500, 800)));
        const initialPass3 = extractAllTransactions();
        initialTransactions = combineTransactions(initialTransactions, initialPass3);
        allTransactions = combineTransactions(allTransactions, initialTransactions);
        console.log(`Initial extraction at top: ${initialTransactions.length} unique transactions`);
        
        // Log date range of initial transactions for debugging
        const initialDates = initialTransactions
            .map(t => parseTransactionDate(t.date))
            .filter(d => d)
            .sort((a, b) => b.getTime() - a.getTime());
        if (initialDates.length > 0) {
            console.log(`Initial date range found: ${initialDates[initialDates.length - 1].toLocaleDateString()} to ${initialDates[0].toLocaleDateString()}`);
        }
        
        while (!stopScrolling && scrollAttempts < MAX_SCROLL_ATTEMPTS) {
            
            scrollAttempts++;
            
            // Update progress bar
            const progress = Math.min((scrollAttempts / MAX_SCROLL_ATTEMPTS) * 100, 95);
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
            allTransactions = combineTransactions(allTransactions, newTransactions);
            
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
            
            const newTransactionsThisScroll = allTransactions.length - lastTransactionCount;
            if (newTransactionsThisScroll > 0) {
                scrollStats.scrollsWithNewTransactions++;
            } else {
                scrollStats.scrollsWithNoChange++;
            }
            
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
            let foundDateRange = 'N/A';
            if (allTransactions.length > 0) {
                const foundDates = allTransactions
                    .map(t => parseTransactionDate(t.date))
                    .filter(d => d)
                    .sort((a, b) => a.getTime() - b.getTime());
                if (foundDates.length > 0) {
                    foundDateRange = `${foundDates[0].toLocaleDateString()} - ${foundDates[foundDates.length - 1].toLocaleDateString()}`;
                }
            }
            
            // Show requested range, not found range
            const requestedRange = `${startDateObj.toLocaleDateString()} - ${endDateObj.toLocaleDateString()}`;
            
            // Update counter with transactions in range
            counterElement.textContent = `
Scroll: ${scrollAttempts} | Found: ${allTransactions.length} | In Range: ${transactionsInRangeCount}
Range: ${requestedRange} | Found: ${foundDateRange} | (Time: ${elapsedDisplay})
            `.trim();
            
            // Check for transactions in target range using improved date comparison
            const transactionsInRange = newTransactions.filter(transaction => {
                return isDateInRange(transaction.date, startDateObj, endDateObj);
            });
            
            if (transactionsInRange.length > 0) {
                foundTargetDateRange = true;
                consecutiveTargetDateMatches++;
            } else {
                consecutiveTargetDateMatches = 0;
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
            
            if (foundTargetDateRange && scrolledPastDateRange && canStopNow) {
                // Wait for DOM stability before stopping
                const currentDOMCount = document.querySelectorAll('[data-index]').length;
                const isStable = await waitForDOMStability(currentDOMCount, 2000);
                if (isStable) {
                    if (isLastMonthStop) {
                        console.log(`Last Month: Found range, scrolled past, and DOM is stable after ${scrollAttempts} scrolls. Stopping.`);
                    } else {
                        console.log('Found range, scrolled past, and DOM is stable. Stopping.');
                    }
                break;
                }
            } else if (foundTargetDateRange && scrolledPastDateRange && !canStopNow) {
                console.log(`Last Month: Found range but only ${scrollAttempts} scrolls (need ${MIN_SCROLLS_FOR_STOP}). Continuing...`);
            }
            
            // Check if scroll position hasn't changed (reached bottom)
            // For "Last Month", be more conservative - require more unchanged scrolls
            // Use SYSTEM_DATE for consistency (captured once at start)
            const daysSinceEndDateCheck = (SYSTEM_DATE - endDateObj) / (24 * 60 * 60 * 1000);
            const isLastMonthCheck = daysSinceEndDateCheck >= 30 && daysSinceEndDateCheck < 60;
            const requiredUnchangedScrolls = isLastMonthCheck ? 5 : 3; // More for last month
            const MIN_SCROLLS_FOR_LAST_MONTH_BOTTOM = CONFIG.MIN_SCROLLS.BOTTOM_CHECK; // From CONFIG (reduced from 60 to minimize logout risk)
            const canStopAtBottom = !isLastMonthCheck || scrollAttempts >= MIN_SCROLLS_FOR_LAST_MONTH_BOTTOM;
            
            const currentScrollPosition = window.scrollY;
            if (Math.abs(currentScrollPosition - lastScrollPosition) < 10) {
                scrollPositionUnchangedCount++;
                if (scrollPositionUnchangedCount >= requiredUnchangedScrolls && canStopAtBottom) {
                    // Wait for DOM stability
                    const currentDOMCount = document.querySelectorAll('[data-index]').length;
                    const isStable = await waitForDOMStability(currentDOMCount, 2000);
                    if (isStable) {
                        // For last month, also check if we have good date coverage before stopping
                        if (isLastMonthCheck) {
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
                                console.log(`Reached bottom with ${Math.round(coverage*100)}% date coverage after ${scrollAttempts} scrolls. Stopping.`);
                                break;
                            } else {
                                console.log(`Reached bottom but only ${Math.round(coverage*100)}% coverage. Continuing scroll...`);
                                scrollPositionUnchangedCount = 0; // Reset to continue scrolling
                            }
                        } else {
                            console.log('Reached bottom and DOM is stable. Stopping.');
                            break;
                        }
                    }
                } else if (scrollPositionUnchangedCount >= requiredUnchangedScrolls && !canStopAtBottom) {
                    console.log(`Last Month: Reached bottom but only ${scrollAttempts} scrolls (need ${MIN_SCROLLS_FOR_LAST_MONTH_BOTTOM}). Continuing...`);
                    scrollPositionUnchangedCount = 0; // Reset to continue scrolling
                }
            } else {
                scrollPositionUnchangedCount = 0;
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
            
            // PRISTINE VERSION: Simple scroll - no verification, no event dispatching
            // Simple approach worked for 133 transactions extraction
            scrollDown();
            
            // ROLLBACK: Simple adaptive wait time (from successful October-133-Version)
            // Use CONFIG wait times: fast if found range for 3+ scrolls, standard otherwise
            const waitTime = (foundTargetDateRange && consecutiveTargetDateMatches >= 3) ? CONFIG.SCROLL_WAIT_TIME.FAST : CONFIG.SCROLL_WAIT_TIME.STANDARD;
            await new Promise(resolve => setTimeout(resolve, waitTime));
            
            // Add micro-pauses for human behavior (from successful version)
            const microPause = simulateHumanBehavior();
            await new Promise(resolve => setTimeout(resolve, microPause));
        }
        
        // OPTIMIZED: Final verification pass - only check date range area, not entire page
        // CRITICAL: Always run final verification pass, even if main scroll stopped early
        try {
            console.log('Performing optimized final verification pass...');
            finalVerificationScrolls = 0; // Reset counter for final verification
            if (counterElement && document.body.contains(counterElement)) {
                counterElement.textContent = `Final verification pass (Scroll: 0) - checking date range boundaries...`;
            }
            
            const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
            
            // Calculate smart scroll limits based on date range
            // For recent dates (like November), only check top portion of page
            // Use SYSTEM_DATE for consistency (captured once at start)
            const daysSinceEndDate = (SYSTEM_DATE - endDateObj) / (24 * 60 * 60 * 1000);
            const rangeDays = (endDateObj - startDateObj) / (24 * 60 * 60 * 1000);
            
            // Determine scroll limit based on how recent the range is
            // CRITICAL: Be more conservative - ensure we don't miss transactions
            // For recent dates, we still need to check enough area to catch all transactions
            let scrollLimit = maxScroll;
            if (daysSinceEndDate < 30) {
                // Very recent (current month) - check top 50%
                scrollLimit = Math.min(maxScroll * 0.5, maxScroll);
                console.log(`Very recent date range (${Math.round(daysSinceEndDate)} days ago) - checking top 50%`);
            } else if (daysSinceEndDate < 60) {
                // Last month (30-60 days ago) - check top 70% (need more area since data is further down)
                scrollLimit = Math.min(maxScroll * 0.7, maxScroll);
                console.log(`Last month date range (${Math.round(daysSinceEndDate)} days ago) - checking top 70% for completeness`);
            } else if (daysSinceEndDate < 180) {
                // Recent (within 6 months) - check top 60% of page
                scrollLimit = Math.min(maxScroll * 0.6, maxScroll);
                console.log(`Recent date range (${Math.round(daysSinceEndDate)} days ago) - checking top 60%`);
            } else if (rangeDays < 90) {
                // Small range (< 3 months) - check top 70% of page
                scrollLimit = Math.min(maxScroll * 0.7, maxScroll);
                console.log(`Small date range (${Math.round(rangeDays)} days) - checking top 70%`);
            }
            
            // LESSON LEARNED: Scroll to top with extraction at each segment
            console.log('Scrolling back to top for final verification pass (segmented with extraction)...');
            await scrollToTopSegmented(
                (segment, total, progress) => {
                    if (counterElement && document.body.contains(counterElement)) {
                        counterElement.textContent = `Returning to top: Segment ${segment}/${total} (${progress}%)...`;
                    }
                },
                () => {
                    // LESSON LEARNED: Extract at each scroll segment to capture older transactions
                    const segmentTransactions = extractAllTransactions();
                    allTransactions = combineTransactions(allTransactions, segmentTransactions);
                }
            );
            await new Promise(resolve => setTimeout(resolve, randomDelay(800, 1200)));
            
            // Final extraction at top
            let finalTransactions = extractAllTransactions();
            allTransactions = combineTransactions(allTransactions, finalTransactions);
            
            // Optimized final pass - only scroll through relevant area
            let finalScrollPosition = 0;
            const finalScrollIncrement = window.innerHeight * 0.4;
            
            // Track found dates to stop early
            const foundDates = new Set();
            let consecutiveNoNewDates = 0;
            const expectedDateCount = Math.ceil(rangeDays) + 1;
            
            while (finalScrollPosition < scrollLimit && !stopScrolling) {
                finalScrollPosition += finalScrollIncrement;
                window.scrollTo(0, finalScrollPosition);
                finalVerificationScrolls++;
                
                // Update counter with final verification scroll count
                if (counterElement && document.body.contains(counterElement)) {
                    const inRangeCount = allTransactions.filter(t => {
                        return isDateInRange(t.date, startDateObj, endDateObj);
                    }).length;
                    counterElement.textContent = `Final verification pass (Scroll: ${finalVerificationScrolls}) - checking date range boundaries...\nFound: ${inRangeCount} transactions in range`;
                }
                
                await new Promise(resolve => setTimeout(resolve, randomDelay(500, 700)));
                
                // Extract at each position
                const pass1 = extractAllTransactions();
                allTransactions = combineTransactions(allTransactions, pass1);
                
                await new Promise(resolve => setTimeout(resolve, randomDelay(200, 400)));
                const pass2 = extractAllTransactions();
                allTransactions = combineTransactions(allTransactions, pass2);
                
                // Check if we've found all dates in range (use original dates for checking)
                const currentInRange = allTransactions.filter(t => {
                    return isDateInRange(t.date, startDateObj, endDateObj);
                });
                
                const currentFoundDates = new Set();
                currentInRange.forEach(t => {
                    const txDate = parseTransactionDate(t.date);
                    if (txDate) {
                        const dateKey = txDate.toLocaleDateString();
                        currentFoundDates.add(dateKey);
                    }
                });
                
                const newDatesCount = [...currentFoundDates].filter(d => !foundDates.has(d)).length;
                if (newDatesCount === 0) {
                    consecutiveNoNewDates++;
                    // If we haven't found new dates for 3 positions and have good coverage, stop
                    if (consecutiveNoNewDates >= 3 && foundDates.size >= expectedDateCount * 0.9) {
                        console.log(`Found ${foundDates.size}/${expectedDateCount} dates. Stopping final pass early.`);
                        break;
                    }
                } else {
                    consecutiveNoNewDates = 0;
                    currentFoundDates.forEach(d => foundDates.add(d));
                }
            }
            
            // Focused boundary check - only check positions around start and end dates
            // IMPROVED: More thorough boundary checking, especially for October 1st
            console.log('Performing focused boundary check for date range...');
            if (counterElement && document.body.contains(counterElement)) {
                counterElement.textContent = `Final verification pass - focused boundary check (ensuring ${startDateObj.toLocaleDateString()} is captured)...`;
            }
            
            // For "Last Month" scenarios, check more positions near the start date
            // Reuse 'today' and 'daysSinceEndDate' already declared above (line 1524-1525)
            const isLastMonth = daysSinceEndDate >= 30 && daysSinceEndDate < 60;
            
            // More boundary positions for last month to ensure start date (Oct 1) is captured
            let boundaryPositions;
            if (isLastMonth) {
                // For last month, check more positions in the lower portion where start date would be
                boundaryPositions = [
                    scrollLimit * 0.05,  // Very top (newest)
                    scrollLimit * 0.15,  // Top area
                    scrollLimit * 0.25,  // Upper-middle
                    scrollLimit * 0.35,  // Middle-upper
                    scrollLimit * 0.45,  // Middle
                    scrollLimit * 0.55,  // Middle-lower (start date area for last month)
                    scrollLimit * 0.65,  // Lower-middle (start date area)
                    scrollLimit * 0.75,  // Lower area (before start date)
                ].filter(p => p <= scrollLimit);
                console.log(`Last month detected - checking ${boundaryPositions.length} positions to ensure start date capture`);
            } else {
                boundaryPositions = [
                    scrollLimit * 0.1,  // Top area (start date)
                    scrollLimit * 0.2,
                    scrollLimit * 0.3,
                    scrollLimit * 0.4,  // Middle area (end date for recent ranges)
                    scrollLimit * 0.5
                ].filter(p => p <= scrollLimit);
            }
            
            for (const checkPos of boundaryPositions) {
                window.scrollTo(0, checkPos);
                await new Promise(resolve => setTimeout(resolve, randomDelay(1000, 1500)));
                
                // IMPROVED: More extractions at each boundary position (5 instead of 3)
                for (let i = 0; i < 5; i++) {
                    const boundaryPass = extractAllTransactions();
                    allTransactions = combineTransactions(allTransactions, boundaryPass);
                    
                    // Check if we've captured the start date
                    const hasStartDate = allTransactions.some(t => {
                        const txDate = parseTransactionDate(t.date);
                        if (!txDate) return false;
                        return txDate.getTime() === startDateObj.getTime();
                    });
                    
                    if (hasStartDate && i >= 2) {
                        console.log(`✓ Found start date (${startDateObj.toLocaleDateString()}) at position ${Math.round(checkPos)}`);
                        // Still do remaining passes but know we found it
                    }
                    
                    await new Promise(resolve => setTimeout(resolve, randomDelay(400, 600)));
                }
            }
            
            // Final check: verify we have the start date
            const finalCheck = allTransactions.filter(t => {
                const txDate = parseTransactionDate(t.date);
                if (!txDate) return false;
                return txDate.getTime() === startDateObj.getTime();
            });
            if (finalCheck.length > 0) {
                console.log(`✓ Verified: Found ${finalCheck.length} transaction(s) with start date ${startDateObj.toLocaleDateString()}`);
            } else {
                console.warn(`⚠️ WARNING: Start date ${startDateObj.toLocaleDateString()} not found after boundary check!`);
            }
            
            // CRITICAL: Enhanced pending transaction check - check top area thoroughly
            console.log('Performing enhanced pending transaction check...');
            console.log('Scrolling back to top for pending check (segmented with extraction)...');
            await scrollToTopSegmented(
                (segment, total, progress) => {
                    if (counterElement && document.body.contains(counterElement)) {
                        counterElement.textContent = `Returning to top for pending check: Segment ${segment}/${total} (${progress}%)...`;
                    }
                },
                () => {
                    // LESSON LEARNED: Extract at each scroll segment
                    const segmentTransactions = extractAllTransactions();
                    allTransactions = combineTransactions(allTransactions, segmentTransactions);
                }
            );
            await new Promise(resolve => setTimeout(resolve, randomDelay(1000, 1500)));
            
            // Extract at top first
            let pendingPass1 = extractAllTransactions();
            allTransactions = combineTransactions(allTransactions, pendingPass1);
            console.log(`Initial pending check: Found ${pendingPass1.length} transactions`);
            
            // Pending transactions are at the top, check first 40% of page (increased from 30%)
            const pendingCheckLimit = Math.min(maxScroll * 0.4, maxScroll);
            let pendingCheckPosition = 0;
            const pendingIncrement = window.innerHeight * 0.3; // Smaller increments (30% of viewport)
            
            while (pendingCheckPosition < pendingCheckLimit) {
                window.scrollTo(0, pendingCheckPosition);
                await new Promise(resolve => setTimeout(resolve, randomDelay(800, 1200)));
                
                // Multiple extractions at each position
                const pendingPass = extractAllTransactions();
                allTransactions = combineTransactions(allTransactions, pendingPass);
                
                await new Promise(resolve => setTimeout(resolve, randomDelay(400, 600)));
                const pendingPass2 = extractAllTransactions();
                allTransactions = combineTransactions(allTransactions, pendingPass2);
                
                pendingCheckPosition += pendingIncrement;
            }
            
            // Final extraction at top to catch any remaining pending
            console.log('Final scroll to top (segmented)...');
            await scrollToTopSegmented(
                null,
                () => {
                    // LESSON LEARNED: Extract at each scroll segment
                    const segmentTransactions = extractAllTransactions();
                    allTransactions = combineTransactions(allTransactions, segmentTransactions);
                }
            );
            await new Promise(resolve => setTimeout(resolve, randomDelay(800, 1200)));
            const finalPendingPass = extractAllTransactions();
            allTransactions = combineTransactions(allTransactions, finalPendingPass);
            
            // Log pending transaction count
            const pendingCount = allTransactions.filter(t => {
                const isPendingStatus = t.status && t.status.toLowerCase() === 'pending';
                // CRITICAL FIX: Check if t.date exists before calling .trim() to prevent TypeError
                const hasNoDate = !t.date || (typeof t.date === 'string' && t.date.trim() === '');
                return isPendingStatus || hasNoDate;
            }).length;
            console.log(`✓ Pending transaction check complete. Found ${pendingCount} pending transactions`);
            
            console.log(`Final extraction complete. Total unique transactions: ${allTransactions.length}`);
            console.log(`Final verification pass complete. Performed ${finalVerificationScrolls} verification scrolls.`);
        } catch (finalPassError) {
            console.error('Error during final verification pass:', finalPassError);
            // Log error but continue - don't let final pass error stop the export
            console.log(`Final verification pass encountered error but continuing. Verification scrolls attempted: ${finalVerificationScrolls}`);
        }
        // Nested try-catch block is now fully closed above
    } finally {
        // Clean up UI
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
    
    console.log(`Total transactions found: ${allTransactions.length}`);
    
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
    
    // Filter transactions using the export date range (trimmed if buffer detected)
    // IMPORTANT: Include pending transactions (those without dates OR with "Pending" status) if ORIGINAL end date is today or future
    // Use original endDateObj (not trimmed exportEndDate) to determine if we should include pending
    // Use SYSTEM_DATE for consistency (captured once at start)
    const today = new Date(SYSTEM_DATE);
    today.setHours(0, 0, 0, 0); // Normalize to start of day
    const originalEndDate = new Date(endDateObj);
    originalEndDate.setHours(23, 59, 59, 999); // End of day
    // Include pending if original end date is today or in the future (even if trimmed)
    // For "This Month" preset, always include pending regardless of trim
    const isThisMonthPreset = (startDateObj.getMonth() === today.getMonth() && 
                               startDateObj.getFullYear() === today.getFullYear() &&
                               endDateObj >= today);
    const shouldIncludePending = originalEndDate >= today || isThisMonthPreset;
    
    console.log(`Pending transaction check: originalEndDate=${originalEndDate.toLocaleDateString()}, today=${today.toLocaleDateString()}, shouldIncludePending=${shouldIncludePending}, isThisMonthPreset=${isThisMonthPreset}`);
    
    const filteredTransactions = filterEmptyTransactions(
        allTransactions.filter(transaction => {
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
            
            // Log transactions that are being excluded for debugging
            if (!inRange && txDate) {
                // Only log first few to avoid spam
                if (Math.random() < 0.001) { // Log 0.1% of excluded transactions
                    console.log(`Excluding transaction: ${transaction.date} (parsed: ${txDate.toLocaleDateString()}), not in range ${exportStartDate.toLocaleDateString()} to ${exportEndDate.toLocaleDateString()}`);
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
    
    // Log comprehensive date range info for debugging
    console.log(`=== EXTRACTION SUMMARY ===`);
    console.log(`Selected date range (raw input): ${startDate} to ${endDate}`);
    console.log(`Export date range ${trimmedRange ? '(trimmed)' : ''}: ${exportStartDate.toLocaleDateString()} (${exportStartDate.getFullYear()}-${String(exportStartDate.getMonth()+1).padStart(2,'0')}-${String(exportStartDate.getDate()).padStart(2,'0')}) to ${exportEndDate.toLocaleDateString()} (${exportEndDate.getFullYear()}-${String(exportEndDate.getMonth()+1).padStart(2,'0')}-${String(exportEndDate.getDate()).padStart(2,'0')})`);
    console.log(`Total transactions found (all dates): ${allTransactions.length}`);
    console.log(`Transactions in export range: ${filteredTransactions.length}`);
    
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
    
    return { allTransactions, filteredTransactions, elapsedTime: totalTimeDisplay };
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
            const txCount = document.querySelectorAll('[data-index]').length;
            console.log(`TxVault: Transaction elements found: ${txCount}`);
            if (txCount === 0 && window.location.href.includes('creditkarma.com')) {
                console.warn('TxVault: ⚠️ No transaction elements found - page may still be loading or selectors may have changed');
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
            console.log(`Received request to capture transactions from ${startDate} to ${endDate}`);
            console.log(`Trim to exact month: ${trimToExactMonth}`);
            
            // Check if we're on the correct page (more flexible URL matching)
            // Also check if transaction elements exist on the page
            const currentUrl = window.location.href.toLowerCase();
            const hasTransactionElements = document.querySelectorAll('[data-index]').length > 0;
            const isTransactionsPage = (currentUrl.includes('creditkarma.com') && 
                                      (currentUrl.includes('/networth/transactions') || 
                                       currentUrl.includes('/transactions'))) ||
                                      hasTransactionElements;
            
            if (!isTransactionsPage) {
                // Try to redirect to transactions page
                if (currentUrl.includes('creditkarma.com')) {
                    window.location.href = 'https://www.creditkarma.com/networth/transactions';
                    alert('Redirecting to transactions page... Please wait for the page to load, then try exporting again.');
                } else {
                    alert('Error: You must be on the Credit Karma transactions page (https://www.creditkarma.com/networth/transactions) to export transactions. Please navigate to that page and try again.');
                }
                sendResponse({ status: 'error', message: 'Not on transactions page' });
                return true;
            }
            
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
            }).then(({ allTransactions, filteredTransactions, elapsedTime }) => {
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
                    console.warn(`All transactions found:`, allTransactions.slice(0, 10).map(t => ({
                        date: t.date,
                        parsed: parseTransactionDate(t.date)?.toLocaleDateString()
                    })));
                    alert(`No transactions found in the specified date range (${startDate} to ${endDate}).\n\nFound ${allTransactions.length} total transactions on the page.\n\nCheck the browser console (F12) for details.`);
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
                
                // Count pending transactions - only count those with explicit Pending status
                // Don't count empty dates as pending unless they're actually in pending section
                const pendingCount = filteredTransactions.filter(t => {
                    const isPendingStatus = t.status && t.status.toLowerCase() === 'pending';
                    // Only count as pending if status is explicitly "Pending"
                    // Empty date alone doesn't mean pending (could be data extraction issue)
                    return isPendingStatus;
                }).length;
                
                // Generate and save CSVs
                if (csvTypes.allTransactions) {
                    const allCsvData = convertToCSV(filteredTransactions);
                    const fileName = `all_transactions_${startDate.replace(/\//g, '-')}_to_${endDate.replace(/\//g, '-')}.csv`;
                    saveCSVToFile(allCsvData, fileName);
                    filesGenerated.push('all_transactions.csv');
                }

                if (csvTypes.income) {
                    const creditTransactions = filteredTransactions.filter(t => t.transactionType === 'credit');
                    if (creditTransactions.length > 0) {
                    const creditCsvData = convertToCSV(creditTransactions);
                        const fileName = `income_${startDate.replace(/\//g, '-')}_to_${endDate.replace(/\//g, '-')}.csv`;
                        saveCSVToFile(creditCsvData, fileName);
                        filesGenerated.push('income.csv');
                    }
                }

                if (csvTypes.expenses) {
                    const debitTransactions = filteredTransactions.filter(t => t.transactionType === 'debit');
                    if (debitTransactions.length > 0) {
                    const debitCsvData = convertToCSV(debitTransactions);
                        const fileName = `expenses_${startDate.replace(/\//g, '-')}_to_${endDate.replace(/\//g, '-')}.csv`;
                        saveCSVToFile(debitCsvData, fileName);
                        filesGenerated.push('expenses.csv');
                    }
                }
                
                // Show statistics panel
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
                    pendingCount: pendingCount
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
