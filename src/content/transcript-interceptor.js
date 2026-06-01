// transcript-interceptor.js - MAIN-world network interceptor for YouTube transcripts
//
// Runs in the PAGE context (world: "MAIN") at document_start. YouTube fetches the
// transcript from its internal InnerTube endpoint (/youtubei/v1/get_transcript) using
// the user's real authenticated session. We hook fetch/XHR and read the structured JSON
// response the page itself receives, then relay it to the isolated content script via
// window.postMessage. This is robust against CSS/DOM redesigns because it never depends
// on class names - it reads YouTube's own data.

(function () {
  'use strict';

  const MESSAGE_SOURCE = 'RT_INTERCEPTOR';
  const MESSAGE_TYPE = 'RT_TRANSCRIPT';
  // YouTube serves the transcript via two endpoints depending on the UI:
  //   - get_transcript : legacy Polymer panel  (transcriptSegmentRenderer, startMs/endMs)
  //   - get_panel      : modern view-model panel (transcriptSegmentViewModel, simpleText/timestamp)
  // get_panel is generic (other engagement panels use it too), but parsing yields
  // segments only for transcript responses, so hooking it is safe.
  const TRANSCRIPT_URL_FRAGMENTS = ['/youtubei/v1/get_transcript', '/youtubei/v1/get_panel'];

  // Avoid double-injection (SPA navigations / multiple injections)
  if (window.__rtInterceptorInstalled) return;
  window.__rtInterceptorInstalled = true;

  function getVideoId() {
    try {
      return new URLSearchParams(location.search).get('v') || '';
    } catch {
      return '';
    }
  }

  /**
   * Parse a "M:SS" / "H:MM:SS" timestamp string to seconds.
   * @param {string} t
   * @returns {number|null}
   */
  function parseTimestampStr(t) {
    const parts = (t || '').trim().split(':').map((n) => parseInt(n, 10));
    if (parts.length === 0 || parts.some((n) => isNaN(n))) return null;
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return null;
  }

  /**
   * Deep-walk an InnerTube get_transcript / get_panel response and collect cues.
   * Handles both transcript UIs:
   *   - legacy `transcriptSegmentRenderer` (startMs/endMs + snippet.runs/simpleText)
   *   - modern `transcriptSegmentViewModel` (simpleText + "timestamp" string, no endMs)
   * @param {*} json
   * @returns {Array<{time:number, end:number|undefined, text:string}>}
   */
  function parseTranscript(json) {
    const segments = [];
    const seen = new Set();

    const add = (time, end, text) => {
      const clean = (text || '').trim();
      if (time === null || time === undefined || isNaN(time) || !clean) return;
      const key = time + '|' + clean;
      if (seen.has(key)) return;
      seen.add(key);
      segments.push({ time, end: end === undefined || isNaN(end) ? undefined : end, text: clean });
    };

    (function walk(node, depth) {
      if (!node || depth > 30 || typeof node !== 'object') return;
      if (Array.isArray(node)) {
        for (const item of node) walk(item, depth + 1);
        return;
      }

      // Legacy Polymer renderer
      const seg = node.transcriptSegmentRenderer;
      if (seg) {
        const startMs = parseInt(seg.startMs, 10);
        const endMs = parseInt(seg.endMs, 10);
        const text =
          (seg.snippet && Array.isArray(seg.snippet.runs)
            ? seg.snippet.runs.map((r) => r.text).join('')
            : seg.snippet && seg.snippet.simpleText) || '';
        add(isNaN(startMs) ? null : Math.floor(startMs / 1000), isNaN(endMs) ? undefined : Math.floor(endMs / 1000), text);
      }

      // Modern view-model (no endMs; timestamp is a formatted string)
      const vm = node.transcriptSegmentViewModel;
      if (vm) {
        add(parseTimestampStr(vm.timestamp), undefined, vm.simpleText);
      }

      for (const k in node) walk(node[k], depth + 1);
    })(json, 0);

    return segments;
  }

  function relay(json) {
    let segments;
    try {
      segments = parseTranscript(json);
    } catch {
      return;
    }
    if (!segments || segments.length === 0) return;

    try {
      window.postMessage(
        {
          source: MESSAGE_SOURCE,
          type: MESSAGE_TYPE,
          payload: { videoId: getVideoId(), segments }
        },
        '*'
      );
    } catch {
      /* noop */
    }
  }

  function isTranscriptUrl(url) {
    return typeof url === 'string' && TRANSCRIPT_URL_FRAGMENTS.some((f) => url.indexOf(f) !== -1);
  }

  // ---- Hook fetch ----
  const originalFetch = window.fetch;
  if (typeof originalFetch === 'function') {
    window.fetch = function (...args) {
      const result = originalFetch.apply(this, args);
      try {
        const input = args[0];
        const url = typeof input === 'string' ? input : input && input.url;
        if (isTranscriptUrl(url)) {
          result
            .then((resp) => {
              try {
                resp
                  .clone()
                  .json()
                  .then(relay)
                  .catch(() => {});
              } catch {
                /* noop */
              }
            })
            .catch(() => {});
        }
      } catch {
        /* noop */
      }
      return result;
    };
  }

  // ---- Hook XMLHttpRequest (fallback path) ----
  const XHR = window.XMLHttpRequest;
  if (XHR && XHR.prototype) {
    const origOpen = XHR.prototype.open;
    const origSend = XHR.prototype.send;

    XHR.prototype.open = function (method, url) {
      try {
        this.__rtIsTranscript = isTranscriptUrl(url);
      } catch {
        this.__rtIsTranscript = false;
      }
      return origOpen.apply(this, arguments);
    };

    XHR.prototype.send = function () {
      if (this.__rtIsTranscript) {
        this.addEventListener('load', function () {
          try {
            const json = JSON.parse(this.responseText);
            relay(json);
          } catch {
            /* noop */
          }
        });
      }
      return origSend.apply(this, arguments);
    };
  }
})();
