# Hemsida Outreach Plugin

Automatiserad B2B outreach-pipeline för webbdesign-försäljning till svenska småföretag (åkerier, bygg, VVS, städ m.fl.). Körs i Cowork via Claude.

---

## Vad gör den?

1. **Scraping** — Hittar nya svenska småbolag via web-sökning och lägger till dem i Notion
2. **Scoring** — Besöker deras hemsidor och betygsätter dem 0–10 (lågt betyg = bra prospekt)
3. **Mockup** — Genererar en personaliserad HTML-mockup av deras "nya hemsida"
4. **Screenshot** — Tar en skärmbild av mockupen via headless Chrome
5. **Gmail-draft** — Skapar ett färdigt mail med screenshoten inbäddad i mejlkroppen
6. **Notion-uppdatering** — Markerar bolaget som kontaktat

Kör max 5 bolag per session. Triggas med `KÖR HEMSIDA-PIPELINE` eller `KÖR SCRAPING` i Cowork.

---

## ⚙️ Setup — tre saker du MÅSTE ändra

### 1. Din namn och domän i mailet

Öppna `skills/hemsida-outreach/SKILL.md`, hitta **Steg 4** och byt ut:
- `[DITT NAMN]` → ditt riktiga namn (t.ex. `Anna Svensson`)
- `[DIN_DOMÄN]` → din domän (t.ex. `minbyrå.se`)

```html
<p>Anna Svensson<br/><a href="https://minbyrå.se">minbyrå.se</a></p>
```

Om du vill skicka från den domänen (och inte din Gmail-adress), konfigurera den som "Send As"-alias i Gmail-inställningarna → Konton → Lägg till en e-postadress.

### 2. Anslut Gmail i Cowork

- Öppna Cowork → Settings → Connections
- Anslut ditt Gmail-konto
- Draften hamnar i den anslutna mailinkorgen

### 3. Notion-databas

Du behöver tillgång till Notion-databasen. Två alternativ:

**a) Använd den delade databasen** (be Noah om åtkomst):
- Database ID: `33f2c3c0-f254-81e3-99ba-d6c1e04e0fe4`
- Inget att ändra i SKILL.md

**b) Skapa en egen** med detta schema:
| Fält | Typ |
|---|---|
| Bolag | Title |
| Stad | Select (Stockholm / Göteborg / Malmö / Linköping) |
| Hemsida | URL |
| Telefon | Phone |
| Adress | Text |
| Har hemsida | Checkbox |
| Hemsidebetyg | Number (0–10) |
| Status | Select: Ej kontaktad / Target / Skip / Kontaktad |
| Email | Email |
| Noteringar | Text |

Uppdatera sedan Database ID i `skills/hemsida-outreach/SKILL.md`.

---

## Tekniska krav

- macOS med `mcp__Control_your_Mac__osascript` aktiverat i Cowork
- Node.js v20+ på `/usr/local/bin/node`
- Google Chrome på `/Applications/Google Chrome.app`
- Notion MCP ansluten i Cowork
- Gmail MCP ansluten i Cowork

---

## Filstruktur

```
hemsida-outreach-plugin/
├── .claude-plugin/
│   └── plugin.json
├── README.md                          ← den här filen
└── skills/
    └── hemsida-outreach/
        ├── SKILL.md                   ← pipline-instruktioner
        └── template/
            ├── mockup-template.html   ← HTML-mall för mockups
            ├── fill-template.mjs      ← fyller mallen med bolagsdata
            ├── process-company.mjs    ← kör fill + screenshot + base64 i ett steg
            └── example-company.json   ← exempeldata
```

---

## Använda kommandon i Cowork

| Kommando | Vad händer |
|---|---|
| `KÖR HEMSIDA-PIPELINE` | Kör hela pipelinen (max 5 bolag med Status = "Target") |
| `KÖR SCRAPING` | Hitta 30 nya bolag och lägg till i Notion |

---

## Felsökning

**"node: command not found"** — Node.js måste ligga på `/usr/local/bin/node`. Kontrollera med: `which node` i terminalen.

**Screenshot för liten (<200KB)** — hero-bilden laddades inte. Kontrollera `hero_image_url` i JSON-filen på Desktop — den måste vara en direkt CDN-URL från `images.unsplash.com`, aldrig `source.unsplash.com`.

**Gmail-draft skapas inte** — Kontrollera att Gmail MCP är anslutet och att `create_draft` är tillgänglig.

**Notion-fält saknas** — Lägg till "Kontaktad" under Status-alternativen och "Email"-fältet manuellt i Notion.
