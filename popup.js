// ============================================================================
// CreditKarmaTxDownloader - Popup Script
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
    statusEl.style.display = 'flex'; // Use flex to center content
    
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
    
    // Check if range is too large (more than 8 years)
    // Allow up to 8.1 years to account for preset rounding (8 years + 37 days buffer)
    const yearsDiff = (end - start) / (1000 * 60 * 60 * 24 * 365);
    if (yearsDiff > 8.1) {
        showStatus('Date range cannot exceed 8 years. Please select a smaller range.', 'error');
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
            
        case 'last-two-months':
            // Last two months: Current month + previous month (exact boundaries)
            if (today.getMonth() === 0) {
                // January: December of last year to January of this year
                startDate = new Date(today.getFullYear() - 1, 11, 1);
                endDate = new Date(today);
                endDate.setHours(23, 59, 59, 999);
            } else if (today.getMonth() === 1) {
                // February: December of last year to February of this year
                startDate = new Date(today.getFullYear() - 1, 11, 1);
                endDate = new Date(today);
                endDate.setHours(23, 59, 59, 999);
            } else {
                // Other months: 2 months ago to today
                startDate = new Date(today.getFullYear(), today.getMonth() - 2, 1);
                endDate = new Date(today);
                endDate.setHours(23, 59, 59, 999);
            }
            break;
            
        case 'last-3-months':
            // 3 months ago MINUS 2 days to today PLUS 2 days
            startDate = new Date(today.getFullYear(), today.getMonth() - 3, 1);
            startDate.setDate(startDate.getDate() - 2); // Subtract 2 days
            endDate = new Date(today);
            endDate.setDate(endDate.getDate() + 2); // Add 2 days (but cap at today if future)
            if (endDate > today) endDate = today;
            break;
            
        case 'this-year':
            // January 1st of this year to today (exact boundaries)
            startDate = new Date(today.getFullYear(), 0, 1);
            endDate = new Date(today);
            endDate.setHours(23, 59, 59, 999); // End of today
            break;
            
        case 'last-5-years':
            // Exactly 5 years ago from today to today
            startDate = new Date(today);
            startDate.setFullYear(today.getFullYear() - 5); // Exactly 5 years ago
            startDate.setHours(0, 0, 0, 0); // Start of day
            endDate = new Date(today);
            endDate.setHours(23, 59, 59, 999); // End of today
            break;
            
        case 'last-8-years':
            // Exactly 8 years ago from today to today
            startDate = new Date(today);
            startDate.setFullYear(today.getFullYear() - 8); // Exactly 8 years ago
            startDate.setHours(0, 0, 0, 0); // Start of day
            endDate = new Date(today);
            endDate.setHours(23, 59, 59, 999); // End of today
            break;
            
        default:
            return;
    }
    
    startDateInput.value = formatDateForInput(startDate);
    endDateInput.value = formatDateForInput(endDate);
    
    // Show status message
    showStatus(`Date range set to ${preset.replace(/-/g, ' ')}. Please wait for dates to display...`, 'info');
    
    // Temporarily disable export button while dates are being set
    const exportBtn = document.getElementById('export-btn');
    const originalBtnText = exportBtn.textContent;
    exportBtn.disabled = true;
    exportBtn.textContent = 'Setting dates...';
    
    // Wait for dates to be displayed (status message auto-hides after 3 seconds)
    // Add small delay to ensure dates are visible in input fields
    setTimeout(() => {
        // Verify dates are actually in the input fields
        const startValue = startDateInput.value;
        const endValue = endDateInput.value;
        
        if (startValue && endValue) {
            // Dates are set - enable export button and show success message
            exportBtn.disabled = false;
            exportBtn.textContent = originalBtnText;
            showStatus(`✓ Dates ready: ${startValue} to ${endValue}. Click Export when ready.`, 'success');
        } else {
            // Dates not set - retry once
            setTimeout(() => {
                startDateInput.value = formatDateForInput(startDate);
                endDateInput.value = formatDateForInput(endDate);
                const retryStartValue = startDateInput.value;
                const retryEndValue = endDateInput.value;
                
                if (retryStartValue && retryEndValue) {
                    exportBtn.disabled = false;
                    exportBtn.textContent = originalBtnText;
                    showStatus(`✓ Dates ready: ${retryStartValue} to ${retryEndValue}. Click Export when ready.`, 'success');
                } else {
                    // Still not working - enable anyway after delay
                    exportBtn.disabled = false;
                    exportBtn.textContent = originalBtnText;
                    showStatus('Dates set. Please verify date inputs before exporting.', 'warning');
                }
            }, 500);
        }
    }, 3500); // Wait 3.5 seconds (status message shows for 3 seconds, plus 0.5s buffer)
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
    
        // MATCH ORIGINAL: No page check or auto-navigation - just send message
        // Original expects user to be on transactions page already (via link click)
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            if (!tabs[0]) {
                showStatus('Unable to access current tab. Please try again.', 'error');
                exportBtn.textContent = originalText;
                exportBtn.disabled = false;
                return;
            }
            
            // Get trim option
            const trimToExactMonth = document.getElementById('trimToExactMonth').checked;
            
            // MATCH ORIGINAL: Simple message send - no navigation, no page check
            // User should click the link to go to transactions page first
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
            }, 3000);
            
            if (response) {
                console.log(response.status);
                if (response.status === 'started') {
                    showStatus('Export started! Check the page for progress updates.', 'success');
                } else if (response.status === 'error') {
                    showStatus(`Error: ${response.message || 'Unknown error occurred.'}`, 'error');
                }
            } else {
                console.error('No response from content script');
                showStatus('Please make sure you are on the Credit Karma transactions page and try again. If error persists, refresh the page (F5).', 'error');
            }
        });
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
// Set GitHub links (update these with your actual GitHub repository URL)
function setupGitHubLinks() {
    const githubLink = document.getElementById('github-link');
    const issuesLink = document.getElementById('issues-link');
    
    // TODO: Update these with your actual GitHub repository URL
    const githubRepoUrl = 'https://github.com/YOUR_USERNAME/YOUR_REPO_NAME';
    
    if (githubLink) {
        githubLink.href = githubRepoUrl;
    }
    if (issuesLink) {
        issuesLink.href = `${githubRepoUrl}/issues`;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Setup GitHub links
    setupGitHubLinks();
    // Set default to "This Month" (first day of month to today - exact boundaries)
    const today = new Date();
    const startDate = new Date(today.getFullYear(), today.getMonth(), 1);
    const endDate = new Date(today);
    endDate.setHours(23, 59, 59, 999); // End of today
    
    const startDateInput = document.getElementById('start-date');
    const endDateInput = document.getElementById('end-date');
    startDateInput.value = formatDateForInput(startDate);
    endDateInput.value = formatDateForInput(endDate);
    
    // Don't mark any button as active by default - only when user clicks
    
    // MATCH ORIGINAL: Don't auto-open - user clicks link to navigate
    // Original just has a link, user clicks it, then extension works
});

// MATCH ORIGINAL: Link is just a simple <a> tag - no JavaScript needed
// User clicks link, navigates to page, then clicks Export

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
