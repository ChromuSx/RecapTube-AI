// openai-provider.js - OpenAI GPT provider implementation

import { AIProvider } from './base-provider.js';
import { APIError, APITimeoutError } from '../../errors/index.js';
import { CONFIG } from '../../config.js';

/**
 * OpenAIProvider - OpenAI GPT API implementation
 *
 * NOTE: the GPT-5.x family on the Chat Completions API requires
 * `max_completion_tokens` (not the legacy `max_tokens`) and only supports the
 * default temperature (1), so we omit `temperature` entirely.
 */
export class OpenAIProvider extends AIProvider {
  constructor(apiKey, config = {}) {
    super(apiKey, config);
    this.baseUrl = config.baseUrl || CONFIG.AI_PROVIDERS.OPENAI.ENDPOINT;
    this.version = config.version;
  }

  /**
   * Get provider name
   * @returns {string}
   */
  getName() {
    return 'openai';
  }

  /**
   * Get available models
   * @returns {Object}
   */
  getAvailableModels() {
    return CONFIG.AI_PROVIDERS.OPENAI.MODELS;
  }

  /**
   * Validate API key format
   * @param {string} apiKey - API key to validate
   * @returns {boolean}
   */
  static validateAPIKey(apiKey) {
    return typeof apiKey === 'string' && apiKey.startsWith('sk-') && apiKey.length > 20;
  }

  /**
   * Create request payload
   * @param {string} systemPrompt - System prompt
   * @param {string} userMessage - User message
   * @param {string} model - Model identifier
   * @returns {Object}
   */
  createPayload(systemPrompt, userMessage, model) {
    const modelId = CONFIG.AI_PROVIDERS.OPENAI.MODELS[model] || CONFIG.AI_PROVIDERS.OPENAI.MODELS.GPT_5_4_MINI;

    return {
      model: modelId,
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: userMessage
        }
      ],
      // GPT-5.x: legacy `max_tokens` is rejected; use `max_completion_tokens`.
      max_completion_tokens: 4096,
      response_format: { type: 'json_object' }
    };
  }

  /**
   * Send request to OpenAI API
   * @param {Object} payload - Request payload
   * @returns {Promise<Object>}
   */
  async sendRequest(payload) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new APIError(
          `OpenAI API error: ${response.status} ${response.statusText}`,
          response.status,
          errorData
        );
      }

      const data = await response.json();
      return data;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        throw new APITimeoutError('OpenAI', this.timeout);
      }

      throw error;
    }
  }

  /**
   * Parse OpenAI response
   * @param {Object} response - API response
   * @returns {Object}
   */
  parseResponse(response) {
    try {
      const content = response.choices[0].message.content;

      // Strip markdown code blocks if present
      let jsonText = content.trim();
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.replace(/```json\n?/, '').replace(/\n?```$/, '');
      } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/```\n?/, '').replace(/\n?```$/, '');
      }

      const parsed = JSON.parse(jsonText);
      return parsed;
    } catch (error) {
      throw new APIError(`Failed to parse OpenAI response: ${error.message}`, null, response);
    }
  }

  /**
   * Create test payload
   * @returns {Object}
   */
  createTestPayload() {
    return {
      model: CONFIG.AI_PROVIDERS.OPENAI.MODELS.GPT_5_4_MINI,
      messages: [
        {
          role: 'system',
          content: 'Test'
        },
        {
          role: 'user',
          content: 'Reply with {"status":"ok"}'
        }
      ],
      max_completion_tokens: 10,
      response_format: { type: 'json_object' }
    };
  }
}
