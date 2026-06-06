// Download elektriciteitsverbruik
import { fetchEntsoeXml, parseEntsoeXml, writeJson } from './energy-download.js';

export async function downloadElectricity(year = 2025, outputFile = `./data-raw/elektriciteit-${year}-uur-data.json`) {
  const xml = await fetchEntsoeXml({
    documentType: 'A65',
    processType: 'A16',
    in_Domain: '10YNL----------L',
    outBiddingZone_Domain: '10YNL----------L',
  }, year);
  const data = await parseEntsoeXml(xml);
  writeJson(outputFile, data);
  return data;
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  const year = Number(process.argv[2]) || 2025;
  await downloadElectricity(year);
}
