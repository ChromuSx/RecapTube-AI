// generate-icons.js - Generates RecapTube AI logo + extension icons from an inline SVG.
// Usage: npm run generate-icons   (requires the `sharp` dev dependency)
//
// Concept: a rounded "screen" with a play triangle on the left and three text/chapter
// lines on the right — i.e. "video → summary + chapters". Blue→teal gradient keeps it in
// the YouTube family while staying visually distinct from SkipTube's red.
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ICONS_DIR = join(__dirname, 'src', 'icons');
const LOGO_PATH = join(__dirname, 'src', 'logo.png');

/**
 * Build the master SVG at a given size. Geometry is expressed in a 128 viewBox and
 * scaled, so it stays crisp at every export size.
 */
function buildSvg(size) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${size}" height="${size}" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#3ea6ff"/>
      <stop offset="0.55" stop-color="#1e7fe0"/>
      <stop offset="1" stop-color="#6a5cff"/>
    </linearGradient>
    <filter id="sh" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="2" stdDeviation="2.4" flood-color="#000" flood-opacity="0.25"/>
    </filter>
  </defs>

  <!-- rounded background -->
  <rect x="6" y="6" width="116" height="116" rx="28" fill="url(#bg)"/>

  <!-- play triangle (left) -->
  <g filter="url(#sh)">
    <path d="M38 40 L38 88 L72 64 Z" fill="#ffffff"/>
  </g>

  <!-- summary / chapter lines (right) -->
  <g fill="#ffffff">
    <rect x="80" y="46" width="26" height="7" rx="3.5"/>
    <rect x="80" y="61" width="20" height="7" rx="3.5" opacity="0.92"/>
    <rect x="80" y="76" width="26" height="7" rx="3.5" opacity="0.82"/>
  </g>

  <!-- chapter dots aligned to the lines -->
  <g fill="#ffd166">
    <circle cx="74" cy="49.5" r="2.6"/>
    <circle cx="74" cy="64.5" r="2.6"/>
    <circle cx="74" cy="79.5" r="2.6"/>
  </g>
</svg>`;
}

const SIZES = [16, 32, 48, 128];

async function run() {
  // Icons
  for (const size of SIZES) {
    const out = join(ICONS_DIR, `icon${size}.png`);
    await sharp(Buffer.from(buildSvg(size))).png().toFile(out);
    console.log(`✓ icon${size}.png`);
  }
  // Logo (high-res for popup/welcome/store)
  await sharp(Buffer.from(buildSvg(512))).png().toFile(LOGO_PATH);
  console.log('✓ logo.png (512)');
  console.log('Done.');
}

run().catch((err) => {
  console.error('Icon generation failed:', err);
  process.exit(1);
});
