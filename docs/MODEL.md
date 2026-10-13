# Beräkningsmodell wind-v3

Appen ger ett **referenscarry att slå**: välj slaget eller klubban som normalt bär detta antal meter i lugn vind, 20 °C, 50 % relativ luftfuktighet, 1013,25 hPa lokalt lufttryck, plan mark och ren kontakt. Inga personliga klubbdata krävs. Rull efter landning ingår inte.

Modellen är en förenklad, sammanhängande modell för en normal rak bollflykt. De generiska vind-, luft- och bollägesfaktorerna är antaganden. Matematiska tester verifierar konsekvens och implementation; de bevisar inte fysisk träffsäkerhet för en viss spelare eller boll. Launch, spinn och vindvariation med höjd simuleras inte som en fullständig bollflykt.

## Vad ändras jämfört med wind-v2?

- Carryförlust inverteras i stället för att bara läggas på målavståndet. Om ett slag tappar 20 % carry behövs 200 m referenscarry för att nå 160 m, inte 192 m.
- Höjd beräknas med en böjd effektiv bollbana och en landningsvinkel. Ett högt mål och en låg bollbana kräver större korrigering.
- Längd, flygtid och sikte löses tillsammans. När du siktar mot sidvinden förändras även mot-/medvindskomponenten.
- En angiven flygtid påverkar längdvind också, inte bara sidodrift.
- Byar, vindriktning, avstånd och höjd påverkar modellintervallet. Landningsbufferten använder faktiska landningsmeter, inte samma meter som klubbens referenscarry.
- Aktuellt väder och grov terränghöjd hämtas automatiskt när du placerar slaget. Utan användbara data märks antagandena tydligt. Exempelväder används bara för provslaget.

## Höjd och effektiv bollbana

Låt `D` vara horisontellt avstånd och `H` målets höjd över bollen. En effektiv parabel beskriver familjen av bollbanor:

```
y(x) = tan(θ) × (x − x²/C)
C = D² / (D − H/tan(θ))
```

`C` är motsvarande carry på plan mark under samma förhållanden. `θ` beskriver bollbanans landningsvinkel vid plan mark. Standardvärdena är 35° för låg, 45° för normal och 55° för hög bollbana. En uppmätt vinkel kan anges i Options men krävs inte.

Detta är en effektiv bana, inte en simulering av launch och Magnus-kraft. Samma skalade banform antas även när det erforderliga referensslaget ändras. Modellen använder den nedåtgående delen av banan: `H < D × tan(θ)/2`. Ett mål över denna gräns ger ett felmeddelande, inte ett artificiellt lågt spelavstånd. Stora höjdskillnader, korta slag och fel antagen landningsvinkel är särskilt osäkra.

## Omvänd vind-, luft- och bollägesberäkning

Meteorologisk vindriktning anger **varifrån** vinden kommer. Komponenterna beräknas relativt den verkliga siktriktningen:

```
head = vindhastighet × cos(vindfrån − siktriktning)
cross = vindhastighet × sin(vindfrån − siktriktning)
airGain = (referensdensitet / aktuell densitet)^0,25
windGain = exp(−head × k × exponering)
referenscarry R = C / (airGain × lieGain × windGain)
```

`k` är 0,012 per m/s i motvind och 0,008 i medvind. Dessa tidigare empiriska storleksordningar behålls; den exponentiella formen säkerställer en positiv faktor. Det är ingen ny mätbaserad kalibrering. Lie-faktorerna är fairway/tee 1, ruff 0,92, flyer 1,07 och fairwaybunker 0,80. De är grova antaganden om carryförändring och gäller inte ett greenbunkerslag.

Luftdensiteten beräknas med idealgasmodellen för torr luft och vattenånga, från temperatur, relativ luftfuktighet och **lokalt** lufttryck. Fuktig luft är något lättare. Kallare luft ökar normalt spelavståndet. Kall boll, regn, gräs mellan boll och klubba och spinn kan ha ytterligare effekter som denna modell inte ger påhittade fasta meter åt.

## Flygtid, sidodrift och sikte

Standardtid för ett planmarksslag med referenscarry `R`:

```
Tnormal = sqrt(2 × R / g)
bollbanefaktor = sqrt(tan(θ))
T = Tnormal × bollbanefaktor × längd i siktriktningen / C
```

Bollbanefaktorn härleds från samma effektiva landningsvinkel som höjdberäkningen (cirka 0,84 / 1 / 1,20 för låg / normal / hög). På plan mark i referensförhållanden ger detta samma topphöjd som den effektiva parabeln och gravitationsformeln för flygtid. Minimitid är en sekund; uppskattad tid över 15 sekunder ligger utanför modellen. En angiven flygtid ersätter denna uppskattning och används även i vindexponeringen: `T / (Tnormal × längd/C)`. När flygtid inte anges är vindexponeringen bollbanefaktorn. Tiden är en uppskattning av referensslagets flykt, avkortad/förlängd för målhöjden. Vindens inverkan på faktisk launch, lift, spinn och landningsvinkel är inte fullständigt simulerad.

Sidodriften använder en linjäriserad dragrespons mot konstant vind:

```
airspeed = max(8, hypot(längd/T + head, cross))
tau = 2 × massa / (densitet × Cd × bollarea × airspeed)
drift = −cross × (T + tau × expm1(−T/tau))
```

Massa är 45,93 g, diameter 42,67 mm och `Cd = 0,25`. Positiv drift betyder höger. Detta är en approximation med konstant effektiv lufthastighet och dragkoefficient, utan egen skruv.

