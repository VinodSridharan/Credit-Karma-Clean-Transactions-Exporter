/**
 * TxVault guards – login/logout guard tests
 */
const {
  isCreditKarmaTransactionsUrl,
  appearsLoggedIn,
  appearsLoggedOut,
  canRunExtraction,
  shouldAbortAndExport,
} = require('../lib/guards');

describe('guards', () => {
  describe('isCreditKarmaTransactionsUrl', () => {
    it('returns true for valid Credit Karma transactions URL', () => {
      expect(
        isCreditKarmaTransactionsUrl('https://www.creditkarma.com/credit/transactions')
      ).toBe(true);
    });
    it('returns true for URL with /transactions path', () => {
      expect(isCreditKarmaTransactionsUrl('https://creditkarma.com/transactions')).toBe(true);
    });
    it('returns false for non-Credit Karma URL', () => {
      expect(isCreditKarmaTransactionsUrl('https://example.com/transactions')).toBe(false);
    });
    it('returns false for Credit Karma non-transactions URL', () => {
      expect(isCreditKarmaTransactionsUrl('https://www.creditkarma.com/dashboard')).toBe(false);
    });
    it('returns false for empty or non-string input', () => {
      expect(isCreditKarmaTransactionsUrl('')).toBe(false);
      expect(isCreditKarmaTransactionsUrl(null)).toBe(false);
      expect(isCreditKarmaTransactionsUrl(123)).toBe(false);
    });
  });

  describe('appearsLoggedIn', () => {
    it('returns true when transaction list present and no login form', () => {
      expect(appearsLoggedIn({ hasTransactionList: true, hasLoginForm: false })).toBe(true);
    });
    it('returns false when login form is present', () => {
      expect(appearsLoggedIn({ hasTransactionList: true, hasLoginForm: true })).toBe(false);
    });
    it('returns false when no transaction list', () => {
      expect(appearsLoggedIn({ hasTransactionList: false, hasLoginForm: false })).toBe(false);
    });
    it('handles empty state object', () => {
      expect(appearsLoggedIn({})).toBe(false);
    });
  });

  describe('appearsLoggedOut', () => {
    it('returns true when login form present', () => {
      expect(appearsLoggedOut({ hasLoginForm: true })).toBe(true);
    });
    it('returns true when no transaction list', () => {
      expect(appearsLoggedOut({ hasTransactionList: false })).toBe(true);
    });
    it('returns false when logged in', () => {
      expect(appearsLoggedOut({ hasLoginForm: false, hasTransactionList: true })).toBe(false);
    });
  });

  describe('canRunExtraction', () => {
    it('returns true only when on CK transactions URL and logged in', () => {
      expect(
        canRunExtraction('https://creditkarma.com/transactions', {
          hasTransactionList: true,
          hasLoginForm: false,
        })
      ).toBe(true);
    });
    it('returns false when not on CK transactions URL', () => {
      expect(
        canRunExtraction('https://example.com', { hasTransactionList: true, hasLoginForm: false })
      ).toBe(false);
    });
    it('returns false when logged out', () => {
      expect(
        canRunExtraction('https://creditkarma.com/transactions', {
          hasTransactionList: false,
          hasLoginForm: true,
        })
      ).toBe(false);
    });
  });

  describe('shouldAbortAndExport', () => {
    it('returns true when logout detected', () => {
      expect(shouldAbortAndExport({ detectedLogout: true })).toBe(true);
    });
    it('returns false when no logout detected', () => {
      expect(shouldAbortAndExport({ detectedLogout: false })).toBe(false);
      expect(shouldAbortAndExport({})).toBe(false);
    });
  });
});
