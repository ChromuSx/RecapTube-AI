// validation-error.js - Validation errors

import { BaseError } from './base-error.js';

/**
 * ValidationError - Data validation errors
 */
export class ValidationError extends BaseError {
  constructor(message, field, value, constraints = {}) {
    super(message, 'VALIDATION_ERROR', { field, value, constraints });
    this.field = field;
    this.value = value;
    this.constraints = constraints;
  }

  getUserMessage() {
    return `Invalid ${this.field}: ${this.message}`;
  }

  getSeverity() {
    return 'warning';
  }
}

/**
 * SegmentValidationError - Segment-specific validation errors
 */
export class SegmentValidationError extends ValidationError {
  constructor(message, segment, field) {
    super(message, field, segment);
    this.segment = segment;
  }

  getUserMessage() {
    return `Invalid segment ${this.field}: ${this.message}`;
  }
}

/**
 * SettingsValidationError - Settings validation errors
 */
export class SettingsValidationError extends ValidationError {
  constructor(message, settingKey, value) {
    super(message, settingKey, value);
  }

  getUserMessage() {
    return `Invalid setting "${this.field}": ${this.message}`;
  }
}

/**
 * TranscriptValidationError - Transcript validation errors
 */
export class TranscriptValidationError extends ValidationError {
  constructor(message) {
    super(message, 'transcript', null);
  }

  getUserMessage() {
    return `Invalid transcript: ${this.message}`;
  }
}
