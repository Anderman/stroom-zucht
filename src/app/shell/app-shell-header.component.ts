import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { EnergyDashboardPresentationStore } from '../data/energy-dashboard-presentation.store';
import { EnergyDashboardViewStore } from '../data/energy-dashboard-view.store';
import { SUPPORTED_YEARS, SupportedYear } from '../data/energy-dashboard.config';
import { EnergyDashboardStore } from '../data/energy-dashboard.store';
import { ThemeService } from '../core/theme.service';

@Component({
  selector: 'app-shell-header',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './app-shell-header.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppShellHeaderComponent {
  protected readonly presentationStore = inject(EnergyDashboardPresentationStore);
  protected readonly store = inject(EnergyDashboardStore);
  protected readonly viewStore = inject(EnergyDashboardViewStore);
  protected readonly themeService = inject(ThemeService);
  protected readonly supportedYears: readonly SupportedYear[] = SUPPORTED_YEARS;
  protected readonly mainTabs = [
    { label: 'Verbruik', path: '/verbruik' },
    { label: 'Opwek', path: '/opwek' },
    { label: 'Balans', path: '/balans' },
    { label: 'Grid systeem', path: '/berekeningen' },
    { label: 'Waterstof systeem', path: '/waterstof-import' },
    { label: 'Uitleg', path: '/uitleg' },
  ];
}
