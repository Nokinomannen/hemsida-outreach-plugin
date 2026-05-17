---
name: hemsida-outreach
description: >
  Automated B2B outreach pipeline for web design sales targeting Swedish small businesses.
  Scrapes Google Maps and the web for new target companies, adds them to Notion, visits
  their websites, scores them, generates personalized HTML mockups, screenshots them,
  creates Outlook email drafts with embedded screenshot, and updates Notion status.
  Use this skill whenever the user writes "KÖR HEMSIDA-PIPELINE" or "KÖR SCRAPING" or
  asks to run the website outreach flow, find new companies, generate mockups, or process
  the Åkerier Sverige database. Also trigger for: hemsida-pipeline, outreach, mockup
  generation, cold email for web design, scrapa bolag, hitta åkerier.
---

# Hemsida Outreach Pipeline

Full B2B outreach flow: scrape web → Notion → score → scrape company data → HTML mockup (template) → screenshot → Outlook draft → update Notion.

**Trigger phrases:**
- `KÖR HEMSIDA-PIPELINE` — runs full pipeline on existing Notion rows
- `KÖR SCRAPING` — only runs Step 0 (find new companies and add to Notion)

---

## TEMPLATE FILES

The template files are bundled inside this skill. When this skill runs, the system provides the skill base directory path in the context as "Base directory for this skill: /path/to/skills/hemsida-outreach/". The template files are at:

- `{SKILL_BASE_DIR}/template/mockup-template.html`
- `{SKILL_BASE_DIR}/template/fill-template.mjs`
- `{SKILL_BASE_DIR}/template/example-company.json`

**CRITICAL:** Read the "Base directory for this skill:" line at the top of your context to determine the actual path, then use it when calling fill-template.mjs. Do NOT hardcode any path.

Example — if the system says `Base directory for this skill: /var/folders/xx/yyy/skills/hemsida-outreach/`, then run:
```applescript
do shell script "/usr/local/bin/node '/var/folders/xx/yyy/skills/hemsida-outreach/template/fill-template.mjs' '/Users/your-username/Desktop/[slug]-data.json' 2>&1"
```

Node.js v24 must be installed at `/usr/local/bin/node`. Use the FULL path always — bare `node` fails in osascript shell.

---

## NOTION DATABASE

Database ID: `33f2c3c0-f254-81e3-99ba-d6c1e04e0fe4`

> **Note for new users:** This is the shared Notion database. If you have a separate database, update this ID.

Schema:
- Bolag (title), Stad (select), Hemsida (url), Telefon (phone), Adress (text)
- Har hemsida (checkbox), Hemsidebetyg (number 0-10)
- Status (select): Ej kontaktad / Target / Skip / Kontaktad
- Email (email), Noteringar (text)

---

## TOOLS REQUIRED

- Notion MCP (read + write)
- web_search / web_fetch (find companies + visit websites)
- Outlook (via Node.js + osascript)
- Node.js v24 at `/usr/local/bin/node`

---

## STEP 0 — SCRAPE NEW COMPANIES (KÖR SCRAPING)

Goal: Find 30 new Swedish small businesses per session and add them to Notion.

**Target profile:**
- Bransch: transport, logistik, bygg, VVS, städ, mark, schakt, åkeri
- Storlek: 2-50 anställda (skip large enterprise)
- Geografi: Stockholm, Göteborg, Malmö, Linköping — rotate each session

**How to find companies:**
1. Use web_search: `åkeri [stad]`, `transportföretag [stad]`, `VVS [stad] litet bolag`
2. Check if company already exists in Notion — skip duplicates
3. Add new rows: Bolag, Stad, Hemsida, Telefon, Har hemsida, Status = "Ej kontaktad"

**Target: 30 new rows per session.**

---

## STEP 1 — SCORE THE WEBSITE (0-10)

For each company with Status = "Ej kontaktad", visit their website with web_fetch.

| Criterion | Max | Low score when... |
|---|---|---|
| Teknisk funktion | 2p | Slow, broken, errors |
| Mobilanpassning | 2p | Not responsive |
| Design och visuell standard | 2p | Outdated, ugly |
| Innehåll och tydlighet | 2p | Vague, missing info |
| CTA och kontaktmöjlighet | 2p | No clear contact |

