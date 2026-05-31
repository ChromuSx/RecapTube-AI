// settings-repository.js - Settings data access layer

import { StorageError } from '../errors/index.js';
import { logger } from '../logger/index.js';
import { Settings, AdvancedSettings } from '../models/index.js';
import { CONFIG } from '../config.js';

/**
 * SettingsRepository - Manages user settings storage
 */
export class SettingsRepository {
  constructor() {
    this.storageKey = 'user_settings';
    this.advancedKey = 'advanced_settings';
    this.logger = logger.child('SettingsRepository');
  }

  /**
   * Get settings from storage
   * @returns {Promise<Settings>}
   */
  async getSettings() {
    try {
      const result = await chrome.storage.local.get(this.storageKey);

      if (!result[this.storageKey]) {
        this.logger.debug(`No settings found, using defaults`);
        return Settings.createDefault();
      }

      const settings = Settings.fromJSON(result[this.storageKey]);
      this.logger.debug(`Settings loaded`, { summary: settings.getSummary() });

      return settings;
    } catch (error) {
      this.logger.error(`Failed to get settings`, { error: error.message });
      throw new StorageError('Failed to read settings', error);
    }
  }

  /**
   * Save settings to storage
   * @param {Settings} settings - Settings to save
   * @returns {Promise<void>}
   */
  async saveSettings(settings) {
    try {
      const data = settings.toJSON();
      await chrome.storage.local.set({ [this.storageKey]: data });

      this.logger.info(`Settings saved`, { summary: settings.getSummary() });
    } catch (error) {
      this.logger.error(`Failed to save settings`, { error: error.message });
      throw new StorageError('Failed to save settings', error);
    }
  }

  /**
   * Update partial settings
   * @param {Object} partial - Partial settings
   * @returns {Promise<Settings>}
   */
  async updateSettings(partial) {
    const current = await this.getSettings();
    const updated = current.merge(partial);
    await this.saveSettings(updated);

    this.logger.debug(`Settings updated`, { fields: Object.keys(partial) });
    return updated;
  }

  /**
   * Reset settings to defaults
   * @returns {Promise<Settings>}
   */
  async resetSettings() {
    const defaults = Settings.createDefault();
    await this.saveSettings(defaults);

    this.logger.info(`Settings reset to defaults`);
    return defaults;
  }

  /**
   * Get advanced settings
   * @returns {Promise<AdvancedSettings>}
   */
  async getAdvancedSettings() {
    try {
      const result = await chrome.storage.local.get(this.advancedKey);

      if (!result[this.advancedKey]) {
        this.logger.debug(`No advanced settings found, using defaults`);
        return AdvancedSettings.createDefault();
      }

      const settings = AdvancedSettings.fromJSON(result[this.advancedKey]);
      this.logger.debug(`Advanced settings loaded`, {
        model: settings.aiModel,
        threshold: settings.confidenceThreshold,
        whitelistCount: settings.getWhitelistCount()
      });

      return settings;
    } catch (error) {
      this.logger.error(`Failed to get advanced settings`, { error: error.message });
      throw new StorageError('Failed to read advanced settings', error);
    }
  }

  /**
   * Save advanced settings
   * @param {AdvancedSettings} settings - Advanced settings to save
   * @returns {Promise<void>}
   */
  async saveAdvancedSettings(settings) {
    try {
      const data = settings.toJSON();
      await chrome.storage.local.set({ [this.advancedKey]: data });

      this.logger.info(`Advanced settings saved`, {
        model: settings.aiModel,
        threshold: settings.confidenceThreshold
      });
    } catch (error) {
      this.logger.error(`Failed to save advanced settings`, { error: error.message });
      throw new StorageError('Failed to save advanced settings', error);
    }
  }

  /**
   * Update partial advanced settings
   * @param {Object} partial - Partial advanced settings
   * @returns {Promise<AdvancedSettings>}
   */
  async updateAdvancedSettings(partial) {
    const current = await this.getAdvancedSettings();
    const updated = current.merge(partial);
    await this.saveAdvancedSettings(updated);

    this.logger.debug(`Advanced settings updated`, { fields: Object.keys(partial) });
    return updated;
  }

  /**
   * Reset advanced settings to defaults
   * @returns {Promise<AdvancedSettings>}
   */
  async resetAdvancedSettings() {
    const defaults = AdvancedSettings.createDefault();
    await this.saveAdvancedSettings(defaults);

    this.logger.info(`Advanced settings reset to defaults`);
    return defaults;
  }

  /**
   * Get all settings (regular + advanced)
   * @returns {Promise<Object>}
   */
  async getAllSettings() {
    const [settings, advancedSettings] = await Promise.all([
      this.getSettings(),
      this.getAdvancedSettings()
    ]);

    return {
      settings,
      advancedSettings
    };
  }

  /**
   * Export settings to JSON
   * @returns {Promise<string>}
   */
  async exportSettings() {
    try {
      const all = await this.getAllSettings();
      const exportData = {
        version: CONFIG.VERSION,
        exportedAt: new Date().toISOString(),
        settings: all.settings.toJSON(),
        advancedSettings: all.advancedSettings.toJSON()
      };

      return JSON.stringify(exportData, null, 2);
    } catch (error) {
      this.logger.error(`Failed to export settings`, { error: error.message });
      throw new StorageError('Failed to export settings', error);
    }
  }

  /**
   * Import settings from JSON
   * @param {string} json - JSON string
   * @returns {Promise<void>}
   */
  async importSettings(json) {
    try {
      const data = JSON.parse(json);

      if (!data.settings || !data.advancedSettings) {
        throw new Error('Invalid import data format');
      }

      const settings = Settings.fromJSON(data.settings);
      const advancedSettings = AdvancedSettings.fromJSON(data.advancedSettings);

      await this.saveSettings(settings);
      await this.saveAdvancedSettings(advancedSettings);

      this.logger.info(`Settings imported`, { version: data.version });
    } catch (error) {
      this.logger.error(`Failed to import settings`, { error: error.message });
      throw new StorageError('Failed to import settings', error);
    }
  }

  /**
   * Add channel to whitelist
   * @param {string} channelId - Channel ID or handle
   * @returns {Promise<void>}
   */
  async addToWhitelist(channelId) {
    const settings = await this.getAdvancedSettings();
    settings.addToWhitelist(channelId);
    await this.saveAdvancedSettings(settings);

    this.logger.info(`Channel added to whitelist`, { channelId });
  }

  /**
   * Remove channel from whitelist
   * @param {string} channelId - Channel ID or handle
   * @returns {Promise<void>}
   */
  async removeFromWhitelist(channelId) {
    const settings = await this.getAdvancedSettings();
    settings.removeFromWhitelist(channelId);
    await this.saveAdvancedSettings(settings);

    this.logger.info(`Channel removed from whitelist`, { channelId });
  }

  /**
   * Check if channel is whitelisted
   * @param {string} channelId - Channel ID or handle
   * @returns {Promise<boolean>}
   */
  async isChannelWhitelisted(channelId) {
    const settings = await this.getAdvancedSettings();
    return settings.isChannelWhitelisted(channelId);
  }

  /**
   * Listen for settings changes
   * @param {Function} callback - Callback function
   */
  onSettingsChange(callback) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local') return;

      if (changes[this.storageKey] || changes[this.advancedKey]) {
        this.logger.debug(`Settings changed externally`);
        callback();
      }
    });
  }
}
