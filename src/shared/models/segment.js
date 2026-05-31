// segment.js - Segment domain model

import { SegmentValidator } from '../validators/index.js';

/**
 * Segment - Represents a video segment to skip
 */
export class Segment {
  /**
   * @param {number} start - Start time in seconds
   * @param {number} end - End time in seconds
   * @param {string} category - Segment category
   * @param {string} description - Optional description
   * @param {number} confidence - AI confidence (0-1)
   */
  constructor(start, end, category, description = '', confidence = 1.0) {
    // Validate on construction
    SegmentValidator.validate({ start, end, category, description });

    this.start = start;
    this.end = end;
    this.category = category;
    this.description = description;
    this.confidence = confidence;
  }

  /**
   * Get segment duration in seconds
   * @returns {number}
   */
  getDuration() {
    return this.end - this.start;
  }

  /**
   * Get formatted duration (MM:SS)
   * @returns {string}
   */
  getFormattedDuration() {
    const duration = this.getDuration();
    const minutes = Math.floor(duration / 60);
    const seconds = Math.floor(duration % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  /**
   * Get formatted time range
   * @returns {string}
   */
  getTimeRange() {
    return `${this.formatTime(this.start)} - ${this.formatTime(this.end)}`;
  }

  /**
   * Format time as MM:SS
   * @param {number} seconds - Time in seconds
   * @returns {string}
   */
  formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Check if time is within this segment
   * @param {number} time - Current time in seconds
   * @param {number} buffer - Optional buffer in seconds
   * @returns {boolean}
   */
  contains(time, buffer = 0) {
    return time >= (this.start - buffer) && time < this.end;
  }

  /**
   * Check if this segment overlaps with another
   * @param {Segment} other - Other segment
   * @returns {boolean}
   */
  overlaps(other) {
    return this.start < other.end && this.end > other.start;
  }

  /**
   * Merge with another segment
   * @param {Segment} other - Segment to merge
   * @returns {Segment} - New merged segment
   */
  merge(other) {
    const start = Math.min(this.start, other.start);
    const end = Math.max(this.end, other.end);
    const category = this.category === other.category
      ? this.category
      : `${this.category} + ${other.category}`;
    const description = [this.description, other.description]
      .filter(d => d.length > 0)
      .join(' | ');
    const confidence = Math.min(this.confidence, other.confidence);

    return new Segment(start, end, category, description, confidence);
  }

  /**
   * Clone this segment
   * @returns {Segment}
   */
  clone() {
    return new Segment(
      this.start,
      this.end,
      this.category,
      this.description,
      this.confidence
    );
  }

  /**
   * Check if segment meets confidence threshold
   * @param {number} threshold - Minimum confidence
   * @returns {boolean}
   */
  meetsConfidenceThreshold(threshold) {
    return this.confidence >= threshold;
  }

  /**
   * Convert to plain object
   * @returns {Object}
   */
  toJSON() {
    return {
      start: this.start,
      end: this.end,
      category: this.category,
      description: this.description,
      confidence: this.confidence,
      duration: this.getDuration()
    };
  }

  /**
   * Create from plain object
   * @param {Object} data - Plain object data
   * @returns {Segment}
   */
  static fromJSON(data) {
    return new Segment(
      data.start,
      data.end,
      data.category,
      data.description || '',
      data.confidence || 1.0
    );
  }

  /**
   * Create from API response
   * @param {Object} data - API response data
   * @returns {Segment}
   */
  static fromAPI(data) {
    return new Segment(
      data.start,
      data.end,
      data.category,
      data.description || '',
      data.confidence || 1.0
    );
  }

  /**
   * Sort segments by start time
   * @param {Array<Segment>} segments - Segments to sort
   * @returns {Array<Segment>}
   */
  static sort(segments) {
    return segments.sort((a, b) => a.start - b.start);
  }

  /**
   * Merge overlapping segments
   * @param {Array<Segment>} segments - Segments to merge
   * @returns {Array<Segment>}
   */
  static mergeOverlapping(segments) {
    if (segments.length === 0) return [];

    const sorted = Segment.sort(segments);
    const merged = [sorted[0].clone()];

    for (let i = 1; i < sorted.length; i++) {
      const current = sorted[i];
      const lastMerged = merged[merged.length - 1];

      if (current.overlaps(lastMerged)) {
        merged[merged.length - 1] = lastMerged.merge(current);
      } else {
        merged.push(current.clone());
      }
    }

    return merged;
  }

  /**
   * Filter by confidence threshold
   * @param {Array<Segment>} segments - Segments to filter
   * @param {number} threshold - Minimum confidence
   * @returns {Array<Segment>}
   */
  static filterByConfidence(segments, threshold) {
    return segments.filter(s => s.meetsConfidenceThreshold(threshold));
  }

  /**
   * Get total duration of segments
   * @param {Array<Segment>} segments - Segments
   * @returns {number} - Total duration in seconds
   */
  static getTotalDuration(segments) {
    return segments.reduce((total, segment) => total + segment.getDuration(), 0);
  }

  /**
   * Group segments by category
   * @param {Array<Segment>} segments - Segments to group
   * @returns {Object} - Segments grouped by category
   */
  static groupByCategory(segments) {
    return segments.reduce((groups, segment) => {
      const category = segment.category;
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(segment);
      return groups;
    }, {});
  }
}
