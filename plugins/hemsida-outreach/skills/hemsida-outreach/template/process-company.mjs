#!/usr/bin/env node
// process-company.mjs — kombinerar fill-template + static HTML + screenshot + base64
// Kör: /usr/local/bin/node process-company.mjs [slug]
// Skriver mockup, static HTML och screenshot till Desktop
// Returnerar base64 av screenshoten på stdout (för Gmail MCP)

import { readFileSync, writeFileSync } from 'fs';
import { execSync, spawnSync } from 'child_process';
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
  /* Force all animated elements visible for headless screenshot */
  *, *::before, *::after {
    animation-duration: 0.001s !important;
    animation-delay: 0s !important;
    animation-fill-mode: both !important;
    transition-duration: 0s !important;
  }
  /* New template selectors */
  nav { opacity: 1 !important; }
  .hero-eyebrow { opacity: 1 !important; transform: none !important; }
  .hero-h1 .word { clip-path: inset(0 0% 0 0) !important; }
  .hero-sub { opacity: 1 !important; transform: none !important; }
  .hero-actions { opacity: 1 !important; transform: none !important; }
  .hero-phone-link { opacity: 1 !important; }
  .btn-primary { opacity: 1 !important; transform: none !important; }
  .service-card { opacity: 1 !important; transform: none !important; }
  .reveal { opacity: 1 !important; transform: none !important; }
</style>`;
html = html.replace('</head>', override + '\n</head>');
writeFileSync(staticFile, html, 'utf8');
console.error(`[2/4] Static HTML klar: ${staticFile}`);

// Steg 3: Screenshot med headless Chrome
const screenshotFile = join(D, `${slug}-screenshot.png`);
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
execSync(`'${chrome}' --headless=new --screenshot='${screenshotFile}' --window-size=1280,1500 'file://${staticFile}' 2>/dev/null`);
console.error(`[3/4] Screenshot tagen: ${screenshotFile}`);

// Steg 4: Kontrollera storlek (varning om hero-bild saknas)
const size = readFileSync(screenshotFile).length;
if (size < 200000) {
  console.error(`[VARNING] Screenshot är bara ${size} bytes — hero-bilden saknas troligen! Kontrollera hero_image_url.`);
} else {
  console.error(`[4/4] Screenshot OK: ${Math.round(size/1024)} KB`);
}

// Steg 5: Skapa email-JPEG (600px bred, kvalitet 60) och ladda upp till 0x0.st
const emailFile = join(D, `${slug}-email.jpg`);
try {
  execSync(`sips -s format jpeg -s formatOptions 60 '${screenshotFile}' --out '${emailFile}' 2>/dev/null`);
  execSync(`sips -Z 600 '${emailFile}' --out '${emailFile}' 2>/dev/null`);
  const emailSize = readFileSync(emailFile).length;
  console.error(`[5/5] Email-JPEG klar: ${Math.round(emailSize/1024)} KB — laddar upp...`);

  // Ladda upp till transfer.sh (14 dagars hosting, ingen API-nyckel)
  const filename = `${slug}-mockup.jpg`;
  const r = spawnSync('curl', [
    '-s', '--upload-file', emailFile,
    `https://transfer.sh/${filename}`
  ], { timeout: 30000, maxBuffer: 1024 * 20 });
  const uploadResult = (r.stdout?.toString() || '').trim();

  if (uploadResult.startsWith('https://')) {
    console.error(`[5/5] Bild uppladdad: ${uploadResult}`);
    process.stdout.write(uploadResult);  // stdout = URL
  } else {
    // Fallback: GitHub raw URL via push till repo
    console.error(`[5/5] transfer.sh misslyckades, försöker GitHub...`);
    try {
      const repoDir = '/tmp/hemsida-mockups';
      execSync(`rm -rf ${repoDir} && git clone https://github.com/Nokinomannen/hemsida-outreach-plugin.git ${repoDir} 2>/dev/null`, { timeout: 30000 });
      execSync(`mkdir -p ${repoDir}/mockups && cp '${emailFile}' ${repoDir}/mockups/${filename}`, { timeout: 5000 });
      execSync(`cd ${repoDir} && git config user.email 'noah.krueger@hotmail.se' && git config user.name 'Noah Krueger' && git add mockups/${filename} && git commit -m 'Mockup: ${slug}' && git push origin main 2>/dev/null`, { timeout: 30000 });
      const ghUrl = `https://raw.githubusercontent.com/Nokinomannen/hemsida-outreach-plugin/main/mockups/${filename}`;
      console.error(`[5/5] GitHub upload OK: ${ghUrl}`);
      process.stdout.write(ghUrl);
    } catch (ghErr) {
      console.error(`[VARNING] Båda uploads misslyckades`);
      process.stdout.write('');
    }
  }
} catch (e) {
  console.error(`[VARNING] Email-steg fel: ${e.message}`);
  process.stdout.write('');
}
