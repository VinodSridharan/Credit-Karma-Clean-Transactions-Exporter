// ============================================================================
// TxVault Exporter - Popup Script
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
        case 'this-week':
            // This week: Start of current week (Sunday) to today (exact boundaries)
            const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
            const daysFromSunday = dayOfWeek; // Days since Sunday
            startDate = new Date(today);
            startDate.setDate(today.getDate() - daysFromSunday); // Go back to Sunday
            startDate.setHours(0, 0, 0, 0); // Start of Sunday
            endDate = new Date(today);
            endDate.setHours(23, 59, 59, 999); // End of today
            break;
            
        case 'this-month':
            // This month: First day of current month to today (exact boundaries)
            startDate = new Date(today.getFullYear(), today.getMonth(), 1);
            endDate = new Date(today);
            endDate.setHours(23, 59, 59, 999); // End of today
            break;
            
        case 'this-year':
            // This year: January 1st of current year to today (exact boundaries)
            startDate = new Date(today.getFullYear(), 0, 1); // January 1st
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
            
        case 'scroll-capture':
            // Scroll & Capture mode: Captures everything visible as you scroll
            // Dates don't matter - no filtering, but set to current month for display
            startDate = new Date(today.getFullYear(), today.getMonth(), 1); // First of current month
            endDate = new Date(today);
            endDate.setHours(23, 59, 59, 999); // End of today
            break;
            
        default:
            return;
    }
    
    startDateInput.value = formatDateForInput(startDate);
    endDateInput.value = formatDateForInput(endDate);
    
    // Store selected preset
    window.selectedPreset = preset;
    
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
            const maxRetries = 2; // Quick retry - only 2 attempts max
            const baseDelay = 300; // Quick base delay
            
            try {
                // IMPROVED: Better injection and verification mechanism
                // Step 1: Check if script is already loaded by checking for global marker
                let scriptReady = false;
                try {
                    // Try to check if content script is already loaded
                    const checkResult = await chrome.scripting.executeScript({
                        target: { tabId: tabs[0].id },
                        func: () => {
                            // Check if content script is loaded (check both markers)
                            return {
                                listenerAttached: typeof window.__ckExportListenerAttached !== 'undefined',
                                scriptLoaded: typeof window.__ckExportScriptLoaded !== 'undefined',
                                chromeAvailable: typeof chrome !== 'undefined' && chrome.runtime !== undefined
                            };
                        }
                    });
                    if (checkResult && checkResult[0] && checkResult[0].result) {
                        const status = checkResult[0].result;
                        scriptReady = status.listenerAttached === true || status.scriptLoaded === true;
                        console.log(`Content script check: listener=${status.listenerAttached}, loaded=${status.scriptLoaded}, chrome=${status.chromeAvailable}`);
                        console.log(`Content script already loaded: ${scriptReady}`);
                    }
                } catch (checkError) {
                    console.log('Could not check if script is loaded:', checkError.message);
                    // Continue anyway - might still be loading via manifest
                }
                
                // Step 2: Inject script if not already loaded
                if (!scriptReady) {
                    try {
                        await chrome.scripting.executeScript({
                            target: { tabId: tabs[0].id },
                            files: ['content.js']
                        });
                        console.log('Content script injection attempted');
                        // Wait a bit for injection to complete
                        await new Promise(resolve => setTimeout(resolve, 500));
                        
                        // Verify script was injected by checking again
                        try {
                            const verifyResult = await chrome.scripting.executeScript({
                                target: { tabId: tabs[0].id },
                                func: () => {
                                    return typeof window.__ckExportListenerAttached !== 'undefined';
                                }
                            });
                            scriptReady = verifyResult && verifyResult[0] && verifyResult[0].result === true;
                            console.log(`Content script verified after injection: ${scriptReady}`);
                        } catch (verifyError) {
                            console.warn('Could not verify script injection:', verifyError.message);
                        }
                    } catch (injectError) {
                        console.error('Content script injection failed:', injectError.message);
                        // Check if manifest-loaded script is available
                        console.log('Checking if manifest-loaded script is available...');
                        try {
                            const manifestCheck = await chrome.scripting.executeScript({
                                target: { tabId: tabs[0].id },
                                func: () => typeof window.__ckExportScriptLoaded !== 'undefined'
                            });
                            scriptReady = manifestCheck && manifestCheck[0] && manifestCheck[0].result === true;
                            console.log(`Manifest-loaded script available: ${scriptReady}`);
                        } catch (manifestError) {
                            console.error('Manifest script check failed:', manifestError.message);
                        }
                    }
                }
                
                // Step 3: Wait for script to fully initialize (quick wait)
                const waitTime = scriptReady 
                    ? baseDelay + (retryCount * 100)  // Quick wait if already loaded
                    : baseDelay + (retryCount * 200) + 500; // Quick wait if just injected
                console.log(`Waiting ${waitTime}ms for content script to initialize (ready: ${scriptReady})...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
                
                // Step 4: Final verification before sending message
                // FIXED: Don't block on verification - manifest script might be ready even if check fails
                try {
                    const finalCheck = await chrome.scripting.executeScript({
                        target: { tabId: tabs[0].id },
                        func: () => {
                            return typeof window.__ckExportListenerAttached !== 'undefined' || 
                                   typeof window.__ckExportScriptLoaded !== 'undefined';
                        }
                    });
                    const isReady = finalCheck && finalCheck[0] && finalCheck[0].result === true;
                    if (isReady) {
                        console.log('✓ Content script verified and ready');
                    } else if (retryCount >= 2) {
                        // After 2 retries, assume manifest script is loaded and continue anyway
                        console.warn('⚠️ Content script verification inconclusive, but proceeding (manifest script may be loaded)');
                        scriptReady = true; // Set ready to proceed
                    }
                } catch (finalError) {
                    console.warn('Final verification warning:', finalError.message);
                    // Continue anyway - might still work if manifest script is loaded
                    if (retryCount >= 2) {
                        scriptReady = true; // Assume ready after multiple attempts
                    }
                }
                
                // Get selected preset
                const selectedPreset = window.selectedPreset || null;
                
                // Now try to send the message
                chrome.tabs.sendMessage(tabs[0].id, {
                    action: 'captureTransactions', 
                    startDate, 
                    endDate,
                    preset: selectedPreset, // Pass preset to content script
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
                            // Retry if we haven't exceeded max retries (quick retry)
                            if (retryCount < maxRetries) {
                                const nextRetry = retryCount + 1;
                                const retryWaitTime = baseDelay + (nextRetry * 200);
                                console.log(`Content script not ready (attempt ${nextRetry}/${maxRetries}), retrying in ${retryWaitTime}ms...`);
                                showStatus(`Loading... (${nextRetry}/${maxRetries})`, 'info');
                                
                                // Update button to show it's retrying (simpler message)
                                exportBtn.textContent = `Loading...`;
                                
                                setTimeout(() => {
                                    ensureContentScriptAndSend(nextRetry);
                                }, retryWaitTime);
                                return;
                            } else {
                                showStatus('Error: Content script could not load. Please refresh the page (Ctrl+F5) and try again.', 'error');
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
                
                // Retry if we haven't exceeded max retries (quick retry)
                if (retryCount < maxRetries) {
                    const nextRetry = retryCount + 1;
                    const retryWaitTime = baseDelay + (nextRetry * 200);
                    console.log(`Error occurred (attempt ${nextRetry}/${maxRetries}), retrying in ${retryWaitTime}ms...`);
                    showStatus(`Loading... (${nextRetry}/${maxRetries})`, 'info');
                    
                    // Update button to show it's retrying (simpler message)
                    exportBtn.textContent = `Loading...`;
                    
                    setTimeout(() => {
                        ensureContentScriptAndSend(nextRetry);
                    }, retryWaitTime);
                } else {
                const errorMsg = error?.message || error?.toString() || 'Failed to start export';
                    showStatus(`Error: ${errorMsg}. Please refresh the page (Ctrl+F5) and try again.`, 'error');
                exportBtn.textContent = originalText;
                exportBtn.disabled = false;
            }
            }
        };
        
        // Start the process quickly
        showStatus('Starting export...', 'info');
        setTimeout(() => {
            ensureContentScriptAndSend(0);
        }, 200);
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
    const startDate = new Date(today.getFullYear(), today.getMonth(), 1); // First of current month (no subtraction)
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + 2); // Add 2 days for pending transactions
    
    const startDateInput = document.getElementById('start-date');
    const endDateInput = document.getElementById('end-date');
    startDateInput.value = formatDateForInput(startDate);
    endDateInput.value = formatDateForInput(endDate);
    
    // Don't mark any button as active by default - only when user clicks
    
    // Show notice if on CK transactions page
    function updateCKPageNotice() {
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            if (!tabs || !tabs[0]) {
                console.log('TxVault: No active tab found');
                return;
            }
            
            const successNotice = document.getElementById('ck-page-notice');
            const warningNotice = document.getElementById('ck-transactions-notice');
            const currentUrl = tabs[0].url || '';
            
            // More flexible URL matching - check for transactions page
            const isOnTransactionsPage = currentUrl && 
                (currentUrl.includes('creditkarma.com/networth/transactions') || 
                 currentUrl.includes('creditkarma.com/transactions') ||
                 currentUrl.includes('/transactions'));
            
            console.log(`TxVault: Checking page notice. URL: ${currentUrl}, Is on transactions: ${isOnTransactionsPage}`);
            
            if (successNotice) {
                successNotice.style.display = isOnTransactionsPage ? 'block' : 'none';
            }
            if (warningNotice) {
                warningNotice.style.display = isOnTransactionsPage ? 'none' : 'block';
            }
        });
    }
    
    // Update scrolling status in popup notice
    function updateScrollingStatus(scrollProgress) {
        const successNotice = document.getElementById('ck-page-notice');
        const noticeTitle = document.getElementById('ck-page-notice-title');
        const noticeText = document.getElementById('ck-page-notice-text');
        
        if (successNotice && noticeTitle && noticeText) {
            if (scrollProgress && scrollProgress.isScrolling) {
                // Show scrolling status
                successNotice.style.backgroundColor = '#e3f2fd';
                successNotice.style.borderColor = '#2196f3';
                successNotice.style.color = '#1565c0';
                noticeTitle.textContent = '🔄 Now Scrolling';
                
                // OPTIMIZED DISPLAY: Show meaningful status without scroll counts
                let statusText = '';
                
                // Show status based on phase
                if (scrollProgress.searchingForBoundary && scrollProgress.searchProgress) {
                    // Fetching boundaries phase
                    statusText = `🔍 Fetching boundaries...`;
                    if (scrollProgress.expectedRange) {
                        statusText += `\nDate range expected: ${scrollProgress.expectedRange}`;
                    }
                    if (scrollProgress.detectedRange && scrollProgress.detectedRange !== 'N/A') {
                        statusText += `\nFound: ${scrollProgress.detectedRange}`;
                    }
                } else if (scrollProgress.foundRightBoundary && !scrollProgress.foundLeftBoundary) {
                    // Found right boundary, searching for left
                    if (scrollProgress.boundaryReached) {
                        statusText = `✅ ${scrollProgress.boundaryReached}`;
                    } else {
                        statusText = `✅ Found right of range`;
                    }
                    if (scrollProgress.expectedRange) {
                        statusText += `\n🔍 Finding left of range... Date range expected: ${scrollProgress.expectedRange}`;
                    }
                    if (scrollProgress.detectedRange && scrollProgress.detectedRange !== 'N/A') {
                        statusText += `\nFound: ${scrollProgress.detectedRange}`;
                    }
                } else if (scrollProgress.foundRightBoundary && scrollProgress.foundLeftBoundary) {
                    // Both boundaries found, harvesting
                    if (scrollProgress.boundaryReached) {
                        statusText = `✅ ${scrollProgress.boundaryReached}`;
                    } else {
                        statusText = `✅ Found left of range | ✅ Found right of range`;
                    }
                    if (scrollProgress.expectedRange) {
                        statusText += `\n🌾 Harvesting between range: ${scrollProgress.expectedRange}`;
                    }
                } else {
                    // Fallback
                    if (scrollProgress.expectedRange) {
                        statusText = `Date range expected: ${scrollProgress.expectedRange}`;
                    }
                }
                
                // Add records and time information
                if (scrollProgress.inRangeCount !== undefined) {
                    statusText += `\nRecords harvested: ${scrollProgress.inRangeCount}`;
                }
                if (scrollProgress.timeElapsed) {
                    statusText += ` | Time: ${scrollProgress.timeElapsed}`;
                }
                
                noticeText.textContent = statusText;
                successNotice.style.display = 'block';
            } else {
                // Reset to ready state
                successNotice.style.backgroundColor = '#e8f5e9';
                successNotice.style.borderColor = '#4caf50';
                successNotice.style.color = '#2e7d32';
                noticeTitle.textContent = '✅ On Transactions Page';
                noticeText.textContent = "You're ready to export! Select a date range below.";
            }
        }
    }
    
    // Listen for scroll progress messages from content script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'scrollProgress') {
            updateScrollingStatus(message.data);
        }
        return true;
    });
    
    // Check on load
    updateCKPageNotice();
    
    // Check when tab updates
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        if (changeInfo.status === 'complete' && tab.active) {
            updateCKPageNotice();
        }
    });
    
    // Auto-open transactions page if not already there (removes redundant step)
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        if (tabs[0] && tabs[0].url && tabs[0].url.includes('creditkarma.com/networth/transactions')) {
            // User is already on the page - show success message
            showStatus('✓ You are on the Credit Karma transactions page. Ready to export!', 'success');
            updateCKPageNotice();
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

    // ============================================================================
    // LEGAL COMPLIANCE: First-Use Disclaimer Dialog
    // ============================================================================
    
    // Check if user has accepted disclaimer
    chrome.storage.local.get(['disclaimerAccepted'], function(result) {
        if (!result.disclaimerAccepted) {
            showDisclaimerDialog();
        }
    });

    function showDisclaimerDialog() {
        const dialog = document.createElement('div');
        dialog.id = 'disclaimer-dialog';
        dialog.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.85);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 100000;
        `;
        
        dialog.innerHTML = `
            <div style="background: white; padding: 24px; border-radius: 8px; max-width: 450px; max-height: 80vh; overflow-y: auto; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);">
                <h3 style="margin-top: 0; color: #ff6b00; font-size: 18px;">⚠️ Important Legal Notice</h3>
                <div style="margin: 15px 0; font-size: 13px; line-height: 1.6; color: #333;">
                    <p><strong>Please read carefully before using this extension:</strong></p>
                    <ul style="margin: 10px 0; padding-left: 20px;">
                        <li style="margin: 8px 0;">This extension is <strong>not affiliated with, endorsed by, or sponsored by Credit Karma</strong>.</li>
                        <li style="margin: 8px 0;">All data processing occurs <strong>locally in your browser</strong>. No data is collected, stored, or transmitted to third parties.</li>
                        <li style="margin: 8px 0;">Your Credit Karma credentials are <strong>never accessed or stored</strong>.</li>
                        <li style="margin: 8px 0;">You are responsible for compliance with Credit Karma's Terms of Service.</li>
                        <li style="margin: 8px 0;">This tool is provided <strong>"as-is"</strong> without warranty of any kind (MIT License).</li>
                        <li style="margin: 8px 0;">Credit Karma may update their platform, which could break this extension.</li>
                    </ul>
                    <p style="margin-top: 15px; padding: 10px; background: #f9f9f9; border-left: 3px solid #ff6b00; font-size: 12px;">
                        <strong>By clicking "I Understand & Accept", you acknowledge that you have read and accept these terms.</strong>
                    </p>
                </div>
                <div style="display: flex; gap: 10px; margin-top: 20px;">
                    <button id="accept-disclaimer" style="flex: 1; padding: 12px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 14px;">
                        I Understand & Accept
                    </button>
                    <button id="decline-disclaimer" style="flex: 1; padding: 12px; background: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px;">
                        Cancel
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(dialog);
        document.getElementById('accept-disclaimer').addEventListener('click', function() {
            chrome.storage.local.set({ disclaimerAccepted: true });
            document.getElementById('disclaimer-dialog').remove();
            showStatus('Thank you! You can now use the extension.', 'success');
        });
        document.getElementById('decline-disclaimer').addEventListener('click', function() {
            window.close(); // Close the popup
        });
    }
    
    // ============================================================================
    // END LEGAL COMPLIANCE CODE
    // ============================================================================
    // Handle Credit Karma button click - navigate to transactions page in current or new tab
    document.getElementById('ck-transactions-link').addEventListener('click', () => {
        const transactionsUrl = 'https://www.creditkarma.com/networth/transactions';
        
        // Check if we're already on a Credit Karma page
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            if (tabs[0]) {
                const currentUrl = tabs[0].url || '';
                
                // If already on transactions page, just show success
                if (currentUrl.includes('/networth/transactions')) {
                    showStatus('✓ You are already on the transactions page. Ready to export!', 'success');
                    return;
                }
                
                // If on Credit Karma but different page, navigate in same tab
                if (currentUrl.includes('creditkarma.com')) {
                    chrome.tabs.update(tabs[0].id, {
                        url: transactionsUrl
                    }, () => {
                        showStatus('Navigating to transactions page... Please wait for it to load.', 'info');
                        // Give user time to see the message
                        setTimeout(() => {
                            showStatus('Page loaded. Now click Export to start extraction.', 'success');
                        }, 2000);
                    });
                    return;
                }
                
                // Not on Credit Karma - create new tab
                chrome.tabs.create({
                    url: transactionsUrl,
                    active: true
                }, () => {
                    showStatus('Opening transactions page in new tab... Please wait for it to load, then click Export.', 'info');
                });
            } else {
                // No active tab - create new tab
                chrome.tabs.create({
                    url: transactionsUrl,
                    active: true
                }, () => {
                    showStatus('Opening transactions page... Please wait for it to load, then click Export.', 'info');
                });
            }
        });
    }); // End of ck-transactions-link click handler
}); // End of DOMContentLoaded

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
