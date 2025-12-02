// Handle opening Credit Karma transactions page
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'openTransactionsPage') {
        // Check if tab already exists
        chrome.tabs.query({url: '*://www.creditkarma.com/networth/transactions*'}, (tabs) => {
            if (tabs.length > 0) {
                // Tab exists, focus it
                chrome.tabs.update(tabs[0].id, { active: true });
                chrome.windows.update(tabs[0].windowId, { focused: true });
                sendResponse({ status: 'focused', tabId: tabs[0].id });
            } else {
                // Create new tab
                chrome.tabs.create({
                    url: 'https://www.creditkarma.com/networth/transactions',
                    active: true
                }, (tab) => {
                    sendResponse({ status: 'created', tabId: tab.id });
                });
            }
        });
        return true;
    }

    if (request.action === 'captureTransactions') {
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            chrome.scripting.executeScript({
                target: {tabId: tabs[0].id},
                function: captureTransactionsInDateRange,
                args: [request.startDate, request.endDate]
            });
            sendResponse({status: 'started'});
        });
        return true;
    }
});