import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';

import { EnergyCostsStore } from './energy-costs.store';
import { EnergyDashboardPresentationStore } from '../data/energy-dashboard-presentation.store';

type CalculationTab = 'delivery' | 'costs' | 'scenarios' | 'battery';

@Component({
  selector: 'app-energy-dashboard-calculations-panel',
  standalone: true,
  templateUrl: './energy-dashboard-calculations-panel.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EnergyDashboardCalculationsPanelComponent {
  protected readonly costsStore = inject(EnergyCostsStore);
  protected readonly presentationStore = inject(EnergyDashboardPresentationStore);
  protected readonly activeTab = signal<CalculationTab>('delivery');

  protected selectTab(tab: CalculationTab): void {
    this.activeTab.set(tab);
  }
}
