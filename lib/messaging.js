/**
 * TxVault messaging – Chrome runtime messaging with lastError handling
 * Wraps chrome.runtime.sendMessage to consistently check chrome.runtime.lastError.
 */

/**
 * Send a message and resolve with response or reject with lastError.
 * @param {Object} chromeApi - Injected chrome API (for testing)
 * @param {string} action - Action name
 * @param {*} [payload] - Optional payload
 * @returns {Promise<*>}
 */
function sendMessageWithLastErrorCheck(chromeApi, action, payload) {
  return new Promise((resolve, reject) => {
    if (!chromeApi || !chromeApi.runtime || typeof chromeApi.runtime.sendMessage !== 'function') {
      reject(new Error('chrome.runtime.sendMessage not available'));
      return;
    }
    chromeApi.runtime.sendMessage({ action, payload }, (response) => {
      if (chromeApi.runtime?.lastError) {
        reject(new Error(chromeApi.runtime.lastError.message || 'Unknown messaging error'));
        return;
      }
      resolve(response);
    });
  });
}

/**
 * Get lastError message if present, otherwise null.
 * @param {Object} chromeApi
 * @returns {string|null}
 */
function getLastErrorMessage(chromeApi) {
  if (!chromeApi?.runtime?.lastError) return null;
  const msg = chromeApi.runtime.lastError?.message;
  return typeof msg === 'string' ? msg : null;
}

/**
 * Check if a messaging error indicates the extension context was invalidated.
 * @param {Error|string} err
 * @returns {boolean}
 */
function isContextInvalidatedError(err) {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('Extension context invalidated') ||
    msg.includes('Receiving end does not exist') ||
    msg.includes('Could not establish connection')
  );
}

module.exports = {
  sendMessageWithLastErrorCheck,
  getLastErrorMessage,
  isContextInvalidatedError,
};
