/**
 * TxVault safety caps – pacing and limit tests
 */
const {
  withinScrollCap,
  hitScrollCap,
  getPacingDelay,
  withinTransactionCap,
  DEFAULT_MAX_SCROLL_ITERATIONS,
  DEFAULT_MIN_DELAY_MS,
} = require('../lib/safety-caps');

describe('safety-caps', () => {
  describe('withinScrollCap', () => {
    it('returns true when below max', () => {
      expect(withinScrollCap(0)).toBe(true);
      expect(withinScrollCap(100)).toBe(true);
      expect(withinScrollCap(DEFAULT_MAX_SCROLL_ITERATIONS - 1)).toBe(true);
    });
    it('returns false when at or above max', () => {
      expect(withinScrollCap(DEFAULT_MAX_SCROLL_ITERATIONS)).toBe(false);
      expect(withinScrollCap(DEFAULT_MAX_SCROLL_ITERATIONS + 1)).toBe(false);
    });
    it('returns false for negative scroll count', () => {
      expect(withinScrollCap(-1)).toBe(false);
    });
    it('respects custom max', () => {
      expect(withinScrollCap(50, 100)).toBe(true);
      expect(withinScrollCap(100, 100)).toBe(false);
    });
  });

  describe('hitScrollCap', () => {
    it('returns false when below max', () => {
      expect(hitScrollCap(0)).toBe(false);
      expect(hitScrollCap(DEFAULT_MAX_SCROLL_ITERATIONS - 1)).toBe(false);
    });
    it('returns true when at or above max', () => {
      expect(hitScrollCap(DEFAULT_MAX_SCROLL_ITERATIONS)).toBe(true);
      expect(hitScrollCap(DEFAULT_MAX_SCROLL_ITERATIONS + 1)).toBe(true);
    });
  });

  describe('getPacingDelay', () => {
    it('returns base delay when above minimum', () => {
      expect(getPacingDelay(2000, DEFAULT_MIN_DELAY_MS)).toBe(2000);
    });
    it('returns minimum when base is below minimum', () => {
      expect(getPacingDelay(100, DEFAULT_MIN_DELAY_MS)).toBe(DEFAULT_MIN_DELAY_MS);
    });
    it('defaults to 1000 and min when called with no args', () => {
      const d = getPacingDelay();
      expect(d).toBeGreaterThanOrEqual(DEFAULT_MIN_DELAY_MS);
    });
  });

  describe('withinTransactionCap', () => {
    it('returns true for valid counts', () => {
      expect(withinTransactionCap(0)).toBe(true);
      expect(withinTransactionCap(1000)).toBe(true);
      expect(withinTransactionCap(50000)).toBe(true);
    });
    it('returns false for over cap', () => {
      expect(withinTransactionCap(50001)).toBe(false);
      expect(withinTransactionCap(50001, 50000)).toBe(false);
    });
    it('returns false for negative count', () => {
      expect(withinTransactionCap(-1)).toBe(false);
    });
  });
});
