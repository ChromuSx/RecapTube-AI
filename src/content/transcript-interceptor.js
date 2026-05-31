// transcript-interceptor.js - MAIN-world network interceptor for YouTube transcripts
//
// Runs in the PAGE context (world: "MAIN") at document_start. YouTube fetches the
// transcript from its internal InnerTube endpoint (/youtubei/v1/get_transcript) using
// the user's real authenticated session. We hook fetch/XHR and read the structured JSON
// response the page itself receives, then relay it to the isolated content script via
// window.postMessage. This is robust against CSS/DOM redesigns because it never depends
// on class names - it reads YouTube's own data.
//
// NOTE: source/type and the install-guard flag are RecapTube-specific (RT_*) so this can
// coexist with SkipTube's interceptor (YSS_*) on the same page without either disabling
// the other.

(function () {
  'use strict';

  const MESSAGE_SOURCE = 'RT_INTERCEPTOR';
  const MESSAGE_TYPE = 'RT_TRANSCRIPT';
  const TRANSCRIPT_URL_FRAGMENT = '/youtubei/v1/get_transcript';

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
   * Deep-walk an InnerTube get_transcript response and collect cues.
   * Cues live under `transcriptSegmentRenderer` with startMs/endMs and snippet text.
   * @param {*} json
   * @returns {Array<{time:number, end:number|undefined, text:string}>}
   */
  function parseTranscript(json) {
    const segments = [];
    const seen = new Set();

    (function walk(node, depth) {
      if (!node || depth > 30 || typeof node !== 'object') return;
      if (Array.isArray(node)) {
        for (const item of node) walk(item, depth + 1);
        return;
      }
      const seg = node.transcriptSegmentRenderer;
      if (seg) {
        const startMs = parseInt(seg.startMs, 10);
        const endMs = parseInt(seg.endMs, 10);
        const text =
          (seg.snippet && Array.isArray(seg.snippet.runs)
            ? seg.snippet.runs.map((r) => r.text).join('')
            : seg.snippet && seg.snippet.simpleText) || '';
        const clean = text.trim();
        if (!isNaN(startMs) && clean) {
          const key = startMs + '|' + clean;
          if (!seen.has(key)) {
            seen.add(key);
            segments.push({
              time: Math.floor(startMs / 1000),
              end: isNaN(endMs) ? undefined : Math.floor(endMs / 1000),
              text: clean
            });
          }
        }
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
    return typeof url === 'string' && url.indexOf(TRANSCRIPT_URL_FRAGMENT) !== -1;
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
