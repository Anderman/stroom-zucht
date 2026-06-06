import { Injectable, computed, signal } from '@angular/core';

type HydrogenUseCase = {
  key: 'bunkering' | 'industry' | 'nonEnergyUse';
  label: string;
  demandPJ: number;
};

export type HydrogenUseCaseRow = {
  key: HydrogenUseCase['key'];
  label: string;
  demandTWh: number;
  demandPJ: number;
  annualImportCostEur: number;
};

const DEFAULT_USE_CASES: HydrogenUseCase[] = [
  { key: 'bunkering', label: 'Energieaanbod bunkering (CBS 2024)', demandPJ: 631.5 },
  { key: 'industry', label: 'Nijverheid totaal (CBS 2024)', demandPJ: 109.7 },
  { key: 'nonEnergyUse', label: 'Niet-energetisch gebruik totaal (CBS 2024)', demandPJ: 458.3 },
];

const TWH_TO_PJ = 3.6;
const PJ_TO_TWH = 1 / TWH_TO_PJ;
const HYDROGEN_KWH_PER_KG_LHV = 33.33;

@Injectable({ providedIn: 'root' })
export class HydrogenImportStore {
  readonly useCases = signal<HydrogenUseCase[]>(DEFAULT_USE_CASES);
  readonly importPriceEurPerKg = signal(6.5);
  readonly fixedAnnualCostEur = signal(0);

  readonly importPriceEurPerKWh = computed(() => this.importPriceEurPerKg() / HYDROGEN_KWH_PER_KG_LHV);

  readonly useCaseRows = computed<HydrogenUseCaseRow[]>(() => {
    const pricePerKWh = this.importPriceEurPerKWh();
    return this.useCases().map(useCase => ({
      key: useCase.key,
      label: useCase.label,
      demandTWh: useCase.demandPJ * PJ_TO_TWH,
      demandPJ: useCase.demandPJ,
      annualImportCostEur: useCase.demandPJ * PJ_TO_TWH * 1_000_000_000 * pricePerKWh,
    }));
  });

  readonly totalDemandTWh = computed(() => this.useCaseRows().reduce((sum, row) => sum + row.demandTWh, 0));
  readonly totalDemandPJ = computed(() => this.totalDemandTWh() * TWH_TO_PJ);
  readonly annualImportCostEur = computed(() => this.useCaseRows().reduce((sum, row) => sum + row.annualImportCostEur, 0));
  readonly totalAnnualCostEur = computed(() => this.annualImportCostEur() + this.fixedAnnualCostEur());

  setImportPriceEurPerKg(value: string): void {
    const parsedValue = Number(value);
    this.importPriceEurPerKg.set(Number.isFinite(parsedValue) ? Math.max(0, parsedValue) : 6.5);
  }

  setFixedAnnualCostEur(value: string): void {
    const parsedValue = Number(value);
    this.fixedAnnualCostEur.set(Number.isFinite(parsedValue) ? Math.max(0, parsedValue) * 1_000_000 : 0);
  }
}
