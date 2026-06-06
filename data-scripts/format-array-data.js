import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const YEAR = Number(process.argv[2]) || 2025;
const IS_LEAP_YEAR = (YEAR % 4 === 0 && YEAR % 100 !== 0) || YEAR % 400 === 0;
const OUTPUT_DIRS = ['./data-array', './public/data-array'];
const START_TIME_UTC = new Date(`${YEAR - 1}-12-31T23:00:00Z`);
const HOURS_PER_YEAR = IS_LEAP_YEAR ? 8784 : 8760;
// CBS gross targets for scaling raw ENTSO-E data to expected annual totals.
// Only needed for 2025 (ongoing year with incomplete data).
// For completed historical years, raw data is used as-is.
const CBS_GROSS_TARGETS_KWH = YEAR === 2025
  ? { windland: 16_731_000_000, windzee: 15_905_000_000 }
  : {};

const DATASETS = [
  {
    key: 'solar',
    rawFile: `./data-raw/zon-${YEAR}-uur-data.json`,
    arrayFile: `./data-array/zon-${YEAR}-uur-array.json`,
    readRows(rawData) {
      return rawData.map(row => ({ time: row.time, value: row.value }));
    },
  },
  {
    key: 'gas',
    rawFile: `./data-raw/aardgas-${YEAR}-uur-data.json`,
    arrayFile: `./data-array/aardgas-${YEAR}-uur-array.json`,
    optional: YEAR < 2021, // NED GasDistribution uurdata beschikbaar vanaf 2021
    readRows(rawData) {
      return rawData.map(([time, value]) => ({ time, value }));
    },
  },
  {
    key: 'electricity',
    rawFile: `./data-raw/elektriciteit-${YEAR}-uur-data.json`,
    arrayFile: `./data-array/elektriciteit-${YEAR}-uur-array.json`,
    readRows(rawData) {
      return rawData.map(row => ({ time: row.time, value: row.value }));
    },
  },
  {
    key: 'windland',
    rawFile: `./data-raw/windland-${YEAR}-uur-data.json`,
    arrayFile: `./data-array/windland-${YEAR}-uur-array.json`,
    readRows(rawData) {
      return rawData.map(row => ({ time: row.time, value: row.value }));
    },
  },
  {
    key: 'windzee',
    rawFile: `./data-raw/windzee-${YEAR}-uur-data.json`,
    arrayFile: `./data-array/windzee-${YEAR}-uur-array.json`,
    readRows(rawData) {
      return rawData.map(row => ({ time: row.time, value: row.value }));
    },
  },
  {
    key: 'windzeewind',
    rawFile: `./data-raw/windzee-potentieel-${YEAR}-uur-data.json`,
    arrayFile: `./data-array/windzee-potentieel-${YEAR}-uur-array.json`,
    optional: true,
    readRows(rawData) {
      return rawData.map(row => ({ time: row.time, value: row.value }));
    },
  },
  {
    key: 'transport',
    rawFile: `./data-raw/vervoer-${YEAR}-uur-data.json`,
    arrayFile: `./data-array/vervoer-${YEAR}-uur-array.json`,
    readRows(rawData) {
      return rawData.map(row => ({ time: row.time, value: row.value }));
    },
  },
  {
    key: 'temperature',
    rawFile: `./data-raw/temperatuur-${YEAR}-uur-data.json`,
    arrayFile: `./data-array/temperatuur-${YEAR}-uur-array.json`,
    readValues(expectedAxis) {
      return readHourlySeriesValues(this.rawFile, expectedAxis);
    },
  },
  ...(YEAR === 2025 ? [{
    key: 'price',
    rawFile: './data-raw/jeroen_punt_nl_dynamische_stroomprijzen_jaar_2025.csv',
    arrayFile: './data-array/stroomprijs-2025-uur-array.json',
    readValues(expectedAxis) {
      return readHourlyPriceValues(this.rawFile, expectedAxis);
    },
  }] : []),
];

function unquoteCsvValue(value) {
  return value.trim().replace(/^"|"$/g, '');
}

function parsePriceCsvRows(rawText, rawFile) {
  const lines = rawText.split(/\r?\n/).filter(Boolean);
  const [, ...rows] = lines;

  return rows.map((line, index) => {
    const parts = line.split(';').map(unquoteCsvValue);
    if (parts.length < 3) {
      throw new Error(`${rawFile} has an invalid CSV row at line ${index + 2}`);
    }

    const [, utcTime, priceText] = parts;
    const price = Number(priceText.replace(',', '.'));
    if (!Number.isFinite(price)) {
      throw new Error(`${rawFile} has an invalid price at line ${index + 2}`);
    }

    return {
      time: utcTime,
      value: price,
    };
  });
}

function roundPrice(value) {
  return Number(value.toFixed(6));
}

function fillMissingHourlyValues(values, rawFile) {
  const result = [...values];
  let missingCount = 0;

  for (let index = 0; index < result.length; index += 1) {
    if (result[index] != null) {
      continue;
    }

    missingCount += 1;

    let previousIndex = index - 1;
    while (previousIndex >= 0 && result[previousIndex] == null) {
      previousIndex -= 1;
    }

    let nextIndex = index + 1;
    while (nextIndex < result.length && result[nextIndex] == null) {
      nextIndex += 1;
    }

    const previousValue = previousIndex >= 0 ? result[previousIndex] : null;
    const nextValue = nextIndex < result.length ? result[nextIndex] : null;

    if (previousValue != null && nextValue != null) {
      const span = nextIndex - previousIndex;
      const offset = index - previousIndex;
      result[index] = roundPrice(previousValue + ((nextValue - previousValue) * offset) / span);
      continue;
    }

    if (previousValue != null) {
      result[index] = previousValue;
      continue;
    }

    if (nextValue != null) {
      result[index] = nextValue;
      continue;
    }

    throw new Error(`${rawFile} does not contain any hourly price values`);
  }

  if (missingCount > 0) {
    console.warn(`${rawFile} was missing ${missingCount} hourly price value(s); filled by interpolation.`);
  }

  return result;
}

