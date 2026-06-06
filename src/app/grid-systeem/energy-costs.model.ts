import {
  CalculationTechnologyRow,
  NuclearCfdSettings,
  TechnologyCostDefinition,
  TechnologyCostKey,
  TechnologyCostValues,
} from '../data/energy-dashboard.types';

// Nederlandse aansluitingen (CBS 2024)
export const NL_HOUSEHOLDS = 8_200_000;
export const NL_BUSINESS_CONNECTIONS = 800_000;
// Aandeel huishoudens in totaal elektriciteitsverbruik (CBS Energiebalans ~35%)
export const HOUSEHOLD_CONSUMPTION_SHARE = 0.35;

// Energiebelasting elektriciteit 2025 (Belastingdienst)
export const ENERGY_TAX_HOUSEHOLD_CT_PER_KWH = 12.599; // eerste schijf ≤10.000 kWh/jr
export const ENERGY_TAX_BUSINESS_CT_PER_KWH = 5.264;  // tweede schijf 10.001–50.000 kWh/jr
// BTW: huishoudens betalen 21%, bedrijven verrekenen het
export const VAT_RATE = 0.21;

export const TECHNOLOGY_COST_DEFAULTS: Record<TechnologyCostKey, TechnologyCostDefinition> = {
  solarPublic: {
    capexPerUnitEur: 400_000_000,
    opexPerUnitEur: 7_000_000,
    lifetimeYears: 27.5,
    interestRatePercent: 5,
    costUnitText: 'mln/GW',
  },
  solarPrivate: {
    capexPerUnitEur: 900_000_000,
    opexPerUnitEur: 10_000_000,
    lifetimeYears: 25,
    interestRatePercent: 5,
    costUnitText: 'mln/GW',
  },
  windzee: {
    capexPerUnitEur: 1_300_000_000,
    opexPerUnitEur: 35_000_000,
    lifetimeYears: 27.5,
    interestRatePercent: 5,
    costUnitText: 'mln/GW',
  },
  offshoreConnection: {
    capexPerUnitEur: 1_400_000_000,
    opexPerUnitEur: 0,
    lifetimeYears: 40,
    interestRatePercent: 5,
    costUnitText: 'mln/GW',
  },
  windland: {
    capexPerUnitEur: 1_000_000_000,
    opexPerUnitEur: 18_000_000,
    lifetimeYears: 25,
    interestRatePercent: 5,
    costUnitText: 'mln/GW',
  },
  nuclear: {
    capexPerUnitEur: 14_000_000_000,
    opexPerUnitEur: 90_000_000,
    lifetimeYears: 60,
    interestRatePercent: 5,
    costUnitText: 'mln/GW',
  },
  borssele: {
    capexPerUnitEur: 0,
    opexPerUnitEur: 419_400_000,
    lifetimeYears: 1,
    interestRatePercent: 0,
    costUnitText: 'mln/GW',
  },
  afvalBiogas: {
    capexPerUnitEur: 0,
    opexPerUnitEur: 0,
    lifetimeYears: 1,
    interestRatePercent: 0,
    costUnitText: 'mln/GW',
  },
  hydrogenBackup: {
    capexPerUnitEur: 900_000_000,
    opexPerUnitEur: 20_000_000,
    lifetimeYears: 30,
    interestRatePercent: 5,
    costUnitText: 'mln/GW',
  },
  batteryPublic: {
    capexPerUnitEur: 250_000_000,
    opexPerUnitEur: 6_000_000,
    lifetimeYears: 30,
    interestRatePercent: 5,
    costUnitText: 'mln/GWh',
  },
  batteryPrivate: {
    capexPerUnitEur: 300_000_000,
    opexPerUnitEur: 7_000_000,
    lifetimeYears: 30,
    interestRatePercent: 5,
    costUnitText: 'mln/GWh',
  },
};

export function createDefaultTechnologyCosts(): Record<TechnologyCostKey, TechnologyCostValues> {
  return Object.fromEntries(
    Object.entries(TECHNOLOGY_COST_DEFAULTS).map(([key, value]) => [
      key,
      {
        capexPerUnitEur: value.capexPerUnitEur,
        opexPerUnitEur: value.opexPerUnitEur,
        lifetimeYears: value.lifetimeYears,
        interestRatePercent: value.interestRatePercent,
      },
    ]),
  ) as Record<TechnologyCostKey, TechnologyCostValues>;
}

