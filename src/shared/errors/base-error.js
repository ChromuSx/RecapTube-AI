// base-error.js - Base error class for custom errors

/**
 * BaseError - Abstract base class for all custom errors
 */
export class BaseError extends Error {
  /**
   * @param {string} message - Error message
   * @param {string} code - Error code
   * @param {Object} context - Additional context
   */
  constructor(message, code, context = {}) {
    super(message);

    this.name = this.constructor.name;
    this.code = code;
    this.context = context;
    this.timestamp = new Date().toISOString();

    // Maintains proper stack trace for where our error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Get error as JSON object
   * @returns {Object}
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context,
      timestamp: this.timestamp,
      stack: this.stack
    };
  }

  /**
   * Get user-friendly message
   * @returns {string}
   */
  getUserMessage() {
    return this.message;
  }

  /**
   * Check if error is retryable
   * @returns {boolean}
   */
  isRetryable() {
    return false;
  }

  /**
   * Get severity level
   * @returns {string}
   */
  getSeverity() {
    return 'error';
  }
}
