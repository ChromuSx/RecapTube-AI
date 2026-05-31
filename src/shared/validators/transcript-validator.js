// transcript-validator.js - Transcript validation logic

import { TranscriptValidationError } from '../errors/index.js';

/**
 * TranscriptValidator - Validates transcript data
 */
export class TranscriptValidator {
  /**
   * Validate complete transcript object
   * @param {Object} transcript - Transcript to validate
   * @throws {TranscriptValidationError}
   */
  static validate(transcript) {
    if (!transcript || typeof transcript !== 'object') {
      throw new TranscriptValidationError(
        'Transcript must be an object',
        'transcript',
        transcript
      );
    }

    if (!transcript.text || typeof transcript.text !== 'string') {
      throw new TranscriptValidationError(
        'Transcript must contain text',
        'text',
        transcript.text
      );
    }

    if (transcript.text.trim().length === 0) {
      throw new TranscriptValidationError(
        'Transcript text cannot be empty',
        'text',
        transcript.text
      );
    }

    // Validate segments if present
    if (transcript.segments !== undefined) {
      this.validateSegments(transcript.segments);
    }

    return true;
  }

  /**
   * Validate transcript segments array
   * @param {Array} segments - Transcript segments
   * @throws {TranscriptValidationError}
   */
  static validateSegments(segments) {
    if (!Array.isArray(segments)) {
      throw new TranscriptValidationError(
        'Segments must be an array',
        'segments',
        segments
      );
    }

    if (segments.length === 0) {
      throw new TranscriptValidationError(
        'Segments array cannot be empty',
        'segments',
        segments
      );
    }

    segments.forEach((segment, index) => {
      this.validateSegment(segment, index);
    });

    return true;
  }

  /**
   * Validate individual transcript segment
   * @param {Object} segment - Segment to validate
   * @param {number} index - Segment index
   * @throws {TranscriptValidationError}
   */
  static validateSegment(segment, index) {
    if (!segment || typeof segment !== 'object') {
      throw new TranscriptValidationError(
        `Segment at index ${index} must be an object`,
        `segments[${index}]`,
        segment
      );
    }

    // Validate time
    if (segment.time !== undefined) {
      if (typeof segment.time !== 'number') {
        throw new TranscriptValidationError(
          `Segment at index ${index}: time must be a number`,
          `segments[${index}].time`,
          segment.time
        );
      }

      if (segment.time < 0) {
        throw new TranscriptValidationError(
          `Segment at index ${index}: time must be non-negative`,
          `segments[${index}].time`,
          segment.time
        );
      }
    }

    // Validate text
    if (segment.text !== undefined) {
      if (typeof segment.text !== 'string') {
        throw new TranscriptValidationError(
          `Segment at index ${index}: text must be a string`,
          `segments[${index}].text`,
          segment.text
        );
      }
    }

    return true;
  }

  /**
   * Validate transcript text format
   * @param {string} text - Transcript text
   * @throws {TranscriptValidationError}
   */
  static validateText(text) {
    if (typeof text !== 'string') {
      throw new TranscriptValidationError(
        'Transcript text must be a string',
        'text',
        text
      );
    }

    if (text.trim().length === 0) {
      throw new TranscriptValidationError(
        'Transcript text cannot be empty',
        'text',
        text
      );
    }

    // Check minimum length (at least 10 characters)
    if (text.length < 10) {
      throw new TranscriptValidationError(
        'Transcript text too short (minimum 10 characters)',
        'text',
        text
      );
    }

    return true;
  }

  /**
   * Validate video ID
   * @param {string} videoId - YouTube video ID
   * @throws {TranscriptValidationError}
   */
  static validateVideoId(videoId) {
    if (typeof videoId !== 'string') {
      throw new TranscriptValidationError(
        'Video ID must be a string',
        'videoId',
        videoId
      );
    }

    if (videoId.trim().length === 0) {
      throw new TranscriptValidationError(
        'Video ID cannot be empty',
        'videoId',
        videoId
      );
    }

    // YouTube video IDs are typically 11 characters
    if (videoId.length !== 11) {
      throw new TranscriptValidationError(
        'Video ID must be 11 characters',
        'videoId',
        videoId
      );
    }

    // Valid characters: alphanumeric, hyphen, underscore
    const validPattern = /^[a-zA-Z0-9_-]+$/;
    if (!validPattern.test(videoId)) {
      throw new TranscriptValidationError(
        'Video ID contains invalid characters',
        'videoId',
        videoId
      );
    }

    return true;
  }

