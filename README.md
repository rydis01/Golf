# Golf Caddie · The National

Första mobilversionen för Links och Lakes på The National i Bara. Appen räknar ett **spelavstånd för carry**, med hänsyn till vind, höjd, temperatur, luftfuktighet, lokalt lufttryck och bolläge. Exempel: 160 meter till målet kan behöva spelas som ett kortare slag i medvind.

Beräkningen är skriven i **Java 21**. Mobilgränssnittet använder HTML/CSS/JavaScript och Leaflet och paketeras med Capacitor för **Android och iOS**. Androids native-projekt innehåller Java; iOS använder Capacitors Swift-brygga. Capacitor-appen använder Java-servern. iPhone-versionen i `iphone/` och datorprototypen kör samma modell lokalt i JavaScript och behöver ingen server för beräkningen.

## Vad finns i första versionen?

- Välj Links eller Lakes och tee; spela ett hål i taget från 1 till 18. Bana, tee och aktuellt hål sparas lokalt så att rundan kan återupptas.
- Avskalad hålvy med bara det valda Links- eller Lakes-hålets geografiska former, automatiskt inzoomad vid start och hålbyte. Hålet orienteras mot green på skärmen; nordpilen visar riktningen. Satellit och områdeskarta är alternativ i Options. Alla 36 officiella banguidebilder finns som separat referens.
- Placera och dra boll och dagens flagga själv, eller följ bollen med GPS. Flaggan är aldrig en förinställd veckoposition.
- Spelavstånd och en kort förklaring visas automatiskt när boll och mål har placerats. Väder, kikarmått, bolläge och detaljerade råd ligger i **Options**.
- Ange avståndskikarens mått till flaggan. Välj vanligt avstånd eller kikare med lutningskompensation, så att höjd inte räknas två gånger.
- Vindkompass, sex timmars vind-/bydiagram, höjd, temperatur, luftfuktighet, lufttryck, bolläge och bollbana.
- Uppskattad sidovindsdrift i meter åt höger/vänster, siktkompensation och möjlighet att ange uppmätt flygtid.
- Förslag på landningspunkt på samma green med större marginal till kända bunkrar, vatten och greenkant. Du väljer själv om förslaget ska användas.

**Par, HCP och teeavstånd för alla 36 hål ingår lokalt.** Även 497 geografiska kartobjekt från OpenStreetMap ingår: bland annat fairways, greener och bunkrar. Lakes har verifierade hållinjer för alla 18 hål och kartan fokuserar på valt hål. Links har 18 ungefärliga referenslinjer: den officiella översiktskartan och hålbilderna har jämförts med OSM:s greener och tees. Dessa visningslinjer är separata från de 497 ursprungliga OSM-objekten. De används för hålval, orientering och zoom; slagets avstånd kommer alltid från dina valda punkter eller kikarmått. Hålets teeavstånd används aldrig som avstånd för ett aktuellt slag.

Kartans former ritas i banguidens färger men i verklig geografisk skala, så att GPS-markören följer kartans koordinater. Links-referenserna har käll- och objekt-ID:n i `mobile/www/data/national-links-routing.json`; de är inte officiella GPS-hållinjer. Onumrerade fairways, greener och hinder väljs för hålvyn efter närhet till hållinjen; tillhörigheten är en visningsheuristik, inte en officiell hålindelning. Originalguiden är en illustration utan verifierad georeferering och används därför som separat bild. Kartdata kan sakna hinder eller vara inaktuella. Sidovindsmodellen och landningsrådet är uppskattningar som behöver kalibreras mot verkliga slag.

Väder och terränghöjd har verifierats med riktiga svar från Open-Meteo. Automatiserade GPS-tester använder en simulerad position; GPS och externa satellitplattor på en fysisk iPhone återstår att verifiera.

## Starta utvecklingsmiljön

### iPhone utan dator eller Java-server

