/**
 * TxVault data handling – deduplication, CSV, validation tests
 */
const {
  transactionKey,
  deduplicateTransactions,
  isPendingOrInvalidDate,
  filterValidDates,
  escapeCSVValue,
  toCSV,
} = require('../lib/data-handling');

describe('data-handling', () => {
  describe('transactionKey', () => {
    it('produces stable key from transaction fields', () => {
      const tx = {
        date: '2025-01-15',
        description: 'Coffee',
        amount: '-5.99',
        type: 'debit',
        status: 'posted',
      };
      expect(transactionKey(tx)).toBe('2025-01-15|Coffee|-5.99|debit|posted');
    });
    it('handles missing fields', () => {
      expect(transactionKey({})).toBe('||||');
    });
  });

  describe('deduplicateTransactions', () => {
    it('removes duplicates by composite key', () => {
      const txs = [
        { date: '2025-01-15', description: 'Coffee', amount: '-5.99', type: 'debit', status: 'posted' },
        { date: '2025-01-15', description: 'Coffee', amount: '-5.99', type: 'debit', status: 'posted' },
        { date: '2025-01-16', description: 'Lunch', amount: '-12.00', type: 'debit', status: 'posted' },
      ];
      const deduped = deduplicateTransactions(txs);
      expect(deduped).toHaveLength(2);
      expect(deduped[0].description).toBe('Coffee');
      expect(deduped[1].description).toBe('Lunch');
    });
    it('returns empty array for empty input', () => {
      expect(deduplicateTransactions([])).toEqual([]);
    });
  });

  describe('isPendingOrInvalidDate', () => {
    it('returns true for Pending', () => {
      expect(isPendingOrInvalidDate('Pending')).toBe(true);
      expect(isPendingOrInvalidDate('PENDING')).toBe(true);
    });
    it('returns true for empty or n/a', () => {
      expect(isPendingOrInvalidDate('')).toBe(true);
      expect(isPendingOrInvalidDate('n/a')).toBe(true);
    });
    it('returns false for valid date string', () => {
      expect(isPendingOrInvalidDate('Jan 15, 2025')).toBe(false);
      expect(isPendingOrInvalidDate('2025-01-15')).toBe(false);
    });
  });

  describe('filterValidDates', () => {
    it('filters out pending and invalid dates', () => {
      const txs = [
        { date: 'Jan 15, 2025', description: 'A' },
        { date: 'Pending', description: 'B' },
        { date: 'Jan 16, 2025', description: 'C' },
      ];
      const filtered = filterValidDates(txs);
      expect(filtered).toHaveLength(2);
      expect(filtered.every((t) => t.date !== 'Pending')).toBe(true);
    });
    it('uses custom date field', () => {
      const txs = [{ transactionDate: 'Valid' }, { transactionDate: 'Pending' }];
      expect(filterValidDates(txs, 'transactionDate')).toHaveLength(1);
    });
  });

  describe('escapeCSVValue', () => {
    it('escapes quotes', () => {
      expect(escapeCSVValue('Say "hello"')).toBe('"Say ""hello"""');
    });
    it('wraps in quotes when comma present', () => {
      expect(escapeCSVValue('A, B')).toBe('"A, B"');
    });
    it('returns simple values unquoted', () => {
      expect(escapeCSVValue('simple')).toBe('simple');
    });
  });

  describe('toCSV', () => {
    it('produces header and rows', () => {
      const txs = [{ date: '2025-01-15', description: 'Coffee', amount: '-5.99', type: 'debit', status: 'posted' }];
      const csv = toCSV(txs);
      expect(csv).toContain('date,description,amount,type,status');
      expect(csv).toContain('2025-01-15,Coffee,-5.99,debit,posted');
    });
    it('handles empty transactions', () => {
      const csv = toCSV([]);
      expect(csv).toContain('date,description,amount,type,status');
      expect(csv.split('\r\n')).toHaveLength(1);
    });
  });
});
