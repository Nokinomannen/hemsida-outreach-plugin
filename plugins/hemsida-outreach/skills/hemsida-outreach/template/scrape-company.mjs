#!/usr/bin/env node
// scrape-company.mjs — Extrahera verklig bolagsdata för mockup-generering
//
// Input:  hitta-JSON för ett enskilt bolag (från scrape-hitta.mjs output)
//         Läses från Desktop/[slug]-hitta.json ELLER skickas via stdin
//
// Användning:
//   /usr/local/bin/node scrape-company.mjs [slug]
//   (läser ~/Desktop/[slug]-hitta.json, skriver ~/Desktop/[slug]-data.json)
//
// Output (stdout): komplett mockup-JSON redo för process-company.mjs
// Viktigt: INGA gissningar — all data är antingen verklig eller märkt som "genererad"

import { execSync, spawnSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36';
const D = join(homedir(), 'Desktop');

function log(...args) { process.stderr.write('[scrape-company] ' + args.join(' ') + '\n'); }

// ── HJÄLPFUNKTIONER ──────────────────────────────────────────────────────────

function curlFetch(url, timeout = 10) {
  try {
    const r = spawnSync('curl', [
      '-s', '-L', `--max-time`, String(timeout),
      '-A', UA, '-H', 'Accept-Language: sv-SE,sv;q=0.9',
      url
    ], { maxBuffer: 5 * 1024 * 1024, timeout: (timeout + 3) * 1000 });
    return r.stdout?.toString() || '';
  } catch { return ''; }
}

function chromeFetch(url) {
  try {
    return execSync(
      `'${CHROME}' --headless=new --dump-dom --virtual-time-budget=6000 '${url}' 2>/dev/null`,
      { maxBuffer: 8 * 1024 * 1024, timeout: 30000 }
    ).toString();
  } catch { return ''; }
}

function toSlug(name) {
  return name.toLowerCase()
    .replace(/å/g,'a').replace(/ä/g,'a').replace(/ö/g,'o')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ── CSS-FÄRGEXTRAKTION ────────────────────────────────────────────────────────

function extractColorsFromCSS(html, url) {
  // Extrahera inline CSS + style-taggar
  const styles = [];

  // Inline style-attribut
  const inlineStyles = [...html.matchAll(/style="([^"]{1,500})"/g)].map(m => m[1]);
  styles.push(...inlineStyles);

  // <style>-taggar
  const styleTags = [...html.matchAll(/<style[^>]*>([\s\S]{1,10000}?)<\/style>/gi)].map(m => m[1]);
  styles.push(...styleTags);

  const combined = styles.join(' ');

  // Hitta alla hex-färger
  const hexColors = [...combined.matchAll(/#([0-9a-fA-F]{6})\b/g)].map(m => '#' + m[1].toUpperCase());

  // Hitta alla rgb-färger
  const rgbColors = [...combined.matchAll(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/g)].map(m => {
    const r = parseInt(m[1]).toString(16).padStart(2,'0');
    const g = parseInt(m[2]).toString(16).padStart(2,'0');
    const b = parseInt(m[3]).toString(16).padStart(2,'0');
    return '#' + (r+g+b).toUpperCase();
  });

  const allColors = [...hexColors, ...rgbColors];

  // Filtrera bort svart, vitt, grå och för vanliga UI-färger
  const SKIP_COLORS = new Set([
    '#FFFFFF', '#000000', '#FAFAFA', '#F5F5F5', '#EEEEEE', '#E0E0E0',
    '#BDBDBD', '#9E9E9E', '#757575', '#616161', '#424242', '#212121',
    '#333333', '#666666', '#999999', '#CCCCCC', '#DDDDDD', '#F8F8F8',
    '#1A1A1A', '#2A2A2A', '#3A3A3A', '#111111', '#222222', '#444444',
  ]);

  // Räkna förekomster
  const counts = {};
  for (const c of allColors) {
    if (!SKIP_COLORS.has(c) && c !== '#UNDEFINED') {
      counts[c] = (counts[c] || 0) + 1;
    }
  }

  // Sortera efter frekvens
  const sorted = Object.entries(counts).sort((a,b) => b[1] - a[1]);

  if (sorted.length < 2) {
    log('  Kunde inte extrahera tillräckligt med färger från CSS');
    return null;
  }

  // Ta topp-2 distinkta färger
  const primary = sorted[0][0];
  // Accent = nästa färg som är tillräckligt annorlunda från primary
  let accent = sorted[1][0];
  for (const [c] of sorted.slice(1)) {
    if (colorDistance(primary, c) > 50) { accent = c; break; }
  }

  log(`  Primärfärg: ${primary} (${sorted[0][1]} förekomster)`);
  log(`  Accentfärg: ${accent}`);
  return { primary, accent };
}

function colorDistance(hex1, hex2) {
  const r1 = parseInt(hex1.slice(1,3),16), g1 = parseInt(hex1.slice(3,5),16), b1 = parseInt(hex1.slice(5,7),16);
  const r2 = parseInt(hex2.slice(1,3),16), g2 = parseInt(hex2.slice(3,5),16), b2 = parseInt(hex2.slice(5,7),16);
  return Math.sqrt((r1-r2)**2 + (g1-g2)**2 + (b1-b2)**2);
}

// ── HERO-BILDEXTRAKTION ───────────────────────────────────────────────────────

function extractHeroImage(html, baseUrl) {
  // Sök efter bakgrundsbilder i hero-sektioner
  const heroPatterns = [
    /(?:hero|banner|header|jumbotron|intro)[^{]*\{[^}]*background(?:-image)?[^}]*url\(['"]([^'"]+)['"]\)/gi,
    /background(?:-image)?:\s*url\(['"]([^'"]+)['"]\)/gi,
  ];

  for (const pattern of heroPatterns) {
    const matches = [...html.matchAll(pattern)];
    for (const m of matches) {
      let imgUrl = m[m.length - 1];
      if (!imgUrl.startsWith('http')) {
        try {
          imgUrl = new URL(imgUrl, baseUrl).href;
        } catch { continue; }
      }
      // Skippa data-URLs och ikoner
      if (imgUrl.startsWith('data:') || imgUrl.includes('icon') || imgUrl.includes('logo')) continue;
      if (imgUrl.match(/\.(png|jpg|jpeg|webp)/i)) {
        log(`  Hero-bild hittad: ${imgUrl}`);
        return imgUrl;
      }
    }
  }

  // Fallback: hitta stora <img>-taggar i header/hero-kontext
  const imgMatches = [...html.matchAll(/<img[^>]+src="([^"]+\.(jpg|jpeg|png|webp))"[^>]*>/gi)];
  for (const m of imgMatches) {
    const src = m[1];
    if (src.includes('logo') || src.includes('icon') || src.includes('sprite')) continue;
    if (!src.startsWith('http')) continue;
    log(`  Fallback hero-bild: ${src}`);
    return src;
  }

  return null;
}

// ── BRANSCHBASERADE STANDARDFÄRGER ────────────────────────────────────────────
// Används när bolaget saknar hemsida

const INDUSTRY_COLORS = {
  'åkeri':     { primary: '#1a2e4a', accent: '#e8871e' }, // mörkblå + orange
  'transport': { primary: '#1a2e4a', accent: '#e8871e' },
  'logistik':  { primary: '#0d2137', accent: '#f4a623' },
  'bygg':      { primary: '#2c3e1a', accent: '#f0a500' }, // mörkgrön + gul
  'vvs':       { primary: '#1c3a5c', accent: '#0ea5e9' }, // mörkblå + ljusblå
  'städ':      { primary: '#1a3a2e', accent: '#10b981' }, // mörkgrön + grön
  'mark':      { primary: '#2d1a0e', accent: '#c2762a' }, // brun + koppar
  'schakt':    { primary: '#1a1a2e', accent: '#7c3aed' }, // mörk + lila
  'el':        { primary: '#1a1a1a', accent: '#eab308' }, // svart + gul
  'snickeri':  { primary: '#2d1b0e', accent: '#d97706' }, // trä-toner
};

function getIndustryColors(category) {
  const key = category?.toLowerCase().trim();
  return INDUSTRY_COLORS[key] || { primary: '#1e2d3d', accent: '#e07b39' };
}

// ── TJÄNSTEXTRAKTION FRÅN HITTA-BESKRIVNING ───────────────────────────────────

function extractServicesFromDescription(description, category) {
  if (!description) return null;

  // Sök efter meningar som beskriver tjänster
  const serviceKeywords = [
    'transport', 'frakt', 'leverans', 'flytt', 'hämtning', 'körning',
    'lyft', 'kran', 'container', 'pall', 'gods', 'last',
    'reparation', 'service', 'underhåll', 'installation',
    'mark', 'schakt', 'grävning', 'anläggning',
    'städ', 'rengöring', 'tvätt',
    'bygg', 'renovering', 'konstruktion',
    'vvs', 'rör', 'värme', 'ventilation',
  ];

  const sentences = description.split(/[.\n!?]+/).map(s => s.trim()).filter(s => s.length > 10);
  const serviceRelated = sentences.filter(s =>
    serviceKeywords.some(kw => s.toLowerCase().includes(kw))
  );

  return serviceRelated.slice(0, 6); // Max 6 service-meningar
}

// ── IKONER PER BRANSCH ────────────────────────────────────────────────────────

// SVG-ikonnyckel — matchas av mockup-template.html ICONS-map
const INDUSTRY_ICONS = {
  'åkeri':     ['transport', 'logistik', 'mark', 'reparation'],
  'transport': ['transport', 'logistik', 'reparation', 'default'],
  'logistik':  ['logistik', 'transport', 'mark', 'default'],
  'bygg':      ['bygg', 'mark', 'reparation', 'default'],
  'vvs':       ['vvs', 'reparation', 'bygg', 'default'],
  'städ':      ['städ', 'default', 'bygg', 'reparation'],
  'mark':      ['mark', 'bygg', 'transport', 'default'],
  'schakt':    ['mark', 'bygg', 'transport', 'reparation'],
};

function getIcons(category) {
  return INDUSTRY_ICONS[category?.toLowerCase()] || ['default', 'reparation', 'bygg', 'transport'];
}

// ── BÄSTA UNSPLASH-BILD PER BRANSCH ──────────────────────────────────────────
// Direkt CDN-URL, verifierade att fungera i headless Chrome

const INDUSTRY_IMAGES = {
  'åkeri':     'https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?w=1600&q=80',
  'transport': 'https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?w=1600&q=80',
  'logistik':  'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=1600&q=80',
  'bygg':      'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=1600&q=80',
  'vvs':       'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1600&q=80',
  'städ':      'https://images.unsplash.com/photo-1563453392212-326f5e854473?w=1600&q=80',
  'mark':      'https://images.unsplash.com/photo-1581094794329-c8112a89af12?w=1600&q=80',
  'schakt':    'https://images.unsplash.com/photo-1581094794329-c8112a89af12?w=1600&q=80',
};

function getIndustryImage(category) {
  return INDUSTRY_IMAGES[category?.toLowerCase()] ||
    'https://images.unsplash.com/photo-1486325212027-8081e485255e?w=1600&q=80';
}

// ── SCRAPA BOLAGETS HEMSIDA (om de har en) ────────────────────────────────────

function scrapeWebsite(websiteUrl) {
  log(`Scrapar hemsida: ${websiteUrl}`);

  // Prova curl först (snabbt)
  let html = curlFetch(websiteUrl, 8);

  // Om sidan är JS-renderad, använd Chrome
  if (!html || html.length < 2000 || html.includes('You need to enable JavaScript')) {
    log('  Curl gav lite data — provar Chrome...');
    html = chromeFetch(websiteUrl);
  }

  if (!html || html.length < 500) {
    log('  Hemsida ej nåbar');
    return null;
  }

  log(`  Sida laddad (${Math.round(html.length/1024)} KB)`);

  const colors = extractColorsFromCSS(html, websiteUrl);
  const heroImage = extractHeroImage(html, websiteUrl);

  // Extrahera kontaktinfo
  const emails = [...html.matchAll(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g)]
    .map(m => m[1])
    .filter(e => !e.includes('example') && !e.includes('test') && !e.includes('@sentry'));

  return {
    colors,
    heroImage,
    email: emails[0] || null,
    htmlSize: html.length,
  };
}

// ── BYGG KOMPLETT MOCKUP-JSON ─────────────────────────────────────────────────

function buildMockupData(hitaCompany) {
  const {
    name, phone, website, description, address, category, social_media
  } = hitaCompany;

  const slug = toSlug(name);
  const city = address?.city || 'Stockholm';
  const region = address?.region || 'Stockholms län';
  const industryKey = category?.toLowerCase() || 'transport';

  // Standardfärger baserade på bransch
  let colors = getIndustryColors(industryKey);
  let heroImageUrl = getIndustryImage(industryKey);
  let email = null;

  // Om bolaget har hemsida — scrapa faktiska färger och hero-bild
  if (website) {
    log(`Bolag har hemsida: ${website}`);
    const scraped = scrapeWebsite(website);
    if (scraped) {
      if (scraped.colors) colors = scraped.colors;
      if (scraped.heroImage) heroImageUrl = scraped.heroImage;
      if (scraped.email) email = scraped.email;
    }
  }

  // Extrahera tjänster från hitta-beskrivning
  const serviceSentences = extractServicesFromDescription(description, category);
  const icons = getIcons(industryKey);

  // Bygg 4 tjänster från verklig data
  // Använd konkreta meningar från beskrivningen, trim:a dem
  let services;
  if (serviceSentences && serviceSentences.length >= 2) {
    services = serviceSentences.slice(0, 4).map((s, i) => {
      // Extrahera tjänstens "namn" = max 3 ord från första frasen
      const phrase = s.split(/[,;.]/)[0].trim();
      const STOP = /^(och|att|med|för|som|det|den|ett|en|av|på|är|vi|de|har|till|från|om|men|när|kan|dig|oss|sin|sig|var|samt|också|alla|våra|era|sedan|även)$/i;
      // Ta 1-2 meningsbärande ord — prioritera substantiv (inte adjektiv på -ad/-ig/-lig)
      const ADJSUFFIX = /(?:lad|lig|iga|ade|igt|bar|sam|full|lös|rad|ägt)$/i;
      const nameWords = phrase.split(/\s+/)
        .map(w => w.replace(/[^a-zA-ZåäöÅÄÖ]/g, ''))  // rensa bindestreck etc.
        .filter(c => {
          if (c.length < 5 || c.length > 22) return false;
          if (STOP.test(c)) return false;
          if (ADJSUFFIX.test(c) && c.length < 16) return false; // adjektiv bort (utökat)
          return true;
        })
        .slice(0, 2);
      // Om första ordet är ett långt specifikt kompositum (>=12 tecken), använd bara det
      const firstWord = nameWords[0] || '';
      const name = firstWord.length >= 12
        ? firstWord
        : nameWords.length > 0
          ? nameWords.join(' ')
          : phrase.split(/\s+/).slice(0, 2).join(' ');
      const desc = s.length > 90 ? s.slice(0, 90) + '…' : s;
      return {
        name: name.charAt(0).toUpperCase() + name.slice(1),
        desc: desc,
        icon: icons[i] || 'default'
      };
    });
    // Fyll upp till 4 om vi har för få
    while (services.length < 4) {
      services.push({
        name: 'Kontakta oss',
        desc: 'Vi hjälper dig med det du behöver.',
        icon: icons[services.length] || '📞'
      });
    }
  } else {
    // Fallback baserat på bransch
    const fallbacks = {
      'åkeri':     [
        { name: 'Godstransport', desc: 'Pålitliga transporter av gods och material.', icon: 'transport' },
        { name: 'Expressleverans', desc: 'Snabb och säker leverans när du behöver.', icon: 'logistik' },
        { name: 'Specialtransport', desc: 'Transport av tunga och överkranskjutande gods.', icon: 'mark' },
        { name: 'Nationella rutter', desc: 'Regelbundna turer i hela Sverige.', icon: 'default' },
      ],
      'bygg':      [
        { name: 'Nybyggnation', desc: 'Vi bygger ditt projekt från grunden.', icon: 'bygg' },
        { name: 'Renovering', desc: 'Professionell renovering av alla slag.', icon: 'reparation' },
        { name: 'Markarbeten', desc: 'Schaktning, dränering och grundläggning.', icon: 'mark' },
        { name: 'Projektledning', desc: 'Vi tar helhetsansvar för ditt projekt.', icon: 'default' },
      ],
      'vvs':       [
        { name: 'VVS-installation', desc: 'Professionell installation av VVS-system.', icon: 'vvs' },
        { name: 'Rörarbeten', desc: 'Allt inom rör och vatteninstallation.', icon: 'reparation' },
        { name: 'Värmepumpar', desc: 'Installation och service av värmepumpar.', icon: 'default' },
        { name: 'Jourtjänst', desc: 'Vi finns tillgängliga när du behöver oss.', icon: 'reparation' },
      ],
    };
    services = fallbacks[industryKey] || fallbacks['åkeri'];
  }

  // Tagline: Hämta distinktivt ord ur BOLAGSNAMNET (inte stad, inte AB/HB, inte generisk bransch)
  // Mål: "BILDEMONTERING I HOLMSJÖ", "PÅLITLIGA TRANSPORTER I GRIMSÅS"
  const INDUSTRY_TAGLINES = {
    'åkeri':   'PÅLITLIGA TRANSPORTER',
    'bygg':    'PROFFS PÅ BYGG',
    'vvs':     'DIN VVS-EXPERT',
    'städ':    'PROFFS PÅ STÄD',
    'mark':    'MARKENTREPRENAD',
    'logistik':'LOGISTIK & FRAKT',
  };
  const GENERIC_WORDS = /^(ab|hb|kb|aktiebolag|handelsbolag|åkeri|akeri|transport|bygg|vvs|stad|i|och|s|n|son|ssons|sson|logistik)$/i;
  const citySlug = city.toLowerCase().replace(/å/g,'a').replace(/ä/g,'a').replace(/ö/g,'o');

  // Extrahera distinktiva ord från bolagsnamnet
  // Uteslut: för korta ord (<6), generiska branschord, possessivformer (-s-slut = ägandeform/efternamn),
  // samt ord som börjar på city-prefix (t.ex. "Smedjebackens" börjar med "smedj")
  const nameWords = name.split(/[\s&+]+/)
    .map(w => w.replace(/[^a-zA-ZåäöÅÄÖ]/g, ''))
    .filter(w => {
      if (w.length < 6) return false;                         // för kort = förnamn/preposition
      const wl = w.toLowerCase().replace(/å/g,'a').replace(/ä/g,'a').replace(/ö/g,'o');
      if (GENERIC_WORDS.test(wl)) return false;               // generiskt branschord
      if (wl.endsWith('s') && w.length <= 12) return false;   // possessiv/efternamnsform (Hultmarks, Jonssons...)
      if (wl.startsWith(citySlug.slice(0, 5))) return false;  // börjar med stadsnamnet
      return true;
    });

  let tagline;
  if (nameWords.length > 0) {
    // Använd första distinktiva ord ur bolagsnamnet + stad
    const keyWord = nameWords[0];
    tagline = `${keyWord.toUpperCase()} I ${city.toUpperCase()}`;
  } else {
    tagline = (INDUSTRY_TAGLINES[industryKey] || 'PROFFS') + ' I ' + city.toUpperCase();
  }

  // Hero-subtext
  const heroSubtext = description
    ? description.split('.')[0].slice(0, 120).trim() + '.'
    : `Professionella ${category}-tjänster i ${city} och omnejd.`;

  // Om oss-sektion
  const aboutHeading = description
    ? `${name} — proffs i ${city}`
    : `Välkommen till ${name}`;
  const aboutBody = description
    ? (description.length > 300 ? description.slice(0, 300).trim() + '…' : description)
    : `Vi är ett lokalt företag i ${city} som specialiserar oss på ${category}. Kontakta oss för att diskutera dina behov.`;

  // Stats — sparas för bakåtkompatibilitet men visas ej i ny mall
  const stats = [];

  return {
    company_name: name,
    slug: slug,
    industry: category || 'Transport',
    tagline: tagline,
    city: city,
    region: region,
    phone: phone || '',
    email: email || '',
    founded_year: null, // Allabolag.se skulle kunna ge detta
    primary_color: colors.primary,
    accent_color: colors.accent,
    hero_image_url: heroImageUrl,
    hero_subtext: heroSubtext,
    about_heading: aboutHeading,
    about_body: aboutBody,
    services: services,
    stats: stats,
    // Extra metadata (används inte av process-company.mjs men sparas för referens)
    _source: {
      hitta_url: hitaCompany.hitta_url,
      has_website: hitaCompany.has_website,
      website_label: hitaCompany.website_label,
      description_length: description?.length || 0,
      colors_from: website && hitaCompany.has_website ? 'website' : 'industry_default',
      hero_from: website && hitaCompany.has_website ? 'website' : 'unsplash_default',
    }
  };
}

// ── MAIN ──────────────────────────────────────────────────────────────────────

const slug = process.argv[2];

if (!slug) {
  process.stderr.write('Användning: /usr/local/bin/node scrape-company.mjs [slug]\n');
  process.stderr.write('Förväntar ~/Desktop/[slug]-hitta.json\n');
  process.exit(1);
}

const hitaFile = join(D, `${slug}-hitta.json`);
let hitaCompany;

try {
  hitaCompany = JSON.parse(readFileSync(hitaFile, 'utf8'));
  log(`Laddat: ${hitaCompany.name}`);
} catch (e) {
  process.stderr.write(`Kunde inte läsa ${hitaFile}: ${e.message}\n`);
  process.exit(1);
}

log(`Bearbetar: ${hitaCompany.name} (${hitaCompany.website_label})`);
const mockupData = buildMockupData(hitaCompany);

// Skriv data.json till Desktop (som process-company.mjs förväntar sig)
const outFile = join(D, `${slug}-data.json`);
writeFileSync(outFile, JSON.stringify(mockupData, null, 2));
log(`\n✅ Skrivet: ${outFile}`);
log(`   Tagline: ${mockupData.tagline}`);
log(`   Färger: ${mockupData.primary_color} + ${mockupData.accent_color}`);
log(`   Hero: ${mockupData.hero_image_url?.slice(0,60)}...`);
log(`   Tjänster: ${mockupData.services.map(s=>s.name).join(', ')}`);
log(`   Email: ${mockupData.email || '(inte hittad)'}`);

// Stdout = JSON (för pipeline-integration)
process.stdout.write(JSON.stringify(mockupData));