export function createDefaultNuclearCfdSettings(): NuclearCfdSettings {
  return {
    cfdPeriodYears: 35,
    buildTimeYears: 15,
    interestRatePercent: 3.5,
  };
}

export function getAnnualTechnologyCost(capacity: number, capexPerUnitEur: number, opexPerUnitEur: number, lifetimeYears: number, interestRatePercent = 0): number {
  const annualizedCapex = getAnnuityPayment(capacity * capexPerUnitEur, interestRatePercent / 100, lifetimeYears);
  const annualOpex = capacity * opexPerUnitEur;
  return annualizedCapex + annualOpex;
}

export function getAnnualNuclearGenerationTWhForCost(capacityGW: number, nuclearFullLoadHours: number): number {
  return capacityGW * nuclearFullLoadHours / 1_000;
}

export function getAnnualNuclearCfdCost(
  capacityGW: number,
  configuredCosts: TechnologyCostValues,
  nuclearCfdSettings: NuclearCfdSettings,
): number {
  const interestRate = nuclearCfdSettings.interestRatePercent / 100;
  const effectiveCapexPerGW = configuredCosts.capexPerUnitEur * Math.pow(1 + interestRate, nuclearCfdSettings.buildTimeYears / 2);
  const annualCapitalCost = getAnnuityPayment(capacityGW * effectiveCapexPerGW, interestRate, nuclearCfdSettings.cfdPeriodYears);
  const annualOpex = capacityGW * configuredCosts.opexPerUnitEur;
  return annualCapitalCost + annualOpex;
}

export function getNuclearCfdNoteText(nuclearCfdSettings: NuclearCfdSettings, formatNumber: (value: number) => string): string {
  return `CfD ${formatNumber(nuclearCfdSettings.cfdPeriodYears)} jr · bouw ${formatNumber(nuclearCfdSettings.buildTimeYears)} jr · rente ${formatNumber(nuclearCfdSettings.interestRatePercent)}%`;
}

export function buildCalculationTechnologyRow(params: {
  costKey: TechnologyCostKey;
  label: string;
  capacityText: string;
  energyText: string;
  configuredCosts: TechnologyCostValues;
  annualCost: number;
  costUnitText: string;
  buildTimeInputValue?: number;
  costFromModel?: boolean;
  noteText?: string;
  formatNumber: (value: number) => string;
  formatCurrency: (value: number) => string;
  toMillionEuroInputValue: (valueEur: number) => number;
  annualEnergyMWh?: number;
  annualGenerationCost?: number;
  annualInfraCost?: number;
  annualPrivateCost?: number;
}): CalculationTechnologyRow {
  const annualEnergyMWh = params.annualEnergyMWh ?? 0;

  return {
    costKey: params.costKey,
    label: params.label,
    capacityText: params.capacityText,
    energyText: params.energyText,
    capexInputValue: params.toMillionEuroInputValue(params.configuredCosts.capexPerUnitEur),
    opexInputValue: params.toMillionEuroInputValue(params.configuredCosts.opexPerUnitEur),
    lifetimeInputValue: params.configuredCosts.lifetimeYears,
    interestRateInputValue: params.configuredCosts.interestRatePercent,
    buildTimeInputValue: params.buildTimeInputValue ?? 0,
    costFromModel: params.costFromModel ?? false,
    costUnitText: params.costUnitText,
    annualGenerationCostText: params.formatCurrency(params.annualGenerationCost ?? 0),
    annualCostText: params.formatCurrency(params.annualCost),
    annualInfraCostText: params.formatCurrency(params.annualInfraCost ?? 0),
    annualPrivateCostText: params.formatCurrency(params.annualPrivateCost ?? 0),
    pricePerMWhText: annualEnergyMWh > 0 ? `${params.formatNumber(params.annualCost / annualEnergyMWh)} EUR/MWh` : 'n.v.t.',
    noteText: params.noteText,
  };
}

export function getAnnuityPayment(principal: number, interestRate: number, years: number): number {
  if (years <= 0) {
    return 0;
  }
  if (interestRate <= 0) {
    return principal / years;
  }

  const annuityFactor = interestRate / (1 - Math.pow(1 + interestRate, -years));
  return principal * annuityFactor;
}
