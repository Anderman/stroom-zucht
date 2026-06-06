import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';

import { DATASETS } from '../data/energy-dashboard.config';
import { EnergyDashboardChartPanelComponent } from '../shared/energy-dashboard-chart-panel.component';
import { EnergyDashboardPresentationStore } from '../data/energy-dashboard-presentation.store';
import { EnergyDashboardStore } from '../data/energy-dashboard.store';
import { EnergyDashboardViewStore } from '../data/energy-dashboard-view.store';
import { DatasetConfig } from '../data/energy-dashboard.types';

@Component({
  selector: 'app-energy-consumption-page',
  standalone: true,
  imports: [EnergyDashboardChartPanelComponent],
  templateUrl: './energy-consumption-page.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EnergyConsumptionPageComponent {
  protected readonly presentationStore = inject(EnergyDashboardPresentationStore);
  protected readonly store = inject(EnergyDashboardStore);
  protected readonly viewStore = inject(EnergyDashboardViewStore);
  protected readonly visibleDatasets: DatasetConfig[] = DATASETS.filter(dataset =>
    ['totaldemand', 'electricity', 'gas', 'transport'].includes(dataset.key),
  );
  protected readonly isCbsImageDialogOpen = signal(false);
  protected readonly cbsConsumptionImageUrl = 'Energie.png';
  protected readonly cbsConsumptionSourceUrl = 'https://opendata.cbs.nl/#/CBS/nl/dataset/83140NED/table';

  constructor() {
    const activeDataset = this.viewStore.activeDataset();
    if (!this.visibleDatasets.some(dataset => dataset.key === activeDataset)) {
      this.viewStore.selectDataset('totaldemand');
    }
  }

  protected openCbsImageDialog(): void {
    this.isCbsImageDialogOpen.set(true);
  }

  protected closeCbsImageDialog(): void {
    this.isCbsImageDialogOpen.set(false);
  }
}
