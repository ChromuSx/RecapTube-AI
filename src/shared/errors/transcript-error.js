// transcript-error.js - Transcript extraction errors

import { BaseError } from './base-error.js';

/**
 * TranscriptError - Transcript extraction errors
 */
export class TranscriptError extends BaseError {
  constructor(message, videoId, method = null) {
    super(message, 'TRANSCRIPT_ERROR', { videoId, method });
    this.videoId = videoId;
    this.method = method;
  }

  getUserMessage() {
    return 'Unable to extract transcript from this video.';
  }

  getSeverity() {
    return 'warning';
  }
}

/**
 * TranscriptNotAvailableError - Video has no transcript
 */
export class TranscriptNotAvailableError extends TranscriptError {
  constructor(videoId) {
    super('Transcript not available for this video', videoId);
  }

  getUserMessage() {
    return 'This video does not have subtitles/transcript available. The extension only works with videos that have captions.';
  }
}

/**
 * TranscriptExtractionError - Failed to extract transcript
 */
export class TranscriptExtractionError extends TranscriptError {
  constructor(message, videoId, method) {
    super(message, videoId, method);
  }

  isRetryable() {
    return true;
  }

  getUserMessage() {
    return 'Failed to extract transcript. Retrying with different method...';
  }
}

/**
 * TranscriptParseError - Failed to parse transcript data
 */
export class TranscriptParseError extends TranscriptError {
  constructor(message, videoId, data) {
    super(message, videoId);
    this.data = data;
  }

  getUserMessage() {
    return 'Transcript data is malformed. Unable to analyze this video.';
  }
}