  /**
   * Validate channel ID
   * @param {string} channelId - YouTube channel ID
   * @throws {TranscriptValidationError}
   */
  static validateChannelId(channelId) {
    if (typeof channelId !== 'string') {
      throw new TranscriptValidationError(
        'Channel ID must be a string',
        'channelId',
        channelId
      );
    }

    if (channelId.trim().length === 0) {
      throw new TranscriptValidationError(
        'Channel ID cannot be empty',
        'channelId',
        channelId
      );
    }

    // Channel IDs can be handles (@username) or UC IDs (UCxxxxxxxxxx)
    const isHandle = channelId.startsWith('@');
    const isUCId = channelId.startsWith('UC') && channelId.length === 24;

    if (!isHandle && !isUCId) {
      throw new TranscriptValidationError(
        'Channel ID must be a handle (@username) or UC ID (UC...)',
        'channelId',
        channelId
      );
    }

    return true;
  }

  /**
   * Sanitize transcript (normalize text, remove invalid segments)
   * @param {Object} transcript - Transcript to sanitize
   * @returns {Object} - Sanitized transcript
   */
  static sanitize(transcript) {
    if (!transcript || typeof transcript !== 'object') {
      return { text: '', segments: [] };
    }

    const sanitized = {
      text: (transcript.text || '').trim(),
      videoId: transcript.videoId || '',
      channelId: transcript.channelId || ''
    };

    // Sanitize segments if present
    if (Array.isArray(transcript.segments)) {
      sanitized.segments = transcript.segments
        .filter(segment => {
          return segment &&
                 typeof segment === 'object' &&
                 (segment.time === undefined || typeof segment.time === 'number') &&
                 (segment.text === undefined || typeof segment.text === 'string');
        })
        .map(segment => ({
          time: Math.max(0, segment.time || 0),
          text: (segment.text || '').trim()
        }));
    }

    return sanitized;
  }

  /**
   * Validate safe - returns null on failure
   * @param {Object} transcript - Transcript to validate
   * @returns {boolean|null}
   */
  static validateSafe(transcript) {
    try {
      this.validate(transcript);
      return true;
    } catch (error) {
      return null;
    }
  }

  /**
   * Check if transcript has sufficient content for analysis
   * @param {Object} transcript - Transcript to check
   * @param {number} minLength - Minimum text length
   * @returns {boolean}
   */
  static hasSufficientContent(transcript, minLength = 100) {
    if (!transcript || !transcript.text) {
      return false;
    }

    return transcript.text.trim().length >= minLength;
  }

  /**
   * Validate transcript format (DOM vs API)
   * @param {Array} transcriptArray - Array of transcript entries
   * @throws {TranscriptValidationError}
   */
  static validateFormat(transcriptArray) {
    if (!Array.isArray(transcriptArray)) {
      throw new TranscriptValidationError(
        'Transcript must be an array',
        'transcript',
        transcriptArray
      );
    }

    if (transcriptArray.length === 0) {
      throw new TranscriptValidationError(
        'Transcript array cannot be empty',
        'transcript',
        transcriptArray
      );
    }

    // Each entry should have time and text
    transcriptArray.forEach((entry, index) => {
      if (!entry || typeof entry !== 'object') {
        throw new TranscriptValidationError(
          `Entry at index ${index} must be an object`,
          `transcript[${index}]`,
          entry
        );
      }

      if (typeof entry.time !== 'number') {
        throw new TranscriptValidationError(
          `Entry at index ${index} must have numeric time`,
          `transcript[${index}].time`,
          entry.time
        );
      }

      if (typeof entry.text !== 'string') {
        throw new TranscriptValidationError(
          `Entry at index ${index} must have string text`,
          `transcript[${index}].text`,
          entry.text
        );
      }
    });

    return true;
  }
}
