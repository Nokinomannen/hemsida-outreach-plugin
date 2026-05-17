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

## NOTION DATABASE

Database ID: `33f2c3c0-f254-81e3-99ba-d6c1e04e0fe4`
Data Source ID: `33f2c3c0-f254-816d-91a2-000b2e8d7dfe`

Schema:
- Bolag (title), Stad (select), Hemsida (url), Telefon (phone), Adress (text)
- Har hemsida (checkbox), Hemsidebetyg (number 0-10)
- Status (select): Ej kontaktad / Target / Skip / Kontaktad
- Email (email), Noteringar (text)

**NOTE:** If "Kontaktad" or "Email" are missing from the schema, prompt the user to add them manually in Notion before running the pipeline.

This database is designed for **continuous rolling intake**. New companies are added each session via Step 0. The pipeline only processes rows with Status = "Ej kontaktad".

---

## TOOLS REQUIRED

- Notion MCP (read + write)
- Claude in Chrome / web_search (find companies + visit websites)
- Outlook (create draft via Node.js + osascript — no MCP available)
- Node.js v24 at `/usr/local/bin/node` (ALWAYS use full path — `node` alone fails in osascript shell)

---

## TEMPLATE FILES (mockup-generering)

Mockups genereras INTE from scratch — använd alltid dessa filer:

- **Template:** `/Users/noahkrueger/Documents/hemsida-outreach/template/mockup-template.html`
- **Fill-script:** `/Users/noahkrueger/Documents/hemsida-outreach/template/fill-template.mjs`
- **Exempel-JSON:** `/Users/noahkrueger/Documents/hemsida-outreach/template/example-company.json`

---

## STEP 0 — SCRAPE NEW COMPANIES (KÖR SCRAPING)

Goal: Find 30 new Swedish small businesses per session and add them to Notion.

**Target profile:**
- Bransch: transport, logistik, bygg, VVS, städ, mark, schakt, åkeri
- Storlek: 2-50 anställda (skip large enterprise)
- Geografi: Stockholm, Göteborg, Malmö, Linköping — rotate each session
- Indicator of weak web presence: old site, no booking, phone-only contact

**How to find companies:**

1. Use web_search with queries like:
   - `åkeri [stad] site:google.com/maps` — or Google Maps search
   - `transportföretag [stad] hemsida`
   - `VVS [stad] litet bolag`
   - Allabolag.se search: `allabolag.se/bransch/transport/[stad]`

2. For each company found, check if it already exists in Notion (search by Bolag name). Skip duplicates.

3. Add new companies to Notion with:
   - Bolag = company name
   - Stad = city (must match existing options: Stockholm/Göteborg/Malmö/Linköping — if new city needed, note it)
   - Hemsida = URL (if found)
   - Telefon = phone (if found)
   - Har hemsida = YES/NO
   - Status = "Ej kontaktad"

**Target: 30 new rows per session. Report how many were added.**

---

## STEP 1 — SCORE THE WEBSITE (0-10)

For each company with Status = "Ej kontaktad":

Visit the company's website using Claude in Chrome or web_fetch.

**Scoring rubric:**
| Criterion | Max | Low score when... |
|---|---|---|
| Teknisk funktion | 2p | Slow, broken, errors |
| Mobilanpassning | 2p | Not responsive |
| Design och visuell standard | 2p | Outdated, ugly |
| Innehåll och tydlighet | 2p | Vague, missing info |
| CTA och kontaktmöjlighet | 2p | No clear contact |

**Decision rule:**
- Score <=6 -> Status = "Target"
- Score 7-10 -> Status = "Skip"
- No website -> Status = "Target" (strong opportunity), Hemsidebetyg = 0
- Large enterprise -> Status = "Skip"

Update Notion immediately: set Hemsidebetyg + Status.

---

## STEP 2 — SCRAPE COMPANY DATA (Target rows only)

**OBLIGATORISKT: Besok alltid foretagets faktiska hemsida.** Var inte lat — ga in pa sidan med Claude in Chrome eller web_fetch och extrahera verklig data. Anta aldrig information utan att ha verifierat den.

**Fargextraktion:** Matcha alltidrimarfarg och accentfarg mot foretagets faktiska visuella identitet (logo, navbar, knappar). Inspektera CSS eller anvand digital color picker.

**Hero-bild:** Om foretagets hemsida har en hero-bild (bakgrundsbild pa startsidan), anvand den direkta URL:en i `hero_image_url`. Om ingen hero-bild finns, hitta en relevant bild fran Unsplash CDN: `https://images.unsplash.com/photo-{PHOTO_ID}?w=1600&q=80` — sok via unsplash.com for att hitta ratt photo ID, kopiera sedan CDN-URL:en direkt. Anvand ALDRIG `source.unsplash.com` — det ar en redirect-tjanst som inte fungerar i headless Chrome.

