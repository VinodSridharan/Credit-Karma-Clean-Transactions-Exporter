/**
 * TxVault safety caps – pacing, limits, and rate control
 */

/** Default max scroll iterations before forcing exit */
const DEFAULT_MAX_SCROLL_ITERATIONS = 500;

/** Default min delay (ms) between scroll actions */
const DEFAULT_MIN_DELAY_MS = 800;

/**
 * Check if scroll count is within safety cap.
 * @param {number} current - Current scroll count
 * @param {number} [max=DEFAULT_MAX_SCROLL_ITERATIONS] - Max allowed
 * @returns {boolean}
 */
function withinScrollCap(current, max = DEFAULT_MAX_SCROLL_ITERATIONS) {
  return typeof current === 'number' && current >= 0 && current < max;
}

/**
 * Check if we've hit the scroll cap (should stop).
 * @param {number} current
 * @param {number} [max=DEFAULT_MAX_SCROLL_ITERATIONS]
 * @returns {boolean}
 */
function hitScrollCap(current, max = DEFAULT_MAX_SCROLL_ITERATIONS) {
  return typeof current === 'number' && current >= max;
}

/**
 * Compute next delay for pacing, respecting minimum.
 * @param {number} [baseMs=1000]
 * @param {number} [minMs=DEFAULT_MIN_DELAY_MS]
 * @returns {number}
 */
function getPacingDelay(baseMs = 1000, minMs = DEFAULT_MIN_DELAY_MS) {
  const ms = typeof baseMs === 'number' ? baseMs : 1000;
  const min = typeof minMs === 'number' ? minMs : DEFAULT_MIN_DELAY_MS;
  return Math.max(ms, min);
}

/**
 * Check if transaction count is within a reasonable export cap.
 * @param {number} count
 * @param {number} [max=50000]
 * @returns {boolean}
 */
function withinTransactionCap(count, max = 50000) {
  return typeof count === 'number' && count >= 0 && count <= max;
}

module.exports = {
  DEFAULT_MAX_SCROLL_ITERATIONS,
  DEFAULT_MIN_DELAY_MS,
  withinScrollCap,
  hitScrollCap,
  getPacingDelay,
  withinTransactionCap,
};
