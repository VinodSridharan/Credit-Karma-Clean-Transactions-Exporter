// ============================================================================
// Credit Karma Transaction Exporter - Popup Script
// ============================================================================

// Utility Functions
// ============================================================================

/**
 * Format date as YYYY-MM-DD for input fields
 */
function formatDateForInput(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Show status message
 */
function showStatus(message, type = 'info') {
    const statusEl = document.getElementById('status-message');
    statusEl.textContent = message;
    statusEl.className = `status-message ${type}`;
    statusEl.style.display = 'block';
    
    // Auto-hide after 5 seconds for success/info, 10 seconds for errors
    const timeout = type === 'error' ? 10000 : 5000;
    setTimeout(() => {
        statusEl.style.display = 'none';
    }, timeout);
}

/**
 * Validate date range
 */
function validateDateRange(startDate, endDate) {
    if (!startDate || !endDate) {
        showStatus('Please select both start and end dates.', 'error');
        return false;
    }
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    const today = new Date();
    today.setHours(23, 59, 59, 999); // End of today
    
    // Allow up to 2 days in the future for pending transactions (This Month preset)
    const maxFutureDate = new Date(today);
    maxFutureDate.setDate(maxFutureDate.getDate() + 2);
    maxFutureDate.setHours(23, 59, 59, 999);
    
    if (start > end) {
        showStatus('Start date must be before or equal to end date.', 'error');
        return false;
    }
    
    if (end > maxFutureDate) {
        showStatus('End date cannot be more than 2 days in the future (for pending transactions).', 'error');
        return false;
    }
    
    // Check if range is too large (more than 5 years)
    const yearsDiff = (end - start) / (1000 * 60 * 60 * 24 * 365);
    if (yearsDiff > 5) {
        showStatus('Date range cannot exceed 5 years. Please select a smaller range.', 'error');
        return false;
    }
    
    return true;
}

/**
 * Check if at least one CSV type is selected
 */
function validateCSVTypes() {
    const allTransactionsChecked = document.getElementById('allTransactionsCheckbox').checked;
    const incomeChecked = document.getElementById('incomeCheckbox').checked;
    const expensesChecked = document.getElementById('expensesCheckbox').checked;
    
    if (!allTransactionsChecked && !incomeChecked && !expensesChecked) {
        showStatus('Please select at least one CSV type to export.', 'error');
        return false;
    }
    
    return true;
}

// Date Preset Handlers
// ============================================================================

function setDatePreset(preset) {
    // Remove active class from all preset buttons
    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Add active class to clicked button
    const clickedBtn = document.querySelector(`[data-preset="${preset}"]`);
    if (clickedBtn) {
        clickedBtn.classList.add('active');
    }
    
    const today = new Date();
    const startDateInput = document.getElementById('start-date');
    const endDateInput = document.getElementById('end-date');
    
    let startDate, endDate;
    
    switch(preset) {
        case 'this-month':
            // This month: First day of current month to today (exact boundaries)
            startDate = new Date(today.getFullYear(), today.getMonth(), 1);
            endDate = new Date(today);
            endDate.setHours(23, 59, 59, 999); // End of today
            break;
            
        case 'last-month':
            // Last month: First day to last day (exact month boundaries)
            const lastMonth = today.getMonth() - 1;
            const lastMonthYear = lastMonth < 0 ? today.getFullYear() - 1 : today.getFullYear();
            const lastDayOfLastMonth = new Date(lastMonthYear, lastMonth + 1, 0); // Last day of last month
            
            startDate = new Date(lastMonthYear, lastMonth, 1);
            endDate = new Date(lastDayOfLastMonth);
            endDate.setHours(23, 59, 59, 999); // End of last day
            break;
            
        case 'last-year':
            // January 1st of last year MINUS 2 days to December 31st of last year PLUS 2 days
            startDate = new Date(today.getFullYear() - 1, 0, 1);
            startDate.setDate(startDate.getDate() - 2); // Subtract 2 days
            endDate = new Date(today.getFullYear() - 1, 11, 31);
            endDate.setDate(endDate.getDate() + 2); // Add 2 days
            break;
            
        case 'last-2-years':
            // November 19th of 2 years ago to November 18th of current year (exact manual test settings)
            // Manual test: 11/19/2023 to 11/18/2025 = 2,286 transactions, 100% complete, 18m 3s
            startDate = new Date(today.getFullYear() - 2, 10, 19); // November = month 10, day 19
            endDate = new Date(today);
            endDate.setHours(23, 59, 59, 999); // End of today
            break;
            
        case 'last-3-years':
            // November 1st of 3 years ago to November 18th of current year (exact manual test settings)
            // Manual test: 11/01/2022 to 11/18/2025 = 2,865 transactions, 100% complete, 22m 51s
            startDate = new Date(today.getFullYear() - 3, 10, 1); // November = month 10, day 1
            endDate = new Date(today);
            endDate.setHours(23, 59, 59, 999); // End of today
            break;
            
        default:
            return;
    }
    
    startDateInput.value = formatDateForInput(startDate);
    endDateInput.value = formatDateForInput(endDate);
    
    showStatus(`Date range set to ${preset.replace(/-/g, ' ')} (exact month boundaries).`, 'success');
}

// Event Listeners
// ============================================================================

// Date preset buttons
document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const preset = btn.getAttribute('data-preset');
        setDatePreset(preset);
    });
});

