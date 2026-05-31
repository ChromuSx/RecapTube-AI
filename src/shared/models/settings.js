// settings.js - Settings domain model

import { SettingsValidator } from '../validators/index.js';
import { CONFIG } from '../config.js';

/**
 * Settings - Represents user settings
 */
export class Settings {
  /**
   * @param {Object} settings - Settings object
   */
  constructor(settings = {}) {
    // Validate and sanitize
    const sanitized = SettingsValidator.sanitize(settings);

    this.skipSponsors = sanitized.skipSponsors;
    this.skipIntros = sanitized.skipIntros;
    this.skipOutros = sanitized.skipOutros;
    this.skipDonations = sanitized.skipDonations;
    this.skipSelfPromo = sanitized.skipSelfPromo;
    this.skipBuffer = sanitized.skipBuffer;
    this.enablePreview = sanitized.enablePreview;
    this.autoSkip = sanitized.autoSkip;
  }

  /**
   * Get enabled skip categories
   * @returns {Array<string>}
   */
  getEnabledCategories() {
    const categories = [];
    if (this.skipSponsors) categories.push('Sponsor');
    if (this.skipIntros) categories.push('Intro');
    if (this.skipOutros) categories.push('Outro');
    if (this.skipDonations) categories.push('Donations');
    if (this.skipSelfPromo) categories.push('Self-Promo');
    return categories;
  }

  /**
   * Check if category should be skipped
   * @param {string} category - Category name
   * @returns {boolean}
   */
  shouldSkipCategory(category) {
    const categoryLower = category.toLowerCase();

    if (categoryLower.includes('sponsor')) return this.skipSponsors;
    if (categoryLower.includes('intro')) return this.skipIntros;
    if (categoryLower.includes('outro')) return this.skipOutros;
    if (categoryLower.includes('donation') || categoryLower.includes('acknowledgment')) {
      return this.skipDonations;
    }
    if (categoryLower.includes('promo') || categoryLower.includes('merch')) {
      return this.skipSelfPromo;
    }

    return false;
  }

  /**
   * Get count of enabled categories
   * @returns {number}
   */
  getEnabledCount() {
    return this.getEnabledCategories().length;
  }

  /**
   * Check if any skip is enabled
   * @returns {boolean}
   */
  hasAnyEnabled() {
    return this.getEnabledCount() > 0;
  }

  /**
   * Check if all skips are enabled
   * @returns {boolean}
   */
  hasAllEnabled() {
    return this.skipSponsors &&
           this.skipIntros &&
           this.skipOutros &&
           this.skipDonations &&
           this.skipSelfPromo;
  }

  /**
   * Toggle category
   * @param {string} category - Category to toggle
   */
  toggleCategory(category) {
    switch (category) {
      case 'skipSponsors':
        this.skipSponsors = !this.skipSponsors;
        break;
      case 'skipIntros':
        this.skipIntros = !this.skipIntros;
        break;
      case 'skipOutros':
        this.skipOutros = !this.skipOutros;
        break;
      case 'skipDonations':
        this.skipDonations = !this.skipDonations;
        break;
      case 'skipSelfPromo':
        this.skipSelfPromo = !this.skipSelfPromo;
        break;
    }
  }

  /**
   * Enable all categories
   */
  enableAll() {
    this.skipSponsors = true;
    this.skipIntros = true;
    this.skipOutros = true;
    this.skipDonations = true;
    this.skipSelfPromo = true;
  }

  /**
   * Disable all categories
   */
  disableAll() {
    this.skipSponsors = false;
    this.skipIntros = false;
    this.skipOutros = false;
    this.skipDonations = false;
    this.skipSelfPromo = false;
  }

  /**
   * Get summary
   * @returns {string}
   */
  getSummary() {
    const enabled = this.getEnabledCategories();
    if (enabled.length === 0) return 'No categories enabled';
    if (this.hasAllEnabled()) return 'All categories enabled';
    return `${enabled.length} categories enabled: ${enabled.join(', ')}`;
  }

  /**
   * Convert to plain object
   * @returns {Object}
   */
  toJSON() {
    return {
      skipSponsors: this.skipSponsors,
      skipIntros: this.skipIntros,
      skipOutros: this.skipOutros,
      skipDonations: this.skipDonations,
      skipSelfPromo: this.skipSelfPromo,
      skipBuffer: this.skipBuffer,
      enablePreview: this.enablePreview,
      autoSkip: this.autoSkip
    };
  }

