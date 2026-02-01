/**
 * TxVault guards – login/logout and session checks
 * Used to gate extension actions when user is not on Credit Karma or logged out.
 */

/**
 * Check if the current URL appears to be a Credit Karma transactions page.
 * @param {string} [url=''] - Current page URL
 * @returns {boolean}
 */
function isCreditKarmaTransactionsUrl(url = '') {
  if (typeof url !== 'string') return false;
  return (
    url.includes('creditkarma.com') &&
    (url.includes('/transactions') || url.includes('/credit/transactions'))
  );
}

/**
 * Check if the DOM signals a logged-in state (e.g. transaction list present).
 * @param {Object} state - Mock/real state object
 * @param {boolean} [state.hasTransactionList=false]
 * @param {boolean} [state.hasLoginForm=false]
 * @returns {boolean}
 */
function appearsLoggedIn(state = {}) {
  const { hasTransactionList = false, hasLoginForm = false } = state;
  return Boolean(hasTransactionList && !hasLoginForm);
}

/**
 * Check if the DOM signals a logged-out state (e.g. login form visible).
 * @param {Object} state - Mock/real state object
 * @param {boolean} [state.hasLoginForm=false]
 * @param {boolean} [state.hasTransactionList=false]
 * @returns {boolean}
 */
function appearsLoggedOut(state = {}) {
  const { hasLoginForm = false, hasTransactionList = false } = state;
  return Boolean(hasLoginForm || !hasTransactionList);
}

/**
 * Combined guard: safe to run extraction only when on CK transactions page and logged in.
 * @param {string} [url='']
 * @param {Object} [state={}]
 * @returns {boolean}
 */
function canRunExtraction(url = '', state = {}) {
  return isCreditKarmaTransactionsUrl(url) && appearsLoggedIn(state);
}

/**
 * Guard: should abort and export partial data (e.g. on logout detection).
 * @param {Object} state
 * @param {boolean} [state.detectedLogout=false]
 * @returns {boolean}
 */
function shouldAbortAndExport(state = {}) {
  return Boolean(state.detectedLogout);
}

module.exports = {
  isCreditKarmaTransactionsUrl,
  appearsLoggedIn,
  appearsLoggedOut,
  canRunExtraction,
  shouldAbortAndExport,
};
