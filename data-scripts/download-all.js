// Download alle energiebronnen voor een gegeven jaar en bouw daarna de arraybestanden
// Gebruik: node data-scripts/download-all.js [jaar]
// Voorbeeld: node data-scripts/download-all.js 2024
import { downloadElectricity } from './download-elektriciteit.js';
import { downloadGas } from './download-gas.js';
import { downloadSolar } from './download-solar.js';
import { downloadTemperature } from './download-temperature.js';
import { downloadTransport } from './download-transport.js';
import { downloadWindland } from './download-windland.js';
import { downloadWindzee } from './download-windzee.js';
import { formatArrayData } from './format-array-data.js';

// Zeewind potentieel (K13-A) wordt apart verwerkt via:
//   node data-scripts/download-windzee-potentieel.js <pad-naar-knmi-txt> [jaar]

const year = Number(process.argv[2]) || 2025;
console.log(`Downloading data for year ${year}...`);

(async () => {
  await downloadElectricity(year);
  await downloadGas(year);
  await downloadSolar(year);
  await downloadTemperature(year);
  downloadTransport(year);
  await downloadWindland(year);
  await downloadWindzee(year);
  formatArrayData();
})();
