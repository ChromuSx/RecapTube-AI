// openai-provider.js - OpenAI AI provider

import { AIProvider } from './base-provider.js';
import { APIError, APITimeoutError } from '../../errors/index.js';

/**
 * OpenAIProvider - OpenAI implementation
 */
export class OpenAIProvider extends AIProvider {
  constructor(apiKey, config = {}) {
    super(apiKey, config);
    this.baseUrl = config.baseUrl || 'https://api.openai.com/v1/chat/completions';
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
    return {
      'gpt-5.5': 'gpt-5.5',
      'gpt-5.4-mini': 'gpt-5.4-mini',
      'gpt-5.4-nano': 'gpt-5.4-nano'
    };
  }

  /**
   * Validate OpenAI API key format
   * @param {string} apiKey - API key to validate
   * @returns {boolean}
   */
  static validateAPIKey(apiKey) {
    if (!apiKey || typeof apiKey !== 'string') {
      return false;
    }

    // OpenAI API keys start with 'sk-' (but not 'sk-ant-' which is Claude)
    if (!apiKey.startsWith('sk-') || apiKey.startsWith('sk-ant-')) {
      return false;
    }

    // Minimum length check
    if (apiKey.length < 20) {
      return false;
    }

    return true;
  }

  /**
   * Create request payload for OpenAI API
   * @param {string} systemPrompt - System prompt
   * @param {string} userMessage - User message
   * @param {string} model - Model identifier
   * @returns {Object}
   */
  createPayload(systemPrompt, userMessage, model) {
    const models = this.getAvailableModels();
    const modelId = models[model] || models['gpt-5.4-mini'];

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
      temperature: 0.3,
      max_tokens: 4096,
      response_format: { type: "json_object" }
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
      this.logger.debug('Sending request to OpenAI API', { model: payload.model });

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
          errorData.error?.message || `OpenAI API request failed: ${response.status}`,
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
   * Parse OpenAI API response
   * @param {Object} response - OpenAI API response
   * @returns {Object}
   */
  parseResponse(response) {
    try {
      // OpenAI returns response in choices[0].message.content
      const messageContent = response.choices?.[0]?.message?.content;

      if (!messageContent) {
        throw new Error('No message content in OpenAI response');
      }

      // Parse the JSON content
      let jsonText = messageContent.trim();

      // Remove markdown code blocks if present
      jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '');

      // Parse JSON
      const parsed = JSON.parse(jsonText);

      return parsed;
    } catch (error) {
      this.logger.error('Failed to parse OpenAI response', {
        error: error.message,
        response: JSON.stringify(response).substring(0, 200)
      });
      throw new APIError('Failed to parse OpenAI response', 0, { originalError: error.message });
    }
  }

  /**
   * Create test payload
   * @returns {Object}
   */
  createTestPayload() {
    return {
      model: 'gpt-5.4-mini',
      messages: [
        {
          role: 'user',
          content: 'Hello'
        }
      ],
      max_tokens: 10
    };
  }
}