En installerbar iPhone-version finns i **`iphone/`**. Den läggs på hemskärmen via Safari och kör beräkningen på telefonen, även offline efter första laddningen. Publiceringsflöde för GitHub Pages ingår. Satellitplattor, nytt väder och höjddata behöver internet. Den stiliserade GPS-kartan och banguidebilderna fungerar offline efter första laddningen. Se [installation och publicering för iPhone](docs/IPHONE.md).

### Prova på dator utan Java

Ladda ner projektet från GitHub via **Code → Download ZIP** och packa upp det. Öppna sedan **`golf-caddie-prototyp.html`** i Chrome eller Edge. Filen finns redan i projektets rot, och all kod och de lokala banfakta som behövs är inkluderade. Ingen Java-server eller installation behövs för beräkningen. Kartbilder och hämtat väder kräver internet.

För att ändra CSS och direkt se resultatet: öppna **`prototype/index.html`** i webbläsaren och redigera **`mobile/www/style.css`** i din editor. Spara och ladda om sidan. Denna version använder projektets separata CSS- och JavaScript-filer, så behåll mappstrukturen från ZIP-filen.

`python3 scripts/export-prototype.py` uppdaterar båda prototypversionerna efter ändringar i appen och skapar även en lokal kopia i `.runtime/`. Den fristående rotfilen har inbakad CSS; kör exportkommandot när du vill uppdatera den efter CSS-ändringar.

Välj bana och tee och tryck **Starta rundan**. Välj **Placera själv** för att prova hemifrån. **Options → Prova ett slag · 160 m** lägger ut två exempelpositioner inom The Nationals område. Använd **Placera boll** / **Sätt flaggan**, eller dra markörerna. **Använd GPS** följer din verkliga plats; byte tillbaka till Placera själv stänger GPS och återgår till National-vyn.

Den fristående prototypen har en kopia av Java-modellen som jämförs mot Java-API:t i 48 scenarier via `node scripts/check-prototype-model.mjs`. `python3 scripts/smoke-prototype.py` verifierar det exporterade gränssnittet utan nätverks- eller backendåtkomst. Molnets hanterade Chromium blockerar `file://`; därför laddar testet filens innehåll via en lokal testfixture. Direkt filöppning på användarens egen dator har inte verifierats här.

### Java-server och mobilprojekt

Från repositoryts rot:

```bash
./mvnw -B verify
cd mobile
npm ci --no-audit --no-fund
npm run sync
cd ..
./scripts/start.sh
```

Servern lyssnar lokalt på port 8080. `GET /api/health` ska returnera `status: ok`. Gränssnittet kan testas via servern i en lokal webbläsare. Molnonboarding stöder inte länkar till localhost-förhandsvisningar.

`mvnw` aktiverar en full Java 21 JDK vid behov och använder en verifierad Maven-distribution. Molnets befintliga HTTP-proxy och betrodda CA-lager återanvänds utan att TLS-verifiering stängs av. Verktyg och cache läggs i ignorerade `.tools/`; serverns processfiler och offentlig bancache ligger i `.runtime/`. Varje serverstart använder en separat kopia av JAR-filen, så att en ny byggnad inte förstör en redan körande servers klassladdning.

Variabler: `PORT` (8080), `GOLF_BIND` (127.0.0.1), `GOLF_WEB_ROOT` (mobile/www) och `GOLF_ALLOWED_ORIGINS` (kommaseparerat; standard är Capacitors Android-/iOS-origins). För drift bakom en HTTPS-proxy kan `GOLF_BIND=0.0.0.0` behövas. Inga API-nycklar krävs för utveckling med de nu valda datakällorna.

## Android

```bash
./scripts/setup-android.sh
./scripts/build-android.sh
```

Linux-skriptet installerar ett isolerat Android SDK och accepterar Googles SDK-licens för utvecklingsverktygen. Officiella nedladdningar verifieras med deras checksummor; Gradle-distributionen har en fast SHA-256. SDK och Gradle använder molnets befintliga proxy. Debug-APK skapas i `mobile/android/app/build/outputs/apk/debug/app-debug.apk`.

Du kan också öppna projektet via `cd mobile && npm run android` i Android Studio. Debug-signering är enbart för utveckling. `se.golf.caddie` är ett preliminärt app-ID.

