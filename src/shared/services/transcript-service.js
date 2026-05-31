// transcript-service.js - Transcript extraction and management service

import { TranscriptError, TranscriptNotAvailableError, TranscriptExtractionError } from '../errors/index.js';
import { logger } from '../logger/index.js';
import { TranscriptValidator } from '../validators/index.js';
import { Transcript } from '../models/index.js';
import { SELECTORS, INTERCEPTOR } from '../constants.js';

/**
 * TranscriptService - Handles transcript extraction and processing
 *
 * Extraction strategy (hybrid, resilient to YouTube redesigns):
 *   1. PRIMARY  - MAIN-world network interceptor reads YouTube's own get_transcript
 *                 JSON response (no dependency on CSS class names). See transcript-interceptor.js.
 *   2. FALLBACK - DOM scraping of the rendered transcript panel with resilient selectors.
 * Opening the transcript panel is what makes the page issue its authenticated
 * get_transcript request, so both paths start by opening the panel.
 */
export class TranscriptService {
  constructor() {
    this.logger = logger.child('TranscriptService');
    this.maxRetries = 12;
    this.retryDelay = 800;

    // Latest transcript captured by the MAIN-world interceptor, keyed by videoId.
    this._intercepted = null;
    this._bridgeSetup = false;

    // Active selectors. Healed selectors (from AI self-heal) are merged on top of
    // these defaults as additional, comma-combined fallbacks - never replacing them,
    // so a stale healed selector can never be worse than the built-in default.
    this._defaultSelectors = {
      DESCRIPTION_EXPANDER: SELECTORS.DESCRIPTION_EXPANDER,
      TRANSCRIPT_BUTTON_SECTION: SELECTORS.TRANSCRIPT_BUTTON_SECTION,
      TRANSCRIPT_PANEL: SELECTORS.TRANSCRIPT_PANEL,
      TRANSCRIPT_SEGMENTS: SELECTORS.TRANSCRIPT_SEGMENTS,
      SEGMENT_TIMESTAMP: SELECTORS.SEGMENT_TIMESTAMP,
      SEGMENT_TEXT: SELECTORS.SEGMENT_TEXT
    };
    this.selectors = { ...this._defaultSelectors };
    this.healedSelectors = null;
    this._healedLoaded = false;

    // Optional UI notifier injected by the content script: (message, type) => void
    this.notifier = null;
  }

  /**
   * Register a UI notifier so the service can surface user-facing messages
   * (e.g. when self-heal kicks in). Safe no-op if never set.
   * @param {(message: string, type: string) => void} fn
   */
  setNotifier(fn) {
    if (typeof fn === 'function') this.notifier = fn;
  }

  /**
   * Emit a user-facing notification if a notifier is registered.
   * @param {string} message
   * @param {string} type - info | success | warning | error
   */
  notify(message, type = 'info') {
    try {
      if (this.notifier) this.notifier(message, type);
    } catch (error) {
      this.logger.debug('Notifier threw', { error: error.message });
    }
  }

  /** Map from AI heal-result keys to internal selector keys. */
  static get HEAL_KEY_MAP() {
    return {
      descriptionExpanderSelector: 'DESCRIPTION_EXPANDER',
      transcriptButtonSelector: 'TRANSCRIPT_BUTTON_SECTION',
      panelSelector: 'TRANSCRIPT_PANEL',
      segmentSelector: 'TRANSCRIPT_SEGMENTS',
      timestampSelector: 'SEGMENT_TIMESTAMP',
      textSelector: 'SEGMENT_TEXT'
    };
  }

