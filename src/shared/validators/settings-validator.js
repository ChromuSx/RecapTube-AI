// settings-validator.js - Settings validation logic

import { SettingsValidationError } from '../errors/index.js';
import { CONFIG } from '../config.js';

/**
 * SettingsValidator - Validates user settings
 */
export class SettingsValidator {
  /**
   * Validate complete settings object
   * @param {Object} settings - Settings to validate
   * @returns {boolean}
   * @throws {SettingsValidationError}
   */
  static validate(settings) {
    if (!settings || typeof settings !== 'object') {
      throw new SettingsValidationError('Settings must be an object', 'settings', settings);
    }

    // Validate boolean settings
    const booleanSettings = [
      'skipSponsors',
      'skipIntros',
      'skipOutros',
      'skipDonations',
      'skipSelfPromo',
      'enablePreview',
      'autoSkip'
    ];

    booleanSettings.forEach(key => {
      if (settings[key] !== undefined) {
        this.validateBoolean(key, settings[key]);
      }
    });

    // Validate numeric settings
    if (settings.skipBuffer !== undefined) {
      this.validateSkipBuffer(settings.skipBuffer);
    }

    return true;
  }

  /**
   * Validate boolean setting
   * @param {string} key - Setting key
   * @param {any} value - Value to validate
   * @throws {SettingsValidationError}
   */
  static validateBoolean(key, value) {
    if (typeof value !== 'boolean') {
      throw new SettingsValidationError(
        `Must be a boolean`,
        key,
        value
      );
    }
  }

  /**
   * Validate skip buffer
   * @param {number} value - Skip buffer value
   * @throws {SettingsValidationError}
   */
  static validateSkipBuffer(value) {
    if (typeof value !== 'number') {
      throw new SettingsValidationError(
        'Must be a number',
        'skipBuffer',
        value
      );
    }

    if (value < 0 || value > 10) {
      throw new SettingsValidationError(
        'Must be between 0 and 10 seconds',
        'skipBuffer',
        value
      );
    }
  }

  /**
   * Validate advanced settings
   * @param {Object} advancedSettings - Advanced settings
   * @returns {boolean}
   * @throws {SettingsValidationError}
   */
  static validateAdvanced(advancedSettings) {
    if (!advancedSettings || typeof advancedSettings !== 'object') {
      throw new SettingsValidationError(
        'Advanced settings must be an object',
        'advancedSettings',
        advancedSettings
      );
    }

    // Validate confidence threshold
    if (advancedSettings.confidenceThreshold !== undefined) {
      this.validateConfidenceThreshold(advancedSettings.confidenceThreshold);
    }

    // Validate AI provider
    if (advancedSettings.aiProvider !== undefined) {
      this.validateAIProvider(advancedSettings.aiProvider);
    }

    // Validate AI model
    if (advancedSettings.aiModel !== undefined) {
      this.validateAIModel(advancedSettings.aiModel, advancedSettings.aiProvider);
    }

    // Validate channel whitelist
    if (advancedSettings.channelWhitelist !== undefined) {
      this.validateChannelWhitelist(advancedSettings.channelWhitelist);
    }

    return true;
  }

  /**
   * Validate confidence threshold
   * @param {number} value - Confidence threshold
   * @throws {SettingsValidationError}
   */
  static validateConfidenceThreshold(value) {
    if (typeof value !== 'number') {
      throw new SettingsValidationError(
        'Must be a number',
        'confidenceThreshold',
        value
      );
    }

    if (value < 0 || value > 1) {
      throw new SettingsValidationError(
        'Must be between 0 and 1',
        'confidenceThreshold',
        value
      );
    }
  }

  /**
   * Validate AI provider
   * @param {string} value - AI provider
   * @throws {SettingsValidationError}
   */
  static validateAIProvider(value) {
    if (typeof value !== 'string') {
      throw new SettingsValidationError(
        'Must be a string',
        'aiProvider',
        value
      );
    }

    const validProviders = ['claude', 'openai'];
    if (!validProviders.includes(value)) {
      throw new SettingsValidationError(
        `Must be one of: ${validProviders.join(', ')}`,
        'aiProvider',
        value
      );
    }
  }

