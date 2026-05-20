#!/usr/bin/env node
// process-company.mjs — kombinerar fill-template + static HTML + screenshot + base64
// Kör: /usr/local/bin/node process-company.mjs [slug]
// Skriver mockup, static HTML och screenshot till Desktop
// Returnerar base64 av screenshoten på stdout (för Gmail MCP)

import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { homedir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const D = join(homedir(), 'Desktop');
const slug = process.argv[2];

if (!slug) {
  console.error('Usage: /usr/local/bin/node process-company.mjs [slug]');
  process.exit(1);
}

// Steg 1: Fyll mall (fill-template.mjs i samma katalog)
const fillScript = join(__dirname, 'fill-template.mjs');
const dataFile = join(D, `${slug}-data.json`);
console.error(`[1/4] Fyller mall för ${slug}...`);
execSync(`/usr/local/bin/node '${fillScript}' '${dataFile}'`, { stdio: ['pipe', 'pipe', 'inherit'] });

// Steg 2: Skapa static-version (inaktivera CSS-animationer)
const mockupFile = join(D, `${slug}-mockup.html`);
const staticFile = join(D, `${slug}-static.html`);
let html = readFileSync(mockupFile, 'utf8');
const override = `<style>
  nav { opacity: 1 !important; animation: none !important; }
  .hero-badge { opacity: 1 !important; transform: none !important; animation: none !important; }
  .hero-h1 .word { clip-path: inset(0 0% 0 0) !important; animation: none !important; }
  .hero-sub { opacity: 1 !important; transform: none !important; animation: none !important; }
  .hero-cta { opacity: 1 !important; transform: scale(1) !important; animation: none !important; }
  .hero-phone { opacity: 1 !important; animation: none !important; }
  .service-card { opacity: 1 !important; transform: translateY(0) !important; transition: none !important; }
  .reveal { opacity: 1 !important; transform: none !important; transition: none !important; }
  * { animation-duration: 0.001s !important; animation-delay: 0s !important; }
</style>`;
html = html.replace('</head>', override + '\n</head>');
writeFileSync(staticFile, html, 'utf8');
console.error(`[2/4] Static HTML klar: ${staticFile}`);

// Steg 3: Screenshot med headless Chrome
const screenshotFile = join(D, `${slug}-screenshot.png`);
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
execSync(`'${chrome}' --headless=new --screenshot='${screenshotFile}' --window-size=1200,675 'file://${staticFile}' 2>/dev/null`);
console.error(`[3/4] Screenshot tagen: ${screenshotFile}`);

// Steg 4: Kontrollera storlek (varning om hero-bild saknas)
const size = readFileSync(screenshotFile).length;
if (size < 200000) {
  console.error(`[VARNING] Screenshot är bara ${size} bytes — hero-bilden saknas troligen! Kontrollera hero_image_url.`);
} else {
  console.error(`[4/4] Screenshot OK: ${Math.round(size/1024)} KB`);
}

// Output: base64 på stdout (fångas av osascript-anropet)
process.stdout.write(readFileSync(screenshotFile).toString('base64'));
