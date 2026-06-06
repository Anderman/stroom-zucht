import { Injectable, effect, inject, signal } from '@angular/core';

import { EnergyDashboardDataService } from './energy-dashboard-data.service';
import { EnergyDashboardViewStore } from './energy-dashboard-view.store';
import { DatasetKey } from './energy-dashboard.types';

@Injectable({ providedIn: 'root' })
export class EnergyDashboardDataStore {
  private readonly dataService = inject(EnergyDashboardDataService);
  private readonly viewStore = inject(EnergyDashboardViewStore);

  readonly timestamps = signal<number[]>([]);
  readonly valuesByDataset = signal<Partial<Record<DatasetKey, number[]>>>({});
  readonly isLoading = signal(true);
  readonly errorMessage = signal<string | null>(null);

  constructor() {
    effect(() => {
      void this.loadDatasets(this.viewStore.selectedYear());
    });
  }

  scaleProfileToAnnualTarget(values: number[], targetAnnualKWh: number): number[] {
    return this.dataService.scaleProfileToAnnualTarget(values, targetAnnualKWh);
  }

  private async loadDatasets(year: number = 2025): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    try {
      const dataBundle = await this.dataService.loadDashboardDatasets(year);
      this.timestamps.set(dataBundle.timestamps);
      this.valuesByDataset.set(dataBundle.valuesByDataset);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Onbekende fout';
      this.errorMessage.set(`Data laden mislukt: ${message}`);
    } finally {
      this.isLoading.set(false);
    }
  }
}
