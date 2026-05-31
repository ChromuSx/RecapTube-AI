// recap-service.js - AI orchestration for RecapTube (provider-agnostic)
//
// One AI call produces: a summary written directly in the target language (so translation
// is implicit), key points, and topic chapters with timestamps. Reuses the same pluggable
// provider abstraction as the analysis layer (createPayload -> sendRequest -> parseResponse).
import { CONFIG } from '../config.js';
import { createProvider } from './providers/index.js';
import { logger } from '../logger/index.js';

export class RecapService {
  constructor(apiKey, providerName = null) {
    this.apiKey = apiKey;
    this.providerName = providerName || CONFIG.AI_PROVIDERS.CLAUDE.NAME;
    const pc = CONFIG.AI_PROVIDERS[this.providerName.toUpperCase()] || CONFIG.AI_PROVIDERS.CLAUDE;
    this.provider = createProvider(this.providerName, apiKey, {
      baseUrl: pc.ENDPOINT,
      timeout: pc.TIMEOUT,
      version: pc.VERSION
    });
    this.logger = logger.child('RecapService');
  }

  /**
   * Generate a recap (summary + key points + chapters) from a transcript.
   * @param {Transcript} transcript - Transcript model (has formatForAI())
   * @param {Object} opts
   * @param {string} opts.targetLanguage - Human-readable language name for the AI ("Italian", "English"...)
   * @param {boolean} opts.needChapters - false when the video already has native chapters
   * @param {string} opts.summaryLength - 'short' | 'medium' | 'long'
   * @param {string} opts.aiModel - provider model key (e.g. 'haiku', 'gpt-5.4-mini')
   * @param {number} opts.durationSec - video duration (to clamp chapter timestamps)
   * @param {string} opts.title - video title (extra context)
   * @returns {Promise<{language:string, summary:string, keyPoints:string[], chapters:Array<{start:number,title:string}>}>}
   */
  async generateRecap(transcript, opts = {}) {
    const stopTimer = this.logger.time('generateRecap');
    const {
      targetLanguage = 'English',
      needChapters = true,
      summaryLength = 'medium',
      aiModel,
      durationSec = 0,
      title = ''
    } = opts;

    try {
      const formatted = transcript.formatForAI();
      const systemPrompt = this.buildSystemPrompt({ targetLanguage, needChapters, summaryLength });
      const userMessage = this.buildUserMessage(formatted, title);

      const payload = this.provider.createPayload(systemPrompt, userMessage, aiModel);

      this.logger.info('Requesting recap from AI', {
        provider: this.providerName,
        model: aiModel || 'default',
        targetLanguage,
        needChapters
      });

      const response = await this.provider.sendRequest(payload);
      const parsed = this.provider.parseResponse(response) || {};

      const result = {
        language: typeof parsed.language === 'string' ? parsed.language : targetLanguage,
        summary: typeof parsed.summary === 'string' ? parsed.summary.trim() : '',
        keyPoints: Array.isArray(parsed.keyPoints)
          ? parsed.keyPoints.filter(p => typeof p === 'string' && p.trim()).map(p => p.trim())
          : [],
        chapters: needChapters ? this.normalizeChapters(parsed.chapters, durationSec) : []
      };

      this.logger.info('Recap ready', {
        summaryChars: result.summary.length,
        keyPoints: result.keyPoints.length,
        chapters: result.chapters.length
      });
      stopTimer();
      return result;
    } catch (error) {
      stopTimer();
      this.logger.error('Recap generation failed', { error: error.message });
      throw error;
    }
  }