  /**
   * Validate AI model selection
   * @param {string} value - AI model
   * @param {string} provider - AI provider (optional)
   * @throws {SettingsValidationError}
   */
  static validateAIModel(value, provider = 'claude') {
    if (typeof value !== 'string') {
      throw new SettingsValidationError(
        'Must be a string',
        'aiModel',
        value
      );
    }

    const validModels = provider === 'openai'
      ? ['gpt-5.5', 'gpt-5.4-mini', 'gpt-5.4-nano']
      : ['haiku', 'sonnet'];

    if (!validModels.includes(value)) {
      throw new SettingsValidationError(
        `Must be one of: ${validModels.join(', ')}`,
        'aiModel',
        value
      );
    }
  }

  /**
   * Validate channel whitelist
   * @param {Array} value - Channel whitelist
   * @throws {SettingsValidationError}
   */
  static validateChannelWhitelist(value) {
    if (!Array.isArray(value)) {
      throw new SettingsValidationError(
        'Must be an array',
        'channelWhitelist',
        value
      );
    }

    value.forEach((channel, index) => {
      if (typeof channel !== 'string') {
        throw new SettingsValidationError(
          `Channel at index ${index} must be a string`,
          'channelWhitelist',
          channel
        );
      }

      if (channel.trim().length === 0) {
        throw new SettingsValidationError(
          `Channel at index ${index} cannot be empty`,
          'channelWhitelist',
          channel
        );
      }
    });
  }

  /**
   * Sanitize settings (apply defaults, remove invalid fields)
   * @param {Object} settings - Settings to sanitize
   * @returns {Object} - Sanitized settings
   */
  static sanitize(settings) {
    const defaults = CONFIG.DEFAULTS.SETTINGS;

    return {
      skipSponsors: typeof settings.skipSponsors === 'boolean'
        ? settings.skipSponsors
        : defaults.skipSponsors,

      skipIntros: typeof settings.skipIntros === 'boolean'
        ? settings.skipIntros
        : defaults.skipIntros,

      skipOutros: typeof settings.skipOutros === 'boolean'
        ? settings.skipOutros
        : defaults.skipOutros,

      skipDonations: typeof settings.skipDonations === 'boolean'
        ? settings.skipDonations
        : defaults.skipDonations,

      skipSelfPromo: typeof settings.skipSelfPromo === 'boolean'
        ? settings.skipSelfPromo
        : defaults.skipSelfPromo,

      skipBuffer: typeof settings.skipBuffer === 'number'
        ? Math.max(0, Math.min(10, settings.skipBuffer))
        : defaults.skipBuffer,

      enablePreview: typeof settings.enablePreview === 'boolean'
        ? settings.enablePreview
        : defaults.enablePreview,

      autoSkip: typeof settings.autoSkip === 'boolean'
        ? settings.autoSkip
        : defaults.autoSkip
    };
  }

  /**
   * Sanitize advanced settings
   * @param {Object} advancedSettings - Advanced settings
   * @returns {Object} - Sanitized advanced settings
   */
  static sanitizeAdvanced(advancedSettings) {
    const defaults = CONFIG.DEFAULTS.ADVANCED_SETTINGS;

    // Determine provider
    const aiProvider = ['claude', 'openai'].includes(advancedSettings.aiProvider)
      ? advancedSettings.aiProvider
      : defaults.aiProvider;

    // Determine valid models based on provider
    const validModels = aiProvider === 'openai'
      ? ['gpt-5.5', 'gpt-5.4-mini', 'gpt-5.4-nano']
      : ['haiku', 'sonnet'];

    return {
      confidenceThreshold: typeof advancedSettings.confidenceThreshold === 'number'
        ? Math.max(0, Math.min(1, advancedSettings.confidenceThreshold))
        : defaults.confidenceThreshold,

      aiProvider: aiProvider,

      aiModel: validModels.includes(advancedSettings.aiModel)
        ? advancedSettings.aiModel
        : (aiProvider === 'openai' ? 'gpt-5.4-mini' : 'haiku'),

      skipBuffer: typeof advancedSettings.skipBuffer === 'number'
        ? Math.max(0, Math.min(10, advancedSettings.skipBuffer))
        : defaults.skipBuffer,

      channelWhitelist: Array.isArray(advancedSettings.channelWhitelist)
        ? advancedSettings.channelWhitelist.filter(c => typeof c === 'string' && c.trim().length > 0)
        : defaults.channelWhitelist
    };
  }
}
