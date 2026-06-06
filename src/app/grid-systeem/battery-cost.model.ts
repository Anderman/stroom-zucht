import { getAnnuityPayment } from './energy-costs.model';

export type BatteryCostModelSettings = {
  energyCapacityTWh: number;
  chargePowerCapacityGW: number;
  dischargePowerCapacityGW: number;
  cellPricePerKWhEur: number;
  powerElectronicsCapexPerGWEur: number;
  manageCapexPerKWhAtReferenceCellEur: number;
  hallCapacityMWh: number;
  hallCapexPerHallEur: number;
  cellSizeKWh: number;
  lifetimeYears: number;
  interestRatePercent: number;
  opexPercentOfCapex: number;
};

export type BatteryCostScenarioDefinition = {
  label: string;
  powerElectronicsCapexPerGWEur: number;
  manageCapexPerKWhAtReferenceCellEur: number;
  hallCapacityMWh: number;
  hallCapexPerHallEur: number;
  noteText: string;
};

export type BatteryCostBreakdown = {
  energyCapacityGWh: number;
  requiredPowerCapacityGW: number;
  chargeDurationHours: number;
  dischargeDurationHours: number;
  cellCount: number;
  hallCount: number;
  cellCapex: number;
  powerElectronicsCapex: number;
  manageCapex: number;
  hallCapex: number;
  totalCapex: number;
  annualizedCapex: number;
  annualOpex: number;
  totalAnnualCost: number;
  capexPerStoredKWh: number;
  capexPerPowerKW: number;
};

export const BATTERY_REFERENCE_CELL_SIZE_KWH = 2;

export const BATTERY_COST_SCENARIOS: BatteryCostScenarioDefinition[] = [
  {
    label: 'Conservatief',
    powerElectronicsCapexPerGWEur: 250_000_000,
    manageCapexPerKWhAtReferenceCellEur: 6,
    hallCapacityMWh: 5714,
    hallCapexPerHallEur: 15_000_000,
    noteText: 'Zwaardere power block, meer beheer per celgroep en hogere hal- en automatiseringskosten.',
  },
  {
    label: 'Midden',
    powerElectronicsCapexPerGWEur: 150_000_000,
    manageCapexPerKWhAtReferenceCellEur: 4,
    hallCapacityMWh: 5714,
    hallCapexPerHallEur: 8_000_000,
    noteText: 'Werkmodel met gescheiden energie-, power-, beheer- en halkosten bij 700 HS/MS-stations.',
  },
  {
    label: 'Agressief',
    powerElectronicsCapexPerGWEur: 100_000_000,
    manageCapexPerKWhAtReferenceCellEur: 2,
    hallCapacityMWh: 5714,
    hallCapexPerHallEur: 4_000_000,
    noteText: 'Lage hal- en automatiseringskosten, dus onderkant van de bandbreedte bij 700 stations.',
  },
];

export function createDefaultBatteryCostModelSettings(): BatteryCostModelSettings {
  return {
    energyCapacityTWh: 4,
    chargePowerCapacityGW: 35,
    dischargePowerCapacityGW: 33,
    cellPricePerKWhEur: 20,
    powerElectronicsCapexPerGWEur: 150_000_000,
    manageCapexPerKWhAtReferenceCellEur: 4,
    hallCapacityMWh: 5714,
    hallCapexPerHallEur: 8_000_000,
    cellSizeKWh: 4,
    lifetimeYears: 30,
    interestRatePercent: 5,
    opexPercentOfCapex: 1.2,
  };
}

export function getBatteryCellSizePowerFactor(cellSizeKWh: number): number {
  if (cellSizeKWh <= 0) {
    return 0;
  }

  return BATTERY_REFERENCE_CELL_SIZE_KWH / cellSizeKWh;
}

export function getBatteryRequiredPowerCapacityGW(chargePowerCapacityGW: number, dischargePowerCapacityGW: number): number {
  return Math.max(chargePowerCapacityGW, dischargePowerCapacityGW);
}

