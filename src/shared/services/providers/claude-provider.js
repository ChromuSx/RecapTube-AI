// claude-provider.js - Anthropic Claude AI provider

import { AIProvider } from './base-provider.js';
import { APIError, APITimeoutError } from '../../errors/index.js';

/**
 * ClaudeProvider - Anthropic Claude implementation
 */
export class ClaudeProvider extends AIProvider {
  constructor(apiKey, config = {}) {
    super(apiKey, config);
    this.baseUrl = config.baseUrl || 'https://api.anthropic.com/v1/messages';
    this.version = config.version || '2023-06-01';
  }

  /**
   * Get provider name
   * @returns {string}
   */
  getName() {
    return 'claude';
  }

  /**
   * Get available models
   * @returns {Object}
   */
  getAvailableModels() {
    return {
      'haiku': 'claude-haiku-4-5-20251001',
      'sonnet': 'claude-sonnet-4-6'
    };
  }

  /**
   * Validate Claude API key format
   * @param {string} apiKey - API key to validate
   * @returns {boolean}
   */
  static validateAPIKey(apiKey) {
    if (!apiKey || typeof apiKey !== 'string') {
      return false;
    }

    // Claude API keys start with 'sk-ant-'
    if (!apiKey.startsWith('sk-ant-')) {
      return false;
    }

    // Minimum length check
    if (apiKey.length < 20) {
      return false;
    }

    return true;
  }

  /**
   * Create request payload for Claude API
   * @param {string} systemPrompt - System prompt
   * @param {string} userMessage - User message
   * @param {string} model - Model identifier (haiku or sonnet)
   * @returns {Object}
   */
  createPayload(systemPrompt, userMessage, model) {
    const models = this.getAvailableModels();
    const modelId = models[model] || models['haiku'];

    return {
      model: modelId,
      max_tokens: 4096,
      temperature: 0.3,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: userMessage
        }
      ]
    };
  }

  /**
   * Send request to Claude API
   * @param {Object} payload - Request payload
   * @returns {Promise<Object>}
   */
  async sendRequest(payload) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      this.logger.debug('Sending request to Claude API', { model: payload.model });

      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': this.version,
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new APIError(
          errorData.error?.message || `Claude API request failed: ${response.status}`,
          response.status,
          errorData
        );
      }

      const data = await response.json();
      return data;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        throw new APITimeoutError(this.timeout);
      }

      throw error;
    }
  }

  /**
   * Parse Claude API response
   * @param {Object} response - Claude API response
   * @returns {Object}
   */
  parseResponse(response) {
    try {
      const textContent = response.content.find(c => c.type === 'text');
      if (!textContent) {
        throw new Error('No text content in Claude response');
      }

      // Extract JSON from response
      let jsonText = textContent.text.trim();

      // Remove markdown code blocks if present
      jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '');

      // Parse JSON
      const parsed = JSON.parse(jsonText);

      return parsed;
    } catch (error) {
      this.logger.error('Failed to parse Claude response', {
        error: error.message,
        response: JSON.stringify(response).substring(0, 200)
      });
      throw new APIError('Failed to parse Claude response', 0, { originalError: error.message });
    }
  }

  /**
   * Create test payload
   * @returns {Object}
   */
  createTestPayload() {
    return {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 10,
      messages: [
        {
          role: 'user',
          content: 'Hello'
        }
      ]
    };
  }
}