  buildSystemPrompt({ targetLanguage, needChapters, summaryLength }) {
    const lengthGuide = {
      short: '2-3 sentences and 3-4 key points',
      medium: '1-2 short paragraphs and 4-6 key points',
      long: '3-4 paragraphs and 6-10 key points'
    }[summaryLength] || '1-2 short paragraphs and 4-6 key points';

    const chaptersRule = needChapters
      ? `- "chapters": an ordered list of topic chapters covering the whole video. Each chapter is { "start": <integer seconds>, "title": "<3-7 word title in ${targetLanguage}>" }. The first chapter MUST start at 0. Create a new chapter only when the topic clearly changes (aim for one every 1-5 minutes; typically 4-15 chapters total). Use the [Ns] timestamps from the transcript for "start".`
      : `- "chapters": MUST be an empty array []. This video already has chapters, so do not generate any.`;

    return `You are an expert at summarizing YouTube videos from their transcript.

Write ALL human-readable output (the summary, key points and chapter titles) in ${targetLanguage}, regardless of the transcript's original language. Translate naturally; never copy the source language if it differs.

Produce a JSON object with these fields:
- "language": the BCP-47 code of ${targetLanguage} (e.g. "it", "en").
- "summary": a faithful, neutral summary of what the video covers (${lengthGuide.split(' and ')[0]}). No marketing tone, no "in this video"; just the substance.
- "keyPoints": an array of the most important takeaways (${lengthGuide.split(' and ')[1] || 'key points'}), each a single concise sentence.
${chaptersRule}

RULES:
1. Base everything strictly on the transcript. Do not invent facts.
2. Output VALID JSON only — no markdown, no commentary outside the JSON.
3. Keep chapter "start" values within the video length and strictly increasing.

Output format:
{
  "language": "<bcp-47>",
  "summary": "<text in ${targetLanguage}>",
  "keyPoints": ["<point 1>", "<point 2>"],
  "chapters": [ { "start": 0, "title": "<title>" } ]
}`;
  }

  buildUserMessage(formattedTranscript, title) {
    const head = title ? `Video title: ${title}\n\n` : '';
    return `${head}Transcript (each line is "[<seconds>s] text"):\n\n${formattedTranscript}\n\nSummarize and (if requested) split into chapters. Respond with JSON only.`;
  }

  /**
   * Validate, sort, clamp and dedupe AI chapters.
   */
  normalizeChapters(rawChapters, durationSec) {
    if (!Array.isArray(rawChapters)) return [];
    const max = durationSec && durationSec > 0 ? Math.floor(durationSec) : Infinity;

    const cleaned = rawChapters
      .map(c => ({
        start: Math.max(0, Math.floor(Number(c && c.start))),
        title: (c && typeof c.title === 'string' ? c.title.trim() : '')
      }))
      .filter(c => Number.isFinite(c.start) && c.start <= max && c.title.length > 0)
      .sort((a, b) => a.start - b.start);

    // Drop duplicates / out-of-order starts
    const result = [];
    let lastStart = -1;
    for (const c of cleaned) {
      if (c.start <= lastStart) continue;
      result.push(c);
      lastStart = c.start;
    }

    // Ensure the first chapter anchors at 0
    if (result.length > 0 && result[0].start !== 0) {
      result.unshift({ start: 0, title: result[0].title });
      // remove the accidental duplicate title carry if the next is also 0 (can't happen) - safe
    }
    return result;
  }

  // ---- Self-heal (AI-driven DOM selector recovery) ----
  // Returns the SAME shape TranscriptService.applyHealedSelectors() expects, so the
  // transcript layer's recovery works unchanged. A stronger model is forced.
  async healSelectors(snapshot) {
    const model = this.providerName === CONFIG.AI_PROVIDERS.OPENAI.NAME ? 'gpt-5.5' : 'sonnet';
    const systemPrompt = this.getHealSystemPrompt();
    const userMessage = `<dom_snapshot>\n${snapshot}\n</dom_snapshot>\n\nReturn ONLY the selectors JSON object.`;

    const payload = this.provider.createPayload(systemPrompt, userMessage, model);
    const response = await this.provider.sendRequest(payload);
    const parsed = this.provider.parseResponse(response);

    const result = this.normalizeHealResult(parsed);
    this.logger.info('Self-heal selectors produced', { model, keys: Object.keys(result) });
    return result;
  }

  /** Keep only string selector values from the parsed heal response. */
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
}
