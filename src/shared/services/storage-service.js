// storage-service.js - Storage orchestration service

import { StorageError, StorageQuotaError } from '../errors/index.js';
import { logger } from '../logger/index.js';
import { CacheRepository, SettingsRepository, StatsRepository } from '../repositories/index.js';

/**
 * StorageService - Orchestrates all storage operations
 */
export class StorageService {
  constructor() {
    this.cacheRepo = new CacheRepository();
    this.settingsRepo = new SettingsRepository();
    this.statsRepo = new StatsRepository();
    this.logger = logger.child('StorageService');
  }

  // ==================== Cache Operations ====================

  /**
   * Get cached analysis
   * @param {string} videoId - Video ID
   * @returns {Promise<AnalysisResult|null>}
   */
  async getCachedAnalysis(videoId) {
    return await this.cacheRepo.get(videoId);
  }

  /**
   * Cache analysis result
   * @param {string} videoId - Video ID
   * @param {AnalysisResult} result - Analysis result
   * @returns {Promise<void>}
   */
  async cacheAnalysis(videoId, result) {
    await this.cacheRepo.set(videoId, result);
  }

  /**
   * Invalidate cached analysis
   * @param {string} videoId - Video ID
   * @returns {Promise<void>}
   */
  async invalidateCache(videoId) {
    await this.cacheRepo.invalidate(videoId);
  }

  /**
   * Clean stale cache entries
   * @param {number} maxAgeMs - Maximum age
   * @returns {Promise<number>}
   */
  async cleanStaleCache(maxAgeMs) {
    return await this.cacheRepo.cleanStale(maxAgeMs);
  }

  /**
   * Get cache statistics
   * @returns {Promise<Object>}
   */
  async getCacheStatistics() {
    return await this.cacheRepo.getStatistics();
  }

  /**
   * Clear all cache
   * @returns {Promise<void>}
   */
  async clearCache() {
    await this.cacheRepo.clear();
  }

  // ==================== Settings Operations ====================

  /**
   * Get user settings
   * @returns {Promise<Settings>}
   */
  async getSettings() {
    return await this.settingsRepo.getSettings();
  }

  /**
   * Save user settings
   * @param {Settings} settings - Settings to save
   * @returns {Promise<void>}
   */
  async saveSettings(settings) {
    await this.settingsRepo.saveSettings(settings);
  }

  /**
   * Update partial settings
   * @param {Object} partial - Partial settings
   * @returns {Promise<Settings>}
   */
  async updateSettings(partial) {
    return await this.settingsRepo.updateSettings(partial);
  }

  /**
   * Get advanced settings
   * @returns {Promise<AdvancedSettings>}
   */
  async getAdvancedSettings() {
    return await this.settingsRepo.getAdvancedSettings();
  }

  /**
   * Save advanced settings
   * @param {AdvancedSettings} settings - Advanced settings
   * @returns {Promise<void>}
   */
  async saveAdvancedSettings(settings) {
    await this.settingsRepo.saveAdvancedSettings(settings);
  }

  /**
   * Get all settings
   * @returns {Promise<Object>}
   */
  async getAllSettings() {
    return await this.settingsRepo.getAllSettings();
  }

  /**
   * Check if channel is whitelisted
   * @param {string} channelId - Channel ID
   * @returns {Promise<boolean>}
   */
  async isChannelWhitelisted(channelId) {
    return await this.settingsRepo.isChannelWhitelisted(channelId);
  }

  /**
   * Add channel to whitelist
   * @param {string} channelId - Channel ID
   * @returns {Promise<void>}
   */
  async addToWhitelist(channelId) {
    await this.settingsRepo.addToWhitelist(channelId);
  }

  /**
   * Remove channel from whitelist
   * @param {string} channelId - Channel ID
   * @returns {Promise<void>}
   */
  async removeFromWhitelist(channelId) {
    await this.settingsRepo.removeFromWhitelist(channelId);
  }

  /**
   * Export settings
   * @returns {Promise<string>}
   */
  async exportSettings() {
    return await this.settingsRepo.exportSettings();
  }

  /**
   * Import settings
   * @param {string} json - JSON string
   * @returns {Promise<void>}
   */
  async importSettings(json) {
    await this.settingsRepo.importSettings(json);
  }

  // ==================== Statistics Operations ====================

  /**
   * Get user statistics
   * @returns {Promise<Object>}
   */
  async getStats() {
    return await this.statsRepo.getStats();
  }

  /**
   * Get statistics summary
   * @returns {Promise<Object>}
   */
  async getStatsSummary() {
    return await this.statsRepo.getSummary();
  }

  /**
   * Record skip
   * @param {string} category - Category
   * @param {number} duration - Duration in seconds
   * @returns {Promise<void>}
   */
  async recordSkip(category, duration) {
    await this.statsRepo.incrementSkip(category, duration);
  }