För en siktvridning `δ` relativt målet blir längden i siktriktningen `D × cos(δ)`. Villkoret för landning utan kvarvarande sidoförskjutning är `drift = −D × sin(δ)`. Modellen itererar mot `δ = asin(−drift/D)` och löser referenscarry/flygtid vid varje steg. Siktemarkören placeras `D × tan(δ)` meter vid sidan av målet.

Driftvärdet i texten är uppskattningen **om du siktade rakt mot målet**. Siktrådet räknas däremot med vinden relativt det korrigerade siktet. Därför behöver siktrådet inte vara exakt samma antal meter som den okorrigerade driften. Raderna Vind, Höjd, Luft, Bolläge och Sikte summerar till spelavståndets justering, med avrundning till 0,1 m.

## Marginaler och användningsgränser

Mittvärdet styrs av medelvinden. Modellen räknar även scenarier med:

- Vindhastighet mellan `max(0, medelvind − extra bystyrka)` och bystyrkan.
- Vindriktning ±15° som standard, eller egen marginal i Options. Riktningar med ren mot-/med-/sidvind som ligger inom marginalen inkluderas också. När riktningen kommer från kartpunkter läggs en geometrisk uppskattning av bäringsfelet från positionsmarginalen till, upp till 90° total marginal. För grov GPS kräver manuell placering.
- Höjd ±1 m för manuellt antaget värde och ±5 m för hämtad terränghöjd, eller egen marginal.
- Avstånd ±3 m vid manuell karta, ±1 m som kikarantagande, och minst GPS-noggrannheten plus 3 m i GPS-läge; kan ändras i Options.

Detta är **planeringsantaganden**, inte garantier om sensorernas eller prognosens noggrannhet. Kikare kan ge korrekt längd utan att kartans flaggposition eller vindriktning blir exakt.

Referenscarryintervallet använder extrema beräknade scenarier, mätmarginal och en grundspridning på 3,5 % plus extra variation för lie och vått bolläge. Våt boll ger ingen fast längdkorrigering men ökar både längd- och sidomarginal. En numerisk lokal derivata översätter referenscarrymarginal till en uppskattad landningsmarginal i meter. Positionsmarginal läggs till separat i landningsrådet så att GPS inte räknas två gånger.

Intervallet är en heuristisk modellmarginal, inte ett konfidensintervall eller en personlig spridningsmodell. Det omfattar inte alla fel i antagna koefficienter, landningsvinkel, bollkontakt, spinn, väder eller kartformer. Medelvind över 15 m/s, för stor sidodrift och en numeriskt instabil lösning ger inget exakt spelråd. Om vissa osäkerhetsscenarier ligger utanför modellen markeras intervallet som ofullständigt och inget landningsförslag ges. Spelavstånd över 350 m får ett råd om upplägg.

## Data och uppdateringar

Väder hämtas i bakgrunden för bollens plats. Användbara värden återanvänds upp till 30 minuter och inom 500 m. Terränghöjd återanvänds upp till 30 minuter och ungefär 10 m boll-/3 m målförflyttning. Misslyckade automatiska försök begränsas under fem minuter för samma område/punktpar. GPS kräver fortfarande ditt val och systemets platsbehörighet.

Väder och höjd är modell-/terrängdata från Open-Meteo, inte mätningar vid bollen eller exakta greenhöjder. Gamla svar för andra punkter och svar som kommer efter manuell redigering ignoreras. Manuell redigering stänger av automatiken för respektive värde. Egen höjd gäller det aktuella slaget; vid hålbyte återställs det sparade automatikvalet för höjd. Egna vädervärden kan återanvändas under sessionen. Automatikvalen kan ändras i Options och sparas som inställningar. Utan väder antas lugn vind och referensluft; utan höjd används aktuellt antaget höjdvärde. Dessa antaganden märks i spelvyn. Beräkningen fungerar offline.

## Kikare och landningsyta

Flaggan eller målpunkten placeras av spelaren. Utan slope behandlas kikarens mått som siktlinjens längd: `sqrt(mätning² − höjd²)` ger horisontell sträcka. Med slope används värdet som redan höjdkorrigerat spelavstånd, och ytterligare höjdjustering/marginal sätts till noll. Vind, luft och lie räknas därefter. Kikarens egen slope-algoritm är inte identifierad av appen.

För ett alternativt landningsmål justeras kikaravståndet med skillnaden mellan kartavstånden till flagga och alternativ. Det är en kartuppskattning. Landningsrådet använder faktiska carry-/sidomarginaler och positionsmarginal kring en kartlagd green, och jämför kända bunkrar/vatten/greenkant. Det garanterar inte en säker landning; kartdata kan sakna hinder eller vara inaktuella.

## Verifiering och kvarvarande verklighetsprov

Java-tester kontrollerar analytiska referensfall, höjdens träff på den effektiva banan, vindriktning, rotationsinvarians, mätmarginaler, vått bolläge och modellgränser. En grid med 300 kombinationer av avstånd, höjd och vind jämförs även efter rotation. iPhone-/JavaScriptmodellen jämförs numeriskt med Java, och browser-tester kontrollerar automatiska data, sena svar, manuell prioritet, kikare/slope och offline.

Ingen uppmätt förbättring i meter mot verkliga golfslag är fastställd. Nästa verklighetsprov bör jämföra rekommendationen med carry för normala slag på plan mark och i vind/höjd, utan att blanda in rull eller mishits. Sådana data behövs för att mäta och kalibrera fysisk träffsäkerhet, men krävs inte för att använda appen och få ett nummer att slå.
