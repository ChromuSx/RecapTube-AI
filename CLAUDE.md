# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

RecapTube AI is a Chrome extension (Manifest V3) that uses AI to **summarize** YouTube videos, **translate** the summary into the viewer's language, and **auto-generate topic chapters** when the creator didn't add any. It extracts the video transcript, sends it to Claude/OpenAI in a single call, renders the result in an in-page panel next to the video, and draws chapter markers on the progress bar. Results are cached locally per video and language.

It is a **sibling of SkipTube AI** (`../SkipTubeAI`) and reuses its transcript-extraction and provider architecture. The two extensions are designed to coexist on the same page (see "Cross-extension coexistence").

The codebase is a **modular ES-module project under `src/`**, bundled with Rollup into `dist/`. The extension is loaded from `dist/` (never from `src/`).

## Project Structure

```
src/
  manifest.json                      # MV3 manifest (copied to dist/ by the popup build)
  content/
    content-main.js                  # RecapManager — content script (ISOLATED world)
    transcript-interceptor.js        # MAIN-world network interceptor (no imports, RT_* contract)
  background/
    background-main.js               # BackgroundService — service worker
  popup/  help/                      # UI surfaces (popup.html + popup-main.js, help.html, welcome.html)
  shared/
    config.js                        # CONFIG: providers, model IDs, endpoints, recap defaults
    constants.js                     # SELECTORS, INTERCEPTOR (RT_*), CSS_CLASSES (rt-), messages
    services/
      transcript-service.js          # TranscriptService — extraction + AI self-heal (reused from SkipTube)
      recap-service.js               # RecapService — summary + translation + chapters pipeline
      storage-service.js
      providers/                     # claude-provider.js, openai-provider.js, base-provider.js
    models/ repositories/ validators/ errors/ logger/
```

> Note: some files cloned from SkipTube remain in the tree but are **not imported by any bundle** (e.g. `services/ai-service.js`, `models/segment.js`, `models/settings.js`, `models/analysis-result.js`, the stats/analytics repos, `validators/settings-validator.js`). They are dead weight, safe to ignore or delete; only the files reachable from the three entry points end up in `dist/`.

### Build

```bash
npm run build            # builds all 3 bundles into dist/
npm run build:content    # rollup -c rollup.config.content.js     -> dist/content-bundle.js
npm run build:background # rollup -c rollup.config.background.js  -> dist/background-bundle.js
npm run build:popup      # rollup -c rollup.config.popup.js       -> dist/popup-bundle.js (+ copies assets)
npm run generate-icons   # regenerate src/icons/* + src/logo.png from the inline SVG (uses sharp)
```

- Each bundle is an IIFE. `rollup.config.popup.js` also **copies** `manifest.json`, `popup.html`, `help.html`, `welcome.html`, the icons, `logo.png`, and `src/content/transcript-interceptor.js` into `dist/`.
- `transcript-interceptor.js` has **no imports** and is copied verbatim (not bundled), because it runs in the page's MAIN world.
- There is **no cache-viewer bundle** (unlike SkipTube). `rollup.config.cache-viewer.js` was removed.

## Core Architecture

### Message Passing Flow

```
transcript-interceptor.js  (MAIN world, document_start)
        │  window.postMessage({source:'RT_INTERCEPTOR', type:'RT_TRANSCRIPT', payload})
        ▼
content-main.js (ISOLATED world)  <--chrome.runtime.sendMessage-->  background-main.js (Service Worker)
   - video detection (SPA nav)                                       - generateRecap (AI summary+chapters)
   - native-chapter detection                                        - healSelectors (transcript self-heal)
   - transcript orchestration                                        - recap cache + API keys
   - in-page panel + progress-bar markers
```

Two content scripts are declared in the manifest:
1. `transcript-interceptor.js` — `world: "MAIN"`, `run_at: "document_start"`
2. `content-bundle.js` — ISOLATED world, `run_at: "document_idle"`

### Critical Components

