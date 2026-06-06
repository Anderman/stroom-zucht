import { Injectable } from '@angular/core';

import { getDatasets } from './energy-dashboard.config';
import { DatasetConfig, DatasetKey } from './energy-dashboard.types';

export type EnergyDashboardDataBundle = {
  timestamps: number[];
  valuesByDataset: Partial<Record<DatasetKey, number[]>>;
};

@Injectable({ providedIn: 'root' })
export class EnergyDashboardDataService {
  async loadDashboardDatasets(year: number = 2025): Promise<EnergyDashboardDataBundle> {
    const datasets = getDatasets(year);

    const requiredDatasets: Array<{ key: DatasetKey; file: string }> = [
      ...datasets.filter((dataset): dataset is DatasetConfig & { file: string } => Boolean(dataset.file) && !dataset.optional),
      { key: 'temperature', file: `data-array/temperatuur-${year}-uur-array.json` },
      ...(year === 2025 ? [{ key: 'price' as DatasetKey, file: 'data-array/stroomprijs-2025-uur-array.json' }] : []),
    ];

    const optionalDatasets: Array<{ key: DatasetKey; file: string }> =
      datasets.filter((dataset): dataset is DatasetConfig & { file: string } => Boolean(dataset.file) && Boolean(dataset.optional));

    const [timestampStrings, ...requiredSeries] = await Promise.all([
      this.fetchJson<string[]>(`data-array/timestamps-${year}-utc.json`),
      ...requiredDatasets.map(dataset => this.fetchJson<number[]>(dataset.file)),
    ]);

    const optionalResults = await Promise.all(
      optionalDatasets.map(dataset =>
        this.fetchJson<number[]>(dataset.file).then(data => ({ key: dataset.key, data })).catch(() => null),
      ),
    );

    const valuesByDataset: Partial<Record<DatasetKey, number[]>> = Object.fromEntries(
      requiredDatasets.map((dataset, index) => [dataset.key, requiredSeries[index]]),
    ) as Partial<Record<DatasetKey, number[]>>;

    for (const result of optionalResults) {
      if (result) {
        valuesByDataset[result.key] = result.data;
      }
    }

    return {
      timestamps: timestampStrings.map(value => Date.parse(value)),
      valuesByDataset,
    };
  }

  scaleProfileToAnnualTarget(values: number[], targetAnnualKWh: number): number[] {
    if (!values.length) {
      return [];
    }

    const baselineAnnualKWh = values.reduce((sum, value) => sum + value, 0);
    if (baselineAnnualKWh <= 0) {
      return values;
    }

    const scaleFactor = targetAnnualKWh / baselineAnnualKWh;
    return values.map(value => value * scaleFactor);
  }

  private async fetchJson<T>(url: string): Promise<T> {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  }
}
