# Hemsida Outreach Plugin

B2B outreach-pipeline för webdesignförsäljning till svenska småbolag.

## Vad det gör

Automatiserar hela flödet från att hitta bolag till att skicka ett personaliserat cold email med en mockup av deras nya hemsida:

1. Scrapar Google Maps och webben efter nya målbolag (åkeri, VVS, bygg, etc.)
2. Lägger till bolagen i Notion
3. Betygsätter deras befintliga hemsida (0-10)
4. Besöker deras faktiska hemsida och extraherar färger, tjänster, hero-bild
5. Genererar en personaliserad HTML-mockup på sekunder via mall-systemet
6. Tar en screenshot med headless Chrome
7. Skapar ett Outlook-draft med screenshoten inbäddad direkt i mejlkroppen
8. Uppdaterar Notion-statusen

## Krav

- **Node.js v24** installerat på `/usr/local/bin/node`
- **Google Chrome** installerat på `/Applications/Google Chrome.app`
- **Microsoft Outlook** installerat
- **Notion MCP** ansluten i Cowork
- Notion-databasen skapad (se schema i SKILL.md)

## Kom igång

1. Installera pluginet i Cowork
2. Anslut Notion MCP i Cowork-inställningarna
3. Skapa Notion-databasen med rätt schema (se SKILL.md → NOTION DATABASE)
4. Uppdatera Notion Database ID i SKILL.md om du använder en egen databas
5. Uppdatera avsändarinfo i SKILL.md (steg 5) med ditt namn och företag
6. Skriv `KÖR HEMSIDA-PIPELINE` för att köra pipelinen

## Triggers

- `KÖR HEMSIDA-PIPELINE` — kör hela pipelinen (max 5 bolag)
- `KÖR SCRAPING` — hitta och lägg till nya bolag i Notion

## Filer

- `skills/hemsida-outreach/SKILL.md` — pipeline-instruktioner
- `skills/hemsida-outreach/template/mockup-template.html` — HTML-mallen
- `skills/hemsida-outreach/template/fill-template.mjs` — script som fyller i mallen
- `skills/hemsida-outreach/template/example-company.json` — exempeldata för test