- Score ≤6 → Status = "Target"
- Score 7-10 → Status = "Skip"
- No website → Status = "Target", Hemsidebetyg = 0

---

## STEP 2 — SCRAPE COMPANY DATA (Target rows only)

**OBLIGATORISKT: Besök alltid företagets faktiska hemsida.** Extrahera verklig data — anta aldrig utan att ha verifierat.

**Färgextraktion:** Matcha primärfärg och accentfärg mot deras faktiska visuella identitet (logo, navbar, knappar).

**Hero-bild:** Om de har en hero-bild på startsidan, använd den URL:en i `hero_image_url`. Annars, hitta en relevant bild via unsplash.com och kopiera den direkta CDN-URL:en: `https://images.unsplash.com/photo-{ID}?w=1600&q=80`. Använd ALDRIG `source.unsplash.com` — det är en redirect som inte fungerar i headless Chrome.

Gather: bolagsnamn, slug, grundningsår, stad, region, bransch, 4 specifika tjänster, telefon, email, primärfärg (hex), accentfärg (hex), hero_image_url.

---

## STEP 3 — GENERATE HTML MOCKUP

**Generera ALDRIG HTML from scratch.** Använd fill-template.mjs från denna skills template/-katalog.

1. Bygg JSON (skriv till `~/Desktop/[slug]-data.json`):

```json
{
  "company_name": "Bolagsnamn AB",
  "slug": "bolagsnamn-ab",
  "industry": "Åkeri",
  "tagline": "KORT TAGLINE MAX 5 ORD",
  "city": "Stockholm",
  "region": "Stockholms län",
  "phone": "08-XX XX XX",
  "email": "info@bolaget.se",
  "founded_year": 2005,
  "primary_color": "#1e2d3d",
  "accent_color": "#e07b39",
  "hero_image_url": "https://images.unsplash.com/photo-{ID}?w=1600&q=80",
  "hero_subtext": "En mening om vad bolaget gör.",
  "services": [
    { "name": "Tjänst 1", "desc": "Beskrivning.", "icon": "🚛" },
    { "name": "Tjänst 2", "desc": "Beskrivning.", "icon": "📦" },
    { "name": "Tjänst 3", "desc": "Beskrivning.", "icon": "⚙️" },
    { "name": "Tjänst 4", "desc": "Beskrivning.", "icon": "✅" }
  ],
  "stats": [
    { "value": "2005", "label": "Grundat år" },
    { "value": "20",   "label": "Anställda" },
    { "value": "4",    "label": "Tjänsteområden" },
    { "value": "20",   "label": "Års erfarenhet" }
  ]
}
```

2. Kör fill-template.mjs (läs SKILL_BASE_DIR från systemkontexten):

```applescript
do shell script "/usr/local/bin/node '{SKILL_BASE_DIR}/template/fill-template.mjs' '/Users/{username}/Desktop/[slug]-data.json' 2>&1"
```

Output: `~/Desktop/[slug]-mockup.html`

---

## STEP 4 — SCREENSHOT

**Steg 4a — Skapa static-version** (inaktivera CSS-animationer):

Skriv och kör Node.js-skript (`~/Desktop/make_static_[slug].mjs`):

```javascript
import { readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
const D = homedir() + '/Desktop';
let html = readFileSync(D + '/[slug]-mockup.html', 'utf8');
const override = [
  '<style>',
  '  nav { opacity: 1 !important; animation: none !important; }',
  '  .hero-badge { opacity: 1 !important; transform: none !important; animation: none !important; }',
  '  .hero-h1 .word { clip-path: inset(0 0% 0 0) !important; animation: none !important; }',
  '  .hero-sub { opacity: 1 !important; transform: none !important; animation: none !important; }',
  '  .hero-cta { opacity: 1 !important; transform: scale(1) !important; animation: none !important; }',
  '  .hero-phone { opacity: 1 !important; animation: none !important; }',
  '  .service-card { opacity: 1 !important; transform: translateY(0) !important; transition: none !important; }',
  '  .reveal { opacity: 1 !important; transform: none !important; transition: none !important; }',
  '  * { animation-duration: 0.001s !important; animation-delay: 0s !important; }',
  '</style>'
].join('\n');
html = html.replace('</head>', override + '\n</head>');
writeFileSync(D + '/[slug]-static.html', html);
console.log('Static klar');
```

