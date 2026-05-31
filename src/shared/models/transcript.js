// transcript.js - Transcript domain model

import { TranscriptValidator } from '../validators/index.js';

/**
 * Transcript - Represents a video transcript
 */
export class Transcript {
  /**
   * @param {string} text - Full transcript text
   * @param {string} videoId - YouTube video ID
   * @param {string} channelId - YouTube channel ID
   * @param {Array} segments - Optional transcript segments
   */
  constructor(text, videoId, channelId = '', segments = []) {
    // Validate on construction
    TranscriptValidator.validate({ text, segments });
    TranscriptValidator.validateVideoId(videoId);

    this.text = text.trim();
    this.videoId = videoId;
    this.channelId = channelId;
    this.segments = segments;
    this.extractedAt = new Date().toISOString();
  }

  /**
   * Get transcript word count
   * @returns {number}
   */
  getWordCount() {
    return this.text.split(/\s+/).filter(word => word.length > 0).length;
  }

  /**
   * Get transcript character count
   * @returns {number}
   */
  getCharCount() {
    return this.text.length;
  }

  /**
   * Get estimated reading time in minutes
   * @param {number} wordsPerMinute - Reading speed (default 200)
   * @returns {number}
   */
  getEstimatedReadingTime(wordsPerMinute = 200) {
    return Math.ceil(this.getWordCount() / wordsPerMinute);
  }

  /**
   * Check if transcript has sufficient content for analysis
   * @param {number} minWords - Minimum word count
   * @returns {boolean}
   */
  hasSufficientContent(minWords = 50) {
    return this.getWordCount() >= minWords;
  }

  /**
   * Get transcript excerpt
   * @param {number} maxLength - Maximum length
   * @returns {string}
   */
  getExcerpt(maxLength = 200) {
    if (this.text.length <= maxLength) {
      return this.text;
    }
    return this.text.substring(0, maxLength) + '...';
  }

  /**
   * Get segment at specific time
   * @param {number} time - Time in seconds
   * @returns {Object|null}
   */
  getSegmentAtTime(time) {
    return this.segments.find(segment => {
      return time >= segment.time &&
             (segment.end === undefined || time < segment.end);
    }) || null;
  }

  /**
   * Get segments in time range
   * @param {number} start - Start time
   * @param {number} end - End time
   * @returns {Array}
   */
  getSegmentsInRange(start, end) {
    return this.segments.filter(segment => {
      return segment.time >= start && segment.time < end;
    });
  }

  /**
   * Format for AI analysis
   * @returns {string}
   */
  formatForAI() {
    if (this.segments.length > 0) {
      // Format with timestamps if we have segments
      return this.segments
        .map(segment => `[${Math.floor(segment.time)}s] ${segment.text}`)
        .join('\n');
    }
    return this.text;
  }

  /**
   * Get metadata
   * @returns {Object}
   */
  getMetadata() {
    return {
      videoId: this.videoId,
      channelId: this.channelId,
      wordCount: this.getWordCount(),
      charCount: this.getCharCount(),
      segmentCount: this.segments.length,
      extractedAt: this.extractedAt,
      hasSufficientContent: this.hasSufficientContent()
    };
  }

  /**
   * Convert to plain object
   * @returns {Object}
   */
  toJSON() {
    return {
      text: this.text,
      videoId: this.videoId,
      channelId: this.channelId,
      segments: this.segments,
      extractedAt: this.extractedAt,
      metadata: this.getMetadata()
    };
  }

  /**
   * Create from plain object
   * @param {Object} data - Plain object data
   * @returns {Transcript}
   */
  static fromJSON(data) {
    const transcript = new Transcript(
      data.text,
      data.videoId,
      data.channelId || '',
      data.segments || []
    );

    if (data.extractedAt) {
      transcript.extractedAt = data.extractedAt;
    }

    return transcript;
  }

  /**
   * Create from DOM extraction
   * @param {Array} domSegments - Segments extracted from DOM
   * @param {string} videoId - Video ID
   * @param {string} channelId - Channel ID
   * @returns {Transcript}
   */
  static fromDOM(domSegments, videoId, channelId = '') {
    // Combine all text
    const text = domSegments.map(s => s.text).join(' ');

    // Create transcript with segments
    return new Transcript(text, videoId, channelId, domSegments);
  }

  /**
   * Create from API response
   * @param {Object} apiData - API response data
   * @param {string} videoId - Video ID
   * @param {string} channelId - Channel ID
   * @returns {Transcript}
   */
  static fromAPI(apiData, videoId, channelId = '') {
    // Parse API format (could be various formats)
    const segments = apiData.events || apiData.segments || [];
    const text = segments.map(s => s.segs?.[0]?.utf8 || s.text || '').join(' ');

    return new Transcript(text, videoId, channelId, segments);
  }

  /**
   * Merge multiple transcripts
   * @param {Array<Transcript>} transcripts - Transcripts to merge
   * @returns {Transcript}
   */
  static merge(transcripts) {
    if (transcripts.length === 0) {
      throw new Error('Cannot merge empty transcripts array');
    }

    const first = transcripts[0];
    const allText = transcripts.map(t => t.text).join(' ');
    const allSegments = transcripts.flatMap(t => t.segments);

    return new Transcript(
      allText,
      first.videoId,
      first.channelId,
      allSegments
    );
  }

  /**
   * Search for text in transcript
   * @param {string} query - Search query
   * @param {boolean} caseSensitive - Case sensitive search
   * @returns {Array} - Matches with positions
   */
  search(query, caseSensitive = false) {
    const text = caseSensitive ? this.text : this.text.toLowerCase();
    const searchQuery = caseSensitive ? query : query.toLowerCase();
    const matches = [];
    let position = 0;

    while ((position = text.indexOf(searchQuery, position)) !== -1) {
      matches.push({
        position,
        text: this.text.substring(position, position + query.length),
        context: this.text.substring(
          Math.max(0, position - 50),
          Math.min(this.text.length, position + query.length + 50)
        )
      });
      position += query.length;
    }

    return matches;
  }
}
