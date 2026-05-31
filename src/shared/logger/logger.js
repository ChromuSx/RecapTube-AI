// logger.js - Main logger class

import { LogLevel, LogLevelNames, LogLevelColors, LogLevelEmojis } from './log-levels.js';

/**
 * Logger - Structured logging system
 */
export class Logger {
  /**
   * @param {string} context - Logger context (e.g., 'AIClient', 'TranscriptExtractor')
   * @param {number} minLevel - Minimum log level
   */
  constructor(context = 'App', minLevel = LogLevel.INFO) {
    this.context = context;
    this.minLevel = minLevel;
    this.transports = [];
  }

  /**
   * Add transport (output destination)
   * @param {Object} transport - Transport object with log method
   */
  addTransport(transport) {
    this.transports.push(transport);
  }

  /**
   * Set minimum log level
   * @param {number} level - Log level
   */
  setLevel(level) {
    this.minLevel = level;
  }

  /**
   * Check if level should be logged
   * @param {number} level - Log level
   * @returns {boolean}
   */
  shouldLog(level) {
    return level >= this.minLevel;
  }

  /**
   * Core log method
   * @param {number} level - Log level
   * @param {string} message - Log message
   * @param {Object} data - Additional data
   */
  log(level, message, data = {}) {
    if (!this.shouldLog(level)) {
      return;
    }

    const logEntry = {
      timestamp: new Date().toISOString(),
      level: LogLevelNames[level],
      context: this.context,
      message,
      data,
      ...this.getMetadata()
    };

    // Send to all transports
    if (this.transports.length > 0) {
      this.transports.forEach(transport => {
        try {
          transport.log(logEntry, level);
        } catch (error) {
          console.error('Transport error:', error);
        }
      });
    } else {
      // Fallback to console if no transports
      this.consoleLog(logEntry, level);
    }
  }

  /**
   * Console log with colors
   * @param {Object} entry - Log entry
   * @param {number} level - Log level
   */
  consoleLog(entry, level) {
    const emoji = LogLevelEmojis[level];
    const color = LogLevelColors[level];
    const prefix = `${emoji} [${entry.context}]`;

    const hasData = Object.keys(entry.data).length > 0;

    console.log(
      `%c${prefix} ${entry.message}`,
      `color: ${color}; font-weight: bold`,
      hasData ? entry.data : ''
    );
  }

  /**
   * Get metadata for log entry
   * @returns {Object}
   */
  getMetadata() {
    return {
      url: typeof window !== 'undefined' ? window.location?.href : 'background',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown'
    };
  }

  /**
   * Debug log
   * @param {string} message - Message
   * @param {Object} data - Data
   */
  debug(message, data = {}) {
    this.log(LogLevel.DEBUG, message, data);
  }

  /**
   * Info log
   * @param {string} message - Message
   * @param {Object} data - Data
   */
  info(message, data = {}) {
    this.log(LogLevel.INFO, message, data);
  }

  /**
   * Warning log
   * @param {string} message - Message
   * @param {Object} data - Data
   */
  warn(message, data = {}) {
    this.log(LogLevel.WARN, message, data);
  }

  /**
   * Error log
   * @param {string} message - Message
   * @param {Object} data - Data
   */
  error(message, data = {}) {
    this.log(LogLevel.ERROR, message, data);
  }

  /**
   * Critical log
   * @param {string} message - Message
   * @param {Object} data - Data
   */
  critical(message, data = {}) {
    this.log(LogLevel.CRITICAL, message, data);
  }

  /**
   * Create child logger with sub-context
   * @param {string} subContext - Sub-context name
   * @returns {Logger}
   */
  child(subContext) {
    const childLogger = new Logger(
      `${this.context}:${subContext}`,
      this.minLevel
    );
    childLogger.transports = this.transports;
    return childLogger;
  }

  /**
   * Measure execution time
   * @param {string} label - Timer label
   * @returns {Function} - Stop function
   */
  time(label) {
    const start = performance.now();
    this.debug(`⏱️ Timer started: ${label}`);

    return () => {
      const duration = performance.now() - start;
      this.debug(`⏱️ Timer stopped: ${label}`, { duration: `${duration.toFixed(2)}ms` });
      return duration;
    };
  }

  /**
   * Group logs
   * @param {string} label - Group label
   */
  group(label) {
    if (typeof console.group === 'function') {
      console.group(`[${this.context}] ${label}`);
    }
  }

  /**
   * End group
   */
  groupEnd() {
    if (typeof console.groupEnd === 'function') {
      console.groupEnd();
    }
  }
}

/**
 * Console transport - logs to browser console
 */
export class ConsoleTransport {
  log(entry, level) {
    const emoji = LogLevelEmojis[level];
    const color = LogLevelColors[level];
    const prefix = `${emoji} [${entry.context}]`;

    const hasData = Object.keys(entry.data).length > 0;

    console.log(
      `%c${prefix} ${entry.message}`,
      `color: ${color}; font-weight: bold`,
      hasData ? entry.data : ''
    );
  }
}

/**
 * Storage transport - logs to chrome storage
 */
export class StorageTransport {
  constructor(maxLogs = 100) {
    this.maxLogs = maxLogs;
    this.storageKey = 'app_logs';
  }

  async log(entry, level) {
    try {
      // Only log ERROR and CRITICAL to storage
      if (level < LogLevel.ERROR) {
        return;
      }

      const result = await chrome.storage.local.get(this.storageKey);
      const logs = result[this.storageKey] || [];

      logs.push(entry);

      // Keep only last maxLogs entries
      const trimmedLogs = logs.slice(-this.maxLogs);

      await chrome.storage.local.set({
        [this.storageKey]: trimmedLogs
      });
    } catch (error) {
      console.error('StorageTransport error:', error);
    }
  }

  async getLogs() {
    try {
      const result = await chrome.storage.local.get(this.storageKey);
      return result[this.storageKey] || [];
    } catch (error) {
      console.error('Error getting logs:', error);
      return [];
    }
  }

  async clearLogs() {
    try {
      await chrome.storage.local.remove(this.storageKey);
    } catch (error) {
      console.error('Error clearing logs:', error);
    }
  }
}

// Global logger instance
export const logger = new Logger('RecapTube', LogLevel.INFO);
logger.addTransport(new ConsoleTransport());

// Add storage transport for errors
if (typeof chrome !== 'undefined' && chrome.storage) {
  logger.addTransport(new StorageTransport());
}
