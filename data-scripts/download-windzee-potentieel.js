// Verwerk KNMI uurgegevens Noordzee (bijv. K13-A) naar een capaciteitsfactor-reeks.
// Gebruik: node data-scripts/download-windzee-potentieel.js <pad-naar-knmi-txt>
//
// De tijdsas van de app begint op 2024-12-31T23:00:00Z (= 2025-01-01 00:00 CET).
// Daarvoor is HH=24 van 31 dec 2024 nodig plus alle uren van 2025 t/m HH=23 op 31 dec 2025.
//
// KNMI-kolomindices (0-gebaseerd, komma-gescheiden):
//   0=STN  1=YYYYMMDD  2=HH  3=DD  4=FH (uurgemiddelde windsnelheid 0.1 m/s)
//
// Output-waarden: capaciteitsfactor × 1_000_000 zodat pointScale 1/1_000_000 de
// dimensieloze CF teruggeeft (0–1 bij 1 GW referentie).
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

import { writeJson } from './energy-download.js';

const OUTPUT_FILE = './data-raw/windzee-potentieel-2025-uur-data.json';

// Vereenvoudigde offshore vermogenscurve (generiek, moderne 10–15 MW turbine)
const V_CUTIN = 3;    // m/s — inschakelwindsnelheid
const V_RATED = 11;   // m/s — nominaal vermogen bereikt
const V_CUTOUT = 25;  // m/s — uitschakelwindsnelheid

function windSpeedToCapacityFactor(v) {
  if (v < V_CUTIN || v >= V_CUTOUT) return 0;
  if (v >= V_RATED) return 1;
  return (v ** 3 - V_CUTIN ** 3) / (V_RATED ** 3 - V_CUTIN ** 3);
}

/**
 * Converteert KNMI YYYYMMDD + HH naar de start-van-uur UTC ISO-string.
 * KNMI HH is het eindpunt van het uur (HH=1 = 00:00–01:00 UTC).
 * Dus start-van-uur = HH-1 uur na middernacht UTC van die dag.
 */
function knmiToUtcIso(yyyymmdd, hh) {
  const year = parseInt(yyyymmdd.slice(0, 4), 10);
  const month = parseInt(yyyymmdd.slice(4, 6), 10) - 1;
  const day = parseInt(yyyymmdd.slice(6, 8), 10);
  const date = new Date(Date.UTC(year, month, day, hh - 1, 0, 0));
  return date.toISOString();
}

export function parseKnmiWindzeePotentieel(inputFile, year = 2025, outputFile = `./data-raw/windzee-potentieel-${year}-uur-data.json`) {
  console.log(`Parsing KNMI file: ${inputFile} for year ${year}`);
  const text = readFileSync(inputFile, 'utf8');
  const lines = text.split(/\r?\n/);

  const prevYearStr = String(year - 1);
  const yearStr = String(year);
  const entries = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('BRON') || trimmed.startsWith('YYYY')) {
      continue;
    }

    const parts = trimmed.split(',');
    if (parts.length < 5) continue;

    const yyyymmdd = parts[1].trim();
    const hh = parseInt(parts[2].trim(), 10);
    const fhRaw = parts[4].trim(); // FH = uurgemiddelde windsnelheid in 0.1 m/s

    if (!yyyymmdd || !Number.isFinite(hh)) continue;

    // Houd alleen de benodigde uren:
    //   - HH=24 van 31 december van het vorige jaar (= slot 0 van de tijdsas)
    //   - Alle uren van het doeljaar BEHALVE HH=24 van 31 december (= buiten de as)
    const isFirstSlot = yyyymmdd === `${prevYearStr}1231` && hh === 24;
    const isCurrentYear = yyyymmdd.startsWith(yearStr);
    const isLastSlotNextYear = yyyymmdd === `${yearStr}1231` && hh === 24;
    if (!isFirstSlot && !isCurrentYear) continue;
    if (isLastSlotNextYear) continue;

    const windMs = fhRaw !== '' ? Number(fhRaw) / 10 : null; // 0.1 m/s → m/s
    const cf = windMs !== null ? windSpeedToCapacityFactor(windMs) : null;

    entries.push({ time: knmiToUtcIso(yyyymmdd, hh), cf });
  }

  if (entries.length === 0) {
    throw new Error(`Geen bruikbare data gevonden in ${inputFile}. Controleer of het bestand ${yearStr}-data bevat.`);
  }

  // Sorteer op tijd (voor de zekerheid)
  entries.sort((a, b) => a.time.localeCompare(b.time));

  // Interpoleer ontbrekende CF-waarden
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].cf !== null) continue;
    const prev = entries.slice(0, i).findLast(e => e.cf !== null);
    const next = entries.slice(i + 1).find(e => e.cf !== null);
    if (prev && next) {
      const span = entries.indexOf(next) - entries.indexOf(prev);
      const offset = i - entries.indexOf(prev);
      entries[i].cf = prev.cf + ((next.cf - prev.cf) * offset) / span;
    } else {
      entries[i].cf = prev?.cf ?? next?.cf ?? 0;
    }
  }

  const data = entries.map(e => ({
    time: e.time,
    value: Math.round(e.cf * 1_000_000),
  }));

  console.log(`${data.length} uurwaarden verwerkt (verwacht: 8760).`);
  if (data.length !== 8760) {
    console.warn(`Waarschuwing: ${data.length} ≠ 8760 uur. Controleer de invoer op volledigheid.`);
  }

  writeJson(outputFile, data);
  return data;
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  const inputFile = process.argv[2];
  const year = Number(process.argv[3]) || 2025;
  if (!inputFile) {
    console.error('Gebruik: node data-scripts/download-windzee-potentieel.js <pad-naar-knmi-txt> [jaar]');
    console.error('Voorbeeld: node data-scripts/download-windzee-potentieel.js "D:\\users\\thom\\temp\\uurgeg_252_2021-2030.txt"');
    process.exit(1);
  }
  parseKnmiWindzeePotentieel(inputFile, year);
}