**`src/background/background-main.js`** — `BackgroundService`
- Loads provider API keys from `chrome.storage.local` (`claudeApiKey` / `openaiApiKey`; legacy `apiKey` honored as Claude).
- Message actions: `generateRecap`, `healSelectors`, `updateAPIKey`, `updateProvider`, `getAPIKeyStatus`, `clearRecapCache`.
- AI keys are **required** — without one, `generateRecap` returns an error telling the user to configure it in the popup.
- Recap cache: key `recap_${videoId}_${lang}`, 30-day TTL, cleaned by 24h maintenance. `lang` is the base BCP-47 code; `Intl.DisplayNames` converts it to an English language name for the prompt.

**`src/shared/services/recap-service.js`** — `RecapService`
- `generateRecap(transcript, { targetLanguage, needChapters, summaryLength, aiModel, durationSec, title })` → `{ language, summary, keyPoints[], chapters[] }`.
- One AI call does summary + translation (writes in `targetLanguage`) + chapters. When `needChapters === false`, the prompt forces `"chapters": []`.
- Uses the provider abstraction: `createPayload(system, user, model)` → `sendRequest` → `parseResponse` (returns parsed JSON of any shape — the schema assumption lives here, not in the provider).
- `normalizeChapters()` sorts, dedupes, clamps to duration, anchors the first chapter at 0.
- `healSelectors(snapshot)` forces the stronger model (`sonnet` / `gpt-5.5`) and returns the **exact key shape** `transcript-service.applyHealedSelectors()` expects (`descriptionExpanderSelector`, `transcriptButtonSelector`, `panelSelector`, `segmentSelector`, `timestampSelector`, `textSelector`).

**`src/shared/config.js`** — `CONFIG`
- Claude models: `claude-haiku-4-5-20251001` (`haiku`, default) and `claude-sonnet-4-6` (`sonnet`).
- OpenAI models: `gpt-5.5` (best), `gpt-5.4-mini` (fast, default), `gpt-5.4-nano` (cheapest).
- `CACHE.KEY_PREFIX = 'recap_'`, 30-day TTL.
- `DEFAULTS.SETTINGS`: `{ enabled, generateSummary, generateChapters, showProgressMarkers, autoOpenPanel, summaryLength: 'medium', outputLanguage: 'auto' }`.
- `DEFAULTS.ADVANCED_SETTINGS`: `{ aiProvider: 'claude', aiModel: 'haiku', channelWhitelist: [] }`.

**`src/content/content-main.js`** — `RecapManager`
- Detects new videos via `yt-navigate-finish` + a `MutationObserver` fallback; tears down and rebuilds per video.
- On a new video: whitelist check → `detectNativeChapters()` → `transcriptService.extractFromDOM()` → `generateRecap` to background → `renderPanel()` + (if AI chapters) `drawChapterMarkers()`.
- Registers the interceptor bridge and a toast notifier into `TranscriptService` during `init()`.
- Panel is injected into the first matching `SELECTORS.PANEL_ANCHORS` (`#secondary-inner` → `#secondary` → `#below` → `ytd-watch-metadata`). All injected DOM uses the `rt-` class prefix and a single injected `<style>`.
- Target language: `outputLanguage === 'auto' ? navigator.language : <setting>`.

**`src/popup/popup-main.js`** — Settings & UI
- `isLoading` flag guards against saves during initial load.
- Provider/model selector (`#model` with `data-provider` filtering), per-provider API keys, recap toggles, `summaryLength`, `outputLanguage`, channel exclusions, cache controls.

## Transcript Extraction Strategy (reused from SkipTube)

`TranscriptService.extractFromDOM()` is unchanged from SkipTube and remains the 3-layer, redesign-resilient extractor:

1. **MAIN-world interceptor (PRIMARY)** — `transcript-interceptor.js` hooks `fetch`/`XHR`, reads YouTube's own `/youtubei/v1/get_transcript` JSON, relays segments via `window.postMessage`. Contract in `constants.js → INTERCEPTOR` (`RT_INTERCEPTOR` / `RT_TRANSCRIPT`).
2. **DOM scraping (FALLBACK)** — opens the transcript panel (expanding the description first) and scrapes it with resilient selectors.
3. **AI self-heal (LAST RESORT)** — snapshots the DOM, asks a forced stronger model for working selectors, merges them on top of defaults as comma-combined fallbacks, caches under `healedSelectors`.