## iPhone / App Store

På en Mac med Xcode och CocoaPods:

```bash
cd mobile
npm ci
npm run sync
npm run ios
```

Välj eget bundle-ID och Apple-utvecklarteam i Xcode och testa platsbehörigheten på en riktig iPhone. Linuxmiljön kan skapa och synka iOS-projektet, men kan inte bygga eller signera det. En iOS-build är därför inte verifierad här.

## Anslut mobilappen till Java

För en installerad mobilapp behöver Java-servern en **publik HTTPS-adress**. Ändra `mobile/www/config.js` före `npm run sync`, eller ange adressen via kugghjulet i appen. Ingen produktionsserver har publicerats av denna ändring. Tom adress fungerar endast när webbvyn testas från Java-serverns egen origin. HTTP till en otrygg server godtas inte i mobilinställningarna.

## Tester

```bash
./mvnw -B verify
cd mobile && npm run check && cd ..
# Kör medan scripts/start.sh är igång; kräver Python Playwright och Chromium.
python3 scripts/smoke.py
node scripts/check-prototype-model.mjs
node scripts/check-landing-advisor.mjs
node scripts/check-hole-view.mjs
# Med projektroten serverad lokalt på port 8091:
python3 scripts/smoke-iphone.py
```

Java-testerna kontrollerar bland annat vindriktningens tecken, motvind/medvind, sidvind, luftdensitet, höjd, flyer/ruff, vått bolläge, vindbyar, koordinatavstånd och sammanfogning av OSM-relationsgränser. Smoke-testet anropar den riktiga Java-servern och testar gränssnittets beräkning och inmatning. GPS där använder en uttrycklig simulerad webbläsarposition; väderdiagrammet använder en uttrycklig testfixture. Dessa tester bevisar inte GPS på en riktig telefon eller kontakt med väderleverantören.

## Datakällor och drift

- Banformer: OpenStreetMap, © OpenStreetMap contributors, ODbL 1.0. Den lokala importen använder OSM Map API; servern kan också hämta Overpass-data. Återskapa importen med `python3 scripts/import-course-geometry.py sökväg/till/national.osm`; det lägger också tillbaka Links-referenserna. `python3 scripts/import-links-routing.py` uppdaterar enbart dessa referenser.
- Hålbeskrivningar och 36 oförändrade guidebilder: The National. Källor och attribution finns i `mobile/www/data/national.json`; `python3 scripts/import-guides.py` uppdaterar dem. Bildernas rättigheter tillhör respektive upphovsrättsinnehavare och ingår inte i OSM-licensen.
- Baskarta: OpenStreetMap-plattor. Satellit: Esri World Imagery med attribution i kartan.
- Väder och terränghöjd: Open-Meteo. Vind är modellvind på 10 meters höjd; terränghöjd är inte exakt greenhöjd.
- Liveväder/höjd, rasterkarta och valfri serverimport använder `api.open-meteo.com`, `tile.openstreetmap.org`, `services.arcgisonline.com` och `overpass-api.de`. Importskripten använder även `api.openstreetmap.org` och `thenational.se`. Lokala beräkningar och inbakad bankarta behöver inte dessa tjänster.

Innan butikspublicering återstår HTTPS-drift, kontroll av leverantörernas villkor och kapacitet för kommersiell användning, riktiga enhetstester, utgivarens integritetspolicy, appikoner, butiksmaterial och signering. Servern är en utvecklingsserver; lägg till begränsning av trafik, lämplig övervakning och skydd vid publik drift. Kontrollera butikernas aktuella SDK-/target-krav innan en release.

Modellen behöver kalibreras mot dina uppmätta carryavstånd på banan. Den identifierar inte bolläge från kartan, räknar inte rull eller bollens spinn och ger ingen exakt siktkompensation och ersätter inte ett uppmätt slag. Se [beräkningsmodellen](docs/MODEL.md). Vind- och höjdkorrigerande hjälpmedel kan vara otillåtna vid tävling; kontrollera gällande regler.
