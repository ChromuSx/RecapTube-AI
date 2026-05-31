// stats-repository.js - Statistics data access layer

import { StorageError } from '../errors/index.js';
import { logger } from '../logger/index.js';

/**
 * StatsRepository - Manages usage statistics storage
 */
export class StatsRepository {
  constructor() {
    this.storageKey = 'user_stats';
    this.logger = logger.child('StatsRepository');
  }

  /**
   * Get default stats structure
   * @returns {Object}
   */
  getDefaultStats() {
    return {
      totalSkips: 0,
      totalTimeSaved: 0,
      videosAnalyzed: 0,
      categoryStats: {
        'Sponsor': 0,
        'Intro': 0,
        'Outro': 0,
        'Donations': 0,
        'Self-Promo': 0
      },
      lastUpdated: new Date().toISOString(),
      firstUse: new Date().toISOString()
    };
  }

  /**
   * Get statistics from storage
   * @returns {Promise<Object>}
   */
  async getStats() {
    try {
      const result = await chrome.storage.local.get(this.storageKey);

      if (!result[this.storageKey]) {
        this.logger.debug(`No stats found, creating defaults`);
        const defaults = this.getDefaultStats();
        await this.saveStats(defaults);
        return defaults;
      }

      return result[this.storageKey];
    } catch (error) {
      this.logger.error(`Failed to get stats`, { error: error.message });
      throw new StorageError('Failed to read statistics', error);
    }
  }

  /**
   * Save statistics to storage
   * @param {Object} stats - Statistics to save
   * @returns {Promise<void>}
   */
  async saveStats(stats) {
    try {
      stats.lastUpdated = new Date().toISOString();
      await chrome.storage.local.set({ [this.storageKey]: stats });

      this.logger.debug(`Stats saved`, { totalSkips: stats.totalSkips });
    } catch (error) {
      this.logger.error(`Failed to save stats`, { error: error.message });
      throw new StorageError('Failed to save statistics', error);
    }
  }

  /**
   * Increment skip count for category
   * @param {string} category - Category name
   * @param {number} duration - Skip duration in seconds
   * @returns {Promise<void>}
   */
  async incrementSkip(category, duration = 0) {
    try {
      const stats = await this.getStats();

      stats.totalSkips++;
      stats.totalTimeSaved += duration;

      if (stats.categoryStats[category] !== undefined) {
        stats.categoryStats[category]++;
      } else {
        stats.categoryStats[category] = 1;
      }

      await this.saveStats(stats);

      this.logger.debug(`Skip recorded`, { category, duration });
    } catch (error) {
      this.logger.error(`Failed to increment skip`, { error: error.message });
      throw new StorageError('Failed to update statistics', error);
    }
  }

  /**
   * Increment videos analyzed count
   * @returns {Promise<void>}
   */
  async incrementVideosAnalyzed() {
    try {
      const stats = await this.getStats();
      stats.videosAnalyzed++;
      await this.saveStats(stats);

      this.logger.debug(`Videos analyzed incremented`, { total: stats.videosAnalyzed });
    } catch (error) {
      this.logger.error(`Failed to increment videos analyzed`, { error: error.message });
      throw new StorageError('Failed to update statistics', error);
    }
  }

  /**
   * Get formatted time saved
   * @param {number} seconds - Seconds saved
   * @returns {string}
   */
  formatTimeSaved(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  }

