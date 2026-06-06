import axios from 'axios';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

import { writeJson } from './energy-download.js';

const OUTPUT_FILE = './data-raw/temperatuur-2025-uur-data.json';
const OPEN_METEO_URL = 'https://archive-api.open-meteo.com/v1/archive';

export async function downloadTemperature(year = 2025, outputFile = `./data-raw/temperatuur-${year}-uur-data.json`) {
  const response = await axios.get(OPEN_METEO_URL, {
    params: {
      latitude: 52.1,
      longitude: 5.18,
      start_date: `${year - 1}-12-31`,
      end_date: `${year}-12-31`,
      hourly: 'temperature_2m',
      timezone: 'UTC',
    },
  });

  const hourlyTimes = response.data?.hourly?.time;
  const hourlyTemperatures = response.data?.hourly?.temperature_2m;
  if (!Array.isArray(hourlyTimes) || !Array.isArray(hourlyTemperatures) || hourlyTimes.length !== hourlyTemperatures.length) {
    throw new Error('Open-Meteo gaf geen bruikbare uurlijkse temperatuurreeks terug');
  }

  const data = hourlyTimes.map((time, index) => ({
    time: `${time}:00Z`,
    value: Number(hourlyTemperatures[index]),
  }));

  writeJson(outputFile, data);
  return data;
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  const year = Number(process.argv[2]) || 2025;
  await downloadTemperature(year);
}
