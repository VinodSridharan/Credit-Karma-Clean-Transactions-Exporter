/**
 * TxVault – CK UI validation tests (new /networth/transactions, pending, end-date)
 */
const {
  buildDateDistribution,
  isEndDateMissing,
  parseDateForDistribution,
  isPendingOrInvalidDate,
  filterValidDates,
} = require('../lib/data-handling');

describe('ck-ui-validation', () => {
  /** Fixture: transactions as from new /networth/transactions (includes Pending section) */
  const FIXTURE_THIS_MONTH_JAN2026 = [
    { date: 'Jan 31, 2026', description: 'Coffee Shop', amount: -5.99, status: 'Pending', transactionType: 'debit' },
    { date: 'Jan 30, 2026', description: 'Grocery', amount: -85.00, status: 'Posted', transactionType: 'debit' },
    { date: 'Jan 29, 2026', description: 'Salary', amount: 3500, status: 'Posted', transactionType: 'credit' },
    { date: '1/28/2026', description: 'Rent', amount: -1200, status: 'Posted', transactionType: 'debit' },
  ];

  const FIXTURE_PENDING_ONLY_DAY = [
    { date: '2026-01-31', description: 'Pending Charge', amount: -25, status: 'Pending', transactionType: 'debit' },
  ];

  describe('parseDateForDistribution', () => {
    it('parses Jan 31, 2026 to 2026-01-31', () => {
      expect(parseDateForDistribution('Jan 31, 2026')).toBe('2026-01-31');
    });
    it('parses 1/31/2026 to 2026-01-31', () => {
      expect(parseDateForDistribution('1/31/2026')).toBe('2026-01-31');
    });
    it('parses 2026-01-31 as-is', () => {
      expect(parseDateForDistribution('2026-01-31')).toBe('2026-01-31');
    });
    it('returns null for Pending or empty', () => {
      expect(parseDateForDistribution('Pending')).toBe(null);
      expect(parseDateForDistribution('')).toBe(null);
    });
  });

  describe('buildDateDistribution', () => {
    it('includes both posted and pending transactions', () => {
      const dist = buildDateDistribution(FIXTURE_THIS_MONTH_JAN2026);
      expect(dist['2026-01-31']).toBe(1);
      expect(dist['2026-01-30']).toBe(1);
      expect(dist['2026-01-29']).toBe(1);
      expect(dist['2026-01-28']).toBe(1);
    });
    it('counts days with only pending as covered', () => {
      const dist = buildDateDistribution(FIXTURE_PENDING_ONLY_DAY);
      expect(dist['2026-01-31']).toBe(1);
    });
    it('returns empty object for empty input', () => {
      expect(buildDateDistribution([])).toEqual({});
    });
  });

  describe('isEndDateMissing', () => {
    it('returns false when end date (Jan 31, 2026) is in data', () => {
      const dist = buildDateDistribution(FIXTURE_THIS_MONTH_JAN2026);
      expect(isEndDateMissing(dist, '2026-01-31')).toBe(false);
      expect(isEndDateMissing(dist, '1/31/2026')).toBe(false);
    });
    it('returns false when end date has only pending transactions', () => {
      const dist = buildDateDistribution(FIXTURE_PENDING_ONLY_DAY);
      expect(isEndDateMissing(dist, '2026-01-31')).toBe(false);
    });
    it('returns true when end date has no transactions', () => {
      const dist = buildDateDistribution(FIXTURE_THIS_MONTH_JAN2026);
      expect(isEndDateMissing(dist, '2026-02-01')).toBe(true);
    });
    it('returns true for empty distribution', () => {
      expect(isEndDateMissing({}, '2026-01-31')).toBe(true);
    });
  });

  describe('This Month range with Jan 31, 2026', () => {
    it('produces transactions for Jan 31 when present in fixture', () => {
      const dist = buildDateDistribution(FIXTURE_THIS_MONTH_JAN2026);
      const jan31Count = dist['2026-01-31'];
      expect(jan31Count).toBeGreaterThan(0);
    });
    it('does NOT raise end-date-missing when Jan 31 is in data', () => {
      const dist = buildDateDistribution(FIXTURE_THIS_MONTH_JAN2026);
      expect(isEndDateMissing(dist, '2026-01-31')).toBe(false);
    });
  });

  describe('Pending handling', () => {
    it('does not flag days with only pending as missing', () => {
      const dist = buildDateDistribution(FIXTURE_PENDING_ONLY_DAY);
      expect(dist['2026-01-31']).toBe(1);
      expect(isEndDateMissing(dist, '2026-01-31')).toBe(false);
    });
    it('filterValidDates still excludes Pending-only date strings', () => {
      const withPending = [
        { date: 'Jan 31, 2026', description: 'A', amount: 1 },
        { date: 'Pending', description: 'B', amount: 2 },
      ];
      const filtered = filterValidDates(withPending);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].date).toBe('Jan 31, 2026');
    });
  });
});
