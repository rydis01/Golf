# Beräkningsmodell wind-v2

Resultatet betyder: **välj den klubba som normalt bär detta avstånd under referensförhållanden**. Referensen är lugn vind, 20 °C, 50 % relativ luftfuktighet, 1013,25 hPa lokalt lufttryck, plan mark och ren fairwaykontakt. Avstånd avser carry till en vald landningspunkt. Rull efter landning ingår inte.

Detta är en förklarbar empirisk startmodell. Koefficienterna är antaganden, inte validerade mot användarens slag eller en fullständig aerodynamisk simulering.

## Koordinater och vind

Horisontellt avstånd beräknas med haversine och slagriktning som initial bäring, 0° norr och 90° öster. GPS-noggrannhet visas separat; den garanterar inte meterprecision. Tillåtna carryavstånd är 10–350 meter.

Meteorologisk vindriktning anger **varifrån** vinden kommer. Med vindhastighet `v` och skillnaden mellan vindriktning och slagriktning `a`:

```
motvindskomponent = v × cos(a)
sidvindskomponent = v × sin(a)
vindjustering = avstånd × motvindskomponent × koefficient × bollbanefaktor
```

Positiv komponent är motvind, negativ är medvind. Koefficienten är 0,012 per m/s i motvind och 0,008 i medvind. Bollbanefaktor är 0,75 för låg, 1 för normal och 1,25 för hög. Sidovind ger dessutom en uppskattad drift i meter och ett motsvarande siktråd enligt modellen nedan.

Open-Meteos medelvind och byar kommer från en vädermodell på 10 meters höjd. Vind vid bollen kan avvika på grund av träd, byggnader och terräng. Medelvinden styr mittvärdet; byarna ökar osäkerhetsmarginalen. En vindkompasspil visar vart luften rör sig.

## Sidovind och sikte

Modellen antar ett rakt slag utan avsiktlig skruv. Standardflygtiden är `1,15 × sqrt(2 × avstånd × tan(35°) / g) × bollbanefaktor`, med minst en sekund. 35° är en effektiv parameter för flygtidsuppskattningen, inte en uppmätt launchvinkel. Spelaren kan ange en uppmätt flygtid (1–15 sekunder) som ersätter uppskattningen.

Sidledsdraget approximeras med en konstant respons mot sidvinden:

```
relativ lufthastighet = max(8, hypot(avstånd/flygtid + motvind, sidvind))
tau = 2 × bollmassa / (luftdensitet × Cd × bollarea × relativ lufthastighet)
respons = flygtid − tau × (1 − exp(−flygtid/tau))
sidodrift = −sidvind × respons
siktförskjutning = −sidodrift
```

Bollmassa antas vara 45,93 g, diameter 42,67 mm och dragkoefficient `Cd = 0,25`. Positiv sidodrift betyder höger; vind från höger ger alltså drift åt vänster och ett siktråd åt höger. Den numeriska modellen använder `expm1` för stabil beräkning vid kort flygtid.

Sidomarginalen är `max(3 m, 4 % av carry) + 30 % av |driften| + sidledskomponenten av extra vindbyar × respons`. Det är en heuristisk marginal som inkluderar en grov grundvariation för ett rakt slag. Den är inte ett konfidensintervall och ersätter inte en personlig spridningsmodell. Spinn, Magnus-kraft, skruv, varierande vind med höjd och förändringar längs hela flygbanan är inte simulerade. Testerna kontrollerar beräkningsbeteendet, inte fysisk precision på banan.

## Kikare och manuell flagga

Flaggan sätts av spelaren på kartan. Ingen hämtad OSM-pin används som dagens flagga. Ett uppmätt kikaravstånd är förstahandsvärde framför kartans/GPS-avståndets längd; riktningen behöver fortfarande vara markerad på kartan eller anges i grader.

- **Utan slope:** avståndet behandlas som siktlinjens längd. Vid känd höjdskillnad räknas horisontellt avstånd som `sqrt(mätning² − höjd²)` innan modellens höjdjustering läggs till.
- **Med slope:** kikarens värde behandlas som ett redan höjdkorrigerat spelavstånd. Modellens ytterligare höjdjustering sätts till noll; vind, luft och bolläge justeras därefter.

