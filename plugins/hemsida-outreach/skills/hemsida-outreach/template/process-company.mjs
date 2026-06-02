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

// Steg 5: Ta dedikerad hero-screenshot för email
// 560px höjd = bara hero (600px), inget divider/tjänstekort syns under
// Mörk overlay-override + hero-h1 font-size minskas för att tagline alltid ryms
const emailPngFile = join(D, `${slug}-email-raw.png`);
const emailFile = join(D, `${slug}-email.jpg`);
const emailHtmlFile = join(D, `${slug}-email.html`);
try {
  // Läs industri från data.json för att välja rätt Unsplash-bild
  const dataJson = JSON.parse(readFileSync(join(D, `${slug}-data.json`), 'utf8'));
  const industry = (dataJson.industry || 'akeri').toLowerCase().replace(/å/g,'a').replace(/ä/g,'a').replace(/ö/g,'o');
  const EMAIL_HEROES = {
    'akeri':    'https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?w=1280&q=80',
    'transport':'https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?w=1280&q=80',
    'bygg':     'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=1280&q=80',
    'vvs':      'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1280&q=80',
    'stad':     'https://images.unsplash.com/photo-1563453392212-326f5e854473?w=1280&q=80',
    'mark':     'https://images.unsplash.com/photo-1581094794329-c8112a89af12?w=1280&q=80',
  };
  const emailHeroUrl = EMAIL_HEROES[industry] || EMAIL_HEROES['akeri'];

  // Ladda ner Unsplash-bilden och bädda in som base64 (Chrome kan inte ladda externa URLs från file://)
  let emailHeroB64 = '';
  try {
    const heroR = spawnSync('curl', ['-s', '-L', '--max-time', '10', emailHeroUrl],
      { maxBuffer: 4 * 1024 * 1024, timeout: 15000 });
    if (heroR.stdout?.length > 10000) {
      emailHeroB64 = `data:image/jpeg;base64,${heroR.stdout.toString('base64')}`;
    }
  } catch {}

  // Skapa email-version av HTML med extra overrides
  let emailHtml = readFileSync(staticFile, 'utf8');

  // Ersätt heroUrl-variabeln direkt i JS-koden — mer tillförlitligt än CSS !important
  if (emailHeroB64) {
    // Hitta "const heroUrl = "..." och ersätt med ren Unsplash-bild
    emailHtml = emailHtml.replace(
      /const heroUrl = "data:[^"]{10,}"/,
      `const heroUrl = "${emailHeroB64}"`
    );
  }

  const emailOverride = `<style>
    /* Email: mörk overlay för god läsbarhet */
    .hero-overlay { background: linear-gradient(105deg, rgba(0,0,0,0.68) 0%, rgba(0,0,0,0.45) 50%, rgba(0,0,0,0.2) 100%) !important; }
    /* Email: tagline anpassar sig, klipps aldrig */
    .hero-h1 { font-size: clamp(1.8rem, 4.5vw, 3.8rem) !important; }
    .hero-scroll { display: none !important; }
  </style>`;
  emailHtml = emailHtml.replace('</head>', emailOverride + '\n</head>');
  writeFileSync(emailHtmlFile, emailHtml, 'utf8');
  execSync(`'${chrome}' --headless=new --screenshot='${emailPngFile}' --window-size=1280,560 --virtual-time-budget=4000 'file://${emailHtmlFile}' 2>/dev/null`);
  execSync(`sips -s format jpeg -s formatOptions 80 '${emailPngFile}' --out '${emailFile}' 2>/dev/null`);
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
      const { existsSync } = await import('fs');
      // Reclona bara om det inte redan finns ett fungerande repo
      if (!existsSync(repoDir + '/.git')) {
        execSync(`git clone https://github.com/Nokinomannen/hemsida-outreach-plugin.git ${repoDir}`, { timeout: 30000, stdio: 'pipe' });
      } else {
        // Bara pull för att vara i sync
        execSync(`cd ${repoDir} && git pull --rebase origin main 2>/dev/null || true`, { timeout: 15000, stdio: 'pipe' });
      }
      execSync(`mkdir -p ${repoDir}/mockups`, { timeout: 5000, stdio: 'pipe' });
      execSync(`cp '${emailFile}' ${repoDir}/mockups/${filename}`, { timeout: 5000, stdio: 'pipe' });
      execSync(`cd ${repoDir} && git config user.email 'noah.krueger@hotmail.se' && git config user.name 'Noah Krueger' && git add mockups/${filename} && git diff --cached --quiet && echo ok || (git commit -m 'Mockup: ${slug}' && git push origin main)`, { timeout: 30000, stdio: 'pipe' });
      const ghUrl = `https://raw.githubusercontent.com/Nokinomannen/hemsida-outreach-plugin/main/mockups/${filename}`;
      console.error(`[5/5] GitHub upload OK: ${ghUrl}`);
      process.stdout.write(ghUrl);
    } catch (ghErr) {
      console.error(`[VARNING] GitHub upload misslyckades: ${ghErr.message?.slice(0,100)}`);
      process.stdout.write('');
    }
  }
} catch (e) {
  console.error(`[VARNING] Email-steg fel: ${e.message}`);
  process.stdout.write('');
}
