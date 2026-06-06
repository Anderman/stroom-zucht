import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { BalanceControlsComponent } from '../balans/balance-controls.component';
import { EnergyBalanceStore } from '../data/energy-balance.store';
import { EnergyCostsStore } from './energy-costs.store';
import { EnergyDashboardCalculationsPanelComponent } from './energy-dashboard-calculations-panel.component';
import { EnergyDashboardPresentationStore } from '../data/energy-dashboard-presentation.store';
import { EnergyDashboardViewStore } from '../data/energy-dashboard-view.store';
import { EnergyDashboardStore } from '../data/energy-dashboard.store';

@Component({
  selector: 'app-energy-costs-page',
  standalone: true,
  imports: [BalanceControlsComponent, EnergyDashboardCalculationsPanelComponent],
  templateUrl: './energy-costs-page.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EnergyCostsPageComponent {
  protected readonly presentationStore = inject(EnergyDashboardPresentationStore);
  protected readonly store = inject(EnergyDashboardStore);
  protected readonly balanceStore = inject(EnergyBalanceStore);
  protected readonly costsStore = inject(EnergyCostsStore);
  protected readonly viewStore = inject(EnergyDashboardViewStore);

  constructor() {
    if (this.viewStore.activeDataset() !== 'balance') {
      this.viewStore.selectDataset('balance');
    }
  }
}
