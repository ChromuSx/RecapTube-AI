// cache-repository.js - Cache data access layer

import { CacheError, StorageError } from '../errors/index.js';
import { logger } from '../logger/index.js';
import { AnalysisResult } from '../models/index.js';

/**
 * CacheRepository - Manages analysis cache storage
 */
export class CacheRepository {
  constructor() {
    this.storagePrefix = 'analysis_';
    this.memoryCache = new Map();
    this.logger = logger.child('CacheRepository');
  }

  /**
   * Get cache key for video
   * @param {string} videoId - Video ID
   * @returns {string}
   */
  getCacheKey(videoId) {
    return `${this.storagePrefix}${videoId}`;
  }

  /**
   * Get from memory cache
   * @param {string} videoId - Video ID
   * @returns {AnalysisResult|null}
   */
  getFromMemory(videoId) {
    return this.memoryCache.get(videoId) || null;
  }

  /**
   * Set in memory cache
   * @param {string} videoId - Video ID
   * @param {AnalysisResult} result - Analysis result
   */
  setInMemory(videoId, result) {
    this.memoryCache.set(videoId, result);
    this.logger.debug(`Memory cache updated`, { videoId });
  }

  /**
   * Get from persistent storage
   * @param {string} videoId - Video ID
   * @returns {Promise<AnalysisResult|null>}
   */
  async getFromStorage(videoId) {
    try {
      const key = this.getCacheKey(videoId);
      const result = await chrome.storage.local.get(key);

      if (!result[key]) {
        return null;
      }

      this.logger.debug(`Cache hit`, { videoId });
      return AnalysisResult.fromJSON(result[key]);
    } catch (error) {
      this.logger.error(`Failed to get from storage`, { videoId, error: error.message });
      throw new StorageError('Failed to read from cache', error);
    }
  }

  /**
   * Set in persistent storage
   * @param {string} videoId - Video ID
   * @param {AnalysisResult} result - Analysis result
   * @returns {Promise<void>}
   */
  async setInStorage(videoId, result) {
    try {
      const key = this.getCacheKey(videoId);
      const data = result.toJSON();

      await chrome.storage.local.set({ [key]: data });
      this.logger.debug(`Storage cache updated`, { videoId });
    } catch (error) {
      this.logger.error(`Failed to set in storage`, { videoId, error: error.message });
      throw new StorageError('Failed to write to cache', error);
    }
  }

  /**
   * Get analysis result (memory first, then storage)
   * @param {string} videoId - Video ID
   * @returns {Promise<AnalysisResult|null>}
   */
  async get(videoId) {
    this.logger.debug(`Getting analysis`, { videoId });

    // Try memory cache first
    const memoryResult = this.getFromMemory(videoId);
    if (memoryResult) {
      this.logger.debug(`Memory cache hit`, { videoId });
      return memoryResult;
    }

    // Try persistent storage
    const storageResult = await this.getFromStorage(videoId);
    if (storageResult) {
      // Update memory cache
      this.setInMemory(videoId, storageResult);
      return storageResult;
    }

    this.logger.debug(`Cache miss`, { videoId });
    return null;
  }

  /**
   * Set analysis result (both memory and storage)
   * @param {string} videoId - Video ID
   * @param {AnalysisResult} result - Analysis result
   * @returns {Promise<void>}
   */
  async set(videoId, result) {
    this.logger.debug(`Setting analysis`, { videoId, segmentCount: result.getSegmentCount() });

    // Update both caches
    this.setInMemory(videoId, result);
    await this.setInStorage(videoId, result);

    this.logger.info(`Analysis cached`, { videoId, segments: result.getSegmentCount() });
  }

  /**
   * Delete analysis result
   * @param {string} videoId - Video ID
   * @returns {Promise<void>}
   */
  async delete(videoId) {
    try {
      // Remove from memory
      this.memoryCache.delete(videoId);

      // Remove from storage
      const key = this.getCacheKey(videoId);
      await chrome.storage.local.remove(key);

      this.logger.debug(`Cache deleted`, { videoId });
    } catch (error) {
      this.logger.error(`Failed to delete cache`, { videoId, error: error.message });
      throw new StorageError('Failed to delete from cache', error);
    }
  }

  /**
   * Check if cached result exists
   * @param {string} videoId - Video ID
   * @returns {Promise<boolean>}
   */
  async has(videoId) {
    // Check memory first
    if (this.memoryCache.has(videoId)) {
      return true;
    }

    // Check storage
    const result = await this.getFromStorage(videoId);
    return result !== null;
  }

