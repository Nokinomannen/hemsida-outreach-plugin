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
- `KÖR HEMSIDA-PIPELINE` — kör hela pipelinen på befintliga Notion-rader (Status = "Target")
- `KÖR SCRAPING` — kör endast Steg 0 (hitta nya bolag och lägg till i Notion)

---

## ⚙️ ANPASSA DETTA FÖR DIN INSTALLATION

Innan du kör pipelinen för första gången — ändra dessa tre saker:

**1. Din avsändarinfo** (i Steg 4, htmlBody-mallen):
- Byt ut `[DITT NAMN]` mot ditt riktiga namn
- Byt ut `[DIN_DOMÄN]` mot din domän (t.ex. `dbventures.dk`)
- Sätt upp domänen som "Send As"-alias i Gmail-inställningarna om du vill skicka från den

**2. Gmail MCP** — anslut ditt eget Gmail-konto i Cowork-inställningarna (Settings → Connections)

**3. Notion-databas** — antingen:
- Begär åtkomst till den delade databasen av Noah (ID: `33f2c3c0-f254-81e3-99ba-d6c1e04e0fe4`)
- Eller skapa en egen databas med samma schema (se NOTION DATABASE nedan) och uppdatera ID:t i SKILL.md

---

## TOOLS REQUIRED

- **Notion MCP** — read + write
- **Gmail MCP** (`mcp__e52e9abc-cdcb-40b9-b6be-fced7d2b954b`) — create_draft
- **web_search / web_fetch** — hitta bolag + besök hemsidor
- **`mcp__Control_your_Mac__osascript`** — ALLA shell-kommandon går via detta verktyg
- **Write tool** — skapa JSON-filer på Desktop
- Node.js v24 på `/usr/local/bin/node` (ALLTID full sökväg — `node` ensamt fungerar inte i osascript)
- Google Chrome på `/Applications/Google Chrome.app`

**KRITISKT — INGA COMPUTER-USE VERKTYG:**
Använd INTE `mcp__computer-use__*` i denna pipeline — det kräver godkännanden per anrop.
Skriv filer med Write-verktyget. Kör shell-kommandon via `mcp__Control_your_Mac__osascript`.
Ta INGA verifieringsskärmbilder mellan stegen.

---

## TEMPLATE FILES

Dessa filer är bundlade i pluginet. Systemet anger sökvägen i kontexten som:
`Base directory for this skill: /path/to/skills/hemsida-outreach/`

Läs den raden och använd den som `{SKILL_BASE_DIR}`. Hardkoda ALDRIG en sökväg.

- `{SKILL_BASE_DIR}/template/mockup-template.html`
- `{SKILL_BASE_DIR}/template/fill-template.mjs`
- `{SKILL_BASE_DIR}/template/process-company.mjs` ← gör fill + static + screenshot + base64 i ett anrop
- `{SKILL_BASE_DIR}/template/example-company.json`

---

## NOTION DATABASE

Database ID: `33f2c3c0-f254-81e3-99ba-d6c1e04e0fe4`
Data Source ID: `33f2c3c0-f254-816d-91a2-000b2e8d7dfe`

> **Nya användare:** Detta är den delade Notion-databasen. Om du har en egen, uppdatera ID:t ovan.

Schema:
- Bolag (title), Stad (select), Hemsida (url), Telefon (phone), Adress (text)
- Har hemsida (checkbox), Hemsidebetyg (number 0-10)
- Status (select): Ej kontaktad / Target / Skip / Kontaktad
- Email (email), Noteringar (text)

**OBS:** Om "Kontaktad" eller "Email" saknas i schemat, be användaren lägga till dem manuellt i Notion.

---

## STEG 0 — SCRAPA NYA BOLAG (KÖR SCRAPING)

Mål: Hitta 30 nya svenska småbolag per session och lägg till i Notion.

**Målprofil:**
- Bransch: transport, logistik, bygg, VVS, städ, mark, schakt, åkeri
- Storlek: 2-50 anställda (hoppa över stora företag)
- Geografi: Stockholm, Göteborg, Malmö, Linköping — rotera varje session
- Tecken på svag webbnärvaro: gammal sida, ingen bokning, endast telefon

**Hur du hittar bolag:**
1. Använd web_search: `åkeri [stad]`, `transportföretag [stad]`, `VVS [stad] litet bolag`
2. Kontrollera om bolaget redan finns i Notion — hoppa över dubletter
3. Lägg till nya rader: Bolag, Stad, Hemsida, Telefon, Har hemsida, Status = "Ej kontaktad"

**Mål: 30 nya rader per session.**

---

## STEG 1 — BETYGSÄTT HEMSIDAN (0-10)

För varje bolag med Status = "Ej kontaktad", besök deras hemsida med web_fetch.

| Kriterium | Max | Lågt betyg när... |
|---|---|---|
| Teknisk funktion | 2p | Långsam, trasig, fel |
| Mobilanpassning | 2p | Inte responsiv |
| Design och visuell standard | 2p | Föråldrad, ful |
| Innehåll och tydlighet | 2p | Vag, saknar info |
| CTA och kontaktmöjlighet | 2p | Ingen tydlig kontakt |

- Betyg ≤6 → Status = "Target"
- Betyg 7-10 → Status = "Skip"
- Ingen hemsida → Status = "Target", Hemsidebetyg = 0
- Stort företag → Status = "Skip"

