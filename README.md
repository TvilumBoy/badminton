# Badmintonpoint

Dansk stævneapp: tilføj stævne → Single / Double / Mix → vælg op til 10 screenshots → kontrollér profiler og kampe → beregn forventet pointændring.

## Vercel
Importér dette repository som et projekt med framework **Other**. `index.html` er forsiden, og `api/analyze.js` er serverfunktionen. Ingen npm-afhængigheder eller build-kommando kræves.

Indstil servermiljøvariabler i Vercel (aldrig i HTML, kode eller GitHub):
- `GEMINI_API_KEY`: eksisterende Gemini API-nøgle. `GOOGLE_GENERATIVE_AI_API_KEY` og `GOOGLE_API_KEY` understøttes også. Første ikke-tomme navn bruges i den rækkefølge.
- `APP_ACCESS_CODE`: en lang, tilfældig adgangskode til billedaflæsning. Indtastes i appen, gemmes ikke i browserstorage og er ikke API-nøglen.

Modellen er fast `gemini-2.5-flash`, der understøtter billedaflæsning og har en gratis API-kvote. Brug et Google AI Studio-projekt på Free Tier uden betalt fakturering for gratis brug. Appen kan ikke aflæse kontoens faktureringsstatus; samme model kan koste penge med en betalt API-nøgle. Der er ingen automatisk overgang til en anden eller betalt model. Ved 429 stopper forløbet og bevarer allerede aflæste billeder til genoptagelse.

En eksisterende nøgle skal være tilgængelig i Vercel-projektet **badminton**, i det miljø der udgives. Nøgler i et andet projekt deles ikke automatisk. Udgiv på ny efter ændring af miljøvariabler. API-funktionen er lukket indtil både Gemini-nøgle og appkode er sat.

Appkoden beskytter billedaflæsningen, ikke de offentlige HTML-billeder. Dette er en personlig prototype, ikke et flerbrugersystem med login og kvoter. Googles datavilkår afhænger af kontotype og region. Billeder sendes til Google ved tryk på aflæsningsknappen.

Kilder: https://ai.google.dev/gemini-api/docs/pricing og https://ai.google.dev/api/generate-content

## Billeder og kontrol
Op til 10 billeder kan vælges på én gang; de aflæses sekventielt for at holde hver forespørgsel under hostinggrænsen. JPG/PNG/WebP op til 12 MB kan gemmes; AI-request må være højst 3,5 MB inklusive base64 (ca. 2,5 MB originalfil). Større billeder giver en tydelig fejl og bliver ikke sendt. Upload mindre screenshots for at bevare læsbarheden.

API'en udtrækker synlige oplysninger fra hvert billede. Klienten sammenkobler profiler og resultater på tværs af billeder under samme stævne og disciplin. Modstridende point bliver ikke brugt. Profiler og resultater skal kontrolleres før beregning. Identisk aflæsningskvalitet med ChatGPT kan ikke garanteres; model, billedkvalitet og kontekst påvirker resultatet. Ingen automatisk hentning fra BadmintonPlayer.

Double/mix kræver de fire spilleres point. Sætscoren vendes til egen spillers perspektiv. Begge modstander-ID'er bevares i historikken. Noter og tidligere kampe bevares ved opdatering af et entydigt match. AI-kladder og billeder gemmes per stævne/disciplin.

## Point og lagring
Den eksisterende U15-tabel fra ranglistereglementets appendiks B (10. september 2026) er bevaret. Normale individuelle danske turneringskampe. Særtilfælde og halve pointforskelle blokeres fortsat. Startpoint skal være fra den rette periode og ikke allerede indeholde kampene. Der beregnes ikke tilmeldingsniveau.

Data og fotos er lokale i browseren (localStorage/IndexedDB); ingen synkronisering mellem enheder. Brug sikkerhedskopi i Min profil. `index.html` inkluderer de seks oprindelige screenshots.

## Udvikling
`src/app.js`, `src/flow.js` og `src/template.html` er kildekoden. `index.html` er den selvstændige samlede app. Serveren bruger Node.js og Gemini GenerateContent API med struktureret output og servervalidering. Live AI-aflæsning skal testes med en konfigureret API-nøgle; automatiske tests bruger kontrollerede API-svar.