  /**
   * Get all cached video IDs
   * @returns {Promise<Array<string>>}
   */
  async getAllVideoIds() {
    try {
      const allData = await chrome.storage.local.get(null);
      const videoIds = Object.keys(allData)
        .filter(key => key.startsWith(this.storagePrefix))
        .map(key => key.replace(this.storagePrefix, ''));

      return videoIds;
    } catch (error) {
      this.logger.error(`Failed to get all video IDs`, { error: error.message });
      throw new StorageError('Failed to read cache keys', error);
    }
  }

  /**
   * Get all cached results
   * @returns {Promise<Array<AnalysisResult>>}
   */
  async getAll() {
    try {
      const videoIds = await this.getAllVideoIds();
      const results = await Promise.all(
        videoIds.map(videoId => this.get(videoId))
      );

      return results.filter(r => r !== null);
    } catch (error) {
      this.logger.error(`Failed to get all results`, { error: error.message });
      throw new StorageError('Failed to read all cache entries', error);
    }
  }

  /**
   * Clean stale cache entries
   * @param {number} maxAgeMs - Maximum age in milliseconds
   * @returns {Promise<number>} - Number of deleted entries
   */
  async cleanStale(maxAgeMs = 30 * 24 * 60 * 60 * 1000) { // 30 days
    try {
      this.logger.info(`Cleaning stale cache entries`, { maxAgeMs });

      const results = await this.getAll();
      let deletedCount = 0;

      for (const result of results) {
        if (result.isStale(maxAgeMs)) {
          await this.delete(result.videoId);
          deletedCount++;
        }
      }

      this.logger.info(`Cleaned stale cache`, { deleted: deletedCount, total: results.length });
      return deletedCount;
    } catch (error) {
      this.logger.error(`Failed to clean stale cache`, { error: error.message });
      throw new CacheError('Failed to clean stale cache', error);
    }
  }

  /**
   * Clear all cache (memory + storage)
   * @returns {Promise<void>}
   */
  async clear() {
    try {
      this.logger.warn(`Clearing all cache`);

      // Clear memory
      this.memoryCache.clear();

      // Clear storage
      const videoIds = await this.getAllVideoIds();
      const keys = videoIds.map(id => this.getCacheKey(id));
      await chrome.storage.local.remove(keys);

      this.logger.info(`Cache cleared`, { count: videoIds.length });
    } catch (error) {
      this.logger.error(`Failed to clear cache`, { error: error.message });
      throw new CacheError('Failed to clear cache', error);
    }
  }

  /**
   * Get cache size
   * @returns {Promise<Object>} - Size information
   */
  async getSize() {
    try {
      const videoIds = await this.getAllVideoIds();
      const results = await this.getAll();

      return {
        memoryCount: this.memoryCache.size,
        storageCount: videoIds.length,
        totalSegments: results.reduce((sum, r) => sum + r.getSegmentCount(), 0)
      };
    } catch (error) {
      this.logger.error(`Failed to get cache size`, { error: error.message });
      throw new CacheError('Failed to get cache size', error);
    }
  }

  /**
   * Get cache statistics
   * @returns {Promise<Object>}
   */
  async getStatistics() {
    try {
      const results = await this.getAll();
      const size = await this.getSize();

      const stats = {
        totalEntries: results.length,
        memoryEntries: size.memoryCount,
        storageEntries: size.storageCount,
        totalSegments: size.totalSegments,
        averageSegments: results.length > 0 ? size.totalSegments / results.length : 0,
        oldestEntry: null,
        newestEntry: null,
        staleEntries: 0
      };

      if (results.length > 0) {
        const sorted = results.sort((a, b) => {
          return new Date(a.metadata.analyzedAt) - new Date(b.metadata.analyzedAt);
        });

        stats.oldestEntry = sorted[0].metadata.analyzedAt;
        stats.newestEntry = sorted[sorted.length - 1].metadata.analyzedAt;
        stats.staleEntries = results.filter(r => r.isStale()).length;
      }

      return stats;
    } catch (error) {
      this.logger.error(`Failed to get statistics`, { error: error.message });
      throw new CacheError('Failed to get cache statistics', error);
    }
  }

  /**
   * Invalidate cache for video
   * @param {string} videoId - Video ID
   * @returns {Promise<void>}
   */
  async invalidate(videoId) {
    this.logger.info(`Invalidating cache`, { videoId });
    await this.delete(videoId);
  }
}
