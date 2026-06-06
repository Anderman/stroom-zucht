import { mkdirSync, writeFileSync } from 'fs';

// CBS Statline: Finaal energieverbruik Vervoer – aardolie + aardgas, omgezet naar TWh (PJ / 3.6).
// Aardgas 2025 niet beschikbaar in CBS; alleen aardolie gebruikt.
const CBS_TRANSPORT_FOSSIL_TWH = {
  2020: (337.8 + 2.5) / 3.6,  // 94.53
  2021: (340.4 + 2.6) / 3.6,  // 95.28
  2022: (337.7 + 2.7) / 3.6,  // 94.56
  2023: (354.9 + 2.5) / 3.6,  // 99.28
  2024: (338.8 + 2.9) / 3.6,  // 94.92
  2025: 323.7 / 3.6,           // 89.92 (alleen aardolie, gas niet beschikbaar)
};
const TRANSPORT_EFFICIENCY_FACTOR = 3.75;
const SHIFTABLE_SHARE = 0.5;
// Typical Dutch EV smart-charging intraday weights (hour 0–23).
// Higher at night (cheapest grid), lower during evening peak.
const HOUR_OF_DAY_CHARGING_WEIGHTS = [
  1.6, 1.9, 2.0, 2.0, 1.9, 1.5, // 00–05 overnight peak
  1.1, 0.9, 0.8, 0.8, 0.9, 1.0, // 06–11 morning
  1.0, 1.0, 0.9, 0.8, 0.6, 0.4, // 12–17 afternoon → evening drop
  0.4, 0.5, 0.7, 0.9, 1.2, 1.5, // 18–23 recovery
];
const NOVE_2025_MONTHLY_FUEL_SALES_ML = [841, 816, 899, 905, 855, 830, 871, 731, 850, 910, 822, 878];
const WEEKDAY_FACTORS = {
  Mon: 77265.3,
  Tue: 77917.4,
  Wed: 75545.9,
  Thu: 80739.5,
  Fri: 74082.8,
  Sat: 68676.2,
  Sun: 60188.9,
};

const localTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Amsterdam',
  year: 'numeric',
  weekday: 'short',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  hourCycle: 'h23',
});

const totalMonthlyFuelSales = NOVE_2025_MONTHLY_FUEL_SALES_ML.reduce((sum, value) => sum + value, 0);

// Proxy monthly road-transport activity with 2025 NOVE/CBS fuel sales totals.
const monthShares = NOVE_2025_MONTHLY_FUEL_SALES_ML.map(value => value / totalMonthlyFuelSales);


function getLocalParts(date) {
  const parts = localTimeFormatter.formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));

  return {
    year: Number(values.year),
    weekday: values.weekday,
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
  };
}

function buildMonthlyTargets(totalTargetKWh) {
  return monthShares.map(share => share * totalTargetKWh);
}

function buildDayGroups(startTimeUtc, hoursPerYear) {
  const groupedDays = new Map();

  for (let index = 0; index < hoursPerYear; index += 1) {
    const time = new Date(startTimeUtc.getTime() + index * 60 * 60 * 1000);
    const localParts = getLocalParts(time);
    const dayKey = `${localParts.year}-${String(localParts.month).padStart(2, '0')}-${String(localParts.day).padStart(2, '0')}`;
    const current = groupedDays.get(dayKey);

    if (current) {
      current.indices.push(index);
      continue;
    }

    groupedDays.set(dayKey, {
      dayKey,
      month: localParts.month,
      weekday: localParts.weekday,
      indices: [index],
    });
  }

  return Array.from(groupedDays.values());
}

function buildShiftableHourWeights(dayGroup, startTimeUtc) {
  const hourWeights = dayGroup.indices.map(index => {
    const time = new Date(startTimeUtc.getTime() + index * 3_600_000);
    const { hour } = getLocalParts(time);
    return HOUR_OF_DAY_CHARGING_WEIGHTS[hour] ?? 1;
  });
  const total = hourWeights.reduce((sum, w) => sum + w, 0);
  return total > 0
    ? hourWeights.map(w => w / total)
    : dayGroup.indices.map(() => 1 / dayGroup.indices.length);
}

function buildHourlyValues(monthlyTargetsKWh, startTimeUtc, hoursPerYear) {
  const hourlyValues = Array.from({ length: hoursPerYear }, () => 0);
  const dayGroups = buildDayGroups(startTimeUtc, hoursPerYear);
  const groupsByMonth = new Map();

  for (const dayGroup of dayGroups) {
    const groups = groupsByMonth.get(dayGroup.month) ?? [];
    groups.push(dayGroup);
    groupsByMonth.set(dayGroup.month, groups);
  }

  for (const [month, monthDayGroups] of groupsByMonth.entries()) {
    const monthTargetKWh = monthlyTargetsKWh[month - 1] ?? 0;
    const totalMonthWeight = monthDayGroups.reduce((sum, dayGroup) => {
      return sum + (WEEKDAY_FACTORS[dayGroup.weekday] ?? 1);
    }, 0);

    for (const dayGroup of monthDayGroups) {
      const dayWeight = WEEKDAY_FACTORS[dayGroup.weekday] ?? 1;
      const dayTargetKWh = totalMonthWeight > 0 ? (monthTargetKWh * dayWeight) / totalMonthWeight : 0;
      const fixedTargetKWh = dayTargetKWh * (1 - SHIFTABLE_SHARE);
      const shiftableTargetKWh = dayTargetKWh * SHIFTABLE_SHARE;
      const fixedHourlyValue = dayGroup.indices.length > 0 ? fixedTargetKWh / dayGroup.indices.length : 0;
      const shiftableHourWeights = buildShiftableHourWeights(dayGroup, startTimeUtc);

      dayGroup.indices.forEach((index, offset) => {
        hourlyValues[index] = fixedHourlyValue + (shiftableTargetKWh * (shiftableHourWeights[offset] ?? 0));
      });
    }
  }

  return hourlyValues;
}

export function downloadTransport(year = 2025, outputFile = `./data-raw/vervoer-${year}-uur-data.json`) {
  const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const startTimeUtc = new Date(`${year - 1}-12-31T23:00:00Z`);
  const hoursPerYear = isLeapYear ? 8784 : 8760;

  mkdirSync('./data-raw', { recursive: true });
  const baselineTwh = CBS_TRANSPORT_FOSSIL_TWH[year] ?? CBS_TRANSPORT_FOSSIL_TWH[2025];
  const targetTotalKWh = (baselineTwh / TRANSPORT_EFFICIENCY_FACTOR) * 1_000_000_000;
  const monthlyTargetsKWh = buildMonthlyTargets(targetTotalKWh);
  const hourlyValues = buildHourlyValues(monthlyTargetsKWh, startTimeUtc, hoursPerYear);
  const data = Array.from({ length: hoursPerYear }, (_, index) => ({
    time: new Date(startTimeUtc.getTime() + index * 60 * 60 * 1000).toISOString(),
    value: hourlyValues[index],
  }));

  writeFileSync(outputFile, JSON.stringify(data, null, 2), 'utf8');
  console.log(`Transport profile written to ${outputFile}`);
}

if (process.argv[1]?.endsWith('download-transport.js')) {
  const year = Number(process.argv[2]) || 2025;
  downloadTransport(year);
}