  /**
   * Create from plain object
   * @param {Object} data - Plain object data
   * @returns {Settings}
   */
  static fromJSON(data) {
    return new Settings(data);
  }

  /**
   * Create default settings
   * @returns {Settings}
   */
  static createDefault() {
    return new Settings(CONFIG.DEFAULTS.SETTINGS);
  }

  /**
   * Merge with partial settings
   * @param {Object} partial - Partial settings
   * @returns {Settings}
   */
  merge(partial) {
    return new Settings({
      ...this.toJSON(),
      ...partial
    });
  }

  /**
   * Clone settings
   * @returns {Settings}
   */
  clone() {
    return new Settings(this.toJSON());
  }
}

/**
 * AdvancedSettings - Advanced user settings
 */
export class AdvancedSettings {
  /**
   * @param {Object} settings - Advanced settings object
   */
  constructor(settings = {}) {
    // Validate and sanitize
    const sanitized = SettingsValidator.sanitizeAdvanced(settings);

    this.confidenceThreshold = sanitized.confidenceThreshold;
    this.aiProvider = sanitized.aiProvider || 'claude'; // 'claude' or 'openai'
    this.aiModel = sanitized.aiModel;
    this.skipBuffer = sanitized.skipBuffer;
    this.channelWhitelist = sanitized.channelWhitelist;
  }

  /**
   * Check if channel is whitelisted
   * @param {string} channelId - Channel ID or handle
   * @returns {boolean}
   */
  isChannelWhitelisted(channelId) {
    if (this.channelWhitelist.length === 0) return false;
    return this.channelWhitelist.some(id => {
      return channelId === id || channelId.includes(id) || id.includes(channelId);
    });
  }

  /**
   * Add channel to whitelist
   * @param {string} channelId - Channel ID or handle
   */
  addToWhitelist(channelId) {
    if (!this.isChannelWhitelisted(channelId)) {
      this.channelWhitelist.push(channelId);
    }
  }

  /**
   * Remove channel from whitelist
   * @param {string} channelId - Channel ID or handle
   */
  removeFromWhitelist(channelId) {
    this.channelWhitelist = this.channelWhitelist.filter(id => id !== channelId);
  }

  /**
   * Clear whitelist
   */
  clearWhitelist() {
    this.channelWhitelist = [];
  }

  /**
   * Get whitelist count
   * @returns {number}
   */
  getWhitelistCount() {
    return this.channelWhitelist.length;
  }

  /**
   * Get AI model display name
   * @returns {string}
   */
  getModelDisplayName() {
    if (this.aiProvider === 'claude') {
      return this.aiModel === 'haiku' ? 'Claude Haiku (Fast)' : 'Claude Sonnet (Accurate)';
    } else if (this.aiProvider === 'openai') {
      const modelNames = {
        'gpt-5.5': 'GPT-5.5 (Best)',
        'gpt-5.4-mini': 'GPT-5.4 Mini (Fast)',
        'gpt-5.4-nano': 'GPT-5.4 Nano (Cheapest)'
      };
      return modelNames[this.aiModel] || this.aiModel;
    }
    return this.aiModel;
  }

  /**
   * Get confidence threshold as percentage
   * @returns {string}
   */
  getConfidencePercentage() {
    return `${Math.round(this.confidenceThreshold * 100)}%`;
  }

  /**
   * Convert to plain object
   * @returns {Object}
   */
  toJSON() {
    return {
      confidenceThreshold: this.confidenceThreshold,
      aiProvider: this.aiProvider,
      aiModel: this.aiModel,
      skipBuffer: this.skipBuffer,
      channelWhitelist: [...this.channelWhitelist]
    };
  }

  /**
   * Create from plain object
   * @param {Object} data - Plain object data
   * @returns {AdvancedSettings}
   */
  static fromJSON(data) {
    return new AdvancedSettings(data);
  }

  /**
   * Create default advanced settings
   * @returns {AdvancedSettings}
   */
  static createDefault() {
    return new AdvancedSettings(CONFIG.DEFAULTS.ADVANCED_SETTINGS);
  }

  /**
   * Merge with partial settings
   * @param {Object} partial - Partial settings
   * @returns {AdvancedSettings}
   */
  merge(partial) {
    return new AdvancedSettings({
      ...this.toJSON(),
      ...partial
    });
  }

  /**
   * Clone settings
   * @returns {AdvancedSettings}
   */
  clone() {
    return new AdvancedSettings(this.toJSON());
  }
}
