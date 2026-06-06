# Stroom-zucht

En uursimulatie van het Nederlandse elektriciteitssysteem. Draait in de browser, geen backend nodig.

Alle grafieken werken op basis van 8760 uurlijkse datareeksen (of 8784 in schrikkeljaren) voor de jaren 2020 tot en met 2025.

## Pagina's

| Pad | Wat |
|-----|-----|
| `/verbruik` | Totale vraag: elektriciteit, gas omgerekend naar warmtepomp, en vervoer. Gestapeld. |
| `/opwek` | Zon, wind op land, wind op zee. Uur voor uur. |
| `/balans` | Wat blijft er over als je opwek min vraag doet. Met curtailment, batterijen, waterstof. |
| `/berekeningen` | Kosten per technologie, per kWh, en wat het betekent voor een huishouden of bedrijf. |
| `/waterstof-import` | Waterstofvraag uit industrie, bunkering en non-energy use. |
| `/uitleg` | Annames, FAQ, uitleg over hoe dingen berekend zijn. |

## Data

De uurlijkse data komt uit ENTSO-E (elektriciteit, wind), NED (zon, gas), KNMI (windsnelheid), Open-Meteo (temperatuur) en CBS (vervoer, belastingtarieven, industrieel verbruik). De scripts om data op te halen staan in `data-scripts/`.

Nieuwe data binnenhalen:

```
npm run download:all
```

Daarna de ruwe data omzetten naar vlakke arrays:

```
npm run format:arrays
```

Per downloadscript:
```
npm run download:elektriciteit
npm run download:gas
npm run download:solar
npm run download:windland
npm run download:windzee
```

## Ontwikkelen

```
ng serve
```

Browser openen op `http://localhost:4200/`. Wijzigingen worden live geladen.

Bouwen voor productie:

```
ng build
```

## Waarom dit ding?

Nederland zit midden in de energietransitie, maar de meeste modellen die ik tegenkom zijn black boxes of draaien in Excel. Dit is een poging om het transparant te maken: alle rekenstappen zijn terug te vinden in de code, alle data is te herleiden tot bronnen, en je kunt zelf schuiven aan parameters om te zien wat het effect is.

De balanspagina is het hart: daar draait een uursimulatie die per uur uitrekent wat er gebeurt met overschotten en tekorten, hoe batterijen laden en ontladen, en waar waterstof in beeld komt.

## Jaren

De app ondersteunt 2020 tot en met 2025. Elk jaar heeft dezelfde set datareeksen (behalve gas, dat pas vanaf 2021 beschikbaar is in NED). Schakelen gaat via de knop rechtsboven.

## Licentie

MIT — zie [LICENSE](LICENSE).
