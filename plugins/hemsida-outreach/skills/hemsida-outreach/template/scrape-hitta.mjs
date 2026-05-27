#!/usr/bin/env node
// scrape-hitta.mjs — Scrapa hitta.se för svenska småbolag utan/med dålig hemsida
//
// Användning:
//   /usr/local/bin/node scrape-hitta.mjs [kategori] [stad] [sidor]
//   /usr/local/bin/node scrape-hitta.mjs "åkeri" "Stockholm" 2
//
// Output (stdout): JSON-array med bolag sorterade: ingen hemsida → dålig → okej
// Progress (stderr): löpande status

import { execSync, spawnSync } from 'child_process';
import { writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36';

// Stöd för både plain-text och URL-enkodade argument
// Exempel: 'akeri' → 'åkeri', '%C3%A5keri' → 'åkeri'
function decodeArg(s) {
  try { return decodeURIComponent(s); } catch { return s; }
}
// Mappa vanliga felstavningar utan å/ä/ö → rätt form
const CATEGORY_MAP = { 'akeri': 'åkeri', 'ateri': 'åkeri', 'aker': 'åkeri', 'vvs': 'VVS', 'bygg': 'bygg' };
const rawCat = process.argv[2] || 'åkeri';
const CATEGORY = CATEGORY_MAP[rawCat.toLowerCase()] || decodeArg(rawCat);
const CITY     = decodeArg(process.argv[3] || 'Stockholm');
const PAGES    = Math.min(parseInt(process.argv[4] || '2'), 5);

// Bolag att skippa — branschorganisationer, kedjor, ej relevanta
const SKIP_PATTERNS = [
  /circle k/i, /åkeriföretag/i, /åkeritidning/i, /wallenius/i,
  /taxiteknik/i, /logistics group/i, /dhl/i, /postnord/i, /schenker/i,
  /fedex/i, /ups /i, /kuehne/i, /dsv/i,
];

function log(...args) { process.stderr.write('[hitta] ' + args.join(' ') + '\n'); }

// ── HJÄLPFUNKTIONER ──────────────────────────────────────────────────────────

function parseJsonLd(html) {
  const results = [];
  const re = /application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    try { results.push(JSON.parse(m[1].trim())); } catch {}
  }
  return results;
}

function curlFetch(url) {
  try {
    const r = spawnSync('curl', [
      '-s', '-L', '--max-time', '10',
      '-A', UA,
      '-H', 'Accept-Language: sv-SE,sv;q=0.9',
      url
    ], { maxBuffer: 5 * 1024 * 1024, timeout: 12000 });
    return r.stdout?.toString() || '';
  } catch { return ''; }
}

function chromeFetch(url) {
  try {
    return execSync(
      `'${CHROME}' --headless=new --dump-dom --virtual-time-budget=4000 '${url}' 2>/dev/null`,
      { maxBuffer: 8 * 1024 * 1024, timeout: 25000 }
    ).toString();
  } catch (e) {
    log(`Chrome fel: ${e.message?.slice(0, 80)}`);
    return '';
  }
}

function assessWebsite(url) {
  if (!url) return { priority: 1, label: '🔴 Ingen hemsida', score: 0 };
  const u = url.toLowerCase();
  // Bara social media — nästan lika dåligt som ingen hemsida
  if (/facebook\.com|linkedin\.com|instagram\.com/.test(u) && !url.includes('.se/') && !url.includes('.com/') )
    return { priority: 2, label: '🔴 Bara social media', score: 1 };
  // Gamla/enkla byggare
  if (/weebly|wix\.|jimdo|one\.com|wordpress\.com|blogspot|mysite/.test(u))
    return { priority: 2, label: '🟠 Enkel hemsida-byggare', score: 2 };
  // Troligen WordPress (egenhostad men ofta dålig)
  if (/wp-content|wordpress/.test(u))
    return { priority: 3, label: '🟡 WordPress', score: 4 };
  // Ser ut som en riktig sajt — kräver manuell bedömning
  return { priority: 4, label: '🟢 Har hemsida', score: 7 };
}

// ── STEG 1: Hämta söksida med Chrome (ItemList JSON-LD) ──────────────────────

async function fetchSearchPage(page) {
  const offset = (page - 1) * 25;
  const url = `https://www.hitta.se/s%C3%B6k?vad=${encodeURIComponent(CATEGORY)}&var=${encodeURIComponent(CITY)}&typ=foretag&offset=${offset}`;
  log(`Sökresultat sida ${page}: ${url}`);

  const html = chromeFetch(url);
  const ldObjects = parseJsonLd(html);
  const itemList = ldObjects.find(d => d['@type'] === 'ItemList');

  if (!itemList?.itemListElement?.length) {
    log('  ⚠️  Inga resultat eller ItemList saknas');
    return [];
  }

  const companies = itemList.itemListElement.map(el => {
    const item = el.item || {};
    const hitaUrl = item.url || '';
    // Extrahera slug-id från hitta-URL (sista segmentet)
    const slugId = hitaUrl.split('/').pop();
    return {
      name: item.name || '',
      hitaUrl: hitaUrl,
      hitaId: slugId,
      phone: item.telephone || null,
      address: item.address || null,
    };
  });

  // Filtrera bort kedjor och branschorganisationer
  // OBS: behåll även bolag utan namn (de kan ha data på sin hitta-sida)
  const filtered = companies.filter(c =>
    !SKIP_PATTERNS.some(p => p.test(c.name || ''))
  );
  log(`  ${filtered.length} bolag (${companies.length - filtered.length} filtrerade bort)`);
  if (filtered.length > 0) log(`  Exempel: ${filtered.slice(0,3).map(c => c.name || '(inget namn)').join(', ')}`);
  return filtered;
}

