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
 * Parse date string to YYYY-MM-DD for distribution keys.
 * Handles common formats: YYYY-MM-DD, MM/DD/YYYY, "Jan 31, 2026", etc.
 * @param {string} dateStr
 * @returns {string|null} YYYY-MM-DD or null if unparseable
 */
function parseDateForDistribution(dateStr = '') {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const s = dateStr.trim();
  if (!s || isPendingOrInvalidDate(s)) return null;
  // YYYY-MM-DD: use as-is to avoid timezone shifts
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Build date distribution from transactions.
 * Includes BOTH posted and pending with valid dates (days with only pending count as covered).
 * @param {Array<Object>} transactions - { date, status, ... }
 * @returns {Object} { 'YYYY-MM-DD': count, ... }
 */
function buildDateDistribution(transactions = []) {
  const dist = {};
  for (const tx of transactions) {
    const key = parseDateForDistribution(tx.date);
    if (key) {
      dist[key] = (dist[key] || 0) + 1;
    }
  }
  return dist;
}

/**
 * Check if end date is missing from export (no posted or pending for that date).
 * @param {Object} dateDistribution - from buildDateDistribution
 * @param {string} endDateStr - YYYY-MM-DD
 * @returns {boolean} true only when no transaction exists for that date
 */
function isEndDateMissing(dateDistribution = {}, endDateStr = '') {
  if (!endDateStr) return true;
  const key = parseDateForDistribution(endDateStr) || endDateStr.replace(/\//g, '-');
  const count = dateDistribution[key];
  return !count || count === 0;
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
  parseDateForDistribution,
  buildDateDistribution,
  isEndDateMissing,
  filterValidDates,
  escapeCSVValue,
  toCSV,
};
