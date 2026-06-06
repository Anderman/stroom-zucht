// Download zonneproductie
import { fetchNedRows, writeJson } from './energy-download.js';

export async function downloadSolar(year = 2025, outputFile = `./data-raw/zon-${year}-uur-data.json`) {
  const rowsByTime = new Map();

  for (const row of await fetchNedRows({
    point: 0,
    type: 2,
    granularity: 5,
    granularitytimezone: 1,
    classification: 2,
    activity: 1,
  }, year)) {
    const time = row.validfrom.replace('T', ' ').slice(0, 13) + ':00';
    rowsByTime.set(time, {
      time,
      value: Math.round(row.volume),
    });
  }

  const data = [...rowsByTime.values()]
    .sort((left, right) => left.time.localeCompare(right.time));

  writeJson(outputFile, data);
  return data;
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  const year = Number(process.argv[2]) || 2025;
  await downloadSolar(year);
}
