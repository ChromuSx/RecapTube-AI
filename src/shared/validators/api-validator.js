// api-validator.js - API response validation logic

import { ValidationError, APIParseError } from '../errors/index.js';

/**
 * APIValidator - Validates API responses
 */
export class APIValidator {
  /**
   * Validate AI response structure
   * @param {Object} response - API response to validate
   * @throws {APIParseError}
   */
  static validateAIResponse(response) {
    if (!response || typeof response !== 'object') {
      throw new APIParseError('Response must be an object', response);
    }

    if (!response.content || !Array.isArray(response.content)) {
      throw new APIParseError('Response must contain content array', response);
    }

    const textContent = response.content.find(c => c.type === 'text');
    if (!textContent || !textContent.text) {
      throw new APIParseError('Response must contain text content', response);
    }

    return true;
  }

  /**
   * Validate parsed segments from AI
   * @param {Object} parsed - Parsed response
   * @throws {APIParseError}
   */
  static validateParsedResponse(parsed) {
    if (!parsed || typeof parsed !== 'object') {
      throw new APIParseError('Parsed response must be an object', parsed);
    }

    if (!parsed.segments || !Array.isArray(parsed.segments)) {
      throw new APIParseError('Parsed response must contain segments array', parsed);
    }

    // Validate each segment structure
    parsed.segments.forEach((segment, index) => {
      if (!segment || typeof segment !== 'object') {
        throw new APIParseError(
          `Segment at index ${index} must be an object`,
          segment
        );
      }

      this.validateSegmentStructure(segment, index);
    });

    return true;
  }

  /**
   * Validate individual segment structure from AI
   * @param {Object} segment - Segment to validate
   * @param {number} index - Segment index
   * @throws {APIParseError}
   */
  static validateSegmentStructure(segment, index) {
    const requiredFields = ['start', 'end', 'category'];

    requiredFields.forEach(field => {
      if (segment[field] === undefined) {
        throw new APIParseError(
          `Segment at index ${index} missing required field: ${field}`,
          segment
        );
      }
    });

    // Validate types
    if (typeof segment.start !== 'number') {
      throw new APIParseError(
        `Segment at index ${index}: start must be a number`,
        segment
      );
    }

    if (typeof segment.end !== 'number') {
      throw new APIParseError(
        `Segment at index ${index}: end must be a number`,
        segment
      );
    }

    if (typeof segment.category !== 'string') {
      throw new APIParseError(
        `Segment at index ${index}: category must be a string`,
        segment
      );
    }

    // Validate optional fields
    if (segment.confidence !== undefined && typeof segment.confidence !== 'number') {
      throw new APIParseError(
        `Segment at index ${index}: confidence must be a number`,
        segment
      );
    }

    if (segment.description !== undefined && typeof segment.description !== 'string') {
      throw new APIParseError(
        `Segment at index ${index}: description must be a string`,
        segment
      );
    }

    // Validate ranges
    if (segment.start < 0) {
      throw new APIParseError(
        `Segment at index ${index}: start must be non-negative`,
        segment
      );
    }

    if (segment.end <= segment.start) {
      throw new APIParseError(
        `Segment at index ${index}: end must be greater than start`,
        segment
      );
    }

    if (segment.confidence !== undefined && (segment.confidence < 0 || segment.confidence > 1)) {
      throw new APIParseError(
        `Segment at index ${index}: confidence must be between 0 and 1`,
        segment
      );
    }
  }

  /**
   * Validate API request payload
   * @param {Object} payload - Request payload
   * @throws {ValidationError}
   */
  static validateRequestPayload(payload) {
    if (!payload || typeof payload !== 'object') {
      throw new ValidationError('Payload must be an object', 'payload', payload);
    }

    if (!payload.model || typeof payload.model !== 'string') {
      throw new ValidationError('Payload must contain valid model', 'model', payload.model);
    }

    if (!payload.messages || !Array.isArray(payload.messages)) {
      throw new ValidationError('Payload must contain messages array', 'messages', payload.messages);
    }

    if (payload.messages.length === 0) {
      throw new ValidationError('Messages array cannot be empty', 'messages', payload.messages);
    }

    // Validate each message
    payload.messages.forEach((message, index) => {
      if (!message.role || typeof message.role !== 'string') {
        throw new ValidationError(
          `Message at index ${index} must have role`,
          'role',
          message
        );
      }

      if (!message.content || typeof message.content !== 'string') {
        throw new ValidationError(
          `Message at index ${index} must have content`,
          'content',
          message
        );
      }
    });

    // Validate max_tokens
    if (payload.max_tokens !== undefined) {
      if (typeof payload.max_tokens !== 'number' || payload.max_tokens <= 0) {
        throw new ValidationError(
          'max_tokens must be a positive number',
          'max_tokens',
          payload.max_tokens
        );
      }
    }

    // Validate temperature
    if (payload.temperature !== undefined) {
      if (typeof payload.temperature !== 'number' ||
          payload.temperature < 0 ||
          payload.temperature > 1) {
        throw new ValidationError(
          'temperature must be between 0 and 1',
          'temperature',
          payload.temperature
        );
      }
    }

    return true;
  }

  /**
   * Sanitize API response (remove invalid segments)
   * @param {Array} segments - Segments to sanitize
   * @param {number} confidenceThreshold - Minimum confidence
   * @returns {Array} - Sanitized segments
   */
  static sanitizeSegments(segments, confidenceThreshold = 0) {
    if (!Array.isArray(segments)) {
      return [];
    }

    return segments.filter(segment => {
      // Remove invalid segments
      if (!segment || typeof segment !== 'object') {
        return false;
      }

      // Must have required fields
      if (typeof segment.start !== 'number' ||
          typeof segment.end !== 'number' ||
          typeof segment.category !== 'string') {
        return false;
      }

      // Valid time range
      if (segment.start < 0 || segment.end <= segment.start) {
        return false;
      }

      // Check confidence threshold
      if (segment.confidence !== undefined && segment.confidence < confidenceThreshold) {
        return false;
      }

      return true;
    });
  }

  /**
   * Validate safe - returns null on failure
   * @param {Object} response - Response to validate
   * @returns {boolean|null}
   */
  static validateSafe(response) {
    try {
      this.validateAIResponse(response);
      return true;
    } catch (error) {
      return null;
    }
  }
}