Gather from website + Allabolag.se + Google Maps:

```
- Bolagsnamn (exact, from their actual website)
- Slug (URL-safe: lowercase, a/a/o for a/a/o, spaces->hyphens)
- Grundningsar
- Stad, Region (t.ex. "Vastra Gotaland")
- Bransch (t.ex. "VVS", "Akeri", "Bygg")
- Tjanster: exakt 4 specifika tjanster (fran deras faktiska hemsida, inte generiska)
- Antal anstallda (approximate)
- Kontaktperson (name + title if visible)
- Telefon
- Email (look in website footer, contact page, Google Maps listing)
-Rimarfarg (hex) — extraherad fran logotyp eller dominerande varumarksfarg pa hemsidan
- Accentfarg (hex) — sekundar varumarksfarg (knappar, highlights)
- Hero image URL — direkt CDN-URL till en bild (se ovan)
```

Store in memory. Update Notion Email field if found.

---

## STEP 3 — GENERATE HTML MOCKUP (template-baserat, INTE from scratch)

**Generera ALDRIG HTML from scratch.** Anvand fill-template.mjs — det tar sekunder och kostar minimalt med credits.

### Vad du ska gora

1. Samla dessa datapunkter (fran Step 2) och skapa ett JSON-objekt:

```json
{
  "company_name": "Bolagsnamn AB",
  "slug": "bolagsnamn-ab",
  "industry": "VVS",
  "tagline": "DIN VVS-EXPERT I GOTEBORG",
  "city": "Goteborg",
  "region": "Vastra Gotaland",
  "phone": "031-XX XX XX",
  "email": "info@bolaget.se",
  "founded_year": 2003,
  "primary_color": "#1a2535",
  "accent_color": "#07a9e5",
  "hero_image_url": "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1600&q=80",
  "hero_subtext": "Professionella VVS-tjanster i Goteborg sedan 2003.",
  "services": [
    { "name": "Tjanst 1", "desc": "Kort beskrivning.", "icon": "🔧" },
    { "name": "Tjanst 2", "desc": "Kort beskrivning.", "icon": "⚙️" },
    { "name": "Tjanst 3", "desc": "Kort beskrivning.", "icon": "🏗️" },
    { "name": "Tjanst 4", "desc": "Kort beskrivning.", "icon": "✅" }
  ],
  "stats": [
    { "value": "2003", "label": "Grundat ar" },
    { "value": "300+", "label": "Nojda kunder" },
    { "value": "4",    "label": "Tjansteomraden" },
    { "value": "24/7", "label": "Jourtjanst" }
  ]
}
```

**Viktigt:** Anvand `hero_image_url` (direkt CDN-URL) — INTE `hero_image_query`. fill-template.mjs laddar ner bilden och baddar in den som base64, vilket garanterar att den syns i headless Chrome.

**Tagline-regler:** 4-6 ord, svenska, versaler. Exempel:
- VVS: "DIN VVS-EXPERT I [STAD]"
- Akeri: "PALITLIGA TRANSPORTER I [REGION]"
- Bygg: "[STAD]S BYGGARE SEDAN [AR]"

2. Skriv JSON till Desktop: `/Users/noahkrueger/Desktop/[slug]-data.json`

3. Kor fill-scriptet via osascript (ALLTID full sokvaig till node):

```applescript
do shell script "/usr/local/bin/node '/Users/noahkrueger/Documents/hemsida-outreach/template/fill-template.mjs' '/Users/noahkrueger/Desktop/[slug]-data.json' 2>&1"
```

Resultat: `/Users/noahkrueger/Desktop/[slug]-mockup.html` — klar utan AI-generering.

---

## STEP 4 — SCREENSHOT (Chrome headless + static HTML)

**Goal:** Capture a 1200x675 PNG of the fully-rendered hero section for inline embedding in the email.

**Why static HTML:** The mockup uses CSS animations that start hidden. Chrome headless captures the page before animations complete, resulting in invisible text. Solution: inject a style override that forces all animated elements to their final visible state.

**Step 4a — Create static version:**

Write and run this Node.js script (save as `make_static.mjs` in outputs folder):

```javascript
import { readFileSync, writeFileSync } from 'fs';

let html = readFileSync('/Users/noahkrueger/Desktop/[slug]-mockup.html', 'utf8');

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
writeFileSync('/Users/noahkrueger/Desktop/[slug]-static.html', html);
console.log('Static version written');
```

