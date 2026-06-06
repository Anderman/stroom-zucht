export type DatasetKey = 'solar' | 'electricity' | 'electricitysolar' | 'gas' | 'windland' | 'windzee' | 'windzeewind' | 'transport' | 'totaldemand' | 'generationtotal' | 'balance' | 'publiccurtailment' | 'price' | 'temperature';
export type ChartScale = 'y' | 'price' | 'temperature' | 'soc';
export type BalanceChartMode = 'timeline' | 'sorted';
export type ChartXAxisMode = 'time' | 'rank';

export type DatasetConfig = {
  key: DatasetKey;
  label: string;
  description: string;
  peakUnit: string;
  totalUnit: string;
  color: string;
  xAxisLabel?: string;
  file?: string;
  optional?: boolean;
  pointScale: number;
  totalScale: number;
};

export type ChartSeries = {
  label: string;
  color: string;
  values: number[];
  scale?: ChartScale;
  fill?: string;
  dash?: number[];
  width?: number;
  alpha?: number;
  hideFromLegend?: boolean;
};

export type ChartLegendItem = {
  label: string;
  color: string;
  dashed: boolean;
  active: boolean;
};

export type TechnologyCostKey =
  | 'solarPublic'
  | 'solarPrivate'
  | 'windzee'
  | 'offshoreConnection'
  | 'windland'
  | 'nuclear'
  | 'borssele'
  | 'afvalBiogas'
  | 'hydrogenBackup'
  | 'batteryPublic'
  | 'batteryPrivate';

export type TechnologyCostValues = {
  capexPerUnitEur: number;
  opexPerUnitEur: number;
  lifetimeYears: number;
  interestRatePercent: number;
};

export type TechnologyCostDefinition = {
  capexPerUnitEur: number;
  opexPerUnitEur: number;
  lifetimeYears: number;
  interestRatePercent: number;
  costUnitText: string;
};

export type HydrogenSystemMetrics = {
  targetOutputKWh: number;
  targetInputKWh: number;
  producedOutputKWh: number;
  dedicatedWindInputKWh: number;
  gridInputKWh: number;
  surplusKWh: number;
  shortageKWh: number;
  potentialGridExportKWh: number;
  actualGridExportKWh: number;
};

export type NuclearCfdSettings = {
  cfdPeriodYears: number;
  buildTimeYears: number;
  interestRatePercent: number;
};

export type BreakdownItem = {
  label: string;
  color: string;
  valueText: string;
};

export type DemandSummaryItem = {
  label: string;
  color: string;
  totalText: string;
  shareText: string;
};

export type CalculationTechnologyRow = {
  costKey: TechnologyCostKey;
  label: string;
  capacityText: string;
  energyText: string;
  capexInputValue: number;
  opexInputValue: number;
  lifetimeInputValue: number;
  interestRateInputValue: number;
  buildTimeInputValue: number;
  costFromModel: boolean;
  costUnitText: string;
  annualGenerationCostText: string;
  annualCostText: string;
  annualInfraCostText: string;
  annualPrivateCostText: string;
  pricePerMWhText: string;
  noteText?: string;
};

export type CalculationScenarioRow = {
  label: string;
  annualCostText: string;
  priceText: string;
  noteText: string;
};

export type BatteryCostSummaryItem = {
  label: string;
  valueText: string;
  noteText: string;
};

export type BatteryCostScenarioItem = {
  label: string;
  valueText: string;
  noteText: string;
};

export type XWindow = {
  min: number;
  max: number;
};

export type HoverPosition = {
  left: number;
  top: number;
};

export type TimeRange = {
  start: number;
  end: number;
};
