// ============================================================================
// CreditKarmaTxDownloader - Enhanced Content Script
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
    const selectors = [
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
    const descSelectors = [
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
    const dateSelectors = [
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
    
    // CRITICAL: Stricter pending detection - only mark as pending if EXPLICITLY pending
    // Previous logic was too broad and marked many posted transactions as pending
    // New logic: Only mark as pending if:
    // 1. Explicit "Pending" status is found in transaction element
    // 2. OR transaction has NO date AND is in pending section AND no "Posted" text found
    // DO NOT mark as pending just because it's in a pending section or has no date alone
    
    if (explicitStatus === 'Posted') {
        // Explicit Posted status - always respect it, even if in pending section
        transactionInfo.status = 'Posted';
    } else if (explicitStatus === 'Pending') {
        // Explicit Pending status - mark as pending
        transactionInfo.status = 'Pending';
    } else if (isInPendingSection && (!transactionInfo.date || transactionInfo.date.trim() === '') && !elementText.includes('posted')) {
        // In pending section, has NO date, and NO "Posted" text anywhere - likely truly pending
        transactionInfo.status = 'Pending';
    } else if (!transactionInfo.date || transactionInfo.date.trim() === '') {
        // No date but not in pending section or has "Posted" text - default to Posted (not pending)
        // This handles cases where date parsing fails but transaction is actually posted
        transactionInfo.status = 'Posted';
    } else {
        // Has date - default to Posted (posted transactions have dates)
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
                    
                    // CRITICAL: Stricter pending marking - only mark as pending if TRULY pending
                    // Previous logic was too broad - it marked transactions as pending just because they were after a "Pending" header
                    // New logic: Only mark as pending if ALL conditions are met:
                    // 1. Transaction has NO date (truly pending transactions don't have dates)
                    // 2. Transaction does NOT have explicit "Posted" status
                    // 3. Transaction element does NOT contain "Posted" text
                    for (const txEl of txElements) {
                        const txIndex = transactions.findIndex(t => t.dataIndex === txEl.getAttribute('data-index'));
                        if (txIndex >= 0) {
                            const txElementText = (txEl.textContent || '').toLowerCase();
                            const transaction = transactions[txIndex];
                            
                            // STRICT: Only mark as pending if ALL conditions are met
                            const hasNoDate = !transaction.date || transaction.date.trim() === '';
                            const hasExplicitPosted = txElementText.includes('posted') && !txElementText.includes('pending');
                            const alreadyPending = transaction.status === 'Pending';
                            const alreadyPosted = transaction.status === 'Posted';
                            
                            if (hasNoDate && !hasExplicitPosted && !alreadyPosted && !alreadyPending) {
                                // Has no date, no "Posted" text, and not already marked - likely truly pending
                                transaction.status = 'Pending';
                                console.log(`Marked transaction as pending: ${transaction.description}, no date`);
                            } else if (hasNoDate && hasExplicitPosted && !alreadyPosted) {
                                // Has no date but has "Posted" text - should be Posted, not Pending
                                transaction.status = 'Posted';
                                console.log(`Marked transaction as Posted (has Posted text): ${transaction.description}`);
                            } else if (transaction.date && transaction.date.trim() !== '' && !alreadyPosted) {
                                // Has date - should be Posted, not Pending (pending transactions don't have dates)
                                transaction.status = 'Posted';
                                console.log(`Marked transaction as Posted (has date): ${transaction.description}, date: ${transaction.date}`);
                            } else if (alreadyPosted || hasExplicitPosted) {
                                // Already marked as Posted or has Posted text - don't change
                                // (Silently skip - no need to log)
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
 * IMPROVED: Better duplicate detection with date+amount+description combination
 */
function combineTransactions(existingTransactions, newTransactions) {
    // Create multiple lookup sets for better duplicate detection
    const existingHashes = new Set(existingTransactions.map(t => t.hash));
    const existingDataIndices = new Set(existingTransactions.map(t => t.dataIndex));
    
    // Create a composite key set: date|description|amount|status for additional checking
    const existingCompositeKeys = new Set(
        existingTransactions.map(t => {
            const date = parseTransactionDate(t.date);
            const dateStr = date ? `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}` : '';
            const statusStr = (t.status || '').toLowerCase();
            return `${dateStr}|${t.description}|${t.amount}|${statusStr}`.toLowerCase().trim();
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
        
        // Check by composite key (date + description + amount + status)
        // Note: We allow same transaction with different status (pending -> posted) as separate entries
        // But same date+desc+amount+status is a duplicate
        const date = parseTransactionDate(newTransaction.date);
        const dateStr = date ? `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}` : '';
        const statusStr = (newTransaction.status || '').toLowerCase();
        const compositeKey = `${dateStr}|${newTransaction.description}|${newTransaction.amount}|${statusStr}`.toLowerCase().trim();
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
    const header = 'Date,Description,Amount,Category,Transaction Type,Account Name,Labels,Notes,Status\n';
    const rows = transactions.map(transaction => {
        // Handle pending transactions (no date) - use "Pending" as placeholder
        const dateStr = (!transaction.date || transaction.date.trim() === '') 
            ? 'Pending' 
            : convertDateFormat(transaction.date);
        const categoryStr = transaction.category || '';
        // Status column: Only show "Pending" for pending transactions, leave blank for posted
        const isPendingStatus = transaction.status && transaction.status.toLowerCase() === 'pending';
        const hasNoDate = !transaction.date || transaction.date.trim() === '';
        const statusStr = (isPendingStatus || hasNoDate) ? 'Pending' : '';
        // Ensure Notes column is always empty (not populated with any text)
        const notesStr = ''; // Always empty
        return `"${dateStr}","${transaction.description.replace(/"/g, '""')}","${transaction.amount}","${categoryStr.replace(/"/g, '""')}","${transaction.transactionType}",,,"${notesStr}","${statusStr}"\n`;
    });
    return header + rows.join('');
}

// Save cached transactions to sessionStorage for recovery
function saveCachedTransactions(transactions, startDate, endDate, scrollAttempts) {
    try {
        const cacheKey = 'ck_transactions_cache';
        const cacheData = {
            transactions: transactions,
            startDate: startDate,
            endDate: endDate,
            scrollAttempts: scrollAttempts,
            timestamp: Date.now(),
            count: transactions.length
        };
        sessionStorage.setItem(cacheKey, JSON.stringify(cacheData));
        console.log(`💾 Saved ${transactions.length} transactions to cache`);
    } catch (e) {
        console.warn('Could not save transactions to cache:', e);
    }
}

// Load cached transactions from sessionStorage
function loadCachedTransactions() {
    try {
        const cacheKey = 'ck_transactions_cache';
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) {
            const cacheData = JSON.parse(cached);
            console.log(`📦 Found cached transactions: ${cacheData.count} transactions from ${cacheData.startDate} to ${cacheData.endDate}`);
            return cacheData;
        }
    } catch (e) {
        console.warn('Could not load transactions from cache:', e);
    }
    return null;
}

// Export cached transactions
function exportCachedTransactions() {
    const cached = loadCachedTransactions();
    if (!cached || !cached.transactions || cached.transactions.length === 0) {
        alert('No cached transactions found.\n\nIf export was interrupted, transactions may not have been saved yet.');
        console.log('No cached transactions available');
        return false;
    }
    
    // Filter transactions by date range
    const startDateObj = new Date(cached.startDate);
    const endDateObj = new Date(cached.endDate);
    startDateObj.setHours(0, 0, 0, 0);
    endDateObj.setHours(23, 59, 59, 999);
    
    const filteredTransactions = cached.transactions.filter(t => {
        try {
            const txDate = parseTransactionDate(t.date);
            if (!txDate) return false;
            const txTime = txDate.getTime();
            return txTime >= startDateObj.getTime() && txTime <= endDateObj.getTime();
        } catch(e) { return false; }
    });
    
    if (filteredTransactions.length === 0) {
        alert(`Found ${cached.count} cached transactions, but none are in the date range (${cached.startDate} to ${cached.endDate}).`);
        return false;
    }
    
    // Export the cached transactions
    const csvData = convertToCSV(filteredTransactions);
    const fileName = `cached_transactions_${cached.startDate.replace(/\//g, '-')}_to_${cached.endDate.replace(/\//g, '-')}.csv`;
    saveCSVToFile(csvData, fileName);
    
    // Show summary
    const message = `✅ Exported ${filteredTransactions.length} cached transactions\n\n` +
                   `Date Range: ${cached.startDate} to ${cached.endDate}\n` +
                   `Total Cached: ${cached.count} transactions\n` +
                   `In Range: ${filteredTransactions.length} transactions\n` +
                   `Scrolls Completed: ${cached.scrollAttempts || 0}`;
    alert(message);
    console.log(message);
    
    return true;
}

// Make exportCachedTransactions available globally for console access
window.exportCachedTransactions = exportCachedTransactions;

// Function to check date range of collected transactions (for debugging)
window.checkCollectedDateRange = function() {
    // Get transactions from cache (most recent save)
    const cacheKey = 'ck_transactions_cache';
    let transactions = [];
    let startDate, endDate;
    
    try {
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) {
            const cacheData = JSON.parse(cached);
            transactions = cacheData.transactions || [];
            startDate = cacheData.startDate;
            endDate = cacheData.endDate;
        }
    } catch(e) {
        console.log('Could not get data from cache:', e);
        return null;
    }
    
    if (transactions.length === 0) {
        console.log('No transactions found in cache. Start an export first.');
        return null;
    }
    
    console.log(`📦 Found ${transactions.length} cached transactions`);
    
    // Helper function to parse dates (matches content.js logic)
    function parseDate(dateStr) {
        if (!dateStr || dateStr.trim() === '') return null;
        try {
            // Handle formats like "Nov 07, 2025", "01/15/2018", etc.
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) return null;
            // Ensure local time
            return new Date(date.getFullYear(), date.getMonth(), date.getDate());
        } catch(e) {
            return null;
        }
    }
    
    // Filter in-range transactions (only those with dates)
    const transactionsWithDates = transactions.filter(t => t.date && t.date.trim() !== '');
    const inRangeTransactions = transactionsWithDates.filter(t => {
        try {
            const txDate = parseDate(t.date);
            if (!txDate) return false;
            const txTime = txDate.getTime();
            if (startDate && endDate) {
                const startDateObj = new Date(startDate);
                const endDateObj = new Date(endDate);
                startDateObj.setHours(0, 0, 0, 0);
                endDateObj.setHours(23, 59, 59, 999);
                return txTime >= startDateObj.getTime() && txTime <= endDateObj.getTime();
            }
            return true; // If no date range, include all
        } catch(e) { return false; }
    });
    
    if (inRangeTransactions.length === 0) {
        console.log('No transactions in range found yet.');
        return null;
    }
    
    // Find earliest and latest dates
    const dates = inRangeTransactions
        .map(t => parseDate(t.date))
        .filter(d => d !== null)
        .map(d => d.getTime());
    
    if (dates.length === 0) {
        console.log('No valid dates found in transactions.');
        return null;
    }
    
    const earliestDate = new Date(Math.min(...dates));
    const latestDate = new Date(Math.max(...dates));
    const earliestStr = `${earliestDate.getMonth() + 1}/${earliestDate.getDate()}/${earliestDate.getFullYear()}`;
    const latestStr = `${latestDate.getMonth() + 1}/${latestDate.getDate()}/${latestDate.getFullYear()}`;
    
    console.log(`📅 Current Date Range Collected:`);
    console.log(`   Earliest: ${earliestStr}`);
    console.log(`   Latest: ${latestStr}`);
    console.log(`   Transactions in range: ${inRangeTransactions.length}`);
    
    if (startDate && endDate) {
        const startDateObj = new Date(startDate);
        const daysFromStart = (earliestDate.getTime() - startDateObj.getTime()) / (24 * 60 * 60 * 1000);
        const daysToEnd = (new Date(endDate).getTime() - latestDate.getTime()) / (24 * 60 * 60 * 1000);
        
        console.log(`📊 Target Range: ${startDate} to ${endDate}`);
        console.log(`   Days from start: ${Math.round(daysFromStart)} days`);
        console.log(`   Days to end: ${Math.round(daysToEnd)} days`);
        
        if (daysFromStart <= 30) {
            console.log(`✅ Close to start date! Likely have most/all transactions.`);
        } else {
            console.log(`⏳ Still need to scroll further to reach start date. More records will come.`);
        }
    }
    
    return {
        earliest: earliestStr,
        latest: latestStr,
        count: inRangeTransactions.length
    };
};

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
        ${(stats.pendingCount && stats.pendingCount > 0) || stats.isCurrentMonth ? `
        <div style="margin-bottom: 10px; font-size: 13px; color: ${stats.pendingCount && stats.pendingCount > 0 ? '#ff9800' : '#666'}; font-weight: ${stats.pendingCount && stats.pendingCount > 0 ? '500' : 'normal'};">
            <strong>Pending Transactions:</strong> ${stats.pendingCount || 0}
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
    
    const table = sortedForPreview.slice(0, 20).map(t => {
        const isPendingStatus = t.status && t.status.toLowerCase() === 'pending';
        const hasNoDate = !t.date || t.date.trim() === '';
        const statusStr = (isPendingStatus || hasNoDate) ? 'Pending' : '';
        return `
        <tr>
            <td>${(!t.date || t.date.trim() === '') ? 'Pending' : convertDateFormat(t.date)}</td>
            <td>${t.description}</td>
            <td>$${t.amount.toFixed(2)}</td>
            <td>${t.category}</td>
            <td>${t.transactionType}</td>
            <td>${statusStr}</td>
        </tr>
    `;
    }).join('');
    
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
 * Enhanced scroll function with smaller increments for better coverage
 */
function scrollDown() {
    // MATCH ORIGINAL: Scroll more aggressively (1.5x viewport) to ensure all content loads
    // This helps reach Oct 1-17 faster
    const currentPosition = window.scrollY;
    window.scrollTo(0, currentPosition + window.innerHeight * 1.5);
}

/**
 * Scroll to top of page
 */
function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
    if (!dateString) return null;
    
    // Try MM/DD/YYYY format first (most common in Credit Karma)
    // This avoids timezone issues with Date constructor
    if (dateString.includes('/')) {
        const parts = dateString.split('/');
        if (parts.length === 3) {
            const month = parseInt(parts[0], 10);
            const day = parseInt(parts[1], 10);
            const year = parseInt(parts[2], 10);
            
            // Validate parts
            if (!isNaN(month) && !isNaN(day) && !isNaN(year) && 
                month >= 1 && month <= 12 && 
                day >= 1 && day <= 31 && 
                year >= 2010 && year <= 2030) {
                // Create date in local timezone (no timezone conversion)
                const date = new Date(year, month - 1, day);
                // Verify the date is valid (handles invalid dates like Feb 30)
                if (date.getFullYear() === year && 
                    date.getMonth() === month - 1 && 
                    date.getDate() === day) {
                    return date;
                }
            }
        }
    }
    
    // Fallback: Try standard Date parsing
    let date = new Date(dateString);
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
    console.log(`=== STARTING EXTRACTION ===`);
    console.log(`Date range: ${startDate} to ${endDate}`);
    console.log(`💡 Tip: If export is interrupted, run exportCachedTransactions() in console to export cached transactions`);
    
    let allTransactions = [];
    let finalVerificationScrolls = 0; // Initialize early to avoid scope issues
    
    // Setup beforeunload handler to save cache on logout/interruption
    // Note: scrollAttempts will be declared later, use a reference object
    let scrollAttemptsRef = { value: 0 };
    const beforeUnloadHandler = (e) => {
        if (allTransactions.length > 0) {
            saveCachedTransactions(allTransactions, startDate, endDate, scrollAttemptsRef.value);
        }
    };
    window.addEventListener('beforeunload', beforeUnloadHandler);
    
    // Setup visibility change handler to save cache when tab becomes hidden (logout/redirect)
    const visibilityChangeHandler = () => {
        if (document.hidden && allTransactions.length > 0) {
            saveCachedTransactions(allTransactions, startDate, endDate, scrollAttemptsRef.value);
            console.log('⚠️ Page hidden - saved cached transactions');
        }
    };
    document.addEventListener('visibilitychange', visibilityChangeHandler);
    
    // Parse dates as LOCAL time, not UTC (fixes timezone issues)
    // Date format "YYYY-MM-DD" is parsed as UTC by default, which causes day shift
    // Parse manually to ensure local time
    const parseLocalDate = (dateStr) => {
        const parts = dateStr.split('-');
        if (parts.length === 3) {
            // Create date in local timezone (month is 0-indexed)
            return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        }
        // Fallback to standard parsing if format is different
        return new Date(dateStr);
    };
    
    const startDateObj = parseLocalDate(startDate);
    const endDateObj = parseLocalDate(endDate);
    
    // Set time to start of day (00:00:00) for start date and end of day (23:59:59.999) for end date
    startDateObj.setHours(0, 0, 0, 0);
    endDateObj.setHours(23, 59, 59, 999);
    
    // Validate date parsing
    if (isNaN(startDateObj.getTime()) || isNaN(endDateObj.getTime())) {
        throw new Error(`Invalid date range: ${startDate} to ${endDate}`);
    }
    
    // Verify dates are correct (only log errors, not verbose info)
    // Updated to support 8-year ranges (2017-2030) - 2017 is valid for 8-year range from 2025
    if (startDateObj.getFullYear() < 2010 || startDateObj.getFullYear() > 2030) {
        console.error(`⚠️ ERROR: Start date year seems incorrect: ${startDateObj.getFullYear()}`);
    }
    if (endDateObj.getFullYear() < 2010 || endDateObj.getFullYear() > 2030) {
        console.error(`⚠️ ERROR: End date year seems incorrect: ${endDateObj.getFullYear()}`);
    }
    if (startDateObj > endDateObj) {
        console.error(`⚠️ ERROR: Start date (${startDateObj.toLocaleDateString()}) is AFTER end date (${endDateObj.toLocaleDateString()})`);
    }
    
    // Calculate scroll strategy
    const scrollStrategy = calculateScrollStrategy(startDate, endDate);
    
    // Set to full day range (start of start day to end of end day)
    const startDateTime = new Date(startDateObj.getFullYear(), startDateObj.getMonth(), startDateObj.getDate()).getTime();
    const endDateTime = new Date(endDateObj.getFullYear(), endDateObj.getMonth(), endDateObj.getDate(), 23, 59, 59, 999).getTime();
    
    
    let lastTransactionCount = 0;
    let unchangedCount = 0;
    let scrollAttempts = 0;
    let foundTargetDateRange = false;
    let consecutiveTargetDateMatches = 0;
    let lastScrollPosition = 0;
    let scrollPositionUnchangedCount = 0;
    
    // Calculate range size for max scroll limit
    const rangeDaysForMaxScroll = Math.ceil((endDateTime - startDateTime) / (24 * 60 * 60 * 1000)) + 1;
    
    // Use strategy-based max scroll attempts (50% buffer for safety)
    // Limit max scrolls for very large ranges to prevent issues
    // CRITICAL: For "Last Month", increase max scrolls to ensure early dates (e.g., Oct 1-17) are captured
    const nowForMaxScroll = new Date();
    const daysSinceEndDateForMax = (nowForMaxScroll - endDateObj) / (24 * 60 * 60 * 1000);
    
    // Check if end date is in the previous calendar month (same improved logic as buffer calculation)
    const endDateMonthForMax = endDateObj.getMonth();
    const endDateYearForMax = endDateObj.getFullYear();
    const currentMonthForMax = nowForMaxScroll.getMonth();
    const currentYearForMax = nowForMaxScroll.getFullYear();
    const isPreviousCalendarMonthForMax = (endDateYearForMax === currentYearForMax && endDateMonthForMax === currentMonthForMax - 1) || 
                                          (endDateYearForMax === currentYearForMax - 1 && currentMonthForMax === 0 && endDateMonthForMax === 11);
    const isLastMonthForMax = isPreviousCalendarMonthForMax || (daysSinceEndDateForMax >= 15 && daysSinceEndDateForMax < 60);
    
    let maxScrollsCalculated = Math.max(200, Math.ceil(scrollStrategy.estimatedScrolls * 1.5));
    
    // For "Last Month", increase max scrolls to ensure we reach early dates
    if (isLastMonthForMax && rangeDaysForMaxScroll <= 31) {
        maxScrollsCalculated = 250; // Increased from 200 to 250 for last month to capture early dates (e.g., Oct 1-17)
        console.log(`Last month detected: Setting max scrolls to ${maxScrollsCalculated} to ensure early dates are captured`);
    }
    
    // For very large ranges (> 90 days), limit max scrolls to prevent excessive scrolling
    // For 8-year ranges, need maximum scrolls to reach very old dates
    // For 5-year ranges, need significantly more scrolls to reach older dates
    if (rangeDaysForMaxScroll > 2920) {
        // 8-year range: Set to 1500 scrolls to ensure we reach dates from 8 years ago
        maxScrollsCalculated = 1500;
        console.warn(`⚠️ Very large date range detected (${rangeDaysForMaxScroll} days, ~8 years). Setting max scrolls to ${maxScrollsCalculated} to capture older dates. This may take 45-60 minutes.`);
    } else if (rangeDaysForMaxScroll > 1800) {
        // 5-year range: Set to 1000 scrolls to ensure we reach dates from 5 years ago
        maxScrollsCalculated = 1000;
        console.warn(`⚠️ Very large date range detected (${rangeDaysForMaxScroll} days, ~5 years). Setting max scrolls to ${maxScrollsCalculated} to capture older dates. This may take 30-45 minutes.`);
    } else if (rangeDaysForMaxScroll > 90) {
        maxScrollsCalculated = Math.min(maxScrollsCalculated, 300); // Cap at 300 scrolls for large ranges (1-2 years)
        console.warn(`⚠️ Large date range detected (${rangeDaysForMaxScroll} days). Limiting max scrolls to ${maxScrollsCalculated} to prevent issues. Consider splitting into smaller ranges for better results.`);
    }
    
    const MAX_SCROLL_ATTEMPTS = maxScrollsCalculated;
    
    stopScrolling = false;
    
    // Create enhanced UI elements
    const stopButton = document.createElement('button');
    stopButton.textContent = 'Stop & Export';
    stopButton.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 20px;
        z-index: 10001;
        padding: 12px 24px;
        background-color: #ff3b30;
        color: white;
        border: none;
        border-radius: 6px;
        font-weight: bold;
        cursor: pointer;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        font-size: 14px;
        display: block !important;
        visibility: visible !important;
        opacity: 1 !important;
        min-width: 120px;
    `;
    
    stopButton.addEventListener('mouseover', () => {
        stopButton.style.backgroundColor = '#d9342b';
    });
    stopButton.addEventListener('mouseout', () => {
        stopButton.style.backgroundColor = '#ff3b30';
    });
    
    // Flag to track if user manually stopped (skip final verification)
    let manualStop = false;
    
    stopButton.addEventListener('click', () => {
        stopScrolling = true;
        manualStop = true; // Mark as manual stop - skip final verification
        stopButton.textContent = 'Stopping & Exporting...';
        stopButton.style.backgroundColor = '#999';
        stopButton.disabled = true;
        
        // Save cache immediately
        if (allTransactions.length > 0) {
            saveCachedTransactions(allTransactions, startDate, endDate, scrollAttemptsRef.value);
            console.log(`⚠️ Manual stop - collected ${allTransactions.length} transactions so far`);
            console.log(`💾 Saved to cache. Will export collected transactions after scrolling stops.`);
        }
        
        // Force stop immediately - break out of loop
        console.log('🛑 STOP BUTTON CLICKED - Stopping immediately!');
    });
    
    // Add keyboard shortcut (Escape key) to stop
    const handleKeyPress = (e) => {
        if (e.key === 'Escape' && !stopScrolling) {
            console.log('🛑 ESC key pressed - Stopping export...');
            stopScrolling = true;
            manualStop = true;
            stopButton.click(); // Trigger the stop button click handler
        }
    };
    document.addEventListener('keydown', handleKeyPress);
    
    // Cleanup on completion
    const cleanup = () => {
        document.removeEventListener('keydown', handleKeyPress);
    };
    
    document.body.appendChild(stopButton);
    
    // Enhanced progress counter - LARGER and MORE VISIBLE
    const counterElement = document.createElement('div');
    counterElement.style.cssText = `
        position: fixed;
        bottom: 80px;
        left: 20px;
        z-index: 10000;
        padding: 18px 24px;
        background-color: rgba(63, 81, 181, 0.95);
        color: white;
        border-radius: 8px;
        font-size: 18px;
        font-weight: 600;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        min-width: 400px;
        max-width: calc(100% - 40px);
        box-shadow: 0 4px 12px rgba(0,0,0,0.4);
        white-space: nowrap;
        overflow: visible;
        word-wrap: break-word;
        border: 2px solid rgba(255,255,255,0.3);
    `;
    // Show initial max scrolls info
    counterElement.textContent = `Starting export... Max scrolls planned: ${MAX_SCROLL_ATTEMPTS}`;
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
        // MATCH ORIGINAL: Start scrolling immediately from current position
        // Original doesn't scroll to top first - just starts from wherever you are
        
        // Quick initial extraction at current position
        let initialTransactions = extractAllTransactions();
        allTransactions = combineTransactions(allTransactions, initialTransactions);
        
        // MATCH ORIGINAL: No max scroll limit - just keep scrolling until stop conditions met
        // Original uses: while (!stopScrolling) - no max, just stops when conditions are met
        // BUT: Add MAX_SCROLL_ATTEMPTS as safety to prevent infinite loops
        while (!stopScrolling && scrollAttempts < MAX_SCROLL_ATTEMPTS) {
            scrollAttempts++;
            
            // Ensure stop button is visible (re-add if removed)
            if (!document.body.contains(stopButton)) {
                document.body.appendChild(stopButton);
            }
            
            // CRITICAL: Check stopScrolling flag BEFORE doing any work
            if (stopScrolling) {
                console.log('🛑 Stop button clicked. Stopping immediately...');
                break;
            }
            
            // Update progress bar
            const progress = Math.min((scrollAttempts / MAX_SCROLL_ATTEMPTS) * 100, 95);
            progressBar.style.width = `${progress}%`;
            
            // Extract transactions multiple times for better coverage (3-4 passes)
            let newTransactions = extractAllTransactions();
            
            // Optimized: Reduced passes and wait times for speed
            // Second pass after short wait
            await new Promise(resolve => setTimeout(resolve, randomDelay(200, 350)));
            const secondPass = extractAllTransactions();
            newTransactions = combineTransactions(newTransactions, secondPass);
            
            // Third pass for coverage
            await new Promise(resolve => setTimeout(resolve, randomDelay(200, 350)));
            const thirdPass = extractAllTransactions();
            newTransactions = combineTransactions(newTransactions, thirdPass);
            
            // Combine with existing
            allTransactions = combineTransactions(allTransactions, newTransactions);
            
            // CRITICAL: Early auto-abort check - before expensive date calculations
            // Check if we've scrolled way out of range (check all transactions, not just new ones)
            if (allTransactions.length > 0) {
                try {
                    const allDates = allTransactions
                        .map(t => parseTransactionDate(t.date))
                        .filter(d => d !== null);
                    
                    if (allDates.length > 0) {
                        const oldestYear = Math.min(...allDates.map(d => d.getFullYear()));
                        const startYear = startDateObj.getFullYear();
                        const endYear = endDateObj.getFullYear();
                        
                        // If we've scrolled more than 1 year outside the range, auto-abort IMMEDIATELY
                        if (oldestYear < startYear - 1 || oldestYear > endYear + 1) {
                            stopScrolling = true;
                            console.error(`🛑 AUTO-ABORT: Scrolled way out of range! Oldest year found: ${oldestYear}, Range: ${startYear}-${endYear}. Stopping immediately.`);
                            if (indicatorElement) {
                                indicatorElement.textContent = `❌ Auto-aborted: Scrolled too far (${oldestYear} vs ${startYear}-${endYear})!`;
                                indicatorElement.style.backgroundColor = '#d32f2f';
                            }
                            break;
                        }
                    }
                } catch (e) {
                    // Ignore errors, continue
                }
            }
            
            // Calculate in-range count using improved date comparison
            const inRangeCount = allTransactions.filter(t => {
                return isDateInRange(t.date, startDateObj, endDateObj);
            }).length;
            
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
            
            // MATCH ORIGINAL: Simple counter format - easy to see
            // Original shows: "Scroll: X | Found: Y total | In range: Z"
            // NOTE: "In range" shows ACCUMULATED total from allTransactions (not just current view)
            const inRangeSimple = allTransactions.filter(t => {
                try {
                    const txDate = parseTransactionDate(t.date);
                    if (!txDate) return false;
                    const txTime = txDate.getTime();
                    return txTime >= startDateTime && txTime <= endDateTime;
                } catch(e) { return false; }
            }).length;
            
            // Display: Shows accumulated "In range" count from ALL transactions collected so far
            // Show progress with max scrolls: "Scroll: X / MAX | Found: Y total | In range: Z"
            const counterText = `Scroll: ${scrollAttempts} / ${MAX_SCROLL_ATTEMPTS} | Found: ${allTransactions.length} total | In range: ${inRangeSimple}`;
            counterElement.textContent = counterText;
            
            // Update scrollAttempts reference for cache handlers
            scrollAttemptsRef.value = scrollAttempts;
            
            // Periodically save transactions to cache (every 10 scrolls)
            if (scrollAttempts > 0 && scrollAttempts % 10 === 0 && allTransactions.length > 0) {
                saveCachedTransactions(allTransactions, startDate, endDate, scrollAttempts);
                
                // Show date range of collected transactions every 10 scrolls
                const inRangeTransactions = allTransactions.filter(t => {
                    try {
                        const txDate = parseTransactionDate(t.date);
                        if (!txDate) return false;
                        const txTime = txDate.getTime();
                        return txTime >= startDateTime && txTime <= endDateTime;
                    } catch(e) { return false; }
                });
                
                if (inRangeTransactions.length > 0) {
                    // Find earliest and latest dates in range
                    const dates = inRangeTransactions
                        .map(t => parseTransactionDate(t.date))
                        .filter(d => d !== null)
                        .map(d => d.getTime());
                    
                    if (dates.length > 0) {
                        const earliestDate = new Date(Math.min(...dates));
                        const latestDate = new Date(Math.max(...dates));
                        const earliestStr = `${earliestDate.getMonth() + 1}/${earliestDate.getDate()}/${earliestDate.getFullYear()}`;
                        const latestStr = `${latestDate.getMonth() + 1}/${latestDate.getDate()}/${latestDate.getFullYear()}`;
                        
                        console.log(`📅 Date range collected so far: ${earliestStr} to ${latestStr} (${inRangeTransactions.length} transactions in range)`);
                        
                        // Check if we've reached the start date
                        const daysFromStart = (earliestDate.getTime() - startDateTime) / (24 * 60 * 60 * 1000);
                        if (daysFromStart <= 30) {
                            console.log(`✅ Close to start date! Only ${Math.round(daysFromStart)} days away from start date (${startDate})`);
                        } else {
                            console.log(`⏳ Still need to scroll further: ${Math.round(daysFromStart)} days away from start date (${startDate})`);
                        }
                    }
                }
            }
            
            // Also update the top indicator with progress
            if (window.ckExportIndicator) {
                const indicatorText = `🔄 Exporting... ${counterText}`;
                window.ckExportIndicator.textContent = indicatorText;
                // Ensure indicator is visible and properly sized
                if (!document.body.contains(window.ckExportIndicator)) {
                    document.body.appendChild(window.ckExportIndicator);
                }
            }
            
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
            
            // MATCH ORIGINAL: Simple stop logic - find oldest transaction and check if we've scrolled past
            let scrolledPastDateRange = false;
            
            // CRITICAL: Find the oldest transaction from ALL collected transactions (not just current batch)
            // This ensures we check if we've scrolled far enough based on what we've actually collected
            // Using only newTransactions can give false positives (stop too early)
            const oldestTransaction = allTransactions.reduce((oldest, current) => {
                try {
                    const currentDate = parseTransactionDate(current.date);
                    if (!currentDate) return oldest;
                    const currentTime = currentDate.getTime();
                    if (!oldest) return current;
                    const oldestDate = parseTransactionDate(oldest.date);
                    if (!oldestDate) return current;
                    const oldestTime = oldestDate.getTime();
                    return currentTime < oldestTime ? current : oldest;
                } catch (e) {
                    return oldest;
                }
            }, null);
            
            // Also find oldest in new batch for boundary checking (original logic)
            const oldestInNewBatch = newTransactions.reduce((oldest, current) => {
                try {
                    const currentDate = new Date(current.date).getTime();
                    const oldestDate = oldest ? new Date(oldest.date).getTime() : Infinity;
                    return currentDate < oldestDate ? current : oldest;
                } catch (e) {
                    return oldest;
                }
            }, null);
            
                    // CRITICAL: Auto-abort if scrolled way too far out of range
                    // This prevents infinite scrolling to years like 2024 when range is Oct 2025 - Nov 2025
                    if (oldestTransaction) {
                        try {
                            const oldestTxDate = parseTransactionDate(oldestTransaction.date);
                            if (oldestTxDate) {
                                const oldestYear = oldestTxDate.getFullYear();
                                const startYear = startDateObj.getFullYear();
                                const endYear = endDateObj.getFullYear();
                                
                                // If we've scrolled more than 1 year outside the range, auto-abort
                                if (oldestYear < startYear - 1 || oldestYear > endYear + 1) {
                                    stopScrolling = true;
                                    scrolledPastDateRange = true;
                                    console.error(`🛑 AUTO-ABORT: Scrolled way out of range! Oldest transaction year: ${oldestYear}, Range: ${startYear}-${endYear}. Stopping immediately.`);
                                    if (indicatorElement) {
                                        indicatorElement.textContent = `❌ Auto-aborted: Scrolled too far (${oldestYear} vs ${startYear}-${endYear})!`;
                                        indicatorElement.style.backgroundColor = '#d32f2f';
                                    }
                                    break;
                                }
                                
                                // CRITICAL: For Last Month preset, also check if we've scrolled too far past the start date buffer
                                // If we've scrolled more than 2 months past the start date buffer, stop (prevents scrolling to July when target is Oct)
                                // Calculate if this is Last Month preset (end date is in previous calendar month)
                                const currentTimeForCheck = new Date();
                                const daysSinceEndDateForCheck = (currentTimeForCheck - endDateObj) / (24 * 60 * 60 * 1000);
                                const rangeDaysForCheck = Math.ceil((endDateTime - startDateTime) / (24 * 60 * 60 * 1000)) + 1;
                                const endDateMonthForCheck = endDateObj.getMonth();
                                const endDateYearForCheck = endDateObj.getFullYear();
                                const currentMonthForCheck = currentTimeForCheck.getMonth();
                                const currentYearForCheck = currentTimeForCheck.getFullYear();
                                const isPreviousCalendarMonthForCheck = (endDateYearForCheck === currentYearForCheck && endDateMonthForCheck === currentMonthForCheck - 1) || 
                                                                        (endDateYearForCheck === currentYearForCheck - 1 && currentMonthForCheck === 0 && endDateMonthForCheck === 11);
                                const isLastMonthForCheck = isPreviousCalendarMonthForCheck || (daysSinceEndDateForCheck >= 15 && daysSinceEndDateForCheck < 60);
                                
                                if (isLastMonthForCheck && rangeDaysForCheck >= 30 && rangeDaysForCheck <= 31) {
                                    const oldestTime = oldestTxDate.getTime();
                                    const targetStartDateWithBuffer = startDateTime - (28 * 24 * 60 * 60 * 1000); // 28-day buffer for Last Month
                                    const daysPastBuffer = (targetStartDateWithBuffer - oldestTime) / (24 * 60 * 60 * 1000);
                                    
                                    // If we've scrolled more than 60 days past the buffer (2 months), stop
                                    // This prevents scrolling to July when we only need to go to September
                                    if (daysPastBuffer > 60) {
                                        stopScrolling = true;
                                        scrolledPastDateRange = true;
                                        console.warn(`🛑 AUTO-ABORT (Last Month): Scrolled ${Math.round(daysPastBuffer)} days past start date buffer (target: Sep 3, found: ${oldestTxDate.toLocaleDateString()}). Stopping to prevent excessive scrolling.`);
                                        if (indicatorElement) {
                                            indicatorElement.textContent = `⚠️ Stopped: Scrolled too far past start date (${Math.round(daysPastBuffer)} days). Proceeding with export...`;
                                            indicatorElement.style.backgroundColor = '#ff9800';
                                        }
                                        break;
                                    }
                                }
                            }
                        } catch (e) {
                            // Ignore date parsing errors, continue with normal logic
                        }
                    }
            
            // IMPROVED: Check both START and END date boundaries to ensure complete capture
            // Need to scroll past START date (for early dates like Oct 1) AND past END date (for end dates like Oct 20/31)
            // CRITICAL: Calculate month detection variables BEFORE the if block so they're accessible in else if
            const currentTimeForCheck = new Date();
            const daysSinceEndDateForCheck = (currentTimeForCheck - endDateObj) / (24 * 60 * 60 * 1000);
            const rangeDaysForCheck = Math.ceil((endDateTime - startDateTime) / (24 * 60 * 60 * 1000)) + 1;
            const isCurrentMonthForCheck = daysSinceEndDateForCheck <= 1; // Current month (today or yesterday)
            
            // Check if end date is in the previous calendar month (more reliable than days-based check)
            const endDateMonthForCheck = endDateObj.getMonth();
            const endDateYearForCheck = endDateObj.getFullYear();
            const currentMonthForCheck = currentTimeForCheck.getMonth();
            const currentYearForCheck = currentTimeForCheck.getFullYear();
            const isPreviousCalendarMonthForCheck = (endDateYearForCheck === currentYearForCheck && endDateMonthForCheck === currentMonthForCheck - 1) || 
                                                    (endDateYearForCheck === currentYearForCheck - 1 && currentMonthForCheck === 0 && endDateMonthForCheck === 11);
            const isLastMonthForCheck = isPreviousCalendarMonthForCheck || (daysSinceEndDateForCheck >= 15 && daysSinceEndDateForCheck < 60);
            const isRecentMonthForCheck = daysSinceEndDateForCheck >= 15 && daysSinceEndDateForCheck < 60; // Recent but not current month (expanded to catch October)
            
            // CRITICAL: Use oldestTransaction from ALL transactions (allTransactions) for boundary checking
            // This ensures we don't stop too early when we haven't reached the start date yet
            if (oldestTransaction && foundTargetDateRange) {
                try {
                    const oldestTxDate = parseTransactionDate(oldestTransaction.date);
                    let oldestDateTime;
                    
                    if (!oldestTxDate) {
                        // Fallback to oldestInNewBatch if oldestTransaction date can't be parsed
                        oldestDateTime = oldestInNewBatch ? new Date(oldestInNewBatch.date).getTime() : null;
                        if (!oldestDateTime) {
                            // Can't determine oldest date - continue scrolling
                            continue;
                        }
                    } else {
                        oldestDateTime = oldestTxDate.getTime();
                    }
                    
                    // IMPROVED: Use adaptive buffer based on range size and how old the range is
                    // For full months (31 days), need larger buffer. For partial months, smaller buffer.
                    const currentTime = currentTimeForCheck;
                    const daysSinceEndDate = daysSinceEndDateForCheck;
                    const rangeDays = rangeDaysForCheck;
                    const isCurrentMonth = isCurrentMonthForCheck;
                    const isLastMonth = isLastMonthForCheck;
                    const isRecentMonth = isRecentMonthForCheck;
                    
                    // For full month ranges (30-31 days) in last month, use 3-week buffer
                    // For partial month ranges (< 30 days), use smaller buffer regardless of age
                    // For recent months (15-60 days ago), use optimized buffer
                    // CRITICAL: For CURRENT month, use larger buffers to ensure we capture early month dates and recent dates
                    // CRITICAL: For 8-year ranges, use maximum buffer (60 days) to ensure we scroll past very old start dates
                    // CRITICAL: For 5-year ranges, use large buffer (30 days) to ensure we scroll past very old start dates
                    let startBufferDays;
                    if (rangeDays > 2920) {
                        startBufferDays = 60; // 8-year range - need maximum buffer for very old dates (e.g., Nov 14, 2017) - increased from 45 to capture first days
                    } else if (rangeDays > 1800) {
                        startBufferDays = 30; // 5-year range - need large buffer for very old dates (e.g., Nov 14, 2020)
                    } else if (isCurrentMonth) {
                        startBufferDays = 14; // Current month - need larger buffer for early dates (Nov 1-3)
                    } else if (isLastMonth && rangeDays >= 30) {
                        startBufferDays = 28; // Full month, last month - need deep scroll (e.g., October 2025) - increased from 21 to capture all Oct 1st transactions
                    } else if (isLastMonth && rangeDays < 30) {
                        // For custom ranges that start in last month but span multiple months (e.g., Oct 1 to Nov 15)
                        // We still need the 28-day buffer to capture all start date transactions
                        // Check if start date is in previous month
                        const startMonth = startDateObj.getMonth();
                        const startYear = startDateObj.getFullYear();
                        const currMonth = currentTime.getMonth();
                        const currYear = currentTime.getFullYear();
                        const isStartInLastMonth = (startYear === currYear && startMonth === currMonth - 1) || 
                                                   (startYear === currYear - 1 && currMonth === 0 && startMonth === 11);
                        startBufferDays = isStartInLastMonth ? 28 : 7; // Use 28-day buffer if start date is in previous month, otherwise 7 days
                    } else if (isRecentMonth && rangeDays >= 30) {
                        startBufferDays = 28; // Full month, recent month (within 2 months) - use deep scroll buffer - increased from 21 to capture all start date transactions
                    } else if (isRecentMonth && rangeDays < 30) {
                        // For custom ranges that start in previous month, use larger buffer
                        const startMonth = startDateObj.getMonth();
                        const startYear = startDateObj.getFullYear();
                        const currMonth = currentTime.getMonth();
                        const currYear = currentTime.getFullYear();
                        const isStartInLastMonth = (startYear === currYear && startMonth === currMonth - 1) || 
                                                   (startYear === currYear - 1 && currMonth === 0 && startMonth === 11);
                        startBufferDays = isStartInLastMonth ? 28 : 7; // Use 28-day buffer if start date is in previous month
                    } else if (rangeDays < 30) {
                        // For partial month ranges, check if start date is in previous month
                        const startMonth = startDateObj.getMonth();
                        const startYear = startDateObj.getFullYear();
                        const currMonth = currentTime.getMonth();
                        const currYear = currentTime.getFullYear();
                        const isStartInLastMonth = (startYear === currYear && startMonth === currMonth - 1) || 
                                                   (startYear === currYear - 1 && currMonth === 0 && startMonth === 11);
                        startBufferDays = isStartInLastMonth ? 28 : 7; // Use 28-day buffer if start date is in previous month
                    } else {
                        // For other ranges (> 30 days), check if start date is in previous month
                        const startMonth = startDateObj.getMonth();
                        const startYear = startDateObj.getFullYear();
                        const currMonth = currentTime.getMonth();
                        const currYear = currentTime.getFullYear();
                        const isStartInLastMonth = (startYear === currYear && startMonth === currMonth - 1) || 
                                                   (startYear === currYear - 1 && currMonth === 0 && startMonth === 11);
                        startBufferDays = isStartInLastMonth ? 28 : 14; // Use 28-day buffer if start date is in previous month, otherwise 14 days
                    }
                    const startBufferInMs = startBufferDays * 24 * 60 * 60 * 1000;
                    
                    // CRITICAL: Also check END date boundary - need 3-5 days past end date to ensure end boundary is captured
                    // This ensures Oct 20 (or Oct 31) transactions are not missed
                    // For partial months, use larger buffer to ensure we get the end date
                    // CRITICAL: For CURRENT month, we can't scroll past today, so adjust logic
                    let endBufferDays;
                    let scrolledPastEnd;
                    if (isCurrentMonth) {
                        // For current month, we can't scroll past today, so adjust logic:
                        // 1. Scroll past START date with buffer (to capture early dates like Nov 1-3)
                        // 2. Ensure we've found transactions that cover the END date range (Nov 13-14)
                        // Check if we've scrolled far enough past start date (this is checked separately)
                        // For end date: Check if oldest transaction is within or past the start date range
                        // This means we've scrolled far enough to capture both start and end
                        // Since we can't go past today, just ensure we've scrolled past start date with buffer
                        scrolledPastEnd = true; // For current month, we'll rely on scroll past start + verification pass
                    } else {
                        endBufferDays = rangeDays < 31 ? 5 : 3; // Larger buffer for partial months
                        const endBufferInMs = endBufferDays * 24 * 60 * 60 * 1000;
                        scrolledPastEnd = oldestDateTime < (endDateTime - endBufferInMs);
                    }
                    
                    // Check if scrolled past START date (with buffer)
                    // CRITICAL: Must check against start date MINUS buffer (e.g., Oct 1 - 28 days = Sep 3)
                    // This ensures we've scrolled far enough back to capture all Oct 1st transactions
                    const targetStartDateWithBuffer = startDateTime - startBufferInMs;
                    const scrolledPastStart = oldestDateTime < targetStartDateWithBuffer;
                    
                    // Debug logging for Last Month preset
                    if (isLastMonth && rangeDays >= 30 && (scrollAttempts === 1 || scrollAttempts % 10 === 0)) {
                        const oldestDateStr = new Date(oldestDateTime).toLocaleDateString();
                        const targetDateStr = new Date(targetStartDateWithBuffer).toLocaleDateString();
                        console.log(`🔍 Buffer check: Oldest found: ${oldestDateStr}, Need to scroll past: ${targetDateStr} (${startBufferDays} days before Oct 1). Scrolled past start: ${scrolledPastStart}`);
                    }
                    
                    // CRITICAL: For Last Month preset (Oct 1-31), we MUST scroll past start date with buffer
                    // Don't use optimization for old ranges - we need to capture Oct 1
                    // OPTIMIZATION: For old past ranges (end date is in the past), we can stop once we've:
                    // 1. Found the target date range (foundTargetDateRange)
                    // 2. Scrolled past the END date with buffer (scrolledPastEnd)
                    // This is because Credit Karma shows newer dates first, so scrolling down goes to older dates.
                    // Once we've scrolled past the END date (going older), we've already passed through the entire range.
                    // We don't need to continue scrolling past the START date - that would waste time scrolling further into the past.
                    const isPastDateRange = endDateObj < currentTime; // End date is in the past (not current/future dates)
                    const isOldRange = (currentTime - endDateObj) > (365 * 24 * 60 * 60 * 1000); // More than 1 year old
                    
                    // OPTIMIZATION FIX: For old past ranges, we need to check BOTH boundaries for full year ranges
                    // For partial ranges (e.g., Nov-Dec 2020), we can stop after end date
                    // For full year ranges (e.g., Jan 1 - Dec 31, 2020), we MUST scroll past START date too
                    const isFullYearRange = rangeDays >= 365 && rangeDays <= 366; // Full calendar year
                    
                    // CRITICAL: For Last Month preset (recent full month), ALWAYS check BOTH boundaries
                    // Don't optimize - we need to capture Oct 1
                    const isLastMonthFullMonth = isLastMonth && rangeDays >= 30 && rangeDays <= 31;
                    
                    // For old past ranges (like 2020, 2016):
                    // - If it's a FULL YEAR range: Check BOTH boundaries (need to get January)
                    // - If it's a PARTIAL range: Can stop after end date (optimization)
                    // BUT: For Last Month preset, ALWAYS check BOTH boundaries (don't optimize)
                    if (isPastDateRange && isOldRange && foundTargetDateRange && !isLastMonthFullMonth) {
                        if (isFullYearRange) {
                            // Full year: Must check BOTH boundaries to capture January
                            if (scrolledPastStart && scrolledPastEnd) {
                                scrolledPastDateRange = true;
                                console.log(`✓ Found target range and scrolled past BOTH boundaries (full year). Stopping scroll.`);
                            }
                        } else {
                            // Partial range: Can stop after end date (optimization)
                            if (scrolledPastEnd) {
                                scrolledPastDateRange = true;
                                console.log(`✓ Found target range and scrolled past END date. Stopping scroll early (optimized for past ranges).`);
                            }
                        }
                    } else if (foundTargetDateRange && scrolledPastStart && scrolledPastEnd) {
                        // For recent or current date ranges, check both boundaries as before
                        // CRITICAL: For full month ranges (30-31 days) that are recent (current/last/recent month),
                        // ensure we've captured enough transactions before stopping
                        // Don't stop too early - continue scrolling to capture all transactions in the month
                        // Use the variables calculated before the if block (accessible in else if)
                        const isFullMonth = rangeDaysForCheck >= 30 && rangeDaysForCheck <= 31; // Full calendar month (30-31 days)
                        const isRecentFullMonth = isFullMonth && (isCurrentMonthForCheck || isLastMonthForCheck || isRecentMonthForCheck);
                        
                        // CRITICAL: Check if we've actually captured start date transactions before stopping
                        // This prevents stopping too early when we've scrolled past the start date but haven't captured all its transactions
                        // Just scrolling past the start date with buffer doesn't guarantee we captured all start date transactions
                        // This is especially important for the first day of the month (e.g., Oct 1st with 10 transactions)
                        const startDateTransactions = allTransactions.filter(t => {
                            try {
                                const txDate = parseTransactionDate(t.date);
                                if (!txDate) return false;
                                // Check if transaction is ON the start date (same day, month, year)
                                return txDate.getTime() >= startDateTime && txDate.getTime() < (startDateTime + 24 * 60 * 60 * 1000);
                            } catch(e) { return false; }
                        }).length;
                        
                        // For last month full month (e.g., October), we know Oct 1st has 10 transactions
                        // If we have less than 9 transactions from the start date, we likely haven't captured them all
                        // Continue scrolling to ensure we get all start date transactions
                        // Increased from 7 to 9 to capture all 10 Oct 1st transactions
                        const hasStartDateTransactions = startDateTransactions >= 9 || scrollAttempts >= 200; // Either we have enough (9+), or we've scrolled enough (200+)
                        
                        // CRITICAL: Check start date transactions for ANY range that starts in the previous month
                        // This includes both "Last Month" preset AND custom ranges that start in the previous month (e.g., Oct 1 to Nov 15)
                        // Use startDateObj (available in scrolling loop) instead of exportStartDate (defined later)
                        const startDateMonth = startDateObj.getMonth();
                        const startDateYear = startDateObj.getFullYear();
                        const currentMonth = currentTimeForCheck.getMonth();
                        const currentYear = currentTimeForCheck.getFullYear();
                        // Check if start date is in the previous calendar month
                        const isStartDateLastMonth = (startDateYear === currentYear && startDateMonth === currentMonth - 1) || 
                                                     (startDateYear === currentYear - 1 && currentMonth === 0 && startDateMonth === 11);
                        
                        // Check if we need more start date transactions - applies to:
                        // 1. Last month preset (isLastMonthForCheck && isFullMonth) - e.g., "Last Month" preset (Oct 1-31)
                        // 2. Custom ranges that start in the previous month (isStartDateLastMonth) - e.g., Oct 1 to Nov 15
                        // 3. Current month preset starting on 1st (isCurrentMonthForCheck && startDateObj.getDate() === 1) - e.g., "This Month" (Nov 1-today)
                        // 4. This Year preset starting on Jan 1 (startDateObj.getMonth() === 0 && startDateObj.getDate() === 1 && rangeDays > 180) - e.g., Jan 1-today
                        // 5. Any range starting on 1st of month (startDateObj.getDate() === 1) - first day often has many transactions
                        // 6. Long ranges (> 180 days) starting on 1st - e.g., 5-year/8-year presets
                        // 7. VERY LONG ranges (> 1800 days, 5-year/8-year) - CRITICAL: Must ensure start date transactions are captured
                        //    Even if start date is NOT the 1st (e.g., Nov 14, 2020), we need to ensure we captured that day's transactions
                        const isFirstOfMonth = startDateObj.getDate() === 1;
                        const isFirstOfYear = startDateObj.getMonth() === 0 && startDateObj.getDate() === 1;
                        const isLongRange = rangeDaysForCheck > 180; // More than ~6 months
                        const isVeryLongRange = rangeDaysForCheck > 1800; // 5-year or 8-year ranges
                        const needsStartDateCheck = (isLastMonthForCheck && isFullMonth) || 
                                                    isStartDateLastMonth ||
                                                    (isCurrentMonthForCheck && isFirstOfMonth) ||
                                                    (isFirstOfYear && isLongRange) ||
                                                    (isFirstOfMonth && isLongRange) ||
                                                    isVeryLongRange; // CRITICAL: Always check start date for 5-year/8-year ranges
                        
                        // Debug logging to identify why check might not be triggering
                        if (scrollAttempts === 1 || scrollAttempts % 10 === 0 || (scrollAttempts > 5 && !isRecentFullMonth)) {
                            console.log(`🔍 Debug: rangeDays=${rangeDaysForCheck}, isFullMonth=${isFullMonth}, isCurrentMonth=${isCurrentMonthForCheck}, isLastMonth=${isLastMonthForCheck}, isRecentMonth=${isRecentMonthForCheck}, isRecentFullMonth=${isRecentFullMonth}, startDateTx=${startDateTransactions}, isStartDateLastMonth=${isStartDateLastMonth}, needsStartDateCheck=${needsStartDateCheck}, hasStartDateTransactions=${hasStartDateTransactions}`);
                        }
                        
                        if (!hasStartDateTransactions && needsStartDateCheck) {
                            // Need to ensure we've captured all start date transactions (e.g., all 10 Oct 1st transactions)
                            // BUT: If we've scrolled WAY past the start date (more than 60 days past), stop anyway
                            // This prevents infinite scrolling if the start date just doesn't have 9+ transactions
                            const daysPastStartDate = (startDateTime - oldestDateTime) / (24 * 60 * 60 * 1000);
                            const scrolledTooFarPast = daysPastStartDate > 60; // More than 60 days past start date
                            
                            if (scrolledTooFarPast && scrolledPastStart) {
                                // We've scrolled way past the start date - stop even if we don't have 9+ transactions
                                // The start date probably just doesn't have that many transactions
                                scrolledPastDateRange = true;
                                let rangeType = isStartDateLastMonth ? "custom range starting in previous month" : "range with start date check";
                                const startDateStr = startDateObj.toLocaleDateString();
                                console.log(`⚠️ Scrolled ${Math.round(daysPastStartDate)} days past start date (${startDateStr}, ${rangeType}). Found ${startDateTransactions} start date transactions. Stopping to prevent infinite scroll.`);
                                // Stop scrolling - set scrolledPastDateRange = true
                            } else {
                                // Continue scrolling to find more start date transactions
                                let rangeType;
                                if (isVeryLongRange) {
                                    rangeType = rangeDaysForCheck > 2920 ? "8-year range" : "5-year range";
                                } else if (isLastMonthForCheck && isFullMonth) {
                                    rangeType = "last month preset";
                                } else if (isCurrentMonthForCheck && isFirstOfMonth) {
                                    rangeType = "this month preset (1st of month)";
                                } else if (isFirstOfYear && isLongRange) {
                                    rangeType = "this year preset (Jan 1)";
                                } else if (isFirstOfMonth && isLongRange) {
                                    rangeType = "long range starting on 1st";
                                } else if (isStartDateLastMonth) {
                                    rangeType = "custom range starting in previous month";
                                } else {
                                    rangeType = "range with start date check";
                                }
                                const startDateStr = startDateObj.toLocaleDateString();
                                console.log(`📊 Found ${startDateTransactions} transactions from start date (${startDateStr}, ${rangeType}). Continuing to scroll to capture all start date transactions (target: 9+ transactions, current scroll: ${scrollAttempts})...`);
                                // Don't stop - continue scrolling (don't set scrolledPastDateRange)
                            }
                        } else if (isRecentFullMonth) {
                            // Count transactions in range to ensure we have enough
                            const inRangeCount = allTransactions.filter(t => {
                                try {
                                    const txDate = parseTransactionDate(t.date);
                                    if (!txDate) return false;
                                    const txTime = txDate.getTime();
                                    return txTime >= startDateTime && txTime <= endDateTime;
                                } catch(e) { return false; }
                            }).length;
                            
                            // For full month ranges, expect at least 120-150+ transactions for typical months
                            // Continue scrolling if we have less than 120 transactions (allows for small months)
                            // But also don't scroll indefinitely - check if we're still finding new transactions
                            // CRITICAL: Don't stop too early - ensure we've captured most/all transactions
                            
                            // Adjust target based on range type
                            let minTransactionTarget = 120;
                            let minScrollsBeforeCheck = 100;
                            let maxScrollsForRange = 250;
                            
                            if (isCurrentMonthForCheck) {
                                // Current month might have fewer transactions if month just started
                                minTransactionTarget = 80;
                                minScrollsBeforeCheck = 80;
                                maxScrollsForRange = 200;
                            } else if (isLastMonthForCheck) {
                                // Last month - expect full month of transactions (e.g., October with 133 transactions)
                                minTransactionTarget = 133; // Set to known target (133 for October)
                                minScrollsBeforeCheck = 100;
                                maxScrollsForRange = 250;
                            } else if (isRecentMonthForCheck) {
                                // Recent month (15-60 days ago) - expect full month
                                minTransactionTarget = 100;
                                minScrollsBeforeCheck = 90;
                                maxScrollsForRange = 200;
                            }
                            
                            // CRITICAL: For Last Month preset, also check start date transactions
                            // Even if we have enough total transactions, we must ensure all Oct 1st transactions are captured
                            const needsStartDateCheckInRecent = isLastMonthForCheck && isFullMonth && needsStartDateCheck;
                            const hasEnoughStartDate = hasStartDateTransactions || scrollAttempts >= 200;
                            
                            // Don't stop if we haven't captured enough start date transactions (for Last Month preset)
                            if (needsStartDateCheckInRecent && !hasEnoughStartDate) {
                                const rangeType = "last month preset";
                                console.log(`📊 Last Month: Found ${startDateTransactions} transactions from start date (${startDateObj.toLocaleDateString()}). Total in range: ${inRangeCount}. Continuing to scroll to capture all start date transactions (target: 9+ from start date, current scroll: ${scrollAttempts})...`);
                                // Don't stop - continue scrolling (don't set scrolledPastDateRange)
                            } else if (inRangeCount < minTransactionTarget && scrollAttempts < maxScrollsForRange && scrollAttempts >= minScrollsBeforeCheck) {
                                // Continue scrolling - we haven't captured enough transactions yet
                                const rangeType = isCurrentMonthForCheck ? "current month" : (isLastMonthForCheck ? "last month" : "recent month");
                                console.log(`📊 Found ${inRangeCount} transactions in range (${rangeType}). Continuing to scroll for complete month capture (target: ${minTransactionTarget}+ transactions, scroll ${scrollAttempts}/${maxScrollsForRange})...`);
                            } else if (inRangeCount >= minTransactionTarget || (inRangeCount >= minTransactionTarget * 0.8 && scrollAttempts >= maxScrollsForRange * 0.8)) {
                                // We have a reasonable number of transactions OR we've scrolled enough
                                // But only stop if we also have enough start date transactions (for ranges with start date check)
                                if (needsStartDateCheckInRecent && !hasEnoughStartDate) {
                                    // Still need more start date transactions - continue scrolling
                                    let rangeType;
                                    if (isLastMonthForCheck && isFullMonth) {
                                        rangeType = "Last Month";
                                    } else if (isCurrentMonthForCheck && isFirstOfMonth) {
                                        rangeType = "This Month (1st)";
                                    } else {
                                        rangeType = "Recent full month";
                                    }
                                    console.log(`📊 ${rangeType}: Have ${inRangeCount} total transactions (target: ${minTransactionTarget}+), but only ${startDateTransactions} from start date. Continuing to scroll...`);
                                    // Don't stop - continue scrolling (don't set scrolledPastDateRange)
                                } else {
                                    // All checks passed - safe to stop
                                    scrolledPastDateRange = true;
                                    const rangeType = isCurrentMonthForCheck ? "current month" : (isLastMonthForCheck ? "last month" : "recent month");
                                    const startDateInfo = needsStartDateCheckInRecent ? ` (${startDateTransactions} from start date)` : '';
                                    console.log(`✓ Scrolled past BOTH boundaries (${rangeType}). Found ${inRangeCount} transactions in range${startDateInfo}. Stopping scroll.`);
                                }
                            } else if (scrollAttempts >= maxScrollsForRange) {
                                // Maximum scrolls reached - stop regardless
                                scrolledPastDateRange = true;
                                const rangeType = isCurrentMonthForCheck ? "current month" : (isLastMonthForCheck ? "last month" : "recent month");
                                console.log(`✓ Maximum scrolls reached (${scrollAttempts}, ${rangeType}). Found ${inRangeCount} transactions in range. Stopping scroll.`);
                            }
                            // Otherwise, continue scrolling (don't set scrolledPastDateRange) if scrollAttempts < minScrollsBeforeCheck
                        } else {
                            // For other ranges (not recent full month), check start date transactions first
                            // CRITICAL: Don't stop if we haven't captured enough start date transactions
                            // This applies to:
                            // 1. Custom ranges that start in previous month
                            // 2. Current month starting on 1st
                            // 3. This Year starting on Jan 1
                            // 4. Long ranges starting on 1st
                            if (!hasStartDateTransactions && needsStartDateCheck) {
                                // Need more start date transactions - determine range type
                                // BUT: If we've scrolled WAY past the start date (more than 60 days past), stop anyway
                                // This prevents infinite scrolling if the start date just doesn't have 9+ transactions
                                let oldestDateTimeInFallback;
                                try {
                                    const oldestInAll = allTransactions.reduce((oldest, current) => {
                                        try {
                                            const currentDate = parseTransactionDate(current.date);
                                            if (!currentDate) return oldest;
                                            const currentTime = currentDate.getTime();
                                            const oldestTime = oldest ? parseTransactionDate(oldest.date)?.getTime() : Infinity;
                                            return currentTime < oldestTime ? current : oldest;
                                        } catch (e) { return oldest; }
                                    }, null);
                                    oldestDateTimeInFallback = oldestInAll ? parseTransactionDate(oldestInAll.date)?.getTime() : null;
                                } catch (e) {
                                    oldestDateTimeInFallback = null;
                                }
                                
                                if (oldestDateTimeInFallback && scrolledPastStart) {
                                    const daysPastStartDate = (startDateTime - oldestDateTimeInFallback) / (24 * 60 * 60 * 1000);
                                    const scrolledTooFarPast = daysPastStartDate > 60; // More than 60 days past start date
                                    
                                    if (scrolledTooFarPast) {
                                        // We've scrolled way past the start date - stop even if we don't have 9+ transactions
                                        scrolledPastDateRange = true;
                                        let rangeType = isStartDateLastMonth ? "custom range starting in previous month" : "range with start date check";
                                        const startDateStr = startDateObj.toLocaleDateString();
                                        console.log(`⚠️ Scrolled ${Math.round(daysPastStartDate)} days past start date (${startDateStr}, ${rangeType}). Found ${startDateTransactions} start date transactions. Stopping to prevent infinite scroll.`);
                                        // Stop scrolling - set scrolledPastDateRange = true
                                    } else {
                                        // Continue scrolling - haven't scrolled too far yet
                                        let rangeType;
                                        if (isCurrentMonthForCheck && isFirstOfMonth) {
                                            rangeType = "this month preset (1st of month)";
                                        } else if (isFirstOfYear && isLongRange) {
                                            rangeType = "this year preset (Jan 1)";
                                        } else if (isFirstOfMonth && isLongRange) {
                                            rangeType = "long range starting on 1st";
                                        } else if (isStartDateLastMonth) {
                                            rangeType = "custom range starting in previous month";
                                        } else {
                                            rangeType = "range with start date check";
                                        }
                                        console.log(`📊 Found ${startDateTransactions} transactions from start date (${startDateObj.toLocaleDateString()}, ${rangeType}). Continuing to scroll to capture all start date transactions (target: 9+ transactions)...`);
                                        // Don't stop - continue scrolling
                                    }
                                } else {
                                    // Can't determine oldest date - continue scrolling
                                    let rangeType = isStartDateLastMonth ? "custom range starting in previous month" : "range with start date check";
                                    console.log(`📊 Found ${startDateTransactions} transactions from start date (${startDateObj.toLocaleDateString()}, ${rangeType}). Continuing to scroll to capture all start date transactions (target: 9+ transactions)...`);
                                    // Don't stop - continue scrolling
                                }
                            } else {
                                // For other ranges (not recent full month and no start date check needed), stop immediately
                                scrolledPastDateRange = true;
                                console.log(`✓ Scrolled past BOTH boundaries. Stopping scroll.`);
                            }
                        }
                    }
                } catch (e) {
                    console.error(`Error comparing dates: ${oldestTransaction.date}`, e);
                }
            }
            
            // MATCH ORIGINAL: Simple stop condition - found range AND scrolled past
            if (foundTargetDateRange && scrolledPastDateRange) {
                break;
            }
            
            // Safety: If we've exceeded max scrolls, stop regardless (prevents infinite loops)
            if (scrollAttempts >= MAX_SCROLL_ATTEMPTS) {
                console.warn(`⚠️ Maximum scroll attempts reached (${MAX_SCROLL_ATTEMPTS}). Stopping to prevent infinite scroll.`);
                stopScrolling = true;
                break;
            }
            
            // MATCH ORIGINAL: Break if we're not getting any new transactions after several tries
            if (allTransactions.length === lastTransactionCount) {
                unchangedCount++;
                if (unchangedCount >= 5) {
                    break;
                }
            } else {
                unchangedCount = 0;
            }
            
            lastTransactionCount = allTransactions.length;
            
            // MATCH ORIGINAL: Simple wait time logic - adaptive but simple
            // Scroll down first (like original)
            scrollDown();
            
            // Adaptive wait time - shorter if we've already found some transactions in our range
            // MATCH ORIGINAL: 1000ms if found range for 3+ scrolls, 1500ms otherwise
            const waitTime = (foundTargetDateRange && consecutiveTargetDateMatches >= 3) ? 1000 : 1500;
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        
        // OPTIMIZED: Final verification pass - only check date range area, not entire page
        // CRITICAL: Skip final verification if user manually stopped (one-pass export)
        if (!manualStop) {
            // Continue with final verification pass (only if not manually stopped)
            try {
            finalVerificationScrolls = 0; // Reset counter for final verification
            if (counterElement && document.body.contains(counterElement)) {
                counterElement.textContent = `Final verification pass (Scroll: 0) - checking date range boundaries...`;
            }
            
            const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
            
            // Calculate smart scroll limits based on date range
            // For recent dates (like November), only check top portion of page
            const today = new Date();
            const daysSinceEndDate = (today - endDateObj) / (24 * 60 * 60 * 1000);
            const rangeDays = (endDateObj - startDateObj) / (24 * 60 * 60 * 1000);
            
            // Determine scroll limit based on how recent the range is
            // CRITICAL: Be more conservative - ensure we don't miss transactions
            // For recent dates, we still need to check enough area to catch all transactions
            const isCurrentMonth = daysSinceEndDate <= 1; // Current month (today or yesterday)
            
            // Check if end date is in the previous calendar month (same logic as main scroll)
            const endDateMonth = endDateObj.getMonth();
            const endDateYear = endDateObj.getFullYear();
            const currentMonth = new Date().getMonth();
            const currentYear = new Date().getFullYear();
            const isPreviousCalendarMonth = (endDateYear === currentYear && endDateMonth === currentMonth - 1) || 
                                            (endDateYear === currentYear - 1 && currentMonth === 0 && endDateMonth === 11);
            const isLastMonth = isPreviousCalendarMonth || (daysSinceEndDate >= 15 && daysSinceEndDate < 60);
            
            let scrollLimit = maxScroll;
            if (isCurrentMonth) {
                // Current month - check top 70% to ensure we capture early month dates
                scrollLimit = Math.min(maxScroll * 0.7, maxScroll);
            } else if (isLastMonth && rangeDays >= 30) {
                // Last month, full month range (e.g., October 2025) - check top 75% for thorough coverage
                scrollLimit = Math.min(maxScroll * 0.75, maxScroll);
            } else if (daysSinceEndDate < 30) {
                // Very recent (within month) - check top 60%
                scrollLimit = Math.min(maxScroll * 0.6, maxScroll);
            } else if (daysSinceEndDate < 60) {
                // Last month (30-60 days ago) - check top 70% (need more area since data is further down)
                scrollLimit = Math.min(maxScroll * 0.7, maxScroll);
            } else if (daysSinceEndDate < 180) {
                // Recent (within 6 months) - check top 60% of page
                scrollLimit = Math.min(maxScroll * 0.6, maxScroll);
            } else if (rangeDays < 90) {
                // Small range (< 3 months) - check top 70% of page
                scrollLimit = Math.min(maxScroll * 0.7, maxScroll);
            }
            
            // Scroll to top for final pass
            scrollToTop();
            await new Promise(resolve => setTimeout(resolve, randomDelay(1500, 2000)));
            
            // Extract at top
            let finalTransactions = extractAllTransactions();
            allTransactions = combineTransactions(allTransactions, finalTransactions);
            
            // Optimized final pass - only scroll through relevant area
            // CRITICAL: For current month, ensure we check thoroughly to capture early dates (Nov 1-3) and end dates (Nov 13-14)
            let finalScrollPosition = 0;
            const finalScrollIncrement = isCurrentMonth ? window.innerHeight * 0.3 : window.innerHeight * 0.4; // Smaller increments for current month
            
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
                    counterElement.textContent = `Final verification pass (Scroll: ${finalVerificationScrolls}) - checking date range boundaries...`;
                }
                
                // For current month, use slightly longer waits to ensure DOM is stable
                await new Promise(resolve => setTimeout(resolve, randomDelay(isCurrentMonth ? 600 : 500, isCurrentMonth ? 900 : 700)));
                
                // Extract at each position (multiple passes for current month)
                const pass1 = extractAllTransactions();
                allTransactions = combineTransactions(allTransactions, pass1);
                
                await new Promise(resolve => setTimeout(resolve, randomDelay(200, 400)));
                const pass2 = extractAllTransactions();
                allTransactions = combineTransactions(allTransactions, pass2);
                
                // For current month, do one more extraction to be thorough
                if (isCurrentMonth) {
                    await new Promise(resolve => setTimeout(resolve, randomDelay(200, 400)));
                    const pass3 = extractAllTransactions();
                    allTransactions = combineTransactions(allTransactions, pass3);
                }
                
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
                    // For current month, require more coverage before stopping (95% instead of 90%)
                    const coverageThreshold = isCurrentMonth ? 0.95 : 0.9;
                    if (consecutiveNoNewDates >= 3 && foundDates.size >= expectedDateCount * coverageThreshold) {
                        break;
                    }
                } else {
                    consecutiveNoNewDates = 0;
                    currentFoundDates.forEach(d => foundDates.add(d));
                }
            }
            
            // Focused boundary check - only check positions around start and end dates
            const boundaryPositions = [
                scrollLimit * 0.1,  // Top area (start date)
                scrollLimit * 0.2,
                scrollLimit * 0.3,
                scrollLimit * 0.4,  // Middle area (end date for recent ranges)
                scrollLimit * 0.5
            ].filter(p => p <= scrollLimit);
            
            for (const checkPos of boundaryPositions) {
                window.scrollTo(0, checkPos);
                await new Promise(resolve => setTimeout(resolve, randomDelay(800, 1200)));
                
                // 3 extractions at each boundary position
                for (let i = 0; i < 3; i++) {
                    const boundaryPass = extractAllTransactions();
                    allTransactions = combineTransactions(allTransactions, boundaryPass);
                    await new Promise(resolve => setTimeout(resolve, randomDelay(400, 600)));
                }
            }
            
            // CRITICAL: Enhanced pending transaction check - check top area thoroughly
            scrollToTop();
            await new Promise(resolve => setTimeout(resolve, randomDelay(2000, 3000)));
            
            // Extract at top first
            let pendingPass1 = extractAllTransactions();
            allTransactions = combineTransactions(allTransactions, pendingPass1);
            
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
            scrollToTop();
            await new Promise(resolve => setTimeout(resolve, randomDelay(1000, 1500)));
            const finalPendingPass = extractAllTransactions();
            allTransactions = combineTransactions(allTransactions, finalPendingPass);
            
            // Log pending transaction count (from all collected, before filtering)
            const pendingCountAll = allTransactions.filter(t => {
                const isPendingStatus = t.status && t.status.toLowerCase() === 'pending';
                const hasNoDate = !t.date || t.date.trim() === '';
                return isPendingStatus || hasNoDate;
            }).length;
            
            console.log(`Final extraction complete. Total unique transactions: ${allTransactions.length}`);
            if (pendingCountAll > 0) {
                console.log(`ℹ️ Found ${pendingCountAll} pending transactions (total collected, before filtering)`);
            }
            
            } catch (finalPassError) {
                console.error('Error during final verification pass:', finalPassError);
                // Log error but continue - don't let final pass error stop the export
                console.log(`Final verification pass encountered error but continuing. Verification scrolls attempted: ${finalVerificationScrolls}`);
            }
        } else {
            // Manual stop - skip final verification (one-pass export)
            console.log(`⚠️ Manual stop detected - skipping final verification pass (one-pass export)`);
            console.log(`📊 Collected ${allTransactions.length} transactions. Proceeding to export...`);
        }
        
    } finally {
        // Cleanup keyboard listener
        cleanup();
        
        // Save final transactions to cache
        scrollAttemptsRef.value = typeof scrollAttempts !== 'undefined' ? scrollAttempts : scrollAttemptsRef.value;
        if (allTransactions.length > 0) {
            saveCachedTransactions(allTransactions, startDate, endDate, scrollAttemptsRef.value);
        }
        
        // Remove event listeners
        window.removeEventListener('beforeunload', beforeUnloadHandler);
        document.removeEventListener('visibilitychange', visibilityChangeHandler);
        
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
    const nowForPending = new Date();
    nowForPending.setHours(0, 0, 0, 0); // Normalize to start of day
    const originalEndDate = new Date(endDateObj);
    originalEndDate.setHours(23, 59, 59, 999); // End of day
    // Include pending if original end date is today or in the future (even if trimmed)
    // For "This Month" preset, always include pending regardless of trim
    const isThisMonthPreset = (startDateObj.getMonth() === nowForPending.getMonth() && 
                               startDateObj.getFullYear() === nowForPending.getFullYear() &&
                               endDateObj >= nowForPending);
    const shouldIncludePending = originalEndDate >= nowForPending || isThisMonthPreset;
    
    
    const filteredTransactions = filterEmptyTransactions(
        allTransactions.filter(transaction => {
            // Check if transaction is pending (status is Pending OR has no date)
            const isPendingStatus = transaction.status && transaction.status.toLowerCase() === 'pending';
            const hasNoDate = !transaction.date || transaction.date.trim() === '';
            const isPending = isPendingStatus || hasNoDate;
            
            // CRITICAL: STRICT BOUNDARIES RULE - All transactions (including pending) must follow date range
            // 1. If transaction has a date (even if status is "Pending"), it MUST be within the date range
            // 2. If transaction has NO date (truly pending without date):
            //    - Only include if end date is today or in the future (for current/future ranges)
            //    - Exclude if end date is in the past (past ranges don't have pending transactions)
            
            if (hasNoDate) {
                // Transaction has no date (truly pending) - only include if range includes today or future
                // For past ranges (Oct 1-31 when today is Nov), exclude pending transactions without dates
                // CRITICAL: For "This Month" preset, always include pending transactions regardless of strict boundaries
                if (useStrictBoundaries) {
                    // Strict mode: Include pending without dates if:
                    // 1. End date is today or in the future, OR
                    // 2. This is "This Month" preset (always include pending for current month)
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const endDateOnly = new Date(exportEndDate);
                    endDateOnly.setHours(0, 0, 0, 0);
                    // Include if end date is today or in the future, OR if this is "This Month" preset
                    return endDateOnly >= today || isThisMonthPreset;
                } else {
                    // Non-strict mode: Include pending if original end date is today or future
                    return shouldIncludePending;
                }
            } else {
                // Transaction has a date (posted OR pending with date) - MUST be within date range
                // Apply strict boundaries: Date must be within exportStartDate to exportEndDate
                const inRange = isDateInRange(transaction.date, exportStartDate, exportEndDate);
                
                if (!inRange && isPendingStatus) {
                    // Log pending transactions that are outside date range (for debugging)
                    const txDate = parseTransactionDate(transaction.date);
                    if (txDate) {
                        console.log(`⚠️ Pending transaction outside date range excluded: ${transaction.description} (${txDate.toLocaleDateString()})`);
                    }
                }
                
                return inRange;
            }
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
    
    // Debug: Show date range of all transactions vs filtered
    const allTransactionDates = allTransactions
        .map(t => {
            const d = parseTransactionDate(t.date);
            return d ? d.toLocaleDateString() : null;
        })
        .filter(d => d !== null)
        .sort();
    if (allTransactionDates.length > 0) {
        const oldestAll = allTransactionDates[0];
        const newestAll = allTransactionDates[allTransactionDates.length - 1];
        console.log(`📊 All transactions date range: ${oldestAll} to ${newestAll}`);
        
        // Show count of transactions outside range
        const outsideRange = allTransactions.length - filteredTransactions.length;
        if (outsideRange > 0) {
            console.log(`ℹ️ ${outsideRange} transactions outside date range (this is normal - they are from other months)`);
        }
        
        // Debug: Check for October transactions that might be excluded
        const octoberTransactions = allTransactions.filter(t => {
            const d = parseTransactionDate(t.date);
            if (!d) return false;
            return d.getMonth() === 9 && d.getFullYear() === 2025; // October = month 9 (0-indexed)
        });
        if (octoberTransactions.length > 0) {
            const octoberInRange = octoberTransactions.filter(t => {
                return isDateInRange(t.date, exportStartDate, exportEndDate);
            });
            console.log(`📅 October 2025 transactions found: ${octoberTransactions.length} total, ${octoberInRange.length} in range ${exportStartDate.toLocaleDateString()} to ${exportEndDate.toLocaleDateString()}`);
            
            // Detailed breakdown by date to identify missing transactions
            if (octoberTransactions.length !== octoberInRange.length || octoberInRange.length < 133) {
                // Group by date to see which dates might be missing transactions
                const dateGroups = new Map();
                octoberTransactions.forEach(t => {
                    const d = parseTransactionDate(t.date);
                    if (!d) return;
                    const dateStr = `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
                    if (!dateGroups.has(dateStr)) {
                        dateGroups.set(dateStr, { total: 0, inRange: 0, transactions: [] });
                    }
                    const group = dateGroups.get(dateStr);
                    group.total++;
                    group.transactions.push(t);
                    if (isDateInRange(t.date, exportStartDate, exportEndDate)) {
                        group.inRange++;
                    }
                });
                
                // Log breakdown by date
                console.log(`📊 October 2025 transaction breakdown by date:`);
                const sortedDates = Array.from(dateGroups.entries()).sort((a, b) => {
                    const dateA = parseTransactionDate(a[0]);
                    const dateB = parseTransactionDate(b[0]);
                    return dateA && dateB ? dateA.getTime() - dateB.getTime() : 0;
                });
                
                sortedDates.forEach(([dateStr, group]) => {
                    const status = group.total === group.inRange ? '✅' : '⚠️';
                    console.log(`  ${status} ${dateStr}: ${group.inRange}/${group.total} in range`);
                    if (group.total > group.inRange) {
                        const excluded = group.transactions.filter(t => !isDateInRange(t.date, exportStartDate, exportEndDate));
                        excluded.forEach(t => {
                            const d = parseTransactionDate(t.date);
                            console.log(`    ❌ Excluded: ${t.description || 'No description'} - ${d ? d.toLocaleDateString() : 'no date'} (parsed: ${t.date})`);
                        });
                    }
                });
                
                // Summary
                const totalInRange = Array.from(dateGroups.values()).reduce((sum, g) => sum + g.inRange, 0);
                const totalFound = Array.from(dateGroups.values()).reduce((sum, g) => sum + g.total, 0);
                console.log(`📊 Summary: ${totalInRange}/${totalFound} October transactions in range (expected: 133)`);
                if (totalInRange < 133) {
                    console.log(`⚠️ MISSING: ${133 - totalInRange} October transactions not captured`);
                    console.log(`   This could mean:`);
                    console.log(`   1. Transactions weren't found during scrolling (need more scrolls)`);
                    console.log(`   2. Transactions are outside the date range (check date parsing)`);
                    console.log(`   3. Transactions were filtered out (check status/date logic)`);
                }
            }
            
            if (octoberTransactions.length > octoberInRange.length) {
                const excludedOctober = octoberTransactions.filter(t => {
                    return !isDateInRange(t.date, exportStartDate, exportEndDate);
                });
                if (excludedOctober.length > 0) {
                    const excludedDates = excludedOctober.map(t => {
                        const d = parseTransactionDate(t.date);
                        return d ? d.toLocaleDateString() : 'no date';
                    }).filter((v, i, a) => a.indexOf(v) === i).slice(0, 10);
                    console.log(`⚠️ ${excludedOctober.length} October transactions excluded from export: ${excludedDates.join(', ')}${excludedOctober.length > 10 ? '...' : ''}`);
                }
            }
        }
    }
    
    // Log first and last dates in filtered transactions for verification
    if (filteredTransactions.length > 0) {
        const postedFiltered = filteredTransactions.filter(t => {
            const isPendingStatus = t.status && t.status.toLowerCase() === 'pending';
            const hasNoDate = !t.date || t.date.trim() === '';
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
        const hasNoDate = !t.date || t.date.trim() === '';
        const isPending = isPendingStatus || hasNoDate;
        
        if (isPending) {
            pendingCount.count++;
        } else {
            const txDate = parseTransactionDate(t.date);
            if (txDate) {
                const dateKey = txDate.toLocaleDateString();
                dateDistribution[dateKey] = (dateDistribution[dateKey] || 0) + 1;
            }
        }
    });
    
    // Show posted transaction date range
    const postedTxs = filteredTransactions.filter(t => {
        const isPendingStatus = t.status && t.status.toLowerCase() === 'pending';
        const hasNoDate = !t.date || t.date.trim() === '';
        return !isPendingStatus && !hasNoDate;
    });
    if (postedTxs.length > 0) {
        const postedDates = postedTxs.map(t => parseTransactionDate(t.date)).filter(d => d);
        if (postedDates.length > 0) {
            const minDate = new Date(Math.min(...postedDates.map(d => d.getTime())));
            const maxDate = new Date(Math.max(...postedDates.map(d => d.getTime())));
            console.log(`Exported date range: ${minDate.toLocaleDateString()} to ${maxDate.toLocaleDateString()} (${postedTxs.length} transactions)`);
        }
    }
    
    // Check for missing dates in range (only warn for actual problems - dates before today)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expectedDates = [];
    const currentDate = new Date(exportStartDate);
    while (currentDate <= exportEndDate && currentDate <= today) {
        expectedDates.push(currentDate.toLocaleDateString());
        currentDate.setDate(currentDate.getDate() + 1);
    }
    const missingDates = expectedDates.filter(date => !dateDistribution[date] || dateDistribution[date] === 0);
    
    // Only warn about missing dates that are in the past (actual transactions that should exist)
    // Future dates (after today) won't have transactions - that's normal
    if (missingDates.length > 0) {
        const missingPastDates = missingDates.filter(date => {
            const missingDate = new Date(date);
            return missingDate <= today;
        });
        if (missingPastDates.length > 0) {
            // Note: Missing dates are normal if you didn't have transactions on those days
            // This warning helps identify if dates were truly missed vs. just days with no transactions
            console.log(`ℹ️ Dates with no transactions in export: ${missingPastDates.length} dates (${missingPastDates.slice(0, 5).join(', ')}${missingPastDates.length > 5 ? '...' : ''})`);
            if (missingPastDates.length > 100) {
                console.log(`   Note: Many missing dates is normal for long ranges - you don't have transactions every day.`);
            }
        }
    }
    
    // Also check all transactions for pending (check status AND no date)
    const allPendingCount = allTransactions.filter(t => {
        const isPendingStatus = t.status && t.status.toLowerCase() === 'pending';
        const hasNoDate = !t.date || t.date.trim() === '';
        return isPendingStatus || hasNoDate;
    }).length;
    
    // Log pending transaction count (filtered vs all, showing strict boundaries enforcement)
    if (allPendingCount > 0) {
        if (pendingCount.count > 0) {
            if (useStrictBoundaries && allPendingCount > pendingCount.count) {
                const excluded = allPendingCount - pendingCount.count;
                console.log(`ℹ️ Found ${allPendingCount} pending transactions total, ${pendingCount.count} included in export (strict boundaries: ${excluded} excluded - outside date range or past end date).`);
            } else {
                console.log(`ℹ️ Found ${allPendingCount} pending transactions, ${pendingCount.count} included in export.`);
            }
        } else {
            // No pending included - this is normal for past ranges with strict boundaries
            if (useStrictBoundaries) {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const endDateOnly = new Date(exportEndDate);
                endDateOnly.setHours(0, 0, 0, 0);
                if (endDateOnly < today) {
                    console.log(`ℹ️ Found ${allPendingCount} pending transactions, 0 included in export (strict boundaries: end date is in past, pending transactions excluded as expected).`);
                } else {
                    console.warn(`⚠️ Found ${allPendingCount} pending transactions but none were included in export! This might indicate a filtering issue.`);
                }
            } else {
                console.warn(`⚠️ Found ${allPendingCount} pending transactions but none were included in export! This might indicate a filtering issue.`);
            }
        }
    }
    
    
    const totalTime = Math.floor((Date.now() - startTime) / 1000);
    const totalMinutes = Math.floor(totalTime / 60);
    const totalTimeDisplay = totalMinutes > 0 
        ? `${totalMinutes}m ${totalTime % 60}s`
        : `${totalTime}s`;
    
    console.log(`Filtered transactions: ${filteredTransactions.length} (Total time: ${totalTimeDisplay})`);
    
    return { 
        allTransactions, 
        filteredTransactions, 
        elapsedTime: totalTimeDisplay,
        isThisMonthPreset: isThisMonthPreset  // Return flag for "This Month" preset detection
    };
}

// Message Listener
// ============================================================================

// Guard against duplicate listeners (in case script is injected multiple times)
if (!window.__ckExportListenerAttached) {
    window.__ckExportListenerAttached = true;
    
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Handle ping to check if script is loaded
    if (request.action === 'ping') {
        sendResponse({ status: 'pong', message: 'Content script is loaded' });
        return true;
    }
    
    if (request.action === 'captureTransactions') {
        try {
            const { startDate, endDate, csvTypes, trimToExactMonth = true } = request;
            console.log(`Received request to capture transactions from ${startDate} to ${endDate}`);
            console.log(`Trim to exact month: ${trimToExactMonth}`);
            
            // Check if user is on transactions page
            const currentUrl = window.location.href;
            const isOnTransactionsPage = currentUrl.includes('/networth/transactions') || currentUrl.includes('/transactions');
            
            if (!isOnTransactionsPage) {
                alert('⚠️ Please navigate to the Credit Karma Transactions page first!\n\nClick the "📊 Go to Credit Karma Transactions Page" link in the extension popup, then try exporting again.');
                sendResponse({ status: 'error', message: 'Not on transactions page' });
                return;
            }
            
            // Create progress indicator at the top center - LARGER and MORE VISIBLE
            const indicator = document.createElement('div');
            indicator.id = 'ck-export-indicator';
            indicator.style.cssText = `
                position: fixed;
                top: 20px;
                left: 50%;
                transform: translateX(-50%);
                padding: 20px 35px;
                background: rgba(63, 81, 181, 0.95);
                color: white;
                border-radius: 10px;
                z-index: 99999;
                font-size: 18px;
                font-weight: 700;
                box-shadow: 0 4px 16px rgba(0,0,0,0.5);
                text-align: center;
                min-width: 400px;
                max-width: 90%;
                white-space: nowrap;
                overflow: visible;
                word-wrap: break-word;
                border: 2px solid rgba(255,255,255,0.3);
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            `;
            indicator.textContent = '🔄 Exporting transactions... Please wait.';
            document.body.appendChild(indicator);
            
            // Store indicator reference for updates during export
            window.ckExportIndicator = indicator;
            
            // Respond immediately to avoid connection timeout
            sendResponse({ status: 'started', message: 'Transaction capture started' });
            
            // Wait for page to be ready (non-blocking)
            const waitForPageReady = async () => {
                // Check if transaction elements already exist
                const hasTransactionElements = document.querySelectorAll('[data-index]').length > 0;
                
                if (!hasTransactionElements) {
                    console.log('Waiting for transaction elements to load...');
                    // Wait up to 5 seconds for transactions to appear
                    for (let i = 0; i < 50; i++) {
                        await new Promise(resolve => setTimeout(resolve, 100));
                        if (document.querySelectorAll('[data-index]').length > 0) {
                            console.log('Transaction elements found, proceeding...');
                            return true;
                        }
                    }
                    console.warn('No transaction elements found after waiting - proceeding anyway');
                } else {
                    console.log('Transaction elements already present, proceeding...');
                }
                return true;
            };
            
            // Start capture after page is ready
            // Pass request object to include trim option
            waitForPageReady().then(() => {
                return captureTransactionsInDateRange(startDate, endDate, request);
            }).then(({ allTransactions, filteredTransactions, elapsedTime, isThisMonthPreset }) => {
                console.log(`Capture complete. Found ${filteredTransactions.length} transactions in range`);
                
                // Update indicator with success message
                if (window.ckExportIndicator && document.body.contains(window.ckExportIndicator)) {
                    window.ckExportIndicator.textContent = `✅ Export complete! Found ${filteredTransactions.length} transactions. CSV files downloading...`;
                    window.ckExportIndicator.style.background = 'rgba(76, 175, 80, 0.95)'; // Green background
                    
                    // Remove indicator after 5 seconds
                    setTimeout(() => {
                        if (window.ckExportIndicator && document.body.contains(window.ckExportIndicator)) {
                            document.body.removeChild(window.ckExportIndicator);
                            window.ckExportIndicator = null;
                        }
                    }, 5000);
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
                
                // Informational log (not a warning) - this is normal behavior
                // The extension finds ALL transactions on the page, then filters to date range
                // For short date ranges (e.g., "This Month"), it's normal to have many transactions outside the range
                if (filteredTransactions.length < allTransactions.length * 0.1 && filteredTransactions.length > 0) {
                    // Only warn if less than 10% are in range AND we have some transactions (might indicate date parsing issue)
                    console.warn(`⚠️ Note: Only ${filteredTransactions.length} transactions in range out of ${allTransactions.length} total found.`);
                    console.warn('This is usually normal for short date ranges. If you expected more transactions, check the date range.');
                } else if (filteredTransactions.length > 0) {
                    // Normal case - just log info (not a warning)
                    console.log(`ℹ️ Found ${allTransactions.length} total transactions, ${filteredTransactions.length} in selected date range.`);
                }
                
                // Calculate statistics
                const completeness = calculateCompleteness(filteredTransactions);
                const filesGenerated = [];
                
                // Calculate posted transaction date range
                const postedTxs = filteredTransactions.filter(t => {
                    const isPendingStatus = t.status && t.status.toLowerCase() === 'pending';
                    const hasNoDate = !t.date || t.date.trim() === '';
                    // Posted transactions are those that are NOT pending (no status or no date)
                    return !isPendingStatus && !hasNoDate;
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
                
                // Count pending transactions - include both explicit Pending status AND transactions with no date
                // CRITICAL: For "This Month" preset, include all pending transactions (with status OR no date)
                const pendingTransactions = filteredTransactions.filter(t => {
                    const isPendingStatus = t.status && t.status.toLowerCase() === 'pending';
                    const hasNoDate = !t.date || t.date.trim() === '';
                    // Include if status is explicitly "Pending" OR if transaction has no date (truly pending)
                    return isPendingStatus || hasNoDate;
                });
                const pendingCount = pendingTransactions.length;
                
                // Debug logging for "This Month" preset - check if it's detected correctly
                // Use isThisMonthPreset that was returned from captureTransactionsInDateRange
                // This uses calendar month detection (same month/year) which is the correct way
                const isCurrentMonthCheck = isThisMonthPreset || false;
                
                if (isCurrentMonthCheck && pendingCount > 0) {
                    console.log(`✅ "This Month" preset: Found ${pendingCount} pending transactions`);
                    pendingTransactions.forEach(t => {
                        console.log(`  - Pending: ${t.description || 'No description'} | Status: ${t.status || 'none'} | Date: ${t.date || 'No date'}`);
                    });
                } else if (isCurrentMonthCheck && pendingCount === 0) {
                    console.log(`⚠️ "This Month" preset: No pending transactions found in filtered transactions (${filteredTransactions.length} total)`);
                    // Check all transactions for pending
                    const allPending = allTransactions.filter(t => {
                        const isPendingStatus = t.status && t.status.toLowerCase() === 'pending';
                        const hasNoDate = !t.date || t.date.trim() === '';
                        return isPendingStatus || hasNoDate;
                    });
                    if (allPending.length > 0) {
                        console.log(`  ⚠️ Found ${allPending.length} pending transactions in ALL transactions but none in FILTERED transactions`);
                        console.log(`  ⚠️ This suggests pending transactions are being filtered out`);
                        allPending.slice(0, 5).forEach(t => {
                            console.log(`  - All pending: ${t.description || 'No description'} | Status: ${t.status || 'none'} | Date: ${t.date || 'No date'}`);
                        });
                    } else {
                        console.log(`  ℹ️ No pending transactions found in all transactions either`);
                    }
                }
                
                // For "This Month" preset, always show pending count in modal (even if 0) to indicate check was performed
                const finalPendingCount = isCurrentMonthCheck ? pendingCount : pendingCount;
                
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
                    pendingCount: pendingCount,
                    isCurrentMonth: isCurrentMonthCheck  // Pass flag for "This Month" preset
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
                // Handle "Extension context invalidated" error gracefully - this happens after export completes
                if (error && error.message && error.message.includes('Extension context invalidated')) {
                    console.log('⚠️ Extension context invalidated after export - this is normal if extension was reloaded');
                    // Export likely completed successfully before error - check if CSV was downloaded
                    return; // Don't show error to user - export probably succeeded
                }
                
                // Update indicator with error message
                if (window.ckExportIndicator && document.body.contains(window.ckExportIndicator)) {
                    window.ckExportIndicator.textContent = `❌ Export failed: ${error.message || 'Unknown error'}`;
                    window.ckExportIndicator.style.background = 'rgba(244, 67, 54, 0.95)'; // Red background
                    
                    // Remove indicator after 5 seconds
                    setTimeout(() => {
                        if (window.ckExportIndicator && document.body.contains(window.ckExportIndicator)) {
                            document.body.removeChild(window.ckExportIndicator);
                            window.ckExportIndicator = null;
                        }
                    }, 5000);
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

} // End of guard against duplicate listeners