**Steg 4b — Ta screenshot:**

```applescript
do shell script "'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' --headless=new --screenshot='/Users/{username}/Desktop/[slug]-screenshot.png' --window-size=1200,675 'file:///Users/{username}/Desktop/[slug]-static.html' 2>/dev/null"
```

Verifiera att screenshoten är >200 KB — annars är hero-bilden troligen saknad.

---

## STEP 5 — SKAPA OUTLOOK-DRAFT

Skriv och kör Node.js-skript (`~/Desktop/create_email_[slug].mjs`):

```javascript
import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { homedir } from 'os';
const D = homedir() + '/Desktop';
const img = readFileSync(D + '/[slug]-screenshot.png');
const b64 = img.toString('base64');

const htmlBody = `<html><body style="font-family: Arial, sans-serif; color: #333; max-width: 640px; margin: 0 auto; padding: 20px;">
<p>Hej [BOLAGSNAMN]-teamet,</p>
<p>Jag hittade er när jag letade efter [BRANSCH]-bolag i [STAD].</p>
<p>Ni gör bra saker — [SPECIFIK DETALJ]. Men er hemsida speglar inte riktigt det ni är.</p>
<p><img src="data:image/png;base64,${b64}" width="600" style="display:block; border-radius:4px; box-shadow: 0 4px 20px rgba(0,0,0,0.15);" alt="Förhandsgranskning av er nya hemsida" /></p>
<p>Det tar ungefär två veckor, kostar runt 10 000 SEK, och sedan har ni en sida som faktiskt reflekterar vad ni är.</p>
<p>Det här är bara ett förslag — vi kan göra den helt annorlunda.</p>
<p>Intresserad? Svar på detta mail räcker.</p>
<p>[DITT NAMN]<br/>[DITT FÖRETAG] &middot; <a href="[DIN WEBBSIDA]">[DIN WEBBSIDA]</a></p>
</body></html>`;

writeFileSync(D + '/email_body_[slug].html', htmlBody, 'utf8');
const script = [
  'tell application "Microsoft Outlook"',
  '\tset htmlContent to (read POSIX file "' + D + '/email_body_[slug].html" as «class utf8»)',
  '\tset newMsg to make new outgoing message with properties {subject:"[BOLAGSNAMN] - en helt ny version av er hemsida", content:htmlContent}',
  '\tmake new recipient at newMsg with properties {email address:{address:"[EMAIL]"}}',
  '\topen newMsg',
  'end tell'
].join('\n');
writeFileSync(D + '/create_outlook_[slug].applescript', script, 'utf8');
execSync("osascript '" + D + "/create_outlook_[slug].applescript'");
console.log('Draft öppnad i Outlook');
```

---

## STEP 6 — UPPDATERA NOTION

- Status → "Kontaktad"
- Noteringar → "Draft skapad [DATUM]. Hemsidebetyg: [SCORE]/10."

**Max 5 drafts per körning.**

---

## TEKNISKA KRAV

- Använd ALLTID `/usr/local/bin/node` — aldrig bara `node`
- Skriv alltid Node.js-skript till fil och kör via sökväg — aldrig inline via `osascript -e`
- `hero_image_url` måste vara en direkt CDN-URL — aldrig `source.unsplash.com`
- Screenshot <200 KB = hero-bild saknas, kontrollera URL

---

## PRISER (intern referens)

- Hemsida: ~10 000 SEK, ~2 veckor leverans
- Upsell: Underhåll, SEO, AI-integrationer

---

## FELHANTERING

| Situation | Åtgärd |
|---|---|
| Hemsida ej nåbar | Noteringar: "Hemsida ej nåbar", hoppa till nästa |
| Ingen email hittad | Noteringar: "Ingen email hittad", flagga för manuell uppföljning |
| Screenshot misslyckas | Fortsätt med HTML-bilaga som fallback |
| `node: command not found` | Använd `/usr/local/bin/node` |
| Hero-bild 404 | Hitta annan Unsplash CDN-URL |

---

## SESSIONSSUMMERING

Rapportera: X drafts skapade, bolagsnamn, eventuella fel.
