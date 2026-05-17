/**
 * fill-template.mjs
 *
 * Fyller i mockup-template.html med företagsdata.
 * Laddar ner hero-bilden och bäddar in den som base64 — garanterar
 * att den syns i headless Chrome (inga externa requests behövs).
 *
 * Användning:
 *   /usr/local/bin/node fill-template.mjs company.json
 *   → Skriver [slug]-mockup.html på Desktop
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import https from 'https';
import http from 'http';

const __dir    = dirname(fileURLToPath(import.meta.url));
const TEMPLATE = join(__dir, 'mockup-template.html');
const DESKTOP  = join(homedir(), 'Desktop');

// ── Hämta bild och returnera data URI ────────────────────────────────────────
function fetchImageAsDataURI(url, redirects = 5) {
  return new Promise((resolve, reject) => {
    if (redirects === 0) { reject(new Error('För många redirects: ' + url)); return; }
    const proto = url.startsWith('https') ? https : http;
    const req = proto.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
      timeout: 12000,
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        resolve(fetchImageAsDataURI(res.headers.location, redirects - 1));
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} för ${url}`));
        return;
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const buf  = Buffer.concat(chunks);
        const mime = res.headers['content-type']?.split(';')[0] || 'image/jpeg';
        resolve(`data:${mime};base64,${buf.toString('base64')}`);
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout för ' + url)); });
  });
}

// ── Bygg variabellista från företagsdata ─────────────────────────────────────
function buildVars(data, heroDataURI) {
  return {
    COMPANY_NAME:  data.company_name,
    TAGLINE:       (data.tagline || '').toUpperCase(),
    CITY:          data.city,
    REGION:        data.region,
    PHONE:         data.phone,
    EMAIL:         data.email || '',
    FOUNDED_YEAR:  String(data.founded_year || ''),
    PRIMARY_COLOR: data.primary_color,
    ACCENT_COLOR:  data.accent_color,
    HERO_IMAGE_URL: heroDataURI,
    HERO_SUBTEXT:  data.hero_subtext || `${data.industry}-tjänster i ${data.city}.`,

    SERVICE_1_NAME: data.services[0]?.name || '',
    SERVICE_1_DESC: data.services[0]?.desc || '',
    SERVICE_1_ICON: data.services[0]?.icon || '🔧',
    SERVICE_2_NAME: data.services[1]?.name || '',
    SERVICE_2_DESC: data.services[1]?.desc || '',
    SERVICE_2_ICON: data.services[1]?.icon || '⚙️',
    SERVICE_3_NAME: data.services[2]?.name || '',
    SERVICE_3_DESC: data.services[2]?.desc || '',
    SERVICE_3_ICON: data.services[2]?.icon || '📋',
    SERVICE_4_NAME: data.services[3]?.name || '',
    SERVICE_4_DESC: data.services[3]?.desc || '',
    SERVICE_4_ICON: data.services[3]?.icon || '✅',

    STAT_1_VALUE:   String(data.stats[0]?.value || ''),
    STAT_1_NUMERIC: String(parseInt(data.stats[0]?.value) || 0),
    STAT_1_LABEL:   data.stats[0]?.label || '',
    STAT_2_VALUE:   String(data.stats[1]?.value || ''),
    STAT_2_NUMERIC: String(parseInt(data.stats[1]?.value) || 0),
    STAT_2_LABEL:   data.stats[1]?.label || '',
    STAT_3_VALUE:   String(data.stats[2]?.value || ''),
    STAT_3_NUMERIC: String(parseInt(data.stats[2]?.value) || 0),
    STAT_3_LABEL:   data.stats[2]?.label || '',
    STAT_4_VALUE:   String(data.stats[3]?.value || ''),
    STAT_4_NUMERIC: String(parseInt(data.stats[3]?.value) || 0),
    STAT_4_LABEL:   data.stats[3]?.label || '',
  };
}

// ── Substituera platshållare ──────────────────────────────────────────────────
function substitute(html, vars) {
  for (const [key, value] of Object.entries(vars)) {
    html = html.split(`{{${key}}}`).join(value);
  }
  return html;
}

// ── Huvud-funktion ────────────────────────────────────────────────────────────
export async function generateMockup(data) {
  const slug = data.slug || slugify(data.company_name);

  let heroDataURI = '';
  if (data.hero_image_url) {
    try {
      console.log(`Hämtar hero-bild: ${data.hero_image_url}`);
      heroDataURI = await fetchImageAsDataURI(data.hero_image_url);
      console.log(`✅ Hero-bild inbäddad (${(heroDataURI.length / 1024).toFixed(0)} KB)`);
    } catch (e) {
      console.warn(`⚠️  Kunde inte hämta hero-bild: ${e.message}`);
      heroDataURI = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    }
  } else {
    console.warn('⚠️  Ingen hero_image_url angiven — använder mörk bakgrund');
    heroDataURI = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  }

  const template = readFileSync(TEMPLATE, 'utf8');
  const vars     = buildVars(data, heroDataURI);
  const html     = substitute(template, vars);

  const leftover = [...html.matchAll(/\{\{[A-Z_]+\}\}/g)].map(m => m[0]);
  if (leftover.length) {
    console.warn('⚠️  Oreplacerade platshållare:', [...new Set(leftover)].join(', '));
  }

  const outPath = join(DESKTOP, `${slug}-mockup.html`);
  writeFileSync(outPath, html, 'utf8');
  console.log(`✅ Mockup sparad: ${outPath}`);
  return outPath;
}

function slugify(s) {
  return s.toLowerCase()
    .replace(/å/g, 'a').replace(/ä/g, 'a').replace(/ö/g, 'o')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ── CLI ───────────────────────────────────────────────────────────────────────
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const jsonPath = process.argv[2];
  if (!jsonPath) {
    console.error('Användning: /usr/local/bin/node fill-template.mjs company.json');
    process.exit(1);
  }
  const data = JSON.parse(readFileSync(jsonPath, 'utf8'));
  generateMockup(data).catch(e => { console.error(e); process.exit(1); });
}