Uppdatera Notion direkt: sätt Hemsidebetyg + Status.

---

## STEG 2 — HÄMTA BOLAGSDATA (endast Target-rader)

**OBLIGATORISKT: Besök alltid företagets faktiska hemsida.** Extrahera verklig data — anta aldrig utan att ha verifierat.

**Färgextraktion:** Matcha primärfärg och accentfärg mot deras faktiska visuella identitet (logo, navbar, knappar).

**Hero-bild:** Om de har en hero-bild på startsidan, använd den direkta URL:en. Annars: `https://images.unsplash.com/photo-{ID}?w=1600&q=80` — sök på unsplash.com och kopiera CDN-URL:en direkt. Använd ALDRIG `source.unsplash.com` — det är en redirect som inte fungerar i headless Chrome.

Samla:
- Bolagsnamn (exakt, från deras hemsida)
- Slug (URL-säker: gemener, a/a/o för å/ä/ö, mellanslag→bindestreck)
- Grundningsår, Stad, Region, Bransch
- Exakt 4 specifika tjänster (från deras hemsida, inte generiska)
- Telefon, Email (footer, kontaktsida, Google Maps)
- Primärfärg (hex), Accentfärg (hex)
- Hero image URL (direkt CDN-URL)

Spara i minnet. Uppdatera Notion Email-fältet om hittat.

---

## STEG 3 — GENERERA MOCKUP + SCREENSHOT (ETT osascript-anrop)

**Generera ALDRIG HTML from scratch.** Använd process-company.mjs.

### 3a — Bygg JSON och skriv till Desktop (Write-verktyget)

Skriv filen `/Users/[USERNAME]/Desktop/[slug]-data.json`:

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
  "hero_subtext": "En mening om vad bolaget gör och var.",
  "services": [
    { "name": "Tjänst 1", "desc": "Beskrivning.", "icon": "🚛" },
    { "name": "Tjänst 2", "desc": "Beskrivning.", "icon": "📦" },
    { "name": "Tjänst 3", "desc": "Beskrivning.", "icon": "⚙️" },
    { "name": "Tjänst 4", "desc": "Beskrivning.", "icon": "✅" }
  ],
  "stats": [
    { "value": "2005", "label": "Grundat år" },
    { "value": "20+", "label": "Anställda" },
    { "value": "4",    "label": "Tjänsteområden" },
    { "value": "20",   "label": "Års erfarenhet" }
  ]
}
```

**Tagline-regler:** 4-6 ord, svenska, VERSALER. Aldrig längre.

### 3b — Kör process-company.mjs (ETT anrop, returnerar base64)

```applescript
do shell script "/usr/local/bin/node '{SKILL_BASE_DIR}/template/process-company.mjs' '[slug]' 2>/tmp/process-[slug].log"
```

- **stdout** = base64 av screenshoten → spara som `SCREENSHOT_B64`
- **stderr** (i `/tmp/process-[slug].log`) = progress + varningar

Om varning om storlek (<200KB): kontrollera `hero_image_url` och kör om.

---

## STEG 4 — SKAPA GMAIL-DRAFT

Anropa Gmail MCP `create_draft`:

- `to`: `["[BOLAGETS EMAIL]"]`
- `subject`: `"[BOLAGSNAMN] - en helt ny version av er hemsida"`
- `htmlBody`:

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

- `attachments`: `[{"content": "[SCREENSHOT_B64]", "filename": "mockup.png", "inline": true, "mimeType": "image/png"}]`

> **OBS:** `cid:mockup.png` refererar till inline-bilagan. Gmail visar bilden direkt i mejlkroppen.
> **Avsändaradress:** Gmail MCP skapar draftet i det anslutna Gmail-kontot. Om du vill skicka från en alias-domän, ändra From-fältet manuellt i Gmail — förutsätter att domänen är konfigurerad som alias.
> **Fallback:** Om screenshot saknas — skapa draft utan bild, notera "screenshot ej tillgänglig" i Notion.

---

## STEG 5 — UPPDATERA NOTION

Uppdatera raden:
- Status → "Kontaktad"
- Noteringar → "Draft skapad [DATUM]. Hemsidebetyg: [SCORE]/10."

**Max 5 drafts per körning.**

---

## PRISER (intern info)

- Hemsida: ~10 000 SEK, ~2 veckor leverans
- Upsell: Underhåll, SEO, AI-integrationer

---

## FELHANTERING

| Situation | Åtgärd |
|---|---|
| Hemsida ej nåbar | Noteringar: "Hemsida ej nåbar", hoppa till nästa |
| Ingen email hittad | Noteringar: "Ingen email hittad", flagga för manuell uppföljning |
| Screenshot misslyckas | Fortsätt utan bild, notera i Notion |
| Bolag redan i Notion | Hoppa över vid Steg 0 |
| `node: command not found` | Använd alltid `/usr/local/bin/node` |
| process-company.mjs returnerar tomt | Kolla `/tmp/process-[slug].log` |
| Screenshot <200KB | hero_image_url är troligen en redirect — hitta direkt CDN-URL |

---

## RAPPORT VID AVSLUT

Summera: X drafts skapade, bolagsnamn, eventuella fel.
