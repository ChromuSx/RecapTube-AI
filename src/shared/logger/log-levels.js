// log-levels.js - Log level definitions

/**
 * Log levels (ordered by severity)
 */
export const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  CRITICAL: 4,
  NONE: 5
};

/**
 * Log level names
 */
export const LogLevelNames = {
  [LogLevel.DEBUG]: 'DEBUG',
  [LogLevel.INFO]: 'INFO',
  [LogLevel.WARN]: 'WARN',
  [LogLevel.ERROR]: 'ERROR',
  [LogLevel.CRITICAL]: 'CRITICAL',
  [LogLevel.NONE]: 'NONE'
};

/**
 * Log level colors for console
 */
export const LogLevelColors = {
  [LogLevel.DEBUG]: '#9E9E9E',    // Gray
  [LogLevel.INFO]: '#2196F3',     // Blue
  [LogLevel.WARN]: '#FF9800',     // Orange
  [LogLevel.ERROR]: '#F44336',    // Red
  [LogLevel.CRITICAL]: '#9C27B0'  // Purple
};

/**
 * Log level emojis
 */
export const LogLevelEmojis = {
  [LogLevel.DEBUG]: '🔍',
  [LogLevel.INFO]: 'ℹ️',
  [LogLevel.WARN]: '⚠️',
  [LogLevel.ERROR]: '❌',
  [LogLevel.CRITICAL]: '🔥'
};
