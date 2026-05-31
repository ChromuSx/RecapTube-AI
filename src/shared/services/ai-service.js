// ai-service.js - AI analysis service

import { APIError, APIKeyError } from '../errors/index.js';
import { logger } from '../logger/index.js';
import { APIValidator } from '../validators/index.js';
import { AnalysisResult, Segment } from '../models/index.js';
import { CONFIG } from '../config.js';
import { AIProvider } from './providers/index.js';

/**
 * AIService - Handles AI analysis operations using pluggable providers
 */
export class AIService {
  constructor(provider) {
    if (!provider || !(provider instanceof AIProvider)) {
      throw new Error('Valid AIProvider instance required');
    }

    this.provider = provider;
    this.logger = logger.child('AIService');
  }

  /**
   * Analyze transcript with AI
   * @param {Transcript} transcript - Transcript to analyze
   * @param {AdvancedSettings} advancedSettings - Advanced settings
   * @param {Settings} userSettings - User settings (for enabled categories)
   * @returns {Promise<AnalysisResult>}
   */
  async analyzeTranscript(transcript, advancedSettings, userSettings = null) {
    const stopTimer = this.logger.time(`AI analysis for ${transcript.videoId}`);

    try {
      // Get enabled categories from user settings
      const enabledCategories = userSettings
        ? this.getEnabledAICategories(userSettings)
        : null; // null means all categories

      this.logger.info(`Starting AI analysis`, {
        videoId: transcript.videoId,
        model: advancedSettings.aiModel,
        wordCount: transcript.getWordCount(),
        enabledCategories: enabledCategories || 'all'
      });

      // Format transcript for AI
      const formattedText = transcript.formatForAI();

      // Create prompts
      const systemPrompt = this.getSystemPrompt(enabledCategories);
      const userMessage = this.getUserMessage(formattedText);

      // Create request payload with enabled categories
      const payload = this.provider.createPayload(systemPrompt, userMessage, advancedSettings.aiModel);

      // Validate payload
      APIValidator.validateRequestPayload(payload);

      // Send request
      const response = await this.provider.sendRequest(payload);

      // Parse response (each provider handles its own response structure)
      const parsed = this.provider.parseResponse(response);

      // Validate parsed response
      APIValidator.validateParsedResponse(parsed);

      // Filter by confidence threshold
      const filteredSegments = this.filterByConfidence(
        parsed.segments,
        advancedSettings.confidenceThreshold
      );

      // Create segments
      const segments = filteredSegments.map(s => Segment.fromAPI(s));

      // Create result
      const result = new AnalysisResult(transcript.videoId, segments, {
        model: advancedSettings.aiModel,
        transcriptLength: transcript.getCharCount(),
        processingTime: stopTimer()
      });

      this.logger.info(`AI analysis complete`, {
        videoId: transcript.videoId,
        segmentCount: result.getSegmentCount(),
        duration: result.getTotalSkipDuration()
      });

      return result;
    } catch (error) {
      stopTimer();
      this.logger.error(`AI analysis failed`, {
        videoId: transcript.videoId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get enabled AI categories from user settings
   * @param {Settings} userSettings - User settings
   * @returns {Array<Object>} Array of enabled category objects
   */
  getEnabledAICategories(userSettings) {
    const categories = [];

    if (userSettings.skipSponsors) {
      categories.push({
        name: 'sponsorships',
        description: 'Paid promotions, sponsored content'
      });
    }

    if (userSettings.skipIntros) {
      categories.push({
        name: 'intro',
        description: 'Opening sequences, channel intros'
      });
    }

    if (userSettings.skipOutros) {
      categories.push({
        name: 'outro',
        description: 'Closing sequences, end screens'
      });
    }

    if (userSettings.skipDonations) {
      categories.push({
        name: 'donations',
        description: 'Super chat acknowledgments, donation mentions'
      });
    }

    if (userSettings.skipSelfPromo) {
      categories.push({
        name: 'channel_self_promo',
        description: 'Channel promotions, merch plugs, social media callouts'
      });
    }

    return categories;
  }

  /**
   * Get system prompt
   * @param {Array<Object>} enabledCategories - Enabled categories (null = all)
   * @returns {string}
   */
  getSystemPrompt(enabledCategories = null) {
    // Default categories if none specified
    const defaultCategories = [
      { name: 'sponsorships', description: 'Paid promotions, sponsored content' },
      { name: 'intro', description: 'Opening sequences, channel intros' },
      { name: 'outro', description: 'Closing sequences, end screens' },
      { name: 'donations', description: 'Super chat acknowledgments, donation mentions' },
      { name: 'channel_self_promo', description: 'Channel promotions, merch plugs, social media callouts' }
    ];

    const categoriesToUse = enabledCategories && enabledCategories.length > 0
      ? enabledCategories
      : defaultCategories;

    // Build category list for prompt
    const categoryList = categoriesToUse
      .map(cat => `- ${cat.name}: ${cat.description}`)
      .join('\n');

    // Build allowed categories for validation
    const allowedCategories = categoriesToUse.map(cat => cat.name).join(', ');

    return `Analyze this YouTube video transcript to identify segments viewers might want to skip.

<objective>
Your task is to identify time ranges in the transcript that fall into these specific categories:

${categoryList}
</objective>

<analysis_steps>
Follow these steps to analyze the transcript:

1. Read through the entire transcript carefully to understand the video's flow and content
2. Identify transitions in content (e.g., sudden topic changes, promotional language, channel-specific callouts)
3. Look for linguistic patterns:
   - Sponsorships: "This video is sponsored by...", "Thanks to [brand] for...", product descriptions with affiliate links
   - Intros: Channel greetings, "Welcome back to...", theme music descriptions, episode numbers
   - Outros: "Thanks for watching", "Don't forget to subscribe", end cards, social media mentions at video end
   - Donations: "Thank you to...", super chat readings, patron shout-outs
   - Self-promotion: "Check out my merch", "Join the Discord", "New video coming", course/product announcements
4. Determine precise start and end timestamps for each identified segment
5. Assign confidence level based on:
   - High (0.9-1.0): Clear, unambiguous promotional/non-content language
   - Medium (0.7-0.89): Probable but with some content mixed in
   - Low (0.5-0.69): Uncertain, could be legitimate content
6. Only include segments with confidence >= 0.5
</analysis_steps>

<output_requirements>
Return ONLY a valid JSON object without any markdown formatting or explanation:

{
  "segments": [
    {
      "start": <integer seconds>,
      "end": <integer seconds>,
      "category": "<one of: ${allowedCategories}>",
      "confidence": <number 0.0-1.0>,
      "description": "<brief 5-10 word description of what happens in this segment>"
    }
  ]
}
</output_requirements>

<guidelines>
- Times MUST be integers in seconds
- Categories MUST be exactly one of: ${allowedCategories}
- Confidence must be a decimal between 0.0 and 1.0
- Description should be concise and specific (e.g., "NordVPN sponsorship read" not just "sponsor")
- ONLY identify segments matching the categories above - ignore everything else
- If no segments found, return empty array: {"segments": []}
- Prefer slightly longer segments over splitting into multiple parts (merge adjacent segments of same category)
- Do NOT include legitimate video content even if briefly mentioning brands/products in educational context
</guidelines>

<examples>
Example of a good segment identification:
{
  "start": 45,
  "end": 98,
  "category": "sponsorships",
  "confidence": 0.95,
  "description": "Surfshark VPN sponsorship with discount code"
}

Example of what NOT to flag:
- Brief product mentions in tutorial/review content
- Creator discussing their past videos as part of current topic
- Genuine acknowledgments integrated into content discussion
</examples>`;
  }

  /**
   * Get user message
   * @param {string} text - Formatted transcript
   * @returns {string}
   */
  getUserMessage(text) {
    return `<transcript>
${text}
</transcript>

Analyze the transcript above and return your analysis as a JSON object containing the segments to skip.`;
  }

  /**
   * Filter segments by confidence threshold
   * @param {Array} segments - Segments from AI
   * @param {number} threshold - Minimum confidence
   * @returns {Array}
   */
  filterByConfidence(segments, threshold) {
    const filtered = segments.filter(segment => {
      return segment.confidence >= threshold;
    });

    this.logger.debug(`Filtered by confidence`, {
      original: segments.length,
      filtered: filtered.length,
      threshold
    });

    return filtered;
  }

  /**
   * Self-heal: ask the AI to derive working DOM selectors from a page snapshot.
   * Used only as a last resort when interceptor + DOM extraction both fail
   * (e.g. YouTube renamed elements). A stronger model is forced for this rare,
   * high-stakes step regardless of the user's configured analysis model.
   * @param {string} snapshot - Pruned HTML snapshot of the watch page
   * @returns {Promise<Object>} - Map of selector keys to CSS selectors (only valid ones)
   */
  async healSelectors(snapshot) {
    const stopTimer = this.logger.time('AI self-heal selectors');

    try {
      // Force the strongest sensible model for the heal step.
      const model = this.provider.getName() === 'openai' ? 'gpt-5.5' : 'sonnet';

      const systemPrompt = this.getHealSystemPrompt();
      const userMessage = `<dom_snapshot>\n${snapshot}\n</dom_snapshot>\n\nReturn ONLY the selectors JSON object.`;

      const payload = this.provider.createPayload(systemPrompt, userMessage, model);
      APIValidator.validateRequestPayload(payload);

      const response = await this.provider.sendRequest(payload);
      const parsed = this.provider.parseResponse(response);

      const result = this.normalizeHealResult(parsed);

      this.logger.info('Self-heal selectors produced', {
        model,
        keys: Object.keys(result)
      });

      stopTimer();
      return result;
    } catch (error) {
      stopTimer();
      this.logger.error('Self-heal selector generation failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Keep only string selector values from the parsed heal response.
   * @param {Object} parsed
   * @returns {Object}
   */
  normalizeHealResult(parsed) {
    const keys = [
      'descriptionExpanderSelector',
      'transcriptButtonSelector',
      'panelSelector',
      'segmentSelector',
      'timestampSelector',
      'textSelector'
    ];
    const out = {};
    for (const key of keys) {
      const value = parsed && parsed[key];
      if (typeof value === 'string' && value.trim()) {
        out[key] = value.trim();
      }
    }
    return out;
  }

  /**
   * System prompt for the self-heal selector task.
   * @returns {string}
   */
  getHealSystemPrompt() {
    return `You are a DOM analysis expert. You are given a pruned HTML snapshot from a YouTube watch page (youtube.com/watch). Inline styles, scripts and SVGs have been stripped, but tag names, id, class, aria-label and target-id attributes are preserved.

<goal>
A browser extension needs CSS selectors to (1) expand the video description, (2) open the transcript panel, and (3) read transcript segments. YouTube periodically renames elements, breaking hard-coded selectors. Derive working selectors from the snapshot.
</goal>

<what_to_find>
- descriptionExpanderSelector: the "...more" / "Show more" button that expands the collapsed description (historically id "expand").
- transcriptButtonSelector: the "Show transcript" button (often inside ytd-video-description-transcript-section-renderer; has aria-label or text mentioning transcript).
- panelSelector: the engagement panel container that holds the transcript (an ytd-engagement-panel-section-list-renderer whose target-id contains "transcript", e.g. "PAmodern_transcript_view").
- segmentSelector: the repeated element representing one transcript line (historically ytd-transcript-segment-renderer).
- timestampSelector: the element INSIDE a segment holding the timestamp text like "1:23" (historically ".segment-timestamp").
- textSelector: the element INSIDE a segment holding the caption text (historically ".segment-text").
</what_to_find>

<rules>
- Prefer STABLE selectors: tag names, target-id substrings, aria-label, semantic ids over hashed/random class names.
- timestampSelector and textSelector must be relative to a single segment element (used via segment.querySelector).
- If an element is not present in the snapshot, set its value to null. Never invent class names you do not see.
- Return ONLY a valid JSON object, no markdown, no commentary.
</rules>

<output_format>
{
  "descriptionExpanderSelector": "<css or null>",
  "transcriptButtonSelector": "<css or null>",
  "panelSelector": "<css or null>",
  "segmentSelector": "<css or null>",
  "timestampSelector": "<css or null>",
  "textSelector": "<css or null>"
}
</output_format>`;
  }

  /**
   * Translate AI category to display name
   * @param {string} category - AI category
   * @returns {string}
   */
  static translateCategory(category) {
    const categoryLower = category.toLowerCase();

    if (categoryLower.includes('sponsor')) return 'Sponsor';
    if (categoryLower.includes('intro') || categoryLower.includes('opening')) return 'Intro';
    if (categoryLower.includes('outro') || categoryLower.includes('closing')) return 'Outro';
    if (categoryLower.includes('donation') || categoryLower.includes('super chat')) return 'Donations';
    if (categoryLower.includes('acknowledgment') || categoryLower.includes('ringraziament')) return 'Acknowledgments';
    if (categoryLower.includes('promo') || categoryLower.includes('merch')) return 'Self-Promo';

    return category;
  }

  /**
   * Test API connection via provider
   * @returns {Promise<boolean>}
   */
  async testConnection() {
    return await this.provider.testConnection();
  }
}
