// analysis-result.js - Analysis result domain model

import { Segment } from './segment.js';

/**
 * AnalysisResult - Represents the result of AI video analysis
 */
export class AnalysisResult {
  /**
   * @param {string} videoId - Video ID
   * @param {Array<Segment>} segments - Detected segments
   * @param {Object} metadata - Analysis metadata
   */
  constructor(videoId, segments = [], metadata = {}) {
    this.videoId = videoId;
    this.segments = segments;
    this.metadata = {
      analyzedAt: new Date().toISOString(),
      model: metadata.model || 'unknown',
      processingTime: metadata.processingTime || 0,
      transcriptLength: metadata.transcriptLength || 0,
      ...metadata
    };
  }

  /**
   * Get segment count
   * @returns {number}
   */
  getSegmentCount() {
    return this.segments.length;
  }

  /**
   * Get total skip duration
   * @returns {number}
   */
  getTotalSkipDuration() {
    return Segment.getTotalDuration(this.segments);
  }

  /**
   * Get formatted skip duration
   * @returns {string}
   */
  getFormattedSkipDuration() {
    const duration = this.getTotalSkipDuration();
    const minutes = Math.floor(duration / 60);
    const seconds = Math.floor(duration % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  /**
   * Get segments by category
   * @returns {Object}
   */
  getSegmentsByCategory() {
    return Segment.groupByCategory(this.segments);
  }

  /**
   * Get category counts
   * @returns {Object}
   */
  getCategoryCounts() {
    const groups = this.getSegmentsByCategory();
    return Object.keys(groups).reduce((counts, category) => {
      counts[category] = groups[category].length;
      return counts;
    }, {});
  }

  /**
   * Check if analysis is empty
   * @returns {boolean}
   */
  isEmpty() {
    return this.segments.length === 0;
  }

  /**
   * Check if analysis has segments
   * @returns {boolean}
   */
  hasSegments() {
    return this.segments.length > 0;
  }

  /**
   * Filter segments by confidence
   * @param {number} threshold - Minimum confidence
   * @returns {AnalysisResult}
   */
  filterByConfidence(threshold) {
    const filtered = Segment.filterByConfidence(this.segments, threshold);
    return new AnalysisResult(this.videoId, filtered, this.metadata);
  }

  /**
   * Merge overlapping segments
   * @returns {AnalysisResult}
   */
  mergeOverlapping() {
    const merged = Segment.mergeOverlapping(this.segments);
    return new AnalysisResult(this.videoId, merged, this.metadata);
  }

  /**
   * Get segments for enabled categories
   * @param {Settings} settings - User settings
   * @returns {Array<Segment>}
   */
  getEnabledSegments(settings) {
    return this.segments.filter(segment => {
      return settings.shouldSkipCategory(segment.category);
    });
  }

  /**
   * Get analysis summary
   * @returns {Object}
   */
  getSummary() {
    const categoryCounts = this.getCategoryCounts();

    return {
      videoId: this.videoId,
      segmentCount: this.getSegmentCount(),
      totalDuration: this.getTotalSkipDuration(),
      formattedDuration: this.getFormattedSkipDuration(),
      categories: categoryCounts,
      analyzedAt: this.metadata.analyzedAt,
      model: this.metadata.model,
      processingTime: this.metadata.processingTime
    };
  }

  /**
   * Check if analysis is stale
   * @param {number} maxAgeMs - Maximum age in milliseconds
   * @returns {boolean}
   */
  isStale(maxAgeMs = 30 * 24 * 60 * 60 * 1000) { // 30 days default
    const analyzedAt = new Date(this.metadata.analyzedAt).getTime();
    const now = Date.now();
    return (now - analyzedAt) > maxAgeMs;
  }

  /**
   * Get age in days
   * @returns {number}
   */
  getAgeInDays() {
    const analyzedAt = new Date(this.metadata.analyzedAt).getTime();
    const now = Date.now();
    return Math.floor((now - analyzedAt) / (24 * 60 * 60 * 1000));
  }

  /**
   * Convert to plain object
   * @returns {Object}
   */
  toJSON() {
    return {
      videoId: this.videoId,
      segments: this.segments.map(s => s.toJSON()),
      metadata: this.metadata,
      summary: this.getSummary()
    };
  }

  /**
   * Create from plain object
   * @param {Object} data - Plain object data
   * @returns {AnalysisResult}
   */
  static fromJSON(data) {
    const segments = (data.segments || []).map(s => Segment.fromJSON(s));
    return new AnalysisResult(data.videoId, segments, data.metadata || {});
  }

  /**
   * Create from API response
   * @param {string} videoId - Video ID
   * @param {Object} apiResponse - API response
   * @param {Object} metadata - Additional metadata
   * @returns {AnalysisResult}
   */
  static fromAPI(videoId, apiResponse, metadata = {}) {
    const segments = (apiResponse.segments || []).map(s => Segment.fromAPI(s));
    return new AnalysisResult(videoId, segments, {
      ...metadata,
      rawResponse: apiResponse
    });
  }

  /**
   * Create empty result
   * @param {string} videoId - Video ID
   * @returns {AnalysisResult}
   */
  static createEmpty(videoId) {
    return new AnalysisResult(videoId, [], {
      empty: true,
      reason: 'No segments detected'
    });
  }

  /**
   * Merge multiple results
   * @param {Array<AnalysisResult>} results - Results to merge
   * @returns {AnalysisResult}
   */
  static merge(results) {
    if (results.length === 0) {
      throw new Error('Cannot merge empty results array');
    }

    const first = results[0];
    const allSegments = results.flatMap(r => r.segments);
    const merged = Segment.mergeOverlapping(allSegments);

    return new AnalysisResult(first.videoId, merged, {
      merged: true,
      sourceCount: results.length,
      models: results.map(r => r.metadata.model)
    });
  }
}
