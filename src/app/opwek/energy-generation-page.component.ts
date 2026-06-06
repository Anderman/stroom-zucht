import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { DATASETS } from '../data/energy-dashboard.config';
import { EnergyDashboardChartPanelComponent } from '../shared/energy-dashboard-chart-panel.component';
import { EnergyDashboardPresentationStore } from '../data/energy-dashboard-presentation.store';
import { EnergyDashboardStore } from '../data/energy-dashboard.store';
import { EnergyDashboardViewStore } from '../data/energy-dashboard-view.store';
import { DatasetConfig } from '../data/energy-dashboard.types';

@Component({
  selector: 'app-energy-generation-page',
  standalone: true,
  imports: [EnergyDashboardChartPanelComponent],
  templateUrl: './energy-generation-page.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EnergyGenerationPageComponent {
  protected readonly presentationStore = inject(EnergyDashboardPresentationStore);
  protected readonly store = inject(EnergyDashboardStore);
  protected readonly viewStore = inject(EnergyDashboardViewStore);
  protected readonly visibleDatasets: DatasetConfig[] = DATASETS.filter(dataset =>
    ['generationtotal', 'solar', 'windland', 'windzee'].includes(dataset.key),
  );

  constructor() {
    const activeDataset = this.viewStore.activeDataset();
    if (!this.visibleDatasets.some(dataset => dataset.key === activeDataset)) {
      this.viewStore.selectDataset('generationtotal');
    }
  }
}
