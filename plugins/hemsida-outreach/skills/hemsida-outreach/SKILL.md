---
name: hemsida-outreach
description: >
  Automated B2B outreach pipeline for web design sales targeting Swedish small businesses.
  Scrapes hitta.se for companies without websites, generates personalized HTML mockups,
  screenshots them, creates Gmail drafts with embedded screenshot, and updates Notion.
  Use this skill whenever the user writes "KÖR HEMSIDA-PIPELINE" or "KÖR SCRAPING" or
  asks to run the website outreach flow, find new companies, generate mockups, or process
  the Åkerier Sverige database. Also trigger for: hemsida-pipeline, outreach, mockup
  generation, cold email for web design, scrapa bolag, hitta åkerier.
---

# Hemsida Outreach Pipeline v2

Full B2B outreach flow: hitta.se → Notion → scrape company data → HTML mockup → screenshot → Gmail draft → update Notion.

**Trigger phrases:**
- `KÖR HEMSIDA-PIPELINE` — kör hela pipelinen (max 5 bolag med Status = "Target")
- `KÖR SCRAPING` — kör Steg 0: hitta nya bolag och lägg till i Notion

---

## ⚙️ ANPASSA FÖR DIN INSTALLATION

Tre saker att ändra innan första körningen:

**1. Din avsändarinfo** (i Steg 4, htmlBody-mallen):
- Byt ut `[DITT NAMN]` mot ditt riktiga namn
- Byt ut `[DIN_DOMÄN]` mot din domän (t.ex. `dbventures.dk`)

**2. Gmail MCP** — anslut ditt Gmail-konto i Cowork (Settings → Connections)

**3. Notion-databas** — begär åtkomst av Noah (ID: `33f2c3c0-f254-81e3-99ba-d6c1e04e0fe4`) eller skapa egen med samma schema

---

## TOOLS REQUIRED

- **Notion MCP** — read + write
- **Gmail MCP** (`mcp__e52e9abc-cdcb-40b9-b6be-fced7d2b954b`) — create_draft
- **`mcp__Control_your_Mac__osascript`** — ALLA shell-kommandon
- **Write tool** — skapa JSON-filer på Desktop
- Node.js på `/usr/local/bin/node` (ALLTID full sökväg)
- Google Chrome på `/Applications/Google Chrome.app`

**KRITISKT — INGA COMPUTER-USE VERKTYG:**
Använd INTE `mcp__computer-use__*`. Skriv filer med Write-verktyget. Kör shell via osascript.

---

## TEMPLATE FILES

Systemet anger `Base directory for this skill: /path/to/skills/hemsida-outreach/` i kontexten.
Läs den raden, använd som `{SKILL_BASE_DIR}`. Hardkoda ALDRIG sökvägar.

```
{SKILL_BASE_DIR}/template/scrape-hitta.mjs      ← Steg 0: scrapa hitta.se
{SKILL_BASE_DIR}/template/scrape-company.mjs    ← Steg 2: extrahera bolagsdata
{SKILL_BASE_DIR}/template/process-company.mjs   ← Steg 3: mockup + screenshot + base64
{SKILL_BASE_DIR}/template/mockup-template.html  ← HTML-mall
{SKILL_BASE_DIR}/template/fill-template.mjs     ← Fyll mallen
{SKILL_BASE_DIR}/template/example-company.json  ← Exempeldata
```

---

## NOTION DATABASE

Database ID: `33f2c3c0-f254-81e3-99ba-d6c1e04e0fe4`

Schema:
- Bolag (title), Stad (select), Hemsida (url), Telefon (phone), Adress (text)
- Har hemsida (checkbox), Hemsidebetyg (number 0-10)
- Status (select): Ej kontaktad / Target / Skip / Kontaktad
- Email (email), Noteringar (text)

---

## STEG 0 — SCRAPA NYA BOLAG (KÖR SCRAPING)

Kör `scrape-hitta.mjs` för att hitta bolag på hitta.se. Scriptet:
- Söker på kategori + stad
- Extraherar alla bolag via schema.org JSON-LD (inget gissande)
- Besöker varje bolags hitta-sida och kontrollerar `sameAs` för hemsida
- Sorterar: ingen hemsida → bara social media → dålig hemsida → okej hemsida
- Returnerar JSON-array

```applescript
do shell script "/usr/local/bin/node '{SKILL_BASE_DIR}/template/scrape-hitta.mjs' 'åkeri' 'Stockholm' 2 2>/tmp/hitta-scrape.log"
```

**Argument:** kategori, stad, antal sidor (25 bolag/sida)
**Kategorier att rotera:** åkeri, VVS, bygg, städ, mark, logistik
**Städer att rotera:** Stockholm, Göteborg, Malmö, Linköping

Resultat = JSON-array. För varje bolag i toppen (priority 1-2 = ingen/bara social media):
1. Kontrollera om bolaget redan finns i Notion
2. Lägg till ny rad: Bolag, Stad, Telefon, Hemsida (om finns), Har hemsida, Status = "Ej kontaktad"

**Mål: 30 nya rader per session.**

---

## STEG 1 — BETYGSÄTT OCH VÄLJ TARGETS

Gå igenom rader med Status = "Ej kontaktad". Sätt:

