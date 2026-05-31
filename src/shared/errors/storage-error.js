// storage-error.js - Storage-related errors

import { BaseError } from './base-error.js';

/**
 * StorageError - Errors related to storage operations
 */
export class StorageError extends BaseError {
  constructor(message, operation, key = null) {
    super(message, 'STORAGE_ERROR', { operation, key });
    this.operation = operation;
    this.key = key;
  }

  getUserMessage() {
    return `Storage operation failed: ${this.operation}`;
  }
}

/**
 * StorageQuotaError - Storage quota exceeded
 */
export class StorageQuotaError extends BaseError {
  constructor(used, available) {
    super('Storage quota exceeded', 'STORAGE_QUOTA_ERROR', { used, available });
    this.used = used;
    this.available = available;
  }

  getUserMessage() {
    return 'Storage is full. Please clear some cache to continue.';
  }

  getSeverity() {
    return 'warning';
  }
}

/**
 * CacheError - Cache-specific errors
 */
export class CacheError extends BaseError {
  constructor(message, cacheKey) {
    super(message, 'CACHE_ERROR', { cacheKey });
    this.cacheKey = cacheKey;
  }

  isRetryable() {
    return true;
  }

  getUserMessage() {
    return 'Cache operation failed. Data will be reloaded.';
  }

  getSeverity() {
    return 'warning';
  }
}
