// utils.js - Utility functions

/**
 * Promisify Chrome API callback-based functions
 * @param {Function} fn - Chrome API function
 * @returns {Function} - Promisified function
 */
export const promisify = (fn) => (...args) =>
  new Promise((resolve, reject) => {
    fn(...args, (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(result);
      }
    });
  });

// Promisified Chrome Storage APIs
export const storage = {
  local: {
    get: promisify(chrome.storage.local.get.bind(chrome.storage.local)),
    set: promisify(chrome.storage.local.set.bind(chrome.storage.local)),
    remove: promisify(chrome.storage.local.remove.bind(chrome.storage.local)),
    clear: promisify(chrome.storage.local.clear.bind(chrome.storage.local))
  }
};

// Promisified Chrome Runtime APIs
export const runtime = {
  sendMessage: promisify(chrome.runtime.sendMessage.bind(chrome.runtime))
};

// Promisified Chrome Tabs APIs
export const tabs = {
  query: promisify(chrome.tabs.query.bind(chrome.tabs)),
  sendMessage: (tabId, message) =>
    promisify(chrome.tabs.sendMessage.bind(chrome.tabs))(tabId, message),
  create: promisify(chrome.tabs.create.bind(chrome.tabs))
};

/**
 * Parse time string to seconds
 * @param {string} timeStr - Time in format "1:23" or "1:23:45"
 * @returns {number} - Time in seconds
 */
export function parseTimeString(timeStr) {
  const parts = timeStr.trim().split(':').map(p => parseInt(p));
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return 0;
}

/**
 * Format seconds to time string
 * @param {number} seconds - Time in seconds
 * @returns {string} - Formatted time "1:23"
 */
export function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format hours and minutes from seconds
 * @param {number} totalSeconds - Total seconds
 * @returns {string} - Formatted as "Xh Ym"
 */
export function formatHoursMinutes(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

/**
 * Extract video ID from URL
 * @param {string} url - YouTube URL
 * @returns {string|null} - Video ID or null
 */
export function extractVideoId(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.searchParams.get('v');
  } catch {
    return null;
  }
}

/**
 * Check if URL is a YouTube watch page
 * @param {string} url - URL to check
 * @returns {boolean}
 */
export function isYouTubeWatchPage(url) {
  return url && url.includes('youtube.com/watch');
}

/**
 * Debounce function
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in ms
 * @returns {Function} - Debounced function
 */
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Throttle function
 * @param {Function} func - Function to throttle
 * @param {number} limit - Time limit in ms
 * @returns {Function} - Throttled function
 */
export function throttle(func, limit) {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * Wait for element to appear in DOM
 * @param {string} selector - CSS selector
 * @param {number} timeout - Timeout in ms
 * @returns {Promise<Element|null>}
 */
export function waitForElement(selector, timeout = 5000) {
  return new Promise((resolve) => {
    const element = document.querySelector(selector);
    if (element) {
      resolve(element);
      return;
    }

    const observer = new MutationObserver(() => {
      const element = document.querySelector(selector);
      if (element) {
        observer.disconnect();
        clearTimeout(timer);
        resolve(element);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    const timer = setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeout);
  });
}

/**
 * Retry async function with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} baseDelay - Base delay in ms
 * @returns {Promise<any>}
 */
export async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      const delay = baseDelay * Math.pow(2, i);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

/**
 * Deep merge objects
 * @param {Object} target - Target object
 * @param {Object} source - Source object
 * @returns {Object} - Merged object
 */
export function deepMerge(target, source) {
  const output = { ...target };
  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach(key => {
      if (isObject(source[key])) {
        if (!(key in target)) {
          Object.assign(output, { [key]: source[key] });
        } else {
          output[key] = deepMerge(target[key], source[key]);
        }
      } else {
        Object.assign(output, { [key]: source[key] });
      }
    });
  }
  return output;
}

/**
 * Check if value is an object
 * @param {any} item - Value to check
 * @returns {boolean}
 */
function isObject(item) {
  return item && typeof item === 'object' && !Array.isArray(item);
}

/**
 * Replace template variables in string
 * @param {string} template - Template string with {var} placeholders
 * @param {Object} vars - Variables object
 * @returns {string}
 */
export function templateReplace(template, vars) {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    return vars[key] !== undefined ? vars[key] : match;
  });
}

/**
 * Generate cache key for video analysis
 * @param {string} videoId - YouTube video ID
 * @returns {string}
 */
export function generateCacheKey(videoId) {
  return `analysis_${videoId}`;
}

/**
 * Check if cache entry is expired
 * @param {number} timestamp - Entry timestamp
 * @param {number} maxAgeDays - Maximum age in days
 * @returns {boolean}
 */
export function isCacheExpired(timestamp, maxAgeDays) {
  const now = Date.now();
  const maxAge = maxAgeDays * 24 * 60 * 60 * 1000;
  return now - timestamp > maxAge;
}
