// segment-validator.js - Segment validation logic

import { SegmentValidationError } from '../errors/index.js';

/**
 * SegmentValidator - Validates segment data
 */
export class SegmentValidator {
  /**
   * Validate a single segment
   * @param {Object} segment - Segment to validate
   * @throws {SegmentValidationError}
   */
  static validate(segment) {
    if (!segment || typeof segment !== 'object') {
      throw new SegmentValidationError('Segment must be an object', segment, 'segment');
    }

    this.validateStart(segment.start);
    this.validateEnd(segment.end, segment.start);
    this.validateCategory(segment.category);
    this.validateDescription(segment.description);

    return true;
  }

  /**
   * Validate start time
   * @param {number} start - Start time
   * @throws {SegmentValidationError}
   */
  static validateStart(start) {
    if (typeof start !== 'number') {
      throw new SegmentValidationError('Start must be a number', 'start', start);
    }

    if (start < 0) {
      throw new SegmentValidationError('Start must be non-negative', 'start', start);
    }

    if (!Number.isFinite(start)) {
      throw new SegmentValidationError('Start must be finite', 'start', start);
    }
  }

  /**
   * Validate end time
   * @param {number} end - End time
   * @param {number} start - Start time (for comparison)
   * @throws {SegmentValidationError}
   */
  static validateEnd(end, start) {
    if (typeof end !== 'number') {
      throw new SegmentValidationError('End must be a number', 'end', end);
    }

    if (end <= 0) {
      throw new SegmentValidationError('End must be positive', 'end', end);
    }

    if (!Number.isFinite(end)) {
      throw new SegmentValidationError('End must be finite', 'end', end);
    }

    if (start !== undefined && end <= start) {
      throw new SegmentValidationError(
        'End must be greater than start',
        'end',
        { start, end }
      );
    }
  }

  /**
   * Validate category
   * @param {string} category - Category
   * @throws {SegmentValidationError}
   */
  static validateCategory(category) {
    if (typeof category !== 'string') {
      throw new SegmentValidationError('Category must be a string', 'category', category);
    }

    if (category.trim().length === 0) {
      throw new SegmentValidationError('Category cannot be empty', 'category', category);
    }
  }

  /**
   * Validate description
   * @param {string} description - Description (optional)
   * @throws {SegmentValidationError}
   */
  static validateDescription(description) {
    if (description !== undefined && typeof description !== 'string') {
      throw new SegmentValidationError('Description must be a string', 'description', description);
    }
  }

  /**
   * Validate array of segments
   * @param {Array} segments - Segments array
   * @returns {boolean}
   * @throws {SegmentValidationError}
   */
  static validateArray(segments) {
    if (!Array.isArray(segments)) {
      throw new SegmentValidationError('Segments must be an array', 'segments', segments);
    }

    segments.forEach((segment, index) => {
      try {
        this.validate(segment);
      } catch (error) {
        throw new SegmentValidationError(
          `Invalid segment at index ${index}: ${error.message}`,
          segment,
          `segments[${index}]`
        );
      }
    });

    return true;
  }

  /**
   * Validate that segments don't overlap
   * @param {Array} segments - Segments array (must be sorted)
   * @returns {boolean}
   * @throws {SegmentValidationError}
   */
  static validateNoOverlap(segments) {
    this.validateArray(segments);

    for (let i = 1; i < segments.length; i++) {
      const prev = segments[i - 1];
      const current = segments[i];

      if (current.start < prev.end) {
        throw new SegmentValidationError(
          `Segments overlap at index ${i}`,
          { prev, current },
          `segments[${i}]`
        );
      }
    }

    return true;
  }

  /**
   * Sanitize segment (remove invalid fields, normalize values)
   * @param {Object} segment - Segment to sanitize
   * @returns {Object} - Sanitized segment
   */
  static sanitize(segment) {
    return {
      start: Math.max(0, Math.floor(segment.start || 0)),
      end: Math.max(1, Math.ceil(segment.end || 1)),
      category: (segment.category || 'Unknown').trim(),
      description: (segment.description || '').trim()
    };
  }

  /**
   * Try to validate, return null if invalid
   * @param {Object} segment - Segment to validate
   * @returns {Object|null} - Valid segment or null
   */
  static validateSafe(segment) {
    try {
      this.validate(segment);
      return segment;
    } catch (error) {
      return null;
    }
  }
}
