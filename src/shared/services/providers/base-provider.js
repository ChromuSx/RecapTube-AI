// base-provider.js - Abstract base class for AI providers

import { APIKeyError } from '../../errors/index.js';
import { logger } from '../../logger/index.js';

/**
 * Abstract AIProvider base class
 * All AI providers must extend this class
 */
export class AIProvider {
  constructor(apiKey, config = {}) {
    if (this.constructor === AIProvider) {
      throw new Error('AIProvider is an abstract class and cannot be instantiated directly');
    }

    if (!apiKey || apiKey.length < 20) {
      throw new APIKeyError('Valid API key required');
    }

    this.apiKey = apiKey;
    this.config = config;
    this.logger = logger.child(`${this.constructor.name}`);
    this.timeout = config.timeout || 60000; // 60 seconds default
  }

  /**
   * Get provider name
   * @returns {string}
   */
  getName() {
    throw new Error('getName() must be implemented by subclass');
  }

  /**
   * Get available models for this provider
   * @returns {Object} Map of model keys to model IDs
   */
  getAvailableModels() {
    throw new Error('getAvailableModels() must be implemented by subclass');
  }

  /**
   * Validate API key format for this provider
   * @param {string} apiKey - API key to validate
   * @returns {boolean}
   */
  static validateAPIKey(apiKey) {
    throw new Error('validateAPIKey() must be implemented by subclass');
  }

  /**
   * Create request payload for this provider
   * @param {string} systemPrompt - System prompt
   * @param {string} userMessage - User message
   * @param {string} model - Model identifier
   * @returns {Object} Provider-specific payload
   */
  createPayload(systemPrompt, userMessage, model) {
    throw new Error('createPayload() must be implemented by subclass');
  }

  /**
   * Send request to AI API
   * @param {Object} payload - Request payload
   * @returns {Promise<Object>} API response
   */
  async sendRequest(payload) {
    throw new Error('sendRequest() must be implemented by subclass');
  }

  /**
   * Parse AI response into standard format
   * @param {Object} response - Provider-specific response
   * @returns {Object} Parsed response with segments array
   */
  parseResponse(response) {
    throw new Error('parseResponse() must be implemented by subclass');
  }

  /**
   * Test API connection
   * @returns {Promise<boolean>}
   */
  async testConnection() {
    try {
      const payload = this.createTestPayload();
      await this.sendRequest(payload);
      return true;
    } catch (error) {
      this.logger.error('Connection test failed', { error: error.message });
      return false;
    }
  }

  /**
   * Create test payload (can be overridden)
   * @returns {Object}
   */
  createTestPayload() {
    throw new Error('createTestPayload() must be implemented by subclass');
  }
}
