// analytics-service.js - Analytics and monitoring service

import { logger } from '../logger/index.js';
import { StatsRepository } from '../repositories/index.js';

/**
 * AnalyticsService - Handles analytics and monitoring
 */
export class AnalyticsService {
  constructor() {
    this.statsRepo = new StatsRepository();
    this.logger = logger.child('AnalyticsService');
    this.sessionData = {
      sessionStart: Date.now(),
      videosWatched: 0,
      segmentsSkipped: 0,
      totalTimeSaved: 0
    };
  }

  /**
   * Track video view
   * @param {string} videoId - Video ID
   * @param {string} channelId - Channel ID
   */
  async trackVideoView(videoId, channelId) {
    this.sessionData.videosWatched++;

    this.logger.debug(`Video view tracked`, {
      videoId,
      channelId,
      sessionVideos: this.sessionData.videosWatched
    });
  }

  /**
   * Track segment skip
   * @param {Segment} segment - Skipped segment
   * @param {string} videoId - Video ID
   */
  async trackSegmentSkip(segment, videoId) {
    try {
      const duration = segment.getDuration();

      // Update session data
      this.sessionData.segmentsSkipped++;
      this.sessionData.totalTimeSaved += duration;

      // Update persistent stats
      await this.statsRepo.incrementSkip(segment.category, duration);

      this.logger.info(`Segment skip tracked`, {
        videoId,
        category: segment.category,
        duration,
        sessionTotal: this.sessionData.segmentsSkipped
      });
    } catch (error) {
      this.logger.error(`Failed to track skip`, { error: error.message });
    }
  }

  /**
   * Track analysis completion
   * @param {string} videoId - Video ID
   * @param {AnalysisResult} result - Analysis result
   * @param {number} processingTime - Processing time in ms
   */
  async trackAnalysis(videoId, result, processingTime) {
    try {
      await this.statsRepo.incrementVideosAnalyzed();

      this.logger.info(`Analysis tracked`, {
        videoId,
        segmentCount: result.getSegmentCount(),
        totalDuration: result.getTotalSkipDuration(),
        processingTime
      });
    } catch (error) {
      this.logger.error(`Failed to track analysis`, { error: error.message });
    }
  }

  /**
   * Track error
   * @param {Error} error - Error object
   * @param {string} context - Error context
   * @param {Object} metadata - Additional metadata
   */
  trackError(error, context, metadata = {}) {
    this.logger.error(`Error tracked`, {
      context,
      error: error.message,
      name: error.name,
      code: error.code,
      ...metadata
    });
  }

  /**
   * Track performance metric
   * @param {string} metricName - Metric name
   * @param {number} value - Metric value
   * @param {string} unit - Unit (ms, bytes, etc)
   */
  trackPerformance(metricName, value, unit = 'ms') {
    this.logger.debug(`Performance metric`, {
      metric: metricName,
      value,
      unit
    });
  }

  /**
   * Get session summary
   * @returns {Object}
   */
  getSessionSummary() {
    const sessionDuration = Date.now() - this.sessionData.sessionStart;
    const sessionMinutes = Math.floor(sessionDuration / 60000);

    return {
      sessionStart: new Date(this.sessionData.sessionStart).toISOString(),
      sessionDuration: sessionMinutes,
      videosWatched: this.sessionData.videosWatched,
      segmentsSkipped: this.sessionData.segmentsSkipped,
      totalTimeSaved: this.sessionData.totalTimeSaved,
      formattedTimeSaved: this.formatDuration(this.sessionData.totalTimeSaved)
    };
  }

  /**
   * Get lifetime statistics
   * @returns {Promise<Object>}
   */
  async getLifetimeStats() {
    try {
      const summary = await this.statsRepo.getSummary();
      const categoryStats = await this.statsRepo.getCategoryStats();

      return {
        ...summary,
        categoryBreakdown: categoryStats,
        session: this.getSessionSummary()
      };
    } catch (error) {
      this.logger.error(`Failed to get lifetime stats`, { error: error.message });
      return null;
    }
  }

  /**
   * Get insights from statistics
   * @returns {Promise<Object>}
   */
  async getInsights() {
    try {
      const stats = await this.getLifetimeStats();

      if (!stats) {
        return null;
      }

      const insights = {
        mostSkippedCategory: stats.topCategory,
        averageSkipsPerDay: parseFloat(stats.averageSkipsPerDay),
        totalTimeSavedHours: Math.round(stats.totalTimeSaved / 3600),
        efficiency: this.calculateEfficiency(stats),
        usage: this.analyzeUsagePattern(stats)
      };

      return insights;
    } catch (error) {
      this.logger.error(`Failed to get insights`, { error: error.message });
      return null;
    }
  }

  /**
   * Calculate efficiency score
   * @param {Object} stats - Statistics
   * @returns {number}
   */
  calculateEfficiency(stats) {
    // Efficiency = (time saved / videos analyzed) * 100
    if (stats.videosAnalyzed === 0) return 0;

    const avgTimeSavedPerVideo = stats.totalTimeSaved / stats.videosAnalyzed;
    return Math.round(avgTimeSavedPerVideo);
  }

  /**
   * Analyze usage pattern
   * @param {Object} stats - Statistics
   * @returns {string}
   */
  analyzeUsagePattern(stats) {
    const skipsPerDay = parseFloat(stats.averageSkipsPerDay);

    if (skipsPerDay > 50) return 'power user';
    if (skipsPerDay > 20) return 'regular user';
    if (skipsPerDay > 5) return 'casual user';
    return 'light user';
  }

  /**
   * Track cache performance
   * @param {string} videoId - Video ID
   * @param {boolean} cacheHit - Whether cache hit occurred
   * @param {number} loadTime - Load time in ms
   */
  trackCachePerformance(videoId, cacheHit, loadTime) {
    this.logger.debug(`Cache performance`, {
      videoId,
      cacheHit,
      loadTime
    });

    this.trackPerformance(
      cacheHit ? 'cache_hit_time' : 'cache_miss_time',
      loadTime,
      'ms'
    );
  }

  /**
   * Track API performance
   * @param {string} endpoint - API endpoint
   * @param {number} responseTime - Response time in ms
   * @param {boolean} success - Whether request succeeded
   */
  trackAPIPerformance(endpoint, responseTime, success) {
    this.logger.debug(`API performance`, {
      endpoint,
      responseTime,
      success
    });

    this.trackPerformance(
      success ? 'api_success_time' : 'api_error_time',
      responseTime,
      'ms'
    );
  }

  /**
   * Format duration
   * @param {number} seconds - Duration in seconds
   * @returns {string}
   */
  formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  }

  /**
   * Generate report
   * @returns {Promise<string>}
   */
  async generateReport() {
    try {
      const stats = await this.getLifetimeStats();
      const insights = await this.getInsights();

      const report = {
        generatedAt: new Date().toISOString(),
        lifetime: stats,
        insights,
        session: this.getSessionSummary()
      };

      return JSON.stringify(report, null, 2);
    } catch (error) {
      this.logger.error(`Failed to generate report`, { error: error.message });
      throw error;
    }
  }

  /**
   * Reset session data
   */
  resetSession() {
    this.sessionData = {
      sessionStart: Date.now(),
      videosWatched: 0,
      segmentsSkipped: 0,
      totalTimeSaved: 0
    };

    this.logger.info(`Session reset`);
  }
}
