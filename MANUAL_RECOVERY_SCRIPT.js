// Manual Recovery Script for Cached Transactions
// Use this if exportCachedTransactions() doesn't work
// Copy and paste this entire script into browser console

// Get cached data
const cachedData = JSON.parse(sessionStorage.getItem('ck_transactions_cache'));

if (!cachedData || !cachedData.transactions || cachedData.transactions.length === 0) {
    console.error('No cached transactions found');
    alert('No cached transactions found. Export may not have saved yet.');
} else {
    console.log(`✅ Found ${cachedData.transactions.length} cached transactions`);
    console.log(`Date range: ${cachedData.startDate} to ${cachedData.endDate}`);
    
    // Parse date helper (matches content.js logic)
    function parseDate(dateStr) {
        if (!dateStr || dateStr.trim() === '') return null;
        try {
            const date = new Date(dateStr);
            return isNaN(date.getTime()) ? null : date;
        } catch(e) {
            return null;
        }
    }
    
    // Convert date format (matches content.js convertDateFormat)
    function convertDateFormat(dateStr) {
        if (!dateStr || dateStr.trim() === '') return 'Pending';
        try {
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) return dateStr;
            const month = date.getMonth() + 1;
            const day = date.getDate();
            const year = date.getFullYear();
            return `${month}/${day}/${year}`;
        } catch(e) {
            return dateStr;
        }
    }
    
    // Filter by date range
    const startDate = new Date(cachedData.startDate);
    const endDate = new Date(cachedData.endDate);
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);
    
    const filtered = cachedData.transactions.filter(tx => {
        const txDate = parseDate(tx.date);
        if (!txDate) return false;
        return txDate >= startDate && txDate <= endDate;
    });
    
    console.log(`📊 ${filtered.length} transactions in date range ${cachedData.startDate} to ${cachedData.endDate}`);
    
    // Convert to CSV - MATCHES ACTUAL CSV FORMAT FROM content.js
    // Header: Date,Description,Amount,Category,Transaction Type,Account Name,Labels,Notes
    const header = 'Date,Description,Amount,Category,Transaction Type,Account Name,Labels,Notes\n';
    const rows = filtered.map(tx => {
        const dateStr = (!tx.date || tx.date.trim() === '') 
            ? 'Pending' 
            : convertDateFormat(tx.date);
        const description = (tx.description || '').replace(/"/g, '""');
        const amount = tx.amount || '';
        const category = (tx.category || '').replace(/"/g, '""');
        const transactionType = tx.transactionType || '';
        return `"${dateStr}","${description}","${amount}","${category}","${transactionType}",,,\n`;
    });
    
    const csvContent = header + rows.join('');
    
    // Download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cached_transactions_${cachedData.startDate.replace(/\//g, '-')}_to_${cachedData.endDate.replace(/\//g, '-')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    console.log(`✅ Exported ${filtered.length} transactions to CSV`);
    alert(`✅ Exported ${filtered.length} transactions\n\nTotal cached: ${cachedData.transactions.length}\nIn date range: ${filtered.length}\n\nFile downloading now!`);
}

