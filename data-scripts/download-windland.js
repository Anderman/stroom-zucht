// Download wind op land productie
import { fetchEntsoeXml, parseEntsoeXml, writeJson } from './energy-download.js';

export async function downloadWindland(year = 2025, outputFile = `./data-raw/windland-${year}-uur-data.json`) {
  console.log(`Fetching data for Wind Onshore ${year}...`);
  const xml = await fetchEntsoeXml({
    documentType: 'A75',
    processType: 'A16',
    in_Domain: '10YNL----------L',
    psrType: 'B19',
  }, year);
  const data = await parseEntsoeXml(xml);
  writeJson(outputFile, data);
  return data;
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  const year = Number(process.argv[2]) || 2025;
  await downloadWindland(year);
}