  /**
   * Record video analysis
   * @returns {Promise<void>}
   */
  async recordVideoAnalysis() {
    await this.statsRepo.incrementVideosAnalyzed();
  }

  /**
   * Get category statistics
   * @returns {Promise<Array>}
   */
  async getCategoryStats() {
    return await this.statsRepo.getCategoryStats();
  }

  /**
   * Reset statistics
   * @returns {Promise<void>}
   */
  async resetStats() {
    await this.statsRepo.resetStats();
  }

  /**
   * Export statistics
   * @returns {Promise<string>}
   */
  async exportStats() {
    return await this.statsRepo.exportStats();
  }

  // ==================== Combined Operations ====================

  /**
   * Get storage usage
   * @returns {Promise<Object>}
   */
  async getStorageUsage() {
    try {
      const bytesInUse = await chrome.storage.local.getBytesInUse();
      const quota = chrome.storage.local.QUOTA_BYTES;

      return {
        used: bytesInUse,
        total: quota,
        available: quota - bytesInUse,
        percentage: Math.round((bytesInUse / quota) * 100)
      };
    } catch (error) {
      this.logger.error(`Failed to get storage usage`, { error: error.message });
      throw new StorageError('Failed to get storage usage', error);
    }
  }

  /**
   * Check storage quota
   * @returns {Promise<boolean>}
   */
  async checkStorageQuota() {
    const usage = await this.getStorageUsage();

    if (usage.percentage > 90) {
      this.logger.warn(`Storage quota high`, {
        percentage: usage.percentage,
        used: usage.used,
        available: usage.available
      });

      return false;
    }

    return true;
  }

  /**
   * Optimize storage (clean old data)
   * @returns {Promise<Object>}
   */
  async optimizeStorage() {
    this.logger.info(`Optimizing storage`);

    const results = {
      cacheEntriesRemoved: 0,
      bytesFreed: 0
    };

    try {
      // Get usage before
      const usageBefore = await this.getStorageUsage();

      // Clean stale cache (30 days)
      results.cacheEntriesRemoved = await this.cleanStaleCache(30 * 24 * 60 * 60 * 1000);

      // Get usage after
      const usageAfter = await this.getStorageUsage();
      results.bytesFreed = usageBefore.used - usageAfter.used;

      this.logger.info(`Storage optimized`, results);

      return results;
    } catch (error) {
      this.logger.error(`Storage optimization failed`, { error: error.message });
      throw new StorageError('Failed to optimize storage', error);
    }
  }

  /**
   * Export all data
   * @returns {Promise<string>}
   */
  async exportAllData() {
    try {
      this.logger.info(`Exporting all data`);

      const [settings, stats, cacheStats] = await Promise.all([
        this.exportSettings(),
        this.exportStats(),
        this.getCacheStatistics()
      ]);

      const exportData = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        settings: JSON.parse(settings),
        stats: JSON.parse(stats),
        cache: cacheStats
      };

      return JSON.stringify(exportData, null, 2);
    } catch (error) {
      this.logger.error(`Export failed`, { error: error.message });
      throw new StorageError('Failed to export data', error);
    }
  }

  /**
   * Clear all data
   * @returns {Promise<void>}
   */
  async clearAllData() {
    this.logger.warn(`Clearing all data`);

    try {
      await Promise.all([
        this.clearCache(),
        this.settingsRepo.resetSettings(),
        this.settingsRepo.resetAdvancedSettings(),
        this.resetStats()
      ]);

      this.logger.info(`All data cleared`);
    } catch (error) {
      this.logger.error(`Failed to clear all data`, { error: error.message });
      throw new StorageError('Failed to clear all data', error);
    }
  }

  /**
   * Get storage summary
   * @returns {Promise<Object>}
   */
  async getStorageSummary() {
    try {
      const [usage, cacheStats, stats, settings] = await Promise.all([
        this.getStorageUsage(),
        this.getCacheStatistics(),
        this.getStatsSummary(),
        this.getAllSettings()
      ]);

      return {
        storage: usage,
        cache: cacheStats,
        statistics: stats,
        settings: {
          enabledCategories: settings.settings.getEnabledCategories(),
          model: settings.advancedSettings.aiModel,
          whitelistCount: settings.advancedSettings.getWhitelistCount()
        }
      };
    } catch (error) {
      this.logger.error(`Failed to get storage summary`, { error: error.message });
      throw new StorageError('Failed to get storage summary', error);
    }
  }

  /**
   * Listen for storage changes
   * @param {Function} callback - Callback function
   */
  onStorageChange(callback) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local') {
        this.logger.debug(`Storage changed`, { keys: Object.keys(changes) });
        callback(changes);
      }
    });
  }
}
