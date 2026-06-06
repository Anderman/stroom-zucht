import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';

import { EnergyChartComponent } from './energy-chart.component';
import { EnergyDashboardDataStore } from '../data/energy-dashboard-data.store';
import { EnergyDashboardPresentationStore } from '../data/energy-dashboard-presentation.store';
import { EnergyDashboardStore } from '../data/energy-dashboard.store';
import { EnergyDashboardViewStore } from '../data/energy-dashboard-view.store';

@Component({
  selector: 'app-energy-dashboard-chart-panel',
  standalone: true,
  imports: [EnergyChartComponent],
  templateUrl: './energy-dashboard-chart-panel.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EnergyDashboardChartPanelComponent {
  protected readonly dataStore = inject(EnergyDashboardDataStore);
  protected readonly presentationStore = inject(EnergyDashboardPresentationStore);
  protected readonly store = inject(EnergyDashboardStore);
  protected readonly viewStore = inject(EnergyDashboardViewStore);
  protected readonly isChartMaximized = signal(false);

  protected toggleChartMaximized(): void {
    this.isChartMaximized.update(current => !current);
  }
}
