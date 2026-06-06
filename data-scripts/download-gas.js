// Download gasverbruik voor 2025
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { fetchNedRows, writeJson } from './energy-download.js';

export async function downloadGas(year = 2025, outputFile = `./data-raw/aardgas-${year}-uur-data.json`) {
	const rowsByTime = new Map();

	for (const row of await fetchNedRows({
		point: 0,
		type: 31,
		granularity: 5,
		granularitytimezone: 1,
		classification: 2,
		activity: 2,
	}, year)) {
		rowsByTime.set(row.validfrom, [row.validfrom, row.volume]);
	}

	const data = [...rowsByTime.values()]
		.sort((left, right) => left[0].localeCompare(right[0]));

	writeJson(outputFile, data);
	return data;
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
	const year = Number(process.argv[2]) || 2025;
	downloadGas(year).catch(console.error);
}