export function getBatteryCostBreakdown(settings: BatteryCostModelSettings): BatteryCostBreakdown {
  if (settings.energyCapacityTWh <= 0) {
    return {
      energyCapacityGWh: 0, requiredPowerCapacityGW: 0, chargeDurationHours: 0, dischargeDurationHours: 0,
      cellCount: 0, hallCount: 0, cellCapex: 0, powerElectronicsCapex: 0, manageCapex: 0, hallCapex: 0,
      totalCapex: 0, annualizedCapex: 0, annualOpex: 0, totalAnnualCost: 0, capexPerStoredKWh: 0, capexPerPowerKW: 0,
    };
  }

  const energyCapacityGWh = settings.energyCapacityTWh * 1_000;
  const requiredPowerCapacityGW = getBatteryRequiredPowerCapacityGW(settings.chargePowerCapacityGW, settings.dischargePowerCapacityGW);
  const chargeDurationHours = settings.chargePowerCapacityGW > 0 ? energyCapacityGWh / settings.chargePowerCapacityGW : 0;
  const dischargeDurationHours = settings.dischargePowerCapacityGW > 0 ? energyCapacityGWh / settings.dischargePowerCapacityGW : 0;
  const cellCount = getBatteryCellCount(settings.energyCapacityTWh, settings.cellSizeKWh);
  const hallCount = getBatteryHallCount(settings.energyCapacityTWh, settings.hallCapacityMWh);
  const cellCapex = getBatteryCellCapex(settings.energyCapacityTWh, settings.cellPricePerKWhEur);
  const powerElectronicsCapex = getBatteryPowerElectronicsCapex(requiredPowerCapacityGW, settings.powerElectronicsCapexPerGWEur);
  const manageCapex = getBatteryManageCapex(settings.energyCapacityTWh, settings.manageCapexPerKWhAtReferenceCellEur, settings.cellSizeKWh);
  const hallCapex = getBatteryHallCapex(hallCount, settings.hallCapexPerHallEur);
  const totalCapex = cellCapex + powerElectronicsCapex + manageCapex + hallCapex;
  const annualizedCapex = getAnnuityPayment(totalCapex, settings.interestRatePercent / 100, settings.lifetimeYears);
  const annualOpex = totalCapex * settings.opexPercentOfCapex / 100;
  const totalAnnualCost = annualizedCapex + annualOpex;
  const capexPerStoredKWh = settings.energyCapacityTWh > 0 ? totalCapex / (settings.energyCapacityTWh * 1_000_000_000) : 0;
  const capexPerPowerKW = requiredPowerCapacityGW > 0 ? totalCapex / (requiredPowerCapacityGW * 1_000_000) : 0;

  return {
    energyCapacityGWh,
    requiredPowerCapacityGW,
    chargeDurationHours,
    dischargeDurationHours,
    cellCount,
    hallCount,
    cellCapex,
    powerElectronicsCapex,
    manageCapex,
    hallCapex,
    totalCapex,
    annualizedCapex,
    annualOpex,
    totalAnnualCost,
    capexPerStoredKWh,
    capexPerPowerKW,
  };
}

function getBatteryCellCapex(energyCapacityTWh: number, cellPricePerKWhEur: number): number {
  return energyCapacityTWh * 1_000_000_000 * cellPricePerKWhEur;
}

function getBatteryPowerElectronicsCapex(powerCapacityGW: number, powerElectronicsCapexPerGWEur: number): number {
  return powerCapacityGW * powerElectronicsCapexPerGWEur;
}

function getBatteryManageCapex(energyCapacityTWh: number, manageCapexPerKWhAtReferenceCellEur: number, cellSizeKWh: number): number {
  return energyCapacityTWh * 1_000_000_000 * manageCapexPerKWhAtReferenceCellEur * getBatteryCellSizePowerFactor(cellSizeKWh);
}

function getBatteryCellCount(energyCapacityTWh: number, cellSizeKWh: number): number {
  if (cellSizeKWh <= 0) {
    return 0;
  }

  return (energyCapacityTWh * 1_000_000_000) / cellSizeKWh;
}

function getBatteryHallCount(energyCapacityTWh: number, hallCapacityMWh: number): number {
  if (hallCapacityMWh <= 0) {
    return 0;
  }

  return (energyCapacityTWh * 1_000_000) / hallCapacityMWh;
}

function getBatteryHallCapex(hallCount: number, hallCapexPerHallEur: number): number {
  return hallCount * hallCapexPerHallEur;
}
