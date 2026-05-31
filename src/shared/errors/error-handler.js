// error-handler.js - Global error handler

import { BaseError } from './base-error.js';
import { APIError } from './api-error.js';

/**
 * ErrorHandler - Centralized error handling
 */
export class ErrorHandler {
  constructor(logger = null) {
    this.logger = logger;
    this.errorCallbacks = [];
  }

  /**
   * Register error callback
   * @param {Function} callback - Error callback
   */
  onError(callback) {
    this.errorCallbacks.push(callback);
  }

  /**
   * Handle error
   * @param {Error} error - Error to handle
   * @param {Object} context - Additional context
   */
  handle(error, context = {}) {
    // Convert to BaseError if needed
    const handledError = error instanceof BaseError
      ? error
      : this.wrapError(error, context);

    // Log error
    if (this.logger) {
      this.logError(handledError);
    } else {
      console.error('[ErrorHandler]', handledError);
    }

    // Notify callbacks
    this.errorCallbacks.forEach(callback => {
      try {
        callback(handledError);
      } catch (err) {
        console.error('Error in error callback:', err);
      }
    });

    return handledError;
  }

  /**
   * Wrap non-BaseError into BaseError
   * @param {Error} error - Original error
   * @param {Object} context - Context
   * @returns {BaseError}
   */
  wrapError(error, context = {}) {
    return new BaseError(
      error.message || 'Unknown error',
      'UNKNOWN_ERROR',
      {
        ...context,
        originalError: error.toString(),
        stack: error.stack
      }
    );
  }

  /**
   * Log error with appropriate level
   * @param {BaseError} error - Error to log
   */
  logError(error) {
    const severity = error.getSeverity();
    const logData = {
      ...error.toJSON(),
      userMessage: error.getUserMessage(),
      severity: severity,
      retryable: error.isRetryable()
    };

    if (this.logger) {
      switch (severity) {
        case 'critical':
          this.logger.error('Critical error occurred', logData);
          break;
        case 'error':
          this.logger.error('Error occurred', logData);
          break;
        case 'warning':
          this.logger.warn('Warning', logData);
          break;
        default:
          this.logger.info('Error info', logData);
      }
    }
  }

  /**
   * Handle async function with error handling
   * @param {Function} fn - Async function
   * @param {Object} context - Context
   * @returns {Promise}
   */
  async wrap(fn, context = {}) {
    try {
      return await fn();
    } catch (error) {
      throw this.handle(error, context);
    }
  }

  /**
   * Retry async function with exponential backoff
   * @param {Function} fn - Async function
   * @param {number} maxRetries - Max retry attempts
   * @param {number} baseDelay - Base delay in ms
   * @returns {Promise}
   */
  async retry(fn, maxRetries = 3, baseDelay = 1000) {
    let lastError;

    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = this.handle(error, { attempt: i + 1, maxRetries });

        // Only retry if error is retryable
        if (!lastError.isRetryable() || i === maxRetries - 1) {
          throw lastError;
        }

        // Exponential backoff
        const delay = baseDelay * Math.pow(2, i);
        if (this.logger) {
          this.logger.warn(`Retrying in ${delay}ms (attempt ${i + 1}/${maxRetries})`, {
            error: lastError.toJSON()
          });
        }

        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }

  /**
   * Get user-friendly error message
   * @param {Error} error - Error
   * @returns {string}
   */
  getUserMessage(error) {
    if (error instanceof BaseError) {
      return error.getUserMessage();
    }
    return 'An unexpected error occurred. Please try again.';
  }
}

// Global error handler instance
export const globalErrorHandler = new ErrorHandler();
