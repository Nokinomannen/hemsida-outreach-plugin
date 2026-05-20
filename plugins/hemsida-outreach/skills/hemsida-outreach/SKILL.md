---
name: hemsida-outreach
description: >
  Automated B2B outreach pipeline for web design sales targeting Swedish small businesses.
  Scrapes the web for new target companies, adds them to Notion, visits their websites,
  scores them, generates personalized HTML mockups, screenshots them, creates Gmail drafts
  with embedded screenshot, and updates Notion status.
  Use this skill whenever the user writes "KÖR HEMSIDA-PIPELINE" or "KÖR SCRAPING" or
  asks to run the website outreach flow, find new companies, generate mockups, or process
  the Åkerier Sverige database. Also trigger for: hemsida-pipeline, outreach, mockup
  generation, cold email for web design, scrapa bolag, hitta åkerier.
---

# Hemsida Outreach Pipeline

Full B2B outreach flow: scrape web → Notion → score → scrape company data → HTML mockup → screenshot → Gmail draft → update Notion.

**Trigger phrases:**
- `KÖR HEMSIDA-PIPELINE` — runs full pipeline on existing Notion rows
- `KÖR SCRAPING` — only runs Step 0 (find new companies and add to Notion)

---

## TOOLS REQUIRED

- **Notion MCP** — read + write
- **Gmail MCP** (`mcp__e52e9abc-cdcb-40b9-b6be-fced7d2b954b`) — create_draft
- **web_search / web_fetch** — find companies + visit websites
- **`mcp__Control_your_Mac__osascript`** — ALL shell commands go through this tool
- **Write tool** — create JSON files on Desktop
- Node.js v24 at `/usr/local/bin/node` (ALWAYS full path — bare `node` fails in osascript shell)
- Google Chrome at `/Applications/Google Chrome.app`

**KRITISKT — INGA COMPUTER-USE VERKTYG:**
Använd INTE `mcp__computer-use__*` för något i denna pipeline. Det kräver godkännanden per anrop.
Skriv filer med Write-verktyget. Kör shell-kommandon via `mcp__Control_your_Mac__osascript`.
Ta INGA verifieringsskärmbilder mellan stegen — läs stdout/stderr-output för att verifiera resultat.

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

## TEMPLATE FILES

Alla mockups genereras via dessa färdiga filer — generera ALDRIG HTML from scratch:

- **Template:** `/Users/noahkrueger/Documents/hemsida-outreach/template/mockup-template.html`
- **Fill-script:** `/Users/noahkrueger/Documents/hemsida-outreach/template/fill-template.mjs`
- **Combined processor:** `/Users/noahkrueger/Documents/hemsida-outreach/template/process-company.mjs`
- **Exempel-JSON:** `/Users/noahkrueger/Documents/hemsida-outreach/template/example-company.json`

`process-company.mjs` gör allt i ett enda anrop: fill-template → static HTML → Chrome screenshot → returnerar base64 på stdout.

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

Visit the company's website using web_fetch or web_search.

**Scoring rubric:**
| Criterion | Max | Low score when... |
|---|---|---|
| Teknisk funktion | 2p | Slow, broken, errors |
| Mobilanpassning | 2p | Not responsive |
| Design och visuell standard | 2p | Outdated, ugly |
| Innehåll och tydlighet | 2p | Vague, missing info |
| CTA och kontaktmöjlighet | 2p | No clear contact |

**Decision rule:**
- Score ≤6 → Status = "Target"
- Score 7-10 → Status = "Skip"
- No website → Status = "Target" (strong opportunity), Hemsidebetyg = 0
- Large enterprise → Status = "Skip"

Update Notion immediately: set Hemsidebetyg + Status.

---

## STEP 2 — SCRAPE COMPANY DATA (Target rows only)

**OBLIGATORISKT: Besök alltid företagets faktiska hemsida.** Var inte lat — gå in på sidan med web_fetch och extrahera verklig data. Anta aldrig information utan att ha verifierat den.

**Färgextraktion:** Matcha primärfärg och accentfärg mot företagets faktiska visuella identitet (logo, navbar, knappar). Inspektera CSS eller använd digital color picker.

**Hero-bild:** Om företagets hemsida har en hero-bild (bakgrundsbild på startsidan), använd den direkta URL:en i `hero_image_url`. Om ingen hero-bild finns, hitta en relevant bild från Unsplash CDN: `https://images.unsplash.com/photo-{PHOTO_ID}?w=1600&q=80` — sök via unsplash.com för att hitta rätt photo ID, kopiera sedan CDN-URL:en direkt. Använd ALDRIG `source.unsplash.com` — det är en redirect som inte fungerar i headless Chrome.

Gather from website + Allabolag.se + Google Maps:

```
- Bolagsnamn (exact, from their actual website)
- Slug (URL-safe: lowercase, a/a/o for å/ä/ö, spaces→hyphens)
- Grundningsår
- Stad, Region (t.ex. "Västra Götaland")
- Bransch (t.ex. "VVS", "Åkeri", "Bygg")
- Tjänster: exakt 4 specifika tjänster (från deras faktiska hemsida, inte generiska)
- Antal anställda (approximate)
- Telefon
- Email (look in website footer, contact page, Google Maps listing)
- Primärfärg (hex) — extraherad från logotyp eller dominerande varumärkesfärg på hemsidan
- Accentfärg (hex) — sekundär varumärkesfärg (knappar, highlights)
- Hero image URL — direkt CDN-URL till en bild (se ovan)
```

Store in memory. Update Notion Email field if found.

---

