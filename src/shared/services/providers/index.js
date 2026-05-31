// index.js - AI Providers export

import { AIProvider } from './base-provider.js';
import { ClaudeProvider } from './claude-provider.js';
import { OpenAIProvider } from './openai-provider.js';

export { AIProvider, ClaudeProvider, OpenAIProvider };

/**
 * Create AI provider instance based on type
 * @param {string} providerType - Provider type ('claude' or 'openai')
 * @param {string} apiKey - API key
 * @param {Object} config - Provider configuration
 * @returns {AIProvider}
 */
export function createProvider(providerType, apiKey, config = {}) {
  const providers = {
    'claude': () => new ClaudeProvider(apiKey, config),
    'openai': () => new OpenAIProvider(apiKey, config)
  };

  const providerFactory = providers[providerType.toLowerCase()];

  if (!providerFactory) {
    throw new Error(`Unknown provider type: ${providerType}. Available: ${Object.keys(providers).join(', ')}`);
  }

  return providerFactory();
}

/**
 * Validate API key for specific provider
 * @param {string} providerType - Provider type
 * @param {string} apiKey - API key to validate
 * @returns {boolean}
 */
export function validateProviderAPIKey(providerType, apiKey) {
  const validators = {
    'claude': () => ClaudeProvider.validateAPIKey(apiKey),
    'openai': () => OpenAIProvider.validateAPIKey(apiKey)
  };

  const validator = validators[providerType.toLowerCase()];

  if (!validator) {
    return false;
  }

  return validator();
}
