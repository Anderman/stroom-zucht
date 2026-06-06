const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const monthFormatter = new Intl.DateTimeFormat('nl-NL', {
  day: 'numeric',
  month: 'short',
  timeZone: 'Europe/Amsterdam',
});

function getXAxisStepHours(xSpan: number): number {
  if (xSpan > 21 * DAY_MS) {
    return 24;
  }

  if (xSpan > 10 * DAY_MS) {
    return 24;
  }

  if (xSpan > 4 * DAY_MS) {
    return 12;
  }

  if (xSpan > 36 * HOUR_MS) {
    return 6;
  }

  if (xSpan > 18 * HOUR_MS) {
    return 4;
  }

  if (xSpan > 10 * HOUR_MS) {
    return 2;
  }

  return 1;
}

function getLocalParts(date: Date): { weekday: string; month: number; day: number; hour: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Amsterdam',
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));

  return {
    weekday: values['weekday'],
    day: Number(values['day']),
    month: Number(values['month']),
    hour: Number(values['hour']),
  };
}

function getLocalAxisParts(timestamp: number): { day: string; month: string; hour: string } {
  const { day, month, hour } = getLocalParts(new Date(timestamp));

  return {
    day: String(day).padStart(2, '0'),
    month: String(month).padStart(2, '0'),
    hour: String(hour).padStart(2, '0'),
  };
}

function isLocalHourAligned(timestamp: number, stepHours: number): boolean {
  const { hour } = getLocalParts(new Date(timestamp));
  return hour % stepHours === 0;
}

function isLocalMondayMidnight(timestamp: number): boolean {
  const { weekday, hour } = getLocalParts(new Date(timestamp));
  return weekday === 'Mon' && hour === 0;
}

function isLocalMonthStartMidnight(timestamp: number): boolean {
  const { day, hour } = getLocalParts(new Date(timestamp));
  return day === 1 && hour === 0;
}

export function getXAxisSplits(timestamps: number[], scaleMin: number, scaleMax: number): number[] {
  if (!Number.isFinite(scaleMin) || !Number.isFinite(scaleMax) || scaleMax <= scaleMin || !timestamps.length) {
    return [];
  }

  const xSpan = scaleMax - scaleMin;
  if (xSpan > 90 * DAY_MS) {
    return timestamps.filter(timestamp => {
      return timestamp >= scaleMin && timestamp <= scaleMax && isLocalMonthStartMidnight(timestamp);
    });
  }

  if (xSpan > 21 * DAY_MS) {
    return timestamps.filter(timestamp => {
      return timestamp >= scaleMin && timestamp <= scaleMax && isLocalMondayMidnight(timestamp);
    });
  }

  const stepHours = getXAxisStepHours(xSpan);
  return timestamps.filter(timestamp => {
    return timestamp >= scaleMin && timestamp <= scaleMax && isLocalHourAligned(timestamp, stepHours);
  });
}

export function formatXAxisValue(timestamp: number, xSpan: number): string {
  const { day, month, hour } = getLocalAxisParts(timestamp);
  const isMidnight = hour === '00';

  if (xSpan > 90 * DAY_MS) {
    return monthFormatter.format(timestamp);
  }

  if (xSpan > 21 * DAY_MS) {
    return `${day}-${month}`;
  }

  if (xSpan <= 2 * DAY_MS) {
    return isMidnight ? `${day}-${month}` : hour;
  }

  if (xSpan <= 6 * DAY_MS) {
    return isMidnight ? `${day}-${month}` : hour;
  }

  return `${day}-${month}`;
}

export function getRankXAxisSplits(values: number[], scaleMin: number, scaleMax: number): number[] {
  if (!Number.isFinite(scaleMin) || !Number.isFinite(scaleMax) || scaleMax <= scaleMin || !values.length) {
    return [];
  }

  const span = scaleMax - scaleMin;
  const roughStep = span > 5000
    ? 1000
    : span > 2000
      ? 500
      : span > 1000
        ? 250
        : span > 400
          ? 100
          : span > 160
            ? 50
            : span > 80
              ? 20
              : span > 30
                ? 10
                : 5;

  return values.filter(value => value >= scaleMin && value <= scaleMax && ((value - 1) % roughStep === 0 || value === 1));
}

export function formatRankXAxisValue(rank: number): string {
  return `${Math.round(rank)}`;
}
