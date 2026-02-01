/**
 * TxVault messaging – lastError handling tests
 */
const {
  sendMessageWithLastErrorCheck,
  getLastErrorMessage,
  isContextInvalidatedError,
} = require('../lib/messaging');

describe('messaging', () => {
  describe('getLastErrorMessage', () => {
    it('returns null when no lastError', () => {
      expect(getLastErrorMessage({ runtime: {} })).toBe(null);
      expect(getLastErrorMessage(null)).toBe(null);
    });
    it('returns message when lastError present', () => {
      const chromeApi = {
        runtime: { lastError: { message: 'Receiving end does not exist' } },
      };
      expect(getLastErrorMessage(chromeApi)).toBe('Receiving end does not exist');
    });
  });

  describe('isContextInvalidatedError', () => {
    it('returns true for Extension context invalidated', () => {
      expect(isContextInvalidatedError(new Error('Extension context invalidated'))).toBe(true);
    });
    it('returns true for Receiving end does not exist', () => {
      expect(isContextInvalidatedError(new Error('Receiving end does not exist'))).toBe(true);
    });
    it('returns true for Could not establish connection', () => {
      expect(isContextInvalidatedError(new Error('Could not establish connection'))).toBe(true);
    });
    it('returns false for other errors', () => {
      expect(isContextInvalidatedError(new Error('Network error'))).toBe(false);
    });
    it('handles string input', () => {
      expect(isContextInvalidatedError('Extension context invalidated')).toBe(true);
    });
  });

  describe('sendMessageWithLastErrorCheck', () => {
    it('rejects when chrome API missing', async () => {
      await expect(sendMessageWithLastErrorCheck(null, 'ping')).rejects.toThrow(
        'chrome.runtime.sendMessage not available'
      );
    });
    it('rejects when lastError is set', async () => {
      const runtime = { lastError: null };
      runtime.sendMessage = function (msg, cb) {
        runtime.lastError = { message: 'Port closed' };
        cb();
      };
      const chromeApi = { runtime };
      const p = sendMessageWithLastErrorCheck(chromeApi, 'ping');
      await expect(p).rejects.toThrow('Port closed');
    });
    it('resolves with response when no lastError', async () => {
      const chromeApi = {
        runtime: {
          lastError: null,
          sendMessage: (msg, cb) => cb({ ok: true }),
        },
      };
      const result = await sendMessageWithLastErrorCheck(chromeApi, 'ping');
      expect(result).toEqual({ ok: true });
    });
  });
});
