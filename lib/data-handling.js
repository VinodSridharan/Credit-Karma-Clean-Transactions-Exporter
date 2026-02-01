/**
 * TxVault data handling – deduplication, CSV, validation
 */

/**
 * Build a composite key for a transaction (for deduplication).
 * @param {Object} tx
 * @param {string} [tx.date]
 * @param {string} [tx.description]
 * @param {string|number} [tx.amount]
 * @param {string} [tx.type]
 * @param {string} [tx.status]
 * @returns {string}
 */
function transactionKey(tx = {}) {
  const d = tx.date ?? '';
  const desc = tx.description ?? '';
  const amt = String(tx.amount ?? '');
  const type = tx.type ?? '';
  const status = tx.status ?? '';
  return `${d}|${desc}|${amt}|${type}|${status}`;
}

/**
 * Deduplicate transactions by composite key.
 * @param {Array<Object>} transactions
 * @returns {Array<Object>}
 */
function deduplicateTransactions(transactions = []) {
  const seen = new Set();
  return transactions.filter((tx) => {
    const key = transactionKey(tx);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Check if a date string looks like "Pending" or invalid.
 * @param {string} [dateStr='']
 * @returns {boolean}
 */
function isPendingOrInvalidDate(dateStr = '') {
  if (typeof dateStr !== 'string') return true;
  const lower = dateStr.trim().toLowerCase();
  return lower === 'pending' || lower === '' || lower === 'n/a';
}

/**
 * Filter out transactions with pending/invalid dates.
 * @param {Array<Object>} transactions
 * @param {string} [dateField='date']
 * @returns {Array<Object>}
 */
function filterValidDates(transactions = [], dateField = 'date') {
  return transactions.filter((tx) => !isPendingOrInvalidDate(tx[dateField]));
}

/**
 * Sanitize a value for RFC 4180 CSV (escape quotes).
 * @param {string} val
 * @returns {string}
 */
function escapeCSVValue(val) {
  const s = String(val ?? '');
  if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Convert transactions to CSV rows (header + data).
 * @param {Array<Object>} transactions
 * @param {string[]} [columns=['date','description','amount','type','status']]
 * @returns {string}
 */
function toCSV(transactions = [], columns = ['date', 'description', 'amount', 'type', 'status']) {
  const header = columns.map(escapeCSVValue).join(',');
  const rows = transactions.map((tx) =>
    columns.map((col) => escapeCSVValue(tx[col])).join(',')
  );
  return [header, ...rows].join('\r\n');
}

module.exports = {
  transactionKey,
  deduplicateTransactions,
  isPendingOrInvalidDate,
  filterValidDates,
  escapeCSVValue,
  toCSV,
};