// ── STEG 2: Hämta hemsidestatus per bolag via curl ───────────────────────────

function fetchCompanyWebsite(company) {
  // Bygg URL från hitta-slug
  const url = company.hitaUrl.startsWith('http')
    ? company.hitaUrl
    : `https://www.hitta.se${company.hitaUrl}`;

  const html = curlFetch(url);
  if (!html) return null;

  const ldObjects = parseJsonLd(html);
  const ld = ldObjects.find(d =>
    d['@type'] === 'LocalBusiness' || String(d['@type']).includes('LocalBusiness')
  );

  if (!ld) return null;

  const sameAs = Array.isArray(ld.sameAs) ? ld.sameAs : (ld.sameAs ? [ld.sameAs] : []);

  // Social media separat
  const SOCIAL = ['facebook.com', 'linkedin.com', 'instagram.com', 'twitter.com', 'x.com', 'youtube.com'];
  const socialMedia = sameAs.filter(u => u && SOCIAL.some(s => u.includes(s)));

  // Riktig hemsida = inte hitta/eniro/allabolag/social media
  const SKIP_DOMAINS = ['hitta.se', 'eniro.se', 'allabolag.se', ...SOCIAL];
  const website = sameAs.find(u =>
    u && typeof u === 'string' && u.startsWith('http') &&
    !SKIP_DOMAINS.some(d => u.includes(d))
  ) || null;

  // Om de BARA har social media men ingen riktig hemsida = nästan lika dåligt som ingen hemsida
  const onlySocial = !website && socialMedia.length > 0;

  const { priority, label, score } = onlySocial
    ? { priority: 2, label: '🟠 Bara social media', score: 1 }
    : assessWebsite(website);

  return {
    name: ld.name || company.name,
    phone: ld.telephone || company.phone,
    website: website,
    has_website: !!website,
    website_score: score,
    website_label: label,
    priority: priority,
    social_media: socialMedia,
    description: ld.description || null,
    address: {
      street: ld.address?.streetAddress || null,
      city: ld.address?.addressLocality || company.address?.addressLocality || CITY,
      region: ld.address?.addressRegion || null,
      postal: ld.address?.postalCode || null,
    },
    hitta_url: url,
    category: CATEGORY,
  };
}

// ── HUVUDFLÖDE ────────────────────────────────────────────────────────────────

log(`\n🔍 Startar: "${CATEGORY}" i ${CITY}, ${PAGES} sidor\n`);

const allCompanies = [];

for (let p = 1; p <= PAGES; p++) {
  const pageCompanies = await fetchSearchPage(p);

  log(`  Hämtar hemsidestatus för ${pageCompanies.length} bolag...`);
  for (const company of pageCompanies) {
    process.stderr.write(`    ${company.name}... `);
    const enriched = fetchCompanyWebsite(company);
    if (enriched) {
      allCompanies.push(enriched);
      process.stderr.write(`${enriched.website_label}\n`);
    } else {
      process.stderr.write(`[ej nåbar]\n`);
      // Lägg till med minimal data ändå
      allCompanies.push({
        name: company.name,
        phone: company.phone,
        website: null,
        has_website: false,
        website_score: 0,
        website_label: '🔴 Ej nåbar / ingen hemsida',
        priority: 1,
        social_media: [],
        description: null,
        address: { city: CITY },
        hitta_url: company.hitaUrl,
        category: CATEGORY,
      });
    }
    // Liten paus — vara snäll mot hitta.se
    await new Promise(r => setTimeout(r, 200));
  }
}

// ── SORTERA OCH FILTRERA ──────────────────────────────────────────────────────

// Sortera: lägst priority-nummer = bäst target
allCompanies.sort((a, b) => a.priority - b.priority || a.website_score - b.website_score);

// ── STATISTIK ────────────────────────────────────────────────────────────────

const noWebsite  = allCompanies.filter(c => c.priority <= 2);
const badWebsite = allCompanies.filter(c => c.priority === 3);
const okWebsite  = allCompanies.filter(c => c.priority >= 4);

log('\n─────────────────────────────────────────');
log(`✅ KLAR — ${allCompanies.length} bolag analyserade`);
log(`   🔴 Ingen/dålig hemsida:  ${noWebsite.length}  ← BÄSTA TARGET`);
log(`   🟡 Troligen WordPress:   ${badWebsite.length}  ← BRA TARGET`);
log(`   🟢 Har hemsida:          ${okWebsite.length}  ← skippa (manuell granskning)`);
log('\nTop 10 targets:');
allCompanies.slice(0, 10).forEach((c, i) => {
  const addr = c.address?.city || '';
  log(`   ${i+1}. ${c.name} (${addr}) ${c.website_label} ${c.phone || ''}`);
});

// ── OUTPUT ────────────────────────────────────────────────────────────────────

const outFile = join(homedir(), 'Desktop', `hitta-${CITY}-${CATEGORY.replace(/[åä]/g,'a').replace(/ö/g,'o')}-${Date.now()}.json`);
try {
  writeFileSync(outFile, JSON.stringify(allCompanies, null, 2));
  log(`\nSparad: ${outFile}`);
} catch {}

// Stdout = ren JSON (fångas av SKILL.md / Notion-steg)
process.stdout.write(JSON.stringify(allCompanies));