- Inget hemsida (priority 1) → Hemsidebetyg = 0, Status = "Target"
- Bara social media (priority 2) → Hemsidebetyg = 1, Status = "Target"
- Har hemsida men scrape-hitta bedömde "dålig" → Besök sidan med web_fetch, betygsätt 0-10. Betyg ≤6 → "Target", >6 → "Skip"
- Stort bolag (>50 anst.) → Status = "Skip"

**Max 5 Target-rader per körning.**

---

## STEG 2 — EXTRAHERA BOLAGSDATA (Target-rader)

**INGA GISSNINGAR.** All data hämtas från scriptet eller hitta-beskrivningen.

### 2a — Skriv hitta-JSON till Desktop

Skriv `/Users/[USERNAME]/Desktop/[slug]-hitta.json` med bolagets Notion-data:

```json
{
  "name": "Bolagsnamn AB",
  "phone": "+46701234567",
  "website": null,
  "has_website": false,
  "website_label": "Ingen hemsida",
  "priority": 1,
  "social_media": [],
  "description": "Text från Notion-fältet Noteringar eller hitta-beskrivning",
  "address": {
    "city": "Stockholm",
    "region": "Stockholms län"
  },
  "hitta_url": "https://www.hitta.se/...",
  "category": "åkeri"
}
```

Slug = bolagsnamn i lowercase, å→a, ä→a, ö→o, mellanslag→bindestreck.

### 2b — Kör scrape-company.mjs

```applescript
do shell script "/usr/local/bin/node '{SKILL_BASE_DIR}/template/scrape-company.mjs' '[slug]' 2>/tmp/scrape-[slug].log"
```

Scriptet:
- Om bolaget HAR hemsida: scrapar CSS-färger och hero-bild från faktisk sida
- Om bolaget SAKNAR hemsida: använder branschbaserade standardfärger + Unsplash-bild
- Extraherar tjänster från hitta-beskrivningen
- Skriver `/Users/[USERNAME]/Desktop/[slug]-data.json` automatiskt
- Returnerar JSON på stdout

**Kontrollera `/tmp/scrape-[slug].log` vid fel.**

---

## STEG 3 — GENERERA MOCKUP + SCREENSHOT

```applescript
do shell script "/usr/local/bin/node '{SKILL_BASE_DIR}/template/process-company.mjs' '[slug]' 2>/tmp/process-[slug].log"
```

- **stdout** = base64 av screenshoten → spara som `SCREENSHOT_B64`
- Om `[VARNING] Screenshot är bara X bytes` → kontrollera `hero_image_url` i data.json

---

## STEG 4 — SKAPA GMAIL-DRAFT

Anropa Gmail MCP `create_draft`:

- `to`: `["[BOLAGETS EMAIL]"]` — om email saknas, skippa och notera i Notion
- `subject`: `"[BOLAGSNAMN] - en helt ny version av er hemsida"`
- `htmlBody`:

```html
<html><body style="font-family: Arial, sans-serif; color: #333; max-width: 640px; margin: 0 auto; padding: 20px;">
<p>Hej [BOLAGSNAMN]-teamet,</p>
<p>Jag hittade er på hitta.se när jag letade efter [BRANSCH]-bolag i [STAD].</p>
<p>Ni gör bra saker — [SPECIFIK DETALJ från hitta-beskrivningen]. Men ni verkar inte ha en hemsida som speglar det.</p>
<p><img src="cid:mockup.png" width="600" style="display:block; border-radius:4px; box-shadow: 0 4px 20px rgba(0,0,0,0.15);" alt="Förhandsgranskning av er nya hemsida" /></p>
<p>Det tar ungefär två veckor, kostar runt 10 000 SEK, och sedan har ni en sida som faktiskt reflekterar vad ni är.</p>
<p>Det här är bara ett förslag — vi kan göra den helt annorlunda.</p>
<p>Intresserad? Svar på detta mail räcker.</p>
<p>[DITT NAMN]<br/><a href="https://[DIN_DOMÄN]">[DIN_DOMÄN]</a></p>
</body></html>
```

- `attachments`: `[{"content": "[SCREENSHOT_B64]", "filename": "mockup.png", "inline": true, "mimeType": "image/png"}]`

**OBS:** `cid:mockup.png` = inline-bilaga. Gmail visar bilden direkt i mejlkroppen.
**Fallback:** Saknas email → notera "Ingen email — ring [TELEFON]" i Notion, skippa draft.

---

## STEG 5 — UPPDATERA NOTION

- Status → "Kontaktad"
- Noteringar → "Draft skapad [DATUM]. [website_label]. Källa: hitta.se."

**Max 5 drafts per körning.**

---

## PRISER (intern info)

- Hemsida: ~10 000 SEK, ~2 veckor leverans
- Upsell: Underhåll, SEO, AI-integrationer

---

## FELHANTERING

| Situation | Åtgärd |
|---|---|
| scrape-hitta ger 0 resultat | Prova annan kategori eller stad |
| Bolag redan i Notion | Hoppa över |
| scrape-company.mjs misslyckas | Kolla `/tmp/scrape-[slug].log`, kör om |
| Screenshot <200KB | Kontrollera `hero_image_url` i data.json — måste vara direkt CDN-URL |
| Ingen email hittad | Notera telefonnummer i Notion, skippa Gmail-draft |
| `node: command not found` | Alltid `/usr/local/bin/node` |

---

## RAPPORT VID AVSLUT

Summera: X bolag scrapade, X Target, X drafts skapade, eventuella fel.