  /**
   * Test whether a string is a syntactically valid CSS selector.
   * @param {string} selector
   * @returns {boolean}
   */
  isValidSelector(selector) {
    if (typeof selector !== 'string' || !selector.trim()) return false;
    try {
      document.querySelector(selector);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Merge AI-provided selectors on top of the defaults (as comma-combined
   * fallbacks). Only syntactically valid selectors are accepted.
   * @param {Object} healed - Heal-result map
   * @returns {Object} - Accepted heal entries (subset of `healed`)
   */
  applyHealedSelectors(healed) {
    const accepted = {};
    if (!healed || typeof healed !== 'object') return accepted;

    for (const [healKey, selKey] of Object.entries(TranscriptService.HEAL_KEY_MAP)) {
      const value = healed[healKey];
      if (!this.isValidSelector(value)) continue;

      const base = this._defaultSelectors[selKey];
      // Combine so both healed and default are tried; avoid duplicate.
      this.selectors[selKey] = base && base !== value ? `${value}, ${base}` : value;
      accepted[healKey] = value;
    }

    if (Object.keys(accepted).length > 0) {
      this.healedSelectors = { ...(this.healedSelectors || {}), ...accepted };
    }
    return accepted;
  }

  /**
   * Load cached healed selectors from storage once per session.
   * @returns {Promise<void>}
   */
  async loadHealedSelectors() {
    if (this._healedLoaded) return;
    this._healedLoaded = true;
    try {
      const { healedSelectors } = await chrome.storage.local.get('healedSelectors');
      if (healedSelectors) {
        const accepted = this.applyHealedSelectors(healedSelectors);
        if (Object.keys(accepted).length > 0) {
          this.logger.info('Loaded cached healed selectors', { keys: Object.keys(accepted) });
        }
      }
    } catch (error) {
      this.logger.debug('No cached healed selectors', { error: error.message });
    }
  }

  /**
   * Persist the current healed selectors to storage.
   * @returns {Promise<void>}
   */
  async persistHealedSelectors() {
    try {
      if (this.healedSelectors) {
        await chrome.storage.local.set({ healedSelectors: this.healedSelectors });
      }
    } catch (error) {
      this.logger.warn('Failed to persist healed selectors', { error: error.message });
    }
  }

  /**
   * Build a pruned HTML snapshot of the regions relevant to transcript extraction
   * (description/metadata + engagement panels). Inline styles, scripts, SVGs and
   * comments are stripped and the result is size-capped to keep the AI call cheap.
   * @returns {string|null}
   */
  buildDomSnapshot() {
    const regions = [];
    const meta = document.querySelector('ytd-watch-metadata') || document.querySelector('#below');
    if (meta) regions.push(meta);
    document.querySelectorAll('ytd-engagement-panel-section-list-renderer').forEach((p) => regions.push(p));

    if (regions.length === 0) return null;

    let html = regions.map((r) => r.outerHTML).join('\n');
    html = html
      .replace(/<svg[\s\S]*?<\/svg>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\sstyle="[^"]*"/gi, '')
      .replace(/\sdata-[a-z-]+="[^"]*"/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    return html.slice(0, 12000);
  }

  /**
   * Last-resort recovery: snapshot the page, ask the AI (via background) for
   * working selectors, validate and merge them, and persist on success.
   * @returns {Promise<boolean>} - true if new selectors were applied
   */
  async selfHeal() {
    try {
      const snapshot = this.buildDomSnapshot();
      if (!snapshot) {
        this.logger.warn('Self-heal skipped: no DOM snapshot available');
        return false;
      }

      this.notify('🔧 YouTube layout changed — adapting automatically with AI…', 'info');

      const response = await chrome.runtime.sendMessage({
        action: 'healSelectors',
        data: { snapshot, url: location.href }
      });

      if (!response || !response.success || !response.selectors) {
        this.logger.warn('Self-heal returned no selectors', { error: response && response.error });
        return false;
      }

      const accepted = this.applyHealedSelectors(response.selectors);
      const keys = Object.keys(accepted);
      if (keys.length === 0) {
        this.logger.warn('Self-heal selectors were invalid or unusable');
        return false;
      }

      await this.persistHealedSelectors();
      this.logger.info('Self-heal applied new selectors', { keys });
      this.notify('✅ Adapted to YouTube\'s new layout', 'success');
      return true;
    } catch (error) {
      this.logger.error('Self-heal failed', { error: error.message });
      return false;
    }
  }

  /**
   * Register the window message bridge that receives transcripts captured by the
   * MAIN-world interceptor (transcript-interceptor.js). Idempotent.
   */
  setupInterceptorBridge() {
    if (this._bridgeSetup) return;
    this._bridgeSetup = true;

    window.addEventListener('message', (event) => {
      if (event.source !== window) return;
      const data = event.data;
      if (!data || data.source !== INTERCEPTOR.MESSAGE_SOURCE || data.type !== INTERCEPTOR.MESSAGE_TYPE) {
        return;
      }
      const payload = data.payload;
      if (payload && Array.isArray(payload.segments) && payload.segments.length > 0) {
        this._intercepted = { videoId: payload.videoId, segments: payload.segments };
        this.logger.info('Interceptor captured transcript', {
          videoId: payload.videoId,
          segments: payload.segments.length
        });
      }
    });

    this.logger.debug('Interceptor bridge ready');
  }

  /**
   * Read an interceptor-captured transcript for the given video, if available.
   * @param {string} videoId
   * @returns {Array|null}
   */
  getInterceptedTranscript(videoId) {
    if (this._intercepted && (!videoId || this._intercepted.videoId === videoId)) {
      return this._intercepted.segments;
    }
    return null;
  }

  /**
   * Extract transcript from DOM
   * @param {string} videoId - Video ID
   * @param {string} channelId - Channel ID
   * @returns {Promise<Transcript>}
   */
  async extractFromDOM(videoId, channelId = '') {
    const stopTimer = this.logger.time(`Extract transcript for ${videoId}`);

    try {
      this.logger.info(`Extracting transcript`, { videoId });

      // Ensure we are listening for interceptor-captured transcripts and that any
      // previously healed selectors are loaded.
      this.setupInterceptorBridge();
      await this.loadHealedSelectors();

      // Attempt 1: interceptor (primary) + DOM (fallback).
      let transcriptData = await this.attemptExtraction(videoId);

      // Attempt 2 (last resort): AI self-heal of the selectors, then retry once.
      if (!transcriptData || transcriptData.length === 0) {
        this.logger.warn('Extraction failed; attempting AI self-heal', { videoId });
        const healed = await this.selfHeal();
        if (healed) {
          transcriptData = await this.attemptExtraction(videoId);
        }
      }

      if (!transcriptData || transcriptData.length === 0) {
        throw new TranscriptNotAvailableError(videoId);
      }

      // Create transcript model
      const transcript = Transcript.fromDOM(transcriptData, videoId, channelId);

      // Validate
      TranscriptValidator.validate(transcript);

      stopTimer();

      this.logger.info(`Transcript extracted successfully`, {
        videoId,
        wordCount: transcript.getWordCount(),
        segmentCount: transcript.segments.length
      });

      return transcript;
    } catch (error) {
      stopTimer();
      this.logger.error(`Transcript extraction failed`, {
        videoId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Open the transcript panel and wait for transcript data (interceptor or DOM).
   * Returns null instead of throwing so the caller can decide whether to self-heal.
   * @param {string} videoId
   * @returns {Promise<Array|null>}
   */
  async attemptExtraction(videoId) {
    const opened = await this.openTranscriptPanel();
    if (!opened) {
      this.logger.warn('Could not open transcript panel', { videoId });
    }
    return this.waitForTranscript(videoId);
  }

  /**
   * Expand the video description ("...more"), which since 2024 hides the
   * "Show transcript" button until expanded.
   * @returns {Promise<void>}
   */
  async expandDescription() {
    try {
      const expander = document.querySelector(this.selectors.DESCRIPTION_EXPANDER);
      if (expander && expander.offsetParent !== null) {
        expander.click();
        this.logger.debug('Expanded video description');
        await this.delay(400);
      }
    } catch (error) {
      this.logger.debug('Description expand skipped', { error: error.message });
    }
  }

  /**
   * Find the "Show transcript" button, supporting the modern description section
   * and multiple languages (text + aria-label).
   * @returns {HTMLElement|null}
   */
  findTranscriptButton() {
    // Preferred: the dedicated transcript section button inside the description.
    const sectionBtn = document.querySelector(this.selectors.TRANSCRIPT_BUTTON_SECTION);
    if (sectionBtn) return sectionBtn;

    // Fallback: any button/aria-label mentioning transcript (EN + IT).
    const candidates = Array.from(document.querySelectorAll('button, ytd-button-renderer, a'));
    return candidates.find((el) => {
      const text = (el.textContent || '').toLowerCase();
      const aria = (el.getAttribute('aria-label') || '').toLowerCase();
      return text.includes('transcript') || text.includes('trascri') ||
             aria.includes('transcript') || aria.includes('trascri');
    }) || null;
  }

  /**
   * Open transcript panel
   * @returns {Promise<boolean>}
   */
  async openTranscriptPanel() {
    try {
      // Already open?
      const existing = document.querySelector(this.selectors.TRANSCRIPT_PANEL);
      if (existing && existing.offsetParent !== null) {
        this.logger.debug('Transcript panel already open');
        return true;
      }

      // The transcript button is hidden inside the collapsed description.
      await this.expandDescription();

      let transcriptButton = this.findTranscriptButton();

      // Button may render slightly after the description expands - retry briefly.
      for (let i = 0; i < 4 && !transcriptButton; i++) {
        await this.delay(400);
        transcriptButton = this.findTranscriptButton();
      }

      if (!transcriptButton) {
        this.logger.debug('Transcript button not found');
        return false;
      }

      transcriptButton.click();
      this.logger.debug('Clicked transcript button');

      await this.delay(500);
      return true;
    } catch (error) {
      this.logger.warn('Failed to open transcript panel', { error: error.message });
      return false;
    }
  }

  /**
   * Wait for a transcript to become available, preferring the interceptor
   * (YouTube's own JSON) and falling back to DOM scraping.
   * @param {string} videoId
   * @returns {Promise<Array>}
   */
  async waitForTranscript(videoId = '') {
    for (let i = 0; i < this.maxRetries; i++) {
      this.logger.debug(`Checking for transcript (attempt ${i + 1}/${this.maxRetries})`);

      // 1) PRIMARY: interceptor-captured transcript (robust, no CSS dependency).
      const intercepted = this.getInterceptedTranscript(videoId);
      if (intercepted && intercepted.length > 0) {
        this.logger.info(`Transcript via interceptor (${intercepted.length} segments)`);
        return intercepted;
      }

      // 2) FALLBACK: scrape the rendered DOM panel.
      const transcriptData = this.extractTranscriptData();
      if (transcriptData && transcriptData.length > 0) {
        this.logger.info(`Transcript via DOM (${transcriptData.length} segments)`);
        return transcriptData;
      }

      await this.delay(this.retryDelay);
    }

    this.logger.debug('Transcript not found after retries');
    return null;
  }

  /**
   * Parse a YouTube timestamp string ("0:00", "1:23", "1:23:45") to seconds.
   * @param {string} timeText
   * @returns {number|null}
   */
  parseTimestamp(timeText) {
    const parts = (timeText || '').trim().split(':').map((p) => parseInt(p, 10));
    if (parts.some((n) => isNaN(n))) return null;
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return null;
  }

  /**
   * Extract transcript data by scraping the rendered DOM panel (fallback path).
   * Uses resilient selectors with class-substring fallbacks so minor renames
   * (e.g. ".segment-text" -> "...cue-text") still work.
   * @returns {Array|null}
   */
  extractTranscriptData() {
    try {
      const panel = document.querySelector(this.selectors.TRANSCRIPT_PANEL);
      if (!panel) return null;

      const segments = panel.querySelectorAll(this.selectors.TRANSCRIPT_SEGMENTS);
      if (!segments || segments.length === 0) return null;

      const transcriptData = Array.from(segments).map((segment) => {
        const timeElement = segment.querySelector(this.selectors.SEGMENT_TIMESTAMP);
        const textElement = segment.querySelector(this.selectors.SEGMENT_TEXT);
        if (!timeElement || !textElement) return null;

        const timeSeconds = this.parseTimestamp(timeElement.textContent);
        const text = textElement.textContent.trim();
        if (timeSeconds === null || !text) return null;

        return { time: timeSeconds, text };
      }).filter((item) => item !== null);

      return transcriptData.length > 0 ? transcriptData : null;
    } catch (error) {
      this.logger.warn('Error extracting transcript data', { error: error.message });
      return null;
    }
  }

  /**
   * Extract from player config (fallback method)
   * @param {string} videoId - Video ID
   * @returns {Promise<Transcript|null>}
   */
  async extractFromPlayerConfig(videoId) {
    try {
      this.logger.debug(`Trying player config extraction`, { videoId });

      // Access ytInitialPlayerResponse
      if (typeof window.ytInitialPlayerResponse === 'undefined') {
        this.logger.debug(`ytInitialPlayerResponse not available`);
        return null;
      }

      const captions = window.ytInitialPlayerResponse?.captions;
      if (!captions) {
        this.logger.debug(`No captions in player config`);
        return null;
      }

      const captionTracks = captions.playerCaptionsTracklistRenderer?.captionTracks;
      if (!captionTracks || captionTracks.length === 0) {
        this.logger.debug(`No caption tracks found`);
        return null;
      }

      // Find English track or first available
      const track = captionTracks.find(t => t.languageCode === 'en') || captionTracks[0];

      this.logger.info(`Found caption track`, {
        videoId,
        language: track.languageCode
      });

      // Note: Cannot fetch due to CORS, but we know transcript exists
      return null;
    } catch (error) {
      this.logger.warn(`Player config extraction failed`, { error: error.message });
      return null;
    }
  }

  /**
   * Check if transcript is available
   * @returns {Promise<boolean>}
   */
  async isTranscriptAvailable() {
    try {
      // Try to open panel
      await this.openTranscriptPanel();

      // Check for segments
      await this.delay(1000);
      const data = this.extractTranscriptData();

      return data !== null && data.length > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Format transcript for display
   * @param {Transcript} transcript - Transcript to format
   * @param {number} maxLength - Maximum length
   * @returns {string}
   */
  formatForDisplay(transcript, maxLength = 500) {
    const excerpt = transcript.getExcerpt(maxLength);
    const metadata = transcript.getMetadata();

    return `Transcript (${metadata.wordCount} words):\n${excerpt}`;
  }

  /**
   * Search transcript
   * @param {Transcript} transcript - Transcript to search
   * @param {string} query - Search query
   * @param {boolean} caseSensitive - Case sensitive
   * @returns {Array}
   */
  searchTranscript(transcript, query, caseSensitive = false) {
    const results = transcript.search(query, caseSensitive);

    this.logger.debug(`Transcript search`, {
      query,
      resultsCount: results.length
    });

    return results;
  }

  /**
   * Get segment at time
   * @param {Transcript} transcript - Transcript
   * @param {number} time - Time in seconds
   * @returns {Object|null}
   */
  getSegmentAtTime(transcript, time) {
    return transcript.getSegmentAtTime(time);
  }

  /**
   * Validate transcript quality
   * @param {Transcript} transcript - Transcript to validate
   * @returns {Object}
   */
  validateQuality(transcript) {
    const metadata = transcript.getMetadata();

    const quality = {
      isValid: true,
      hasSufficientContent: metadata.hasSufficientContent,
      wordCount: metadata.wordCount,
      charCount: metadata.charCount,
      segmentCount: metadata.segmentCount,
      issues: []
    };

    // Check word count
    if (metadata.wordCount < 50) {
      quality.isValid = false;
      quality.issues.push('Transcript too short (less than 50 words)');
    }

    // Check segment count
    if (metadata.segmentCount === 0 && transcript.text.length > 0) {
      quality.issues.push('No segments available (may affect timestamp accuracy)');
    }

    // Check for empty text
    if (metadata.charCount === 0) {
      quality.isValid = false;
      quality.issues.push('Transcript is empty');
    }

    return quality;
  }

  /**
   * Delay helper
   * @param {number} ms - Milliseconds
   * @returns {Promise}
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Clean transcript text (remove special characters, normalize whitespace)
   * @param {string} text - Text to clean
   * @returns {string}
   */
  static cleanText(text) {
    return text
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s.,!?-]/g, '')
      .trim();
  }

  /**
   * Merge transcript segments
   * @param {Array} segments - Segments to merge
   * @returns {string}
   */
  static mergeSegments(segments) {
    return segments.map(s => s.text).join(' ');
  }
}