> Selector state lives on the `TranscriptService` instance: `_defaultSelectors` (immutable base) and `selectors` (active, possibly healed). Runtime lookups use `this.selectors.*`.

## Native Chapter Detection

`RecapManager.hasNativeChapters()` decides whether to ask the AI for chapters:
- Player ticks: `.ytp-chapters-container .ytp-chapter-hover-container` count ≥ 2, **or**
- Chapters engagement panel: `ytd-macro-markers-list-renderer` / `ytd-engagement-panel-section-list-renderer[target-id*="chapters"|"macro-markers"]` containing `ytd-macro-markers-list-item-renderer`.

If native chapters exist, `needChapters` is false (the prompt returns `chapters: []`) and no progress-bar markers are drawn (YouTube already draws its own).

## Cross-extension coexistence (with SkipTube)

`chrome.storage.local` is isolated per-extension, but the **page DOM and `window.postMessage` are shared**. RecapTube therefore uses distinct identifiers from SkipTube:
- Interceptor contract `RT_INTERCEPTOR` / `RT_TRANSCRIPT` (SkipTube: `YSS_*`).
- Install-guard flag `window.__rtInterceptorInstalled` and `this.__rtIsTranscript` (SkipTube: `__yss*`). **Critical:** if these matched SkipTube's, whichever loaded second would self-disable.
- Injected DOM classes are `rt-`-prefixed (SkipTube: `yss-`).

When changing the interceptor, keep all four distinct.

## Output Schema (AI response)

`recap-service.js` requests strict JSON:
```json
{ "language": "<bcp-47>",
  "summary": "<text in target language>",
  "keyPoints": ["...", "..."],
  "chapters": [ { "start": <int seconds>, "title": "<short title in target language>" } ] }
```
OpenAI enforces `response_format: json_object`; Claude is asked for raw JSON and the provider's `parseResponse` strips ```json fences.

## Development

### Testing / debugging
```
chrome://extensions/  → Developer Mode → Load unpacked → select the dist/ folder
Service worker logs: chrome://extensions/ → "service worker"
Content script logs: F12 on a YouTube watch page (use a video WITH subtitles)
```

Console signals:
- Transcript layer: `Transcript via interceptor (N)`, `Transcript via DOM (N)`, self-heal `attempting AI self-heal`.
- Native chapters: `Native chapters detected → skipping AI chapters`.

Test videos:
- WITH native chapters: `https://www.youtube.com/watch?v=ezqHULlVEMo` (expect: summary, no AI chapters, no duplicate markers).
- WITHOUT chapters: any plain talk/tutorial (expect: summary + AI chapters + progress-bar markers).

### Storage inspection
```javascript
chrome.storage.local.get(null, console.log)             // everything
chrome.storage.local.get('recap_VIDEOID_en')            // a cached recap
chrome.storage.local.get('healedSelectors')             // AI-healed selectors
chrome.storage.local.remove('healedSelectors')          // reset self-heal
```

### Updating model IDs
Model strings must stay consistent across: `config.js`, `providers/claude-provider.js`, `providers/openai-provider.js`, and the `#model` options in `popup.html`.

## Common Issues

- **"API key not configured"** — set a valid key (≥20 chars) in the popup. No key ⇒ no recap.
- **"Transcript not available"** — the video has no transcript, or all three extraction layers failed. The interceptor only fires once the page loads `get_transcript`, which requires opening the panel.
- **Summary in the wrong language** — set Output language in the popup; `auto` follows `navigator.language`.
- **No AI chapters** — expected when the video already has creator chapters.
- **Panel not appearing** — none of `PANEL_ANCHORS` matched yet (page still loading) or `enabled`/`autoOpenPanel` is off.