function readHourlyPriceValues(rawFile, expectedAxis) {
  const rawText = readFileSync(rawFile, 'utf8');
  const rows = parsePriceCsvRows(rawText, rawFile);
  const valuesByHour = new Map();

  for (const row of rows) {
    const normalizedTime = new Date(row.time.replace(' ', 'T') + 'Z').toISOString();
    const hourTime = `${normalizedTime.slice(0, 13)}:00:00.000Z`;
    const hourValues = valuesByHour.get(hourTime) ?? [];
    hourValues.push(row.value);
    valuesByHour.set(hourTime, hourValues);
  }

  const hourlyValues = expectedAxis.map(timestamp => {
    const samples = valuesByHour.get(timestamp);
    if (!samples?.length) {
      return null;
    }

    const hourlyAverage = samples.reduce((sum, value) => sum + value, 0) / samples.length;
    return roundPrice(hourlyAverage);
  });

  return fillMissingHourlyValues(hourlyValues, rawFile);
}

function readHourlySeriesValues(rawFile, expectedAxis) {
  const rawData = JSON.parse(readFileSync(rawFile, 'utf8'));
  const valuesByHour = new Map(
    rawData.map(row => [normalizeUtcTimestamp(row.time), row.value]),
  );

  return expectedAxis.map(timestamp => {
    const value = valuesByHour.get(timestamp);
    if (value == null) {
      throw new Error(`${rawFile} mist uurwaarde voor ${timestamp}`);
    }

    return value;
  });
}

function buildExpectedAxis() {
  return Array.from({ length: HOURS_PER_YEAR }, (_, index) => {
    return new Date(START_TIME_UTC.getTime() + index * 60 * 60 * 1000).toISOString();
  });
}

function normalizeUtcTimestamp(value) {
  if (value.includes('T')) {
    return new Date(value).toISOString();
  }

  return new Date(value.replace(' ', 'T') + ':00Z').toISOString();
}

function scaleValuesToAnnualTarget(values, annualTargetKwh) {
  const sourceTotal = values.reduce((sum, value) => sum + value, 0);
  if (sourceTotal <= 0) {
    return values;
  }

  const scaleFactor = annualTargetKwh / sourceTotal;
  return values.map(value => Math.round(value * scaleFactor));
}

function normalizeDataset(dataset, expectedAxis) {
  if (typeof dataset.readValues === 'function') {
    const normalizedValues = dataset.readValues(expectedAxis);

    for (const outputDir of OUTPUT_DIRS) {
      const targetFile = dataset.arrayFile.replace('./data-array', outputDir);
      writeFileSync(targetFile, JSON.stringify(normalizedValues, null, 2), 'utf8');
      console.log(`Array written to ${targetFile}`);
    }

    return;
  }

  const rawData = JSON.parse(readFileSync(dataset.rawFile, 'utf8'));
  const rows = dataset.readRows(rawData);

  if (rows.length !== HOURS_PER_YEAR) {
    throw new Error(`${dataset.rawFile} has ${rows.length} rows instead of ${HOURS_PER_YEAR} (year ${YEAR})`);
  }

  const values = rows.map((row, index) => {
    const normalizedTime = normalizeUtcTimestamp(row.time);

    if (normalizedTime !== expectedAxis[index]) {
      throw new Error(`${dataset.rawFile} is misaligned at index ${index}: expected ${expectedAxis[index]}, got ${normalizedTime}`);
    }

    return row.value;
  });

  const annualTargetKwh = CBS_GROSS_TARGETS_KWH[dataset.key];
  const normalizedValues = annualTargetKwh
    ? scaleValuesToAnnualTarget(values, annualTargetKwh)
    : values;

  for (const outputDir of OUTPUT_DIRS) {
    const targetFile = dataset.arrayFile.replace('./data-array', outputDir);
    writeFileSync(targetFile, JSON.stringify(normalizedValues, null, 2), 'utf8');
    console.log(`Array written to ${targetFile}`);
  }
}

function writeSharedAxis(expectedAxis) {
  for (const outputDir of OUTPUT_DIRS) {
    const axisFile = `${outputDir}/timestamps-${YEAR}-utc.json`;
    writeFileSync(axisFile, JSON.stringify(expectedAxis, null, 2), 'utf8');
    console.log(`Axis written to ${axisFile}`);
  }
}

export function formatArrayData() {
  console.log(`Formatting array data for year ${YEAR} (${HOURS_PER_YEAR} hours)...`);
  for (const outputDir of OUTPUT_DIRS) {
    mkdirSync(outputDir, { recursive: true });
  }

  const expectedAxis = buildExpectedAxis();
  writeSharedAxis(expectedAxis);

  for (const dataset of DATASETS) {
    if (dataset.optional) {
      try {
        normalizeDataset(dataset, expectedAxis);
      } catch (error) {
        console.warn(`Optioneel dataset '${dataset.key}' overgeslagen: ${error.message}`);
      }
    } else {
      normalizeDataset(dataset, expectedAxis);
    }
  }
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  formatArrayData();
}