// Export button
document.getElementById('export-btn').addEventListener('click', () => {
    let startDate = document.getElementById('start-date').value;
    let endDate = document.getElementById('end-date').value;
    
    // Validate inputs
    if (!validateDateRange(startDate, endDate)) {
        return;
    }
    
    if (!validateCSVTypes()) {
        return;
    }
    
    // Calculate original date range (remove buffer if it was added by preset)
    // For presets, we need to extract the original range before buffer
    // But for manual dates, use as-is
    // Note: The buffer helps with scrolling, but we'll filter to exact range in content.js
    
    // Get checkbox states
    const allTransactionsChecked = document.getElementById('allTransactionsCheckbox').checked;
    const incomeChecked = document.getElementById('incomeCheckbox').checked;
    const expensesChecked = document.getElementById('expensesCheckbox').checked;
    
    // Show loading state
    const exportBtn = document.getElementById('export-btn');
    const originalText = exportBtn.textContent;
    exportBtn.textContent = 'Processing...';
    exportBtn.disabled = true;
    showStatus('Starting export... This may take a few minutes.', 'info');
    
    // Check if we're on the Credit Karma transactions page
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        if (!tabs[0]) {
            showStatus('Unable to access current tab. Please try again.', 'error');
            exportBtn.textContent = originalText;
            exportBtn.disabled = false;
            return;
        }
        
        const url = tabs[0].url;
        // More flexible check - also check if it's any creditkarma.com page
        const isOnCreditKarma = url && url.includes('creditkarma.com');
        const isOnTransactionsPage = url && (url.includes('/networth/transactions') || url.includes('/transactions'));
        
        if (!isOnCreditKarma) {
            showStatus('Please navigate to Credit Karma first, then try exporting again.', 'error');
            exportBtn.textContent = originalText;
            exportBtn.disabled = false;
            return;
        }
        
        if (!isOnTransactionsPage) {
            // Navigate to transactions page in the same tab
            chrome.tabs.update(tabs[0].id, {
                url: 'https://www.creditkarma.com/networth/transactions'
            }, () => {
                showStatus('Navigating to transactions page... Please wait for it to load, then click Export again.', 'info');
                exportBtn.textContent = originalText;
                exportBtn.disabled = false;
            });
            return;
        }
        
        // Get trim option
        const trimToExactMonth = document.getElementById('trimToExactMonth').checked;
        
        // IMPROVED: Function to ensure content script is loaded before sending message
        const ensureContentScriptAndSend = async (retryCount = 0) => {
            const maxRetries = 8; // Increased retries
            const baseDelay = 800; // Longer base delay
            
            try {
                // ALWAYS try to inject the script - this ensures it's loaded even after refresh
                // The script is smart enough to not create duplicate listeners
                try {
                    await chrome.scripting.executeScript({
                        target: { tabId: tabs[0].id },
                        files: ['content.js']
                    });
                    console.log('Content script injection attempted');
                } catch (injectError) {
                    // Script might already be injected (which is fine) or injection failed
                    console.log('Content script injection note:', injectError.message);
                    // Continue anyway - script might already be loaded via manifest
                }
                
                // Wait longer for script to initialize - CRITICAL after page refresh
                const waitTime = baseDelay + (retryCount * 300);
                console.log(`Waiting ${waitTime}ms for content script to initialize...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
                
                // Now try to send the message
                chrome.tabs.sendMessage(tabs[0].id, {
                    action: 'captureTransactions', 
                    startDate, 
                    endDate,
                    trimToExactMonth: trimToExactMonth,
                    csvTypes: {
                        allTransactions: allTransactionsChecked,
                        income: incomeChecked,
                        expenses: expensesChecked
                    }
                }, (response) => {
                // Reset button after a delay
                setTimeout(() => {
                    exportBtn.textContent = originalText;
                    exportBtn.disabled = false;
                }, 2000);
                
                // Check for Chrome runtime errors first
                if (chrome.runtime.lastError) {
                    console.error('Chrome runtime error:', chrome.runtime.lastError);
                    
                    // Safely extract error message
                    let errorMsg = 'Unknown error';
                    if (typeof chrome.runtime.lastError === 'string') {
                        errorMsg = chrome.runtime.lastError;
                    } else if (chrome.runtime.lastError.message) {
                        errorMsg = chrome.runtime.lastError.message;
                    } else if (typeof chrome.runtime.lastError === 'object') {
                        // Try to stringify if it's an object
                        try {
                            errorMsg = JSON.stringify(chrome.runtime.lastError);
                        } catch (e) {
                            errorMsg = 'Chrome runtime error occurred';
                        }
                    }
                    
                    // Check if it's a "receiving end doesn't exist" error (content script not loaded)
                        if (errorMsg.includes("receiving end") || errorMsg.includes("Could not establish") || errorMsg.includes("message port closed") || errorMsg.includes("Extension context invalidated")) {
                            // Retry if we haven't exceeded max retries
                            if (retryCount < maxRetries) {
                                const nextRetry = retryCount + 1;
                                const retryWaitTime = baseDelay + (nextRetry * 400);
                                console.log(`Content script not ready (attempt ${nextRetry}/${maxRetries}), retrying in ${retryWaitTime}ms...`);
                                showStatus(`Waiting for page to load... (${nextRetry}/${maxRetries})`, 'info');
                                
                                // Update button to show it's retrying
                                exportBtn.textContent = `Retrying... (${nextRetry}/${maxRetries})`;
                                
                                setTimeout(() => {
                                    ensureContentScriptAndSend(nextRetry);
                                }, retryWaitTime);
                                return;
                            } else {
                                showStatus('Error: Content script could not load after multiple attempts. Please refresh the page completely (Ctrl+F5) and try again.', 'error');
                                exportBtn.textContent = originalText;
                                exportBtn.disabled = false;
                            }
                    } else {
                        showStatus(`Error: ${errorMsg}`, 'error');
                    }
                    return;
                }
                
                // Check response
                if (response) {
                    if (response.status === 'started') {
                        showStatus('Export started! Check the page for progress updates.', 'success');
                    } else if (response.status === 'error') {
                        showStatus(`Error: ${response.message || 'Unknown error occurred.'}`, 'error');
                    } else {
                        showStatus('Export started! Check the page for progress updates.', 'success');
                    }
                } else {
                    // No response - might be async, show info message
                    showStatus('Export initiated. Check the page for progress updates.', 'info');
                }
                });
            } catch (error) {
                console.error('Error in ensureContentScriptAndSend:', error);
                
                // Retry if we haven't exceeded max retries
                if (retryCount < maxRetries) {
                    const nextRetry = retryCount + 1;
                    const retryWaitTime = baseDelay + (nextRetry * 400);
                    console.log(`Error occurred (attempt ${nextRetry}/${maxRetries}), retrying in ${retryWaitTime}ms...`);
                    showStatus(`Retrying... (${nextRetry}/${maxRetries})`, 'info');
                    
                    // Update button to show it's retrying
                    exportBtn.textContent = `Retrying... (${nextRetry}/${maxRetries})`;
                    
                    setTimeout(() => {
                        ensureContentScriptAndSend(nextRetry);
                    }, retryWaitTime);
                } else {
                const errorMsg = error?.message || error?.toString() || 'Failed to start export';
                    showStatus(`Error: ${errorMsg}. Please refresh the page completely (Ctrl+F5) and try again.`, 'error');
                exportBtn.textContent = originalText;
                exportBtn.disabled = false;
            }
            }
        };
        
        // Start the process with a longer initial delay to ensure page is ready
        showStatus('Preparing export...', 'info');
        setTimeout(() => {
            ensureContentScriptAndSend(0);
        }, 500);
    });
});

// Dark mode toggle
const darkModeToggle = document.getElementById('dark-mode-toggle');
const body = document.body;

// Load dark mode preference from localStorage
if (localStorage.getItem('darkMode') === 'enabled') {
    body.classList.add('dark-mode');
    darkModeToggle.checked = true;
}

darkModeToggle.addEventListener('change', () => {
    if (darkModeToggle.checked) {
        body.classList.add('dark-mode');
        localStorage.setItem('darkMode', 'enabled');
    } else {
        body.classList.remove('dark-mode');
        localStorage.setItem('darkMode', 'disabled');
    }
});

// Initialize popup
document.addEventListener('DOMContentLoaded', () => {
    // Set default to "This Month" (first day of month to today + 2 days for pending)
    const today = new Date();
    const startDate = new Date(today.getFullYear(), today.getMonth(), 1);
    startDate.setDate(startDate.getDate() - 2); // Subtract 2 days for edge dates
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + 2); // Add 2 days for pending transactions
    
    const startDateInput = document.getElementById('start-date');
    const endDateInput = document.getElementById('end-date');
    startDateInput.value = formatDateForInput(startDate);
    endDateInput.value = formatDateForInput(endDate);
    
    // Don't mark any button as active by default - only when user clicks
    
    // Auto-open transactions page if not already there (removes redundant step)
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        if (tabs[0] && tabs[0].url && tabs[0].url.includes('creditkarma.com/networth/transactions')) {
            // User is already on the page - show success message
            showStatus('✓ You are on the Credit Karma transactions page. Ready to export!', 'success');
        } else {
            // Auto-open transactions page
            chrome.runtime.sendMessage({ action: 'openTransactionsPage' }, (response) => {
                if (response && response.status) {
                    showStatus('✓ Opened Credit Karma transactions page. Ready to export!', 'success');
                } else {
                    showStatus('Click the button above to open the Credit Karma transactions page.', 'info');
                }
            });
        }
    });
});

// Handle Credit Karma link click - use background script to open/focus tab
document.getElementById('ck-transactions-link').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.sendMessage({ action: 'openTransactionsPage' }, (response) => {
        if (response && response.status === 'focused') {
            showStatus('✓ Credit Karma transactions page is now active. Ready to export!', 'success');
        } else if (response && response.status === 'created') {
            showStatus('Opening Credit Karma transactions page...', 'info');
        }
    });
});

// Prevent checkbox conflicts
document.getElementById('allTransactionsCheckbox').addEventListener('change', function() {
    if (this.checked) {
        // Uncheck others when "All Transactions" is selected
        document.getElementById('incomeCheckbox').checked = false;
        document.getElementById('expensesCheckbox').checked = false;
    }
});

document.getElementById('incomeCheckbox').addEventListener('change', function() {
    if (this.checked) {
        document.getElementById('allTransactionsCheckbox').checked = false;
    }
});

document.getElementById('expensesCheckbox').addEventListener('change', function() {
    if (this.checked) {
        document.getElementById('allTransactionsCheckbox').checked = false;
    }
});