## STEP 3 — GENERERA MOCKUP + SCREENSHOT (ett enda osascript-anrop)

**Generera ALDRIG HTML from scratch.** Använd process-company.mjs — det gör allt i ett steg.

### 3a — Bygg JSON och skriv till Desktop (Write-verktyget)

Skriv filen `/Users/noahkrueger/Desktop/[slug]-data.json`:

```json
{
  "company_name": "Bolagsnamn AB",
  "slug": "bolagsnamn-ab",
  "industry": "VVS",
  "tagline": "DIN VVS-EXPERT I GÖTEBORG",
  "city": "Göteborg",
  "region": "Västra Götaland",
  "phone": "031-XX XX XX",
  "email": "info@bolaget.se",
  "founded_year": 2003,
  "primary_color": "#1a2535",
  "accent_color": "#07a9e5",
  "hero_image_url": "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1600&q=80",
  "hero_subtext": "Professionella VVS-tjänster i Göteborg sedan 2003.",
  "services": [
    { "name": "Tjänst 1", "desc": "Kort beskrivning.", "icon": "🔧" },
    { "name": "Tjänst 2", "desc": "Kort beskrivning.", "icon": "⚙️" },
    { "name": "Tjänst 3", "desc": "Kort beskrivning.", "icon": "🏗️" },
    { "name": "Tjänst 4", "desc": "Kort beskrivning.", "icon": "✅" }
  ],
  "stats": [
    { "value": "2003", "label": "Grundat år" },
    { "value": "300+", "label": "Nöjda kunder" },
    { "value": "4",    "label": "Tjänsteområden" },
    { "value": "24/7", "label": "Jourtjänst" }
  ]
}
```

**Tagline-regler:** 4-6 ord, svenska, versaler. Max 6 ord — aldrig längre.

### 3b — Kör process-company.mjs (ETT osascript-anrop, returnerar base64)

```applescript
do shell script "/usr/local/bin/node '/Users/noahkrueger/Documents/hemsida-outreach/template/process-company.mjs' '[slug]' 2>/tmp/process-[slug].log"
```

- **stdout** = base64-kodad screenshot (spara detta som `SCREENSHOT_B64`)
- **stderr** (i `/tmp/process-[slug].log`) = progress-loggar + varningar

Om varning om screenshot-storlek (<200KB): kontrollera `hero_image_url` i JSON-filen och kör om.

---

## STEP 4 — SKAPA GMAIL-DRAFT

Anropa Gmail MCP `create_draft` med base64-strängen från steg 3b.

**Parametrar:**
- `to`: `["[COMPANY_EMAIL]"]`
- `subject`: `"[BOLAGSNAMN] - en helt ny version av er hemsida"`
- `htmlBody`: (se mall nedan)
- `attachments`: `[{"content": "[SCREENSHOT_B64]", "filename": "mockup.png", "inline": true, "mimeType": "image/png"}]`

**htmlBody-mall:**
```html
<html><body style="font-family: Arial, sans-serif; color: #333; max-width: 640px; margin: 0 auto; padding: 20px;">
<p>Hej [BOLAGSNAMN]-teamet,</p>
<p>Jag hittade er när jag letade efter [BRANSCH]-bolag i [STAD].</p>
<p>Ni gör bra saker — [SPECIFIK DETALJ om bolaget]. Men er hemsida speglar inte riktigt det ni är.</p>
<p><img src="cid:mockup.png" width="600" style="display:block; border-radius:4px; box-shadow: 0 4px 20px rgba(0,0,0,0.15);" alt="Förhandsgranskning av er nya hemsida" /></p>
<p>Det tar ungefär två veckor, kostar runt 10 000 SEK, och sedan har ni en sida som faktiskt reflekterar vad ni är.</p>
<p>Det här är bara ett förslag — vi kan göra den helt annorlunda.</p>
<p>Intresserad? Svar på detta mail räcker.</p>
<p>[DITT NAMN]<br/><a href="https://[DIN_DOMÄN]">[DIN_DOMÄN]</a></p>
</body></html>
```

**Notering om avsändaradress:** Gmail MCP skapar draftet i det anslutna Gmail-kontot (noahroa123@gmail.com). Om du vill skicka från noah@dbventures.dk, ändra From-fältet manuellt i Gmail när du granskar draftet — förutsätter att dbventures.dk är konfigurerat som alias i Gmail-inställningarna.

**Fallback:** Om screenshot saknas, skapa draft utan bild och lägg "screenshot ej tillgänglig" i Noteringar i Notion.

---

## STEP 5 — UPDATE NOTION

After draft is created:

Update Notion row:
- Status → "Kontaktad"
- Noteringar → "Draft skapad [DATUM]. Hemsidebetyg: [SCORE]/10."

**Daily limit:** Max 5 per pipeline-körning. Stopp och rapport efter 5 klara drafts.

---

## PRICING REFERENCE (internal only)

- Hemsida: ~10 000 SEK, ~2 veckor leverans
- Upsell: Underhåll, SEO, AI-integrationer

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
| process-company.mjs not found | Check path: `/Users/noahkrueger/Documents/hemsida-outreach/template/process-company.mjs` |
| Hero image warning (<200KB) | Check `hero_image_url` in JSON — must be direct `images.unsplash.com` CDN URL |
| process-company.mjs returns empty | Check `/tmp/process-[slug].log` for error details |

---

## SESSION SUMMARY

Report after each batch:
- X new companies added to Notion (Step 0)
- X companies scored, Y Target / Z Skip
- X drafts created (max 5 per session)
- Errors or flagged rows
- Notion link for review
