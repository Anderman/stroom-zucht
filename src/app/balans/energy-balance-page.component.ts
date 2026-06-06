import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { BalanceControlsComponent } from './balance-controls.component';
import { EnergyBalanceStore } from '../data/energy-balance.store';
import { EnergyDashboardChartPanelComponent } from '../shared/energy-dashboard-chart-panel.component';
import { EnergyDashboardPresentationStore } from '../data/energy-dashboard-presentation.store';
import { EnergyDashboardViewStore } from '../data/energy-dashboard-view.store';
import { DATASETS } from '../data/energy-dashboard.config';
import { statNumberFormatter } from '../core/formatters';
import { EnergyDashboardStore } from '../data/energy-dashboard.store';
import { DatasetConfig } from '../data/energy-dashboard.types';

@Component({
  selector: 'app-energy-balance-page',
  standalone: true,
  imports: [BalanceControlsComponent, EnergyDashboardChartPanelComponent],
  templateUrl: './energy-balance-page.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EnergyBalancePageComponent {
  protected readonly presentationStore = inject(EnergyDashboardPresentationStore);
  protected readonly store = inject(EnergyDashboardStore);
  protected readonly scenarioStore = inject(EnergyBalanceStore);
  protected readonly viewStore = inject(EnergyDashboardViewStore);
  protected readonly visibleDatasets: DatasetConfig[] = DATASETS.filter(dataset => dataset.key === 'balance' || dataset.key === 'publiccurtailment');
  readonly hydrogenRequiredInputDemandTWhText = computed(() => `${statNumberFormatter.format(this.scenarioStore.hydrogenProductionTargetTWh())} TWh/jaar`);
  readonly hydrogenDeliveredTWhText = computed(() => `${statNumberFormatter.format(this.store.hydrogenToFactoriesKWhTotal() / 1_000_000_000)} TWh/jaar`);
  readonly hydrogenInputGapTWhText = computed(() => {
    const required = this.scenarioStore.hydrogenProductionTargetTWh();
    const delivered = this.store.hydrogenToFactoriesKWhTotal() / 1_000_000_000;
    return `${statNumberFormatter.format(Math.max(0, required - delivered))} TWh/jaar`;
  });
  readonly hydrogenOutputCoverageText = computed(() => {
    const outputTarget = this.scenarioStore.hydrogenOutputTargetTWh();
    if (outputTarget <= 0) {
      return 'Geen outputdoel ingesteld';
    }

    const deliveredInput = this.store.hydrogenToFactoriesKWhTotal() / 1_000_000_000;
    const efficiency = this.scenarioStore.electrolyzerEfficiencyPercent() / 100;
    const achievedOutput = deliveredInput * efficiency;
    const coverage = Math.min(100, (achievedOutput / outputTarget) * 100);
    return `${statNumberFormatter.format(coverage)}% van outputdoel`;
  });

  constructor() {
    if (this.viewStore.activeDataset() !== 'balance') {
      this.viewStore.selectDataset('balance');
    }
  }
}
