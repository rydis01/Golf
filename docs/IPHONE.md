# Golf Caddie på din iPhone

iPhone-versionen i `iphone/` är en app som installeras från Safari på hemskärmen (PWA). Beräkningen körs direkt på telefonen; din dator och Java-server behöver inte vara igång. Den kräver ingen TestFlight-signering eller Apple Developer-prenumeration.

## Publicera via GitHub Pages

1. Lägg ändringarna på repositoryts `main` genom att merge:a pull requesten för iPhone-versionen.
2. I GitHub: öppna repositoryt **Golf → Settings → Pages**. Välj **GitHub Actions** under **Build and deployment → Source**.
3. Under **Actions**, kör arbetsflödet **Publish iPhone app** om det inte redan körs efter mergningen.
4. Vänta på en godkänd deployment. Använd den faktiska sidlänk som visas i Pages-inställningarna eller i workflow-steget Deploy.

Arbetsflödet publicerar endast `iphone/`, inte Java-projektet eller resten av repositoryt. Repositoryt är privat; Pages i privata personliga repositories kan kräva en GitHub-plan som stöder det. Om Pages inte är tillgängligt kan innehållet i `iphone/` publiceras på en annan HTTPS-webbhosting. Ingen repositorysynlighet ska ändras bara för att kringgå detta.

## Installera på telefonen

1. Öppna den publicerade **HTTPS-länken i Safari på din iPhone**.
2. Vänta tills appen säger **Sparad på telefonen · kan öppnas utan internet**.
3. Tryck **Dela → Lägg till på hemskärmen** och välj Lägg till.
4. Starta **Golf Caddie** från den nya ikonen.

Välj **Links eller Lakes**, tee och **Starta på hål 1**. Använd Föregående/Nästa för hål 1–18; senaste bana, tee och hålnummer sparas lokalt så att du kan fortsätta ronden. Själva boll-/flaggpositionerna och kikaravstånden sparas inte mellan sessioner.

På banan väljer du **Använd GPS** och godkänner platsåtkomst, sätter dagens flagga själv och fyller vid behov i kikaravstånd. Välj om kikaren visar utan eller med slope. Sidovindsrådet anger uppskattad drift och sikte. Ett landningsförslag vid bunker/vatten behöver väljas av dig innan slaget räknas om. Hemifrån kan du välja **Placera själv** eller **Prova ett slag · 160 m**. GPS startar endast efter ditt val och stoppas när du byter till manuell placering eller när appen går till bakgrunden.

## Utan internet

Efter en godkänd första laddning kan appen öppnas offline med service worker och lokal cache. Beräkning, sidovinds-/landningsråd, 497 geografiska banformer, officiella par/HCP/teeavstånd och originalguidebilder för 36 hål finns lokalt. Guidebilderna omfattar ungefär 24 MiB; första laddningen behöver få tid att spara dem innan appen visar offlineklar status. GPS beror på enhetens stöd, behörighet och signal. Satellit- och externa baskartbilder, nytt väder och terränghöjd behöver internet. Ange väder och höjd manuellt när du är offline. Kartplattor förladdas inte för offlinebruk.

Banvyn återger de geografiska formerna i guideinspirerade färger med samma kartprojektion som GPS. Originalguidebilden har inte sträckts till godtyckliga GPS-gränser. Lakes har 18 identifierade hållinjer från OSM:s Lakes-relation; Links har inga identifierade hållinjer i det importerade underlaget och behöver manuell målplacering. Dagens flaggposition är alltid spelarens val.

iOS kan rensa webbappens cache vid lagringsbrist eller när du tar bort webbplatsdata. Öppna därför appen en gång med internet före rundan och kontrollera statusraden. iOS/Safari kan behöva separat platsgodkännande för appen på hemskärmen.

## Bygga och testa

```bash
python3 scripts/build-iphone.py
# Enbart för intern testning på utvecklingsmaskinen:
python3 -m http.server 8091 --bind 127.0.0.1
# I ett annat terminalfönster:
python3 scripts/smoke-iphone.py
```

Appen byggs från det gemensamma gränssnittet och samma testade lokala modell som datorprototypen. Service worker-versionen baseras på innehållets SHA-256; en ny version erbjuder en Uppdatera-knapp. Beräkningsmodellen jämförs mot Java-API:t via `node scripts/check-prototype-model.mjs`.

Verifierat här: mobil layout i Chromium, touchflöde, faktisk offline-omladdning via service worker, lokal beräkning och simulerad GPS. Riktig iPhone/Safari och platsnoggrannhet på banan är ännu inte testade. Linuxmiljön saknar Xcode och har inte byggt eller signerat en native iOS-app. HTTPS-publicering och en riktig iPhone-installation får inte beskrivas som genomförda förrän de är verifierade.