Run via osascript: `do shell script "/usr/local/bin/node '/path/to/make_static.mjs' 2>&1"`

**Step 4b — Take screenshot:**

```bash
'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
  --headless=new \
  --screenshot='/Users/noahkrueger/Desktop/[slug]-screenshot.png' \
  --window-size=1200,675 \
  'file:///Users/noahkrueger/Desktop/[slug]-static.html' 2>/dev/null
```

Result: `[slug]-screenshot.png` on Desktop (~600-800 KB PNG), showing hero with all text visible and hero image rendered.

**Fallback:** If screenshot fails, proceed with Step 5 and use HTML attachment fallback (note "screenshot ej tillganglig" in Noteringar).

---

## STEP 5 — SKAPA GMAIL-DRAFT (inline screenshot)

**Mål:** Skapa ett Gmail-draft med screenshoten inbäddad direkt i mejlkroppen via Gmail MCP. Inget Outlook, inget Node.js-skript.

**Metod: Gmail MCP → create_draft med inline-bilaga**

1. Base64-koda screenshoten via osascript:

```applescript
do shell script "/usr/local/bin/node -e \"const fs=require('fs'); process.stdout.write(fs.readFileSync(require('os').homedir()+'/Desktop/[slug]-screenshot.png').toString('base64'));\""
```

2. Anropa Gmail MCP `create_draft` med dessa parametrar:
   - `to`: ["[COMPANY_EMAIL]"]
   - `subject`: "[BOLAGSNAMN] - en helt ny version av er hemsida"
   - `htmlBody`: (se mall nedan)
   - `attachments`: `[{"content": "[BASE64_DATA]", "filename": "mockup.png", "inline": true, "mimeType": "image/png"}]`

**htmlBody-mall:**
```html
<html><body style="font-family: Arial, sans-serif; color: #333; max-width: 640px; margin: 0 auto; padding: 20px;">
<p>Hej [BOLAGSNAMN]-teamet,</p>
<p>Jag hittade er när jag letade efter [BRANSCH]-bolag i [STAD].</p>
<p>Ni gör bra saker — [SPECIFIK DETALJ]. Men er hemsida speglar inte riktigt det ni är.</p>
<p><img src="cid:mockup.png" width="600" style="display:block; border-radius:4px; box-shadow: 0 4px 20px rgba(0,0,0,0.15);" alt="Förhandsgranskning av er nya hemsida" /></p>
<p>Det tar ungefär två veckor, kostar runt 10 000 SEK, och sedan har ni en sida som faktiskt reflekterar vad ni är.</p>
<p>Det här är bara ett förslag — vi kan göra den helt annorlunda.</p>
<p>Intresserad? Svar på detta mail räcker.</p>
<p>[DITT NAMN]<br/><a href="https://[DIN_DOMÄN]">[DIN_DOMÄN]</a></p>
</body></html>
```

**Viktigt:** `cid:mockup.png` refererar till inline-bilagan via dess filnamn. Gmail visar bilden direkt i mejlkroppen.

**Fallback:** Om screenshot saknas, skicka utan bild och notera "screenshot ej tillgänglig" i ämnesraden.

---

## STEP 6 — UPDATE NOTION

After draft is created and reviewed by Noah:

Update Notion row:
- Status -> "Kontaktad"
- Noteringar -> "Draft skapad [DATE]. Hemsidebetyg: [SCORE]/10. [ev. notering]"

**Daily limit:** Max 5 per pipeline-korning. Stop and report after 5 completed drafts.

---

## PRICING REFERENCE (internal only)

- Hemsida: ~10 000 SEK, ~2 veckor leverans
- Upsell: Underhall, SEO, AI-integrationer

---

## ERROR HANDLING

| Situation | Action |
|---|---|
| Website unreachable | Noteringar: "Hemsida ej nåbar", skip to next |
| No email found | Noteringar: "Ingen email hittad", skip email step, flag for manual follow-up |
| Screenshot fails | Proceed with HTML attachment fallback |
| Company already in Notion | Skip during Step 0 scraping |
| Notion update fails | Log error, continue |
| `node: command not found` | Always use `/usr/local/bin/node` — never bare `node` in osascript |
| fill-template.mjs not found | Check template path in TEMPLATE FILES section above |
| Hero image not loading | Verify `hero_image_url` is a direct CDN URL (not source.unsplash.com redirect) |
| Screenshot is ~50KB (tiny) | Hero image missing — check hero_image_url is a direct images.unsplash.com URL |

---

## SESSION SUMMARY

Report after each batch:
- X new companies added to Notion (Step 0)
- X companies scored, Y Target / Z Skip
- X drafts created (max 5 per session)
- Errors or flagged rows
- Notion link for review
