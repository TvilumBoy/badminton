# Badmintonpoint

Dansk stævneapp: tilføj stævne → Single / Double / Mix → vælg op til 10 screenshots → kontrollér profiler og kampe → beregn forventet pointændring.

## Vercel
Importér dette repository som et projekt med framework **Other**. `index.html` er forsiden, og `api/analyze.js` er serverfunktionen. Ingen npm-afhængigheder eller build-kommando kræves.

Indstil servermiljøvariabler i Vercel (aldrig i HTML, kode eller GitHub):
- `OPENAI_API_KEY`: OpenAI API-nøgle med adgang og saldo. API-forbrug afregnes separat fra ChatGPT.
- `APP_ACCESS_CODE`: en lang, tilfældig adgangskode til billedaflæsningen. Indtastes i appen og gemmes ikke i browserstorage.
- `OPENAI_MODEL`: valgfrit, standard `gpt-4.1`. Vælg en model, der understøtter billeder og struktureret output.

Udgiv på ny efter ændring af miljøvariabler. AI er lukket, indtil både API-nøgle og appkode er sat. Appkoden beskytter den betalte billedaflæsning, ikke de offentlige HTML-billeder. Opsæt forbrugsgrænser hos API-udbyderen før deling. Dette er en personlig prototype, ikke et flerbrugersystem med login og kvoter.

## Billeder og kontrol
Op til 10 billeder kan vælges på én gang; de aflæses sekventielt for at holde hver forespørgsel under hostinggrænsen. JPG/PNG/WebP op til 12 MB kan gemmes; AI-request må være højst 3,5 MB inklusive base64 (ca. 2,5 MB originalfil). Større billeder giver en tydelig fejl og bliver ikke sendt. Upload mindre screenshots for at bevare læsbarheden.

API'en udtrækker synlige oplysninger fra hvert billede. Klienten sammenkobler profiler og resultater på tværs af billeder under samme stævne og disciplin. Modstridende point bliver ikke brugt. Profiler og resultater skal kontrolleres før beregning. Identisk aflæsningskvalitet med ChatGPT kan ikke garanteres; model, billedkvalitet og kontekst påvirker resultatet. Ingen automatisk hentning fra BadmintonPlayer.

Double/mix kræver de fire spilleres point. Sætscoren vendes til egen spillers perspektiv. Begge modstander-ID'er bevares i historikken. Noter og tidligere kampe bevares ved opdatering af et entydigt match. AI-kladder og billeder gemmes per stævne/disciplin.

## Point og lagring
Den eksisterende U15-tabel fra ranglistereglementets appendiks B (10. september 2026) er bevaret. Normale individuelle danske turneringskampe. Særtilfælde og halve pointforskelle blokeres fortsat. Startpoint skal være fra den rette periode og ikke allerede indeholde kampene. Der beregnes ikke tilmeldingsniveau.

Data og fotos er lokale i browseren (localStorage/IndexedDB); ingen synkronisering mellem enheder. Brug sikkerhedskopi i Min profil. `index.html` inkluderer de seks oprindelige screenshots.

## Udvikling
`src/app.js`, `src/flow.js` og `src/template.html` er kildekoden. `index.html` er den selvstændige samlede app. Serveren bruger Node.js og OpenAI Responses API med JSON-schema. Live AI-aflæsning skal testes med en konfigureret API-nøgle; automatiske tests bruger kontrollerede API-svar.