En mer precis mållängd betyder inte att vind- eller slagspridningen blir säkrare. Mätningen nollställs vid hålbyte och när bollens plats eller flaggmål har ändrats tydligt. GPS-brus hanteras med rapporterad noggrannhet som tröskel.

## Landningsyta och riskområden

Rådet använder verkliga OSM-polygontyper för green, bunker och vatten. Endast en flagga inom en kartlagd green kan få ett landningsförslag. En cirkulär buffert byggs av den största av längd- och sidomarginalen, minst fyra meter, plus rapporterad GPS-noggrannhet i GPS-läge. Bufferten är ett planeringshjälpmedel, inte en sannolikhetsmodell eller garanti.

Appen provar punkter på samma green och väger avstånd till riskområden/greenkant mot avståndet från flaggan. Ett alternativ erbjuds om det ger mer utrymme än flaggan. Om hela modellmarginalen fortfarande inte ryms sägs det uttryckligen. Användaren väljer själv om alternativet ska bli slagets mål; flaggan ligger kvar.

Om kikaren används till flaggan justeras avståndet till en vald alternativ yta med skillnaden mellan de två kartavstånden från bollen. Förskjutningen är därför uppskattad och höjden antas lika vid flagga och alternativ. Appen beskriver detta som kartuppskattning. Kartor kan sakna hinder eller vara inaktuella, och rull ingår inte.

## Höjd och luft

Positiv höjdskillnad betyder att målet ligger högre än bollen. Höjdjusteringen är 1 meter spelavstånd per höjdmeter för normal bollbana, 1,2 för låg och 0,75 för hög. Detta är en förenkling; en verklig bollbana behöver launch, spin och hastighet. Hämtad terränghöjd måste kontrolleras och kan ersättas manuellt.

Luftdensitet beräknas från temperaturen, relativ luftfuktighet och **lokalt** lufttryck med idealgasmodellen för torr luft och vattenånga. Luftjusteringen är `avstånd × 0,25 × (densitet / referensdensitet − 1)`. Kallare luft är normalt tätare och ökar spelavståndet. Högre luftfuktighet minskar densiteten något vid oförändrad temperatur och tryck. Fuktig luft ska därför inte ges en generell regel om kortare slag.

Denna luftjustering modellerar inte hur en kall boll förändrar bollhastighet eller hur regn påverkar bollens yta och klubban. Dessa effekter kräver uppmätta data.

## Bolläge och marginal

Startjusteringar relativt carryavståndet: fairway 0 %, ruff +8 %, flyer −7 % och fairwaybunker +20 %. Ett slag från en greenbunker täcks inte av modellen. Lie måste anges av spelaren; en karta eller GPS kan inte avgöra om gräs mellan boll och klubba kommer att orsaka ett flyerslag.

Våt boll/vått gräs får **ingen fast meterjustering**, eftersom både längd och spinn beror på kontakt, lie och klubba. Det ökar marginalen med 4 % av carryavståndet.

```
spelavstånd = avstånd + vind + höjd + luft + bolläge
marginal = avstånd × 0,035
         + (byar − medelvind) × avstånd × 0,012 × bollbanefaktor
         + avstånd × |bollägesfaktor| × 0,75
         + (vått bolläge ? avstånd × 0,04 : 0)
```

Intervallet är en heuristisk modellmarginal, inte ett konfidensintervall. Det inkluderar inte alla GPS-, terräng- eller prognosfel. Vid extrem höjd/vind klipps mittvärdet vid minst en meter med en tydlig varning. Stark vind, stor höjdskillnad och svåra bollägen kräver särskilt försiktig tolkning.

## Nästa kalibrering

Samla verkligt carryavstånd, klubb, temperatur, vind, bolläge och slagkvalitet för slag på Links och Lakes. Börja med personliga carryavstånd i lugnt väder och uppskatta därefter vindkoefficienter för låg/normal/hög bollbana. Skilj mellan bra kontakt, mishits och rull. Modellen ska jämföras mot nya slag som inte användes för kalibreringen innan dess precision anges.