  /**
   * Get statistics summary
   * @returns {Promise<Object>}
   */
  async getSummary() {
    try {
      const stats = await this.getStats();

      // Calculate top category
      let topCategory = null;
      let maxCount = 0;
      Object.entries(stats.categoryStats).forEach(([category, count]) => {
        if (count > maxCount) {
          maxCount = count;
          topCategory = category;
        }
      });

      // Calculate days since first use
      const firstUse = new Date(stats.firstUse);
      const now = new Date();
      const daysSinceFirstUse = Math.floor((now - firstUse) / (1000 * 60 * 60 * 24));

      // Average skips per day
      const averageSkipsPerDay = daysSinceFirstUse > 0
        ? (stats.totalSkips / daysSinceFirstUse).toFixed(1)
        : stats.totalSkips;

      return {
        totalSkips: stats.totalSkips,
        totalTimeSaved: stats.totalTimeSaved,
        formattedTimeSaved: this.formatTimeSaved(stats.totalTimeSaved),
        videosAnalyzed: stats.videosAnalyzed,
        topCategory,
        topCategoryCount: maxCount,
        categoryStats: stats.categoryStats,
        daysSinceFirstUse,
        averageSkipsPerDay,
        lastUpdated: stats.lastUpdated,
        firstUse: stats.firstUse
      };
    } catch (error) {
      this.logger.error(`Failed to get summary`, { error: error.message });
      throw new StorageError('Failed to get statistics summary', error);
    }
  }

  /**
   * Get category statistics
   * @returns {Promise<Array>}
   */
  async getCategoryStats() {
    try {
      const stats = await this.getStats();

      return Object.entries(stats.categoryStats)
        .map(([category, count]) => ({
          category,
          count,
          percentage: stats.totalSkips > 0
            ? Math.round((count / stats.totalSkips) * 100)
            : 0
        }))
        .sort((a, b) => b.count - a.count);
    } catch (error) {
      this.logger.error(`Failed to get category stats`, { error: error.message });
      throw new StorageError('Failed to get category statistics', error);
    }
  }

  /**
   * Reset statistics
   * @returns {Promise<void>}
   */
  async resetStats() {
    try {
      const defaults = this.getDefaultStats();
      await this.saveStats(defaults);

      this.logger.info(`Stats reset`);
    } catch (error) {
      this.logger.error(`Failed to reset stats`, { error: error.message });
      throw new StorageError('Failed to reset statistics', error);
    }
  }

  /**
   * Export statistics to JSON
   * @returns {Promise<string>}
   */
  async exportStats() {
    try {
      const stats = await this.getStats();
      const summary = await this.getSummary();

      const exportData = {
        stats,
        summary,
        exportedAt: new Date().toISOString()
      };

      return JSON.stringify(exportData, null, 2);
    } catch (error) {
      this.logger.error(`Failed to export stats`, { error: error.message });
      throw new StorageError('Failed to export statistics', error);
    }
  }

  /**
   * Get time saved percentage (compared to total watch time)
   * @param {number} totalWatchTimeSeconds - Total time spent watching
   * @returns {Promise<number>}
   */
  async getTimeSavedPercentage(totalWatchTimeSeconds) {
    try {
      const stats = await this.getStats();

      if (totalWatchTimeSeconds === 0) return 0;

      return Math.round((stats.totalTimeSaved / totalWatchTimeSeconds) * 100);
    } catch (error) {
      this.logger.error(`Failed to calculate time saved percentage`, { error: error.message });
      return 0;
    }
  }

  /**
   * Get most skipped category
   * @returns {Promise<Object|null>}
   */
  async getMostSkippedCategory() {
    try {
      const categoryStats = await this.getCategoryStats();

      if (categoryStats.length === 0) return null;

      return categoryStats[0]; // Already sorted by count
    } catch (error) {
      this.logger.error(`Failed to get most skipped category`, { error: error.message });
      return null;
    }
  }

  /**
   * Record bulk skips (for migration or batch operations)
   * @param {Array} skips - Array of skip records
   * @returns {Promise<void>}
   */
  async recordBulkSkips(skips) {
    try {
      const stats = await this.getStats();

      skips.forEach(skip => {
        stats.totalSkips++;
        stats.totalTimeSaved += skip.duration || 0;

        if (stats.categoryStats[skip.category] !== undefined) {
          stats.categoryStats[skip.category]++;
        } else {
          stats.categoryStats[skip.category] = 1;
        }
      });

      await this.saveStats(stats);

      this.logger.info(`Bulk skips recorded`, { count: skips.length });
    } catch (error) {
      this.logger.error(`Failed to record bulk skips`, { error: error.message });
      throw new StorageError('Failed to record bulk skips', error);
    }
  }
}
