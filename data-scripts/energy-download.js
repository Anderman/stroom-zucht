import axios from 'axios';
import { addDays, addMinutes, format } from 'date-fns';
import { writeFileSync } from 'fs';
import { parseStringPromise } from 'xml2js';

export const DATA_YEAR = 2025;
const ENTSOE_API_URL = 'https://web-api.tp.entsoe.eu/api';
const ENTSOE_API_KEY = process.env.ENTSOE_API_KEY;
const NED_API_URL = 'https://api.ned.nl/v1/utilizations';
const NED_AUTH_TOKEN = process.env.NED_AUTH_TOKEN;
export const ENTSOE_PERIOD_START = new Date('2024-12-31T23:00:00Z');
export const ENTSOE_PERIOD_END = new Date('2025-12-31T23:00:00Z');
export const NED_PERIOD_START = new Date('2025-01-01T00:00:00Z');
export const NED_PERIOD_END = new Date('2026-01-01T00:00:00Z');

/**
 * Returns period boundaries and metadata for the given calendar year.
 * ENTSO-E uses UTC+1 offset so the year starts at 2024-12-31T23:00:00Z.
 */
export function getYearConfig(year) {
  const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return {
    year,
    isLeapYear,
    hoursPerYear: isLeapYear ? 8784 : 8760,
    ENTSOE_PERIOD_START: new Date(`${year - 1}-12-31T23:00:00Z`),
    ENTSOE_PERIOD_END: new Date(`${year}-12-31T23:00:00Z`),
    NED_PERIOD_START: new Date(`${year}-01-01T00:00:00Z`),
    NED_PERIOD_END: new Date(`${year + 1}-01-01T00:00:00Z`),
  };
}

export async function fetchEntsoeXml(params, year = DATA_YEAR) {
  const config = getYearConfig(year);
  const formattedStartDate = formatEntsoeDate(config.ENTSOE_PERIOD_START);
  const formattedEndDate = formatEntsoeDate(config.ENTSOE_PERIOD_END);
  const response = await axios.get(ENTSOE_API_URL, {
    params: {
      periodStart: formattedStartDate,
      periodEnd: formattedEndDate,
      securityToken: ENTSOE_API_KEY,
      ...params,
    },
    headers: { 'Accept': 'application/xml' },
  });
  return response.data;
}

function formatEntsoeDate(date) {
  return date.toISOString().slice(0, 16).replace(/[-:T]/g, '');
}

export async function fetchNedRows(baseParams, year = DATA_YEAR, stepDays = 5) {
  const config = getYearConfig(year);
  const allRows = [];
  let currentDate = config.NED_PERIOD_START;

  while (currentDate < config.NED_PERIOD_END) {
    const nextDate = addDays(currentDate, 6);
    const response = await fetchNedPage({
      ...baseParams,
      'validfrom[strictly_before]': format(nextDate < config.NED_PERIOD_END ? nextDate : config.NED_PERIOD_END, 'yyyy-MM-dd'),
      'validfrom[after]': format(currentDate, 'yyyy-MM-dd'),
    });

    allRows.push(...response.data);
    currentDate = addDays(currentDate, stepDays);
  }

  return allRows;
}

async function fetchNedPage(params, attempt = 0) {
  try {
    return await axios.get(NED_API_URL, {
      params,
      headers: {
        'X-AUTH-TOKEN': NED_AUTH_TOKEN,
        'Accept': 'application/json',
      },
    });
  } catch (error) {
    if (error.response?.status !== 429 || attempt >= 4) {
      throw error;
    }

    const retryAfterSeconds = Number(error.response.headers['retry-after'] ?? 0);
    const delayMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
      ? retryAfterSeconds * 1000
      : (attempt + 1) * 1500;

    await new Promise(resolve => setTimeout(resolve, delayMs));
    return fetchNedPage(params, attempt + 1);
  }
}

function getResolutionMinutes(resolution) {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?$/.exec(resolution);
  if (!match) {
    throw new Error(`Unsupported resolution: ${resolution}`);
  }

  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  return hours * 60 + minutes;
}

function formatUtcHour(date) {
  return date.toISOString().slice(0, 13).replace('T', ' ') + ':00';
}

export async function parseEntsoeXml(xml) {
  const result = await parseStringPromise(xml);
  const timeseries = result['GL_MarketDocument']['TimeSeries'];
  const hourlyTotals = new Map();

  for (const series of timeseries) {
    for (const period of series['Period']) {
      const startTime = new Date(period['timeInterval'][0]['start'][0]);
      const resolutionMinutes = getResolutionMinutes(period['resolution'][0]);

      for (const point of period['Point']) {
        const position = parseInt(point['position'][0], 10) - 1;
        const pointTime = addMinutes(startTime, position * resolutionMinutes);
        const hourKey = formatUtcHour(pointTime);
        const quantityMw = parseFloat(point['quantity'][0]);
        const energyKwh = quantityMw * 1000 * (resolutionMinutes / 60);
        hourlyTotals.set(hourKey, (hourlyTotals.get(hourKey) ?? 0) + energyKwh);
      }
    }
  }

  return [...hourlyTotals.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([time, value]) => ({ time, value: Math.round(value) }));
}

export function writeJson(outputFile, data) {
  writeFileSync(outputFile, JSON.stringify(data, null, 2), 'utf8');
  console.log(`Data written to ${outputFile}`);
}
