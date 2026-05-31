// api-error.js - API-related errors

import { BaseError } from './base-error.js';

/**
 * APIError - Errors related to API calls
 */
export class APIError extends BaseError {
  constructor(message, statusCode, responseData = null) {
    super(message, 'API_ERROR', {
      statusCode,
      responseData
    });

    this.statusCode = statusCode;
    this.responseData = responseData;
  }

  isRetryable() {
    // Retry on 5xx errors and some 4xx errors
    return this.statusCode >= 500 ||
           this.statusCode === 429 || // Rate limit
           this.statusCode === 408;   // Timeout
  }

  getUserMessage() {
    if (this.statusCode === 401) {
      return 'API key invalid or expired. Please check your configuration.';
    }
    if (this.statusCode === 429) {
      return 'Rate limit exceeded. Please try again later.';
    }
    if (this.statusCode >= 500) {
      return 'API service temporarily unavailable. Will retry automatically.';
    }
    return `API error: ${this.message}`;
  }

  getSeverity() {
    if (this.statusCode >= 500) return 'error';
    if (this.statusCode === 429) return 'warning';
    if (this.statusCode === 401) return 'critical';
    return 'error';
  }
}

/**
 * APIKeyError - API key configuration errors
 */
export class APIKeyError extends BaseError {
  constructor(message = 'API key not configured or invalid') {
    super(message, 'API_KEY_ERROR');
  }

  getUserMessage() {
    return 'Please configure a valid API key in the extension settings.';
  }

  getSeverity() {
    return 'critical';
  }
}

/**
 * APITimeoutError - Request timeout errors
 */
export class APITimeoutError extends BaseError {
  constructor(timeout) {
    super(`Request timed out after ${timeout}ms`, 'API_TIMEOUT', { timeout });
    this.timeout = timeout;
  }

  isRetryable() {
    return true;
  }

  getUserMessage() {
    return 'Request took too long. Retrying...';
  }

  getSeverity() {
    return 'warning';
  }
}

/**
 * APIParseError - Response parsing errors
 */
export class APIParseError extends BaseError {
  constructor(message, response) {
    super(message, 'API_PARSE_ERROR', { response });
    this.response = response;
  }

  getUserMessage() {
    return 'Unable to parse API response. The service may be experiencing issues.';
  }

  getSeverity() {
    return 'error';
  }
}
