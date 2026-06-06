import { BatteryCostModelSettings } from '../grid-systeem/battery-cost.model';
import { NuclearCfdSettings, TechnologyCostValues } from '../data/energy-dashboard.types';

export type PersistedTechnologyCosts<T extends string> = Partial<Record<T, Partial<Record<keyof TechnologyCostValues, unknown>>>>;

export type PersistedBalanceSettings = {
  batteryCapacityGWh?: unknown;
  batteryCostModelSettings?: unknown;
  hydrogenProductionEnabled?: unknown;
  hydrogenProductionTargetTWh?: unknown;
  hydrogenOutputTargetTWh?: unknown;
  electrolyzerEfficiencyPercent?: unknown;
  hydrogenDedicatedOffshoreWindCapacityGW?: unknown;
  hydrogenElectrolyzerCapacityGW?: unknown;
  hydrogenGridImportLimitGW?: unknown;
  hydrogenGridExportLimitGW?: unknown;
  hydrogenSystemCostSettings?: unknown;
  privateDemandShare?: unknown;
  privateGridMaxLoadGW?: unknown;
  privateBatteryCapacityGWh?: unknown;
  privateSolarCapacityGW?: unknown;
  solarCapacityGW?: unknown;
  solarFullLoadHours?: unknown;
  windlandCapacityGW?: unknown;
  windlandFullLoadHours?: unknown;
  windzeeCapacityGW?: unknown;
  windzeeFullLoadHours?: unknown;
  nuclearCapacityGW?: unknown;
  nuclearFullLoadHours?: unknown;
  technologyCosts?: unknown;
  nuclearCfdSettings?: unknown;
};

export function readPersistedBalanceSettings(storageKey: string): PersistedBalanceSettings | null {
  const storage = getLocalStorage();
  if (!storage) {
    return null;
  }

  const rawValue = storage.getItem(storageKey);
  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue) as PersistedBalanceSettings;
  } catch {
    storage.removeItem(storageKey);
    return null;
  }
}

export function writePersistedBalanceSettings(storageKey: string, settings: PersistedBalanceSettings): void {
  const storage = getLocalStorage();
  if (!storage) {
    return;
  }

  storage.setItem(storageKey, JSON.stringify(settings));
}

export function parseStoredNumber(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(value, 0);
}

export function parseStoredPercentage(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(1, Math.max(0, value));
}

export function parseStoredBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value !== 'boolean') {
    return fallback;
  }

  return value;
}

export function parseStoredTechnologyCosts<T extends string>(
  value: unknown,
  defaults: Record<T, TechnologyCostValues>,
): Record<T, TechnologyCostValues> {
  if (!value || typeof value !== 'object') {
    return defaults;
  }

  const storedCosts = value as PersistedTechnologyCosts<T>;
  const parsedCosts = { ...defaults };

  for (const costKey of Object.keys(defaults) as T[]) {
    const storedTechnology = storedCosts[costKey];
    if (!storedTechnology || typeof storedTechnology !== 'object') {
      continue;
    }

    parsedCosts[costKey] = {
      capexPerUnitEur: parseStoredNumber(storedTechnology.capexPerUnitEur, defaults[costKey].capexPerUnitEur),
      opexPerUnitEur: parseStoredNumber(storedTechnology.opexPerUnitEur, defaults[costKey].opexPerUnitEur),
      lifetimeYears: parseStoredNumber(storedTechnology.lifetimeYears, defaults[costKey].lifetimeYears),
      interestRatePercent: parseStoredNumber(storedTechnology.interestRatePercent, defaults[costKey].interestRatePercent),
    };
  }

  return parsedCosts;
}

export function parseStoredBatteryCostModelSettings(value: unknown, defaults: BatteryCostModelSettings): BatteryCostModelSettings {
  if (!value || typeof value !== 'object') {
    return defaults;
  }

  const storedSettings = value as Partial<Record<keyof BatteryCostModelSettings, unknown>>;
  return {
    energyCapacityTWh: parseStoredNumber(storedSettings.energyCapacityTWh, defaults.energyCapacityTWh),
    chargePowerCapacityGW: parseStoredNumber(storedSettings.chargePowerCapacityGW, defaults.chargePowerCapacityGW),
    dischargePowerCapacityGW: parseStoredNumber(storedSettings.dischargePowerCapacityGW, defaults.dischargePowerCapacityGW),
    cellPricePerKWhEur: parseStoredNumber(storedSettings.cellPricePerKWhEur, defaults.cellPricePerKWhEur),
    powerElectronicsCapexPerGWEur: parseStoredNumber(storedSettings.powerElectronicsCapexPerGWEur, defaults.powerElectronicsCapexPerGWEur),
    manageCapexPerKWhAtReferenceCellEur: parseStoredNumber(storedSettings.manageCapexPerKWhAtReferenceCellEur, defaults.manageCapexPerKWhAtReferenceCellEur),
    hallCapacityMWh: parseStoredNumber((storedSettings as Record<string, unknown>)['hallCapacityMWh'] ?? (storedSettings as Record<string, unknown>)['containerNetMWh'], defaults.hallCapacityMWh),
    hallCapexPerHallEur: parseStoredNumber((storedSettings as Record<string, unknown>)['hallCapexPerHallEur'], defaults.hallCapexPerHallEur),
    cellSizeKWh: parseStoredNumber(storedSettings.cellSizeKWh, defaults.cellSizeKWh),
    lifetimeYears: parseStoredNumber(storedSettings.lifetimeYears, defaults.lifetimeYears),
    interestRatePercent: parseStoredNumber(storedSettings.interestRatePercent, defaults.interestRatePercent),
    opexPercentOfCapex: parseStoredNumber(storedSettings.opexPercentOfCapex, defaults.opexPercentOfCapex),
  };
}

export function parseStoredNuclearCfdSettings(value: unknown, defaults: NuclearCfdSettings): NuclearCfdSettings {
  if (!value || typeof value !== 'object') {
    return defaults;
  }

  const storedSettings = value as Partial<Record<keyof NuclearCfdSettings, unknown>>;
  return {
    cfdPeriodYears: parseStoredNumber(storedSettings.cfdPeriodYears, defaults.cfdPeriodYears),
    buildTimeYears: parseStoredNumber(storedSettings.buildTimeYears, defaults.buildTimeYears),
    interestRatePercent: parseStoredNumber(storedSettings.interestRatePercent, defaults.interestRatePercent),
  };
}

function getLocalStorage(): Storage | null {
  return typeof window !== 'undefined' ? window.localStorage : null;
}
