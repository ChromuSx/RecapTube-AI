// index.js - Error module exports

export { BaseError } from './base-error.js';
export { APIError, APIKeyError, APITimeoutError, APIParseError } from './api-error.js';
export { StorageError, StorageQuotaError, CacheError } from './storage-error.js';
export { ValidationError, SegmentValidationError, SettingsValidationError, TranscriptValidationError } from './validation-error.js';
export { TranscriptError, TranscriptNotAvailableError, TranscriptExtractionError, TranscriptParseError } from './transcript-error.js';
export { ErrorHandler, globalErrorHandler } from './error-handler.js';
