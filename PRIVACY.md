# Privacy Policy for RecapTube AI

**Last Updated:** June 1, 2026

## Introduction

RecapTube AI ("the Extension") is a Chrome browser extension that uses artificial intelligence to summarize YouTube videos, translate the summary into your language, and generate topic chapters from the video transcript. This Privacy Policy explains what information the Extension handles and how.

## Information We Collect

### 1. YouTube Video Transcripts
The Extension reads the publicly available transcript/subtitles of videos you watch. Transcripts contain:
- Spoken dialogue text and timestamps
- No personal information about you

### 2. API Key
You provide your own API key (Anthropic Claude or OpenAI), which is:
- Stored locally in your browser using Chrome's storage API
- Never transmitted to us or any third party except your chosen AI provider's API
- Used only to authenticate requests to that provider

### 3. Extension Settings
Your preferences are stored locally, including:
- What to generate (summary, chapters, progress-bar markers, auto-open)
- Summary length and output language
- AI provider/model and excluded channels

### 4. Recap Cache
Generated recaps are stored locally to improve performance:
- Keyed by video ID and language (`recap_<videoId>_<lang>`)
- Contains the summary, key points and chapters
- Cached for 30 days, then automatically deleted
- Never shared with anyone

### 5. Page Structure Snapshot (Self-Healing Only)
YouTube periodically changes its page layout, which can break transcript extraction. As a last-resort recovery mechanism, the Extension may send a **snapshot of the YouTube page's HTML structure** to your chosen AI provider so it can re-learn how to locate the transcript. This snapshot:
- Contains only page structure (element names, ids, CSS classes) — scripts, styles and images are stripped
- Does **not** contain personal information about you
- Is sent only when automatic extraction fails, and the resulting selectors are cached locally so it is not repeated
- Is sent to the same AI provider you already use

## How We Use Your Information

### Transcript Analysis
- Transcripts are sent to your chosen AI provider (Anthropic Claude or OpenAI)
- The AI returns a summary, key points (in your selected language) and, when the video has no creator chapters, topic chapters with timestamps
- Results are cached locally to avoid repeat calls

### AI-Assisted Layout Adaptation (Self-Healing)
- If YouTube changes its layout and transcript extraction fails, a snapshot of the page's HTML structure (no personal data) is sent to your provider so the Extension can re-learn how to read the transcript
- This happens rarely and the result is cached locally

### Extension Functionality
- Settings control what is generated and in which language
- Cache improves performance and reduces API calls

## Third-Party Services

### AI Providers

#### Anthropic (Claude)
- **What we share:** Video transcripts, your API key, and (rarely) a snapshot of YouTube's page HTML structure for layout adaptation
- **Purpose:** AI-powered summarization, translation and chapter generation
- **Privacy policy:** https://www.anthropic.com/legal/privacy
- **Your control:** You provide and control your own API key

#### OpenAI
- **What we share:** Video transcripts, your API key, and (rarely) a snapshot of YouTube's page HTML structure for layout adaptation
- **Purpose:** Same as above (alternative provider)
- **Privacy policy:** https://openai.com/privacy
- **Your control:** You provide and control your own API key

### YouTube
- **What we access:** Publicly available video transcripts and page structure
- **How:** Directly in the page (network interceptor + DOM)
- **No data sent to YouTube:** We only read; we never transmit data to YouTube

## Data Storage and Security

### Local Storage Only
All data is stored locally on your device via Chrome's storage API:
- API key
- Extension settings
- Recap cache
- AI-healed selectors (if self-heal ran)

### No Remote Servers
We do not operate servers or databases. We do not collect your personal information, track your browsing, or store your data remotely.

### Data Retention
- **API Key / Settings:** until you remove them or uninstall
- **Cache:** auto-deleted after 30 days
- **Healed selectors:** until reset or uninstall

## Your Rights and Controls

You can:
1. View all settings in the popup
2. Clear recaps ("Clear this video" / "Clear all"), remove your API key, or uninstall to wipe all local data
3. Choose the output language and what gets generated
4. Exclude specific channels
5. Disable the Extension at any time

We cannot access your data, track you across devices, identify you personally, or share your data — because it stays on your device.

## Permissions Explained

### `storage`
- **Purpose:** Save settings and cache locally
- **Scope:** Local device only

### `activeTab`
- **Purpose:** Access the current YouTube tab to read the transcript and render the panel
- **Scope:** Only when you're on YouTube

### Host Permissions
- `https://www.youtube.com/*`, `https://youtube.com/*` — read transcripts and inject the panel
- `https://api.anthropic.com/*` — send transcripts to Claude
- `https://api.openai.com/*` — send transcripts to OpenAI

## Children's Privacy
The Extension does not knowingly collect information from children under 13 and is intended for general YouTube users.

## Changes to This Policy
We may update this policy; changes are reflected by the "Last Updated" date. Continued use after changes constitutes acceptance.

## Contact
- **Email:** giovanni.guarino1999@gmail.com

## Consent
By installing and using RecapTube AI, you consent to this Privacy Policy.

## Summary (TL;DR)
- ✅ All your data stored locally on your device
- ✅ Only the transcript (and, rarely, a YouTube page-structure snapshot for layout adaptation) is sent to your chosen AI provider, using your API key
- ✅ No tracking, no analytics, no third-party data sharing
- ✅ You control your API key and can delete all data anytime
- ❌ We don't collect personal information
- ❌ We don't operate servers or databases
- ❌ We don't sell or share your data

---

**Your privacy matters. If you have any concerns or questions, please reach out.**
