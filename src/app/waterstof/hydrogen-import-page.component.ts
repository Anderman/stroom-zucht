import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { EnergyBalanceStore } from '../data/energy-balance.store';
import { EnergyCostsStore } from '../grid-systeem/energy-costs.store';
import { EnergyDashboardStore } from '../data/energy-dashboard.store';

@Component({
  selector: 'app-hydrogen-import-page',
  standalone: true,
  templateUrl: './hydrogen-import-page.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HydrogenImportPageComponent {
  protected readonly balanceStore = inject(EnergyBalanceStore);
  protected readonly dashboardStore = inject(EnergyDashboardStore);
  protected readonly costsStore = inject(EnergyCostsStore);

  protected readonly hydrogenSystem = this.dashboardStore.hydrogenSystem;
  protected readonly h2CostSettings = this.costsStore.hydrogenSystemCostSettings;
  protected readonly h2CostSummary = this.costsStore.hydrogenSystemCostSummary;

  protected readonly isCbsDialogOpen = signal(false);
  protected readonly cbsWaterstofImageUrl = 'Waterstof.png';
  protected readonly cbsWaterstofSourceUrl = 'https://opendata.cbs.nl/statline/#/CBS/nl/';

  protected openCbsDialog(): void {
    this.isCbsDialogOpen.set(true);
  }

  protected closeCbsDialog(): void {
    this.isCbsDialogOpen.set(false);
  }

  protected readonly targetOutputText = computed(() => {
    return `${this.formatNumber(this.balanceStore.hydrogenOutputTargetTWh(), 1)} TWh/jaar`;
  });
  protected readonly targetInputText = computed(() => {
    return `${this.formatNumber(this.hydrogenSystem().targetInputKWh / 1_000_000_000, 1)} TWh/jaar input nodig`;
  });

  protected readonly producedOutputText = computed(() => {
    return `${this.formatNumber(this.hydrogenSystem().producedOutputKWh / 1_000_000_000, 1)} TWh/jaar`;
  });

  protected readonly coverageText = computed(() => {
    const system = this.hydrogenSystem();
    if (system.targetOutputKWh <= 0) {
      return 'Geen doel ingesteld';
    }

    return `${this.formatNumber((system.producedOutputKWh / system.targetOutputKWh) * 100, 1)}% van het outputdoel gehaald`;
  });

  protected readonly shortageText = computed(() => {
    return `${this.formatNumber(this.hydrogenSystem().shortageKWh / 1_000_000_000, 1)} TWh/jaar ongedekt`;
  });

  protected readonly surplusText = computed(() => {
    return `${this.formatNumber(this.hydrogenSystem().surplusKWh / 1_000_000_000, 1)} TWh/jaar overschot`;
  });

  protected readonly dedicatedWindText = computed(() => {
    return `${this.formatNumber(this.balanceStore.hydrogenDedicatedOffshoreWindCapacityGW(), 1)} GW offshore gereserveerd`;
  });

  protected readonly electrolyzerCapacityText = computed(() => {
    return `${this.formatNumber(this.balanceStore.hydrogenElectrolyzerCapacityGW(), 1)} GW elektrolyse`;
  });

  protected readonly gridImportLimitText = computed(() => {
    return this.balanceStore.hydrogenGridImportLimitGW() > 0
      ? `${this.formatNumber(this.balanceStore.hydrogenGridImportLimitGW(), 1)} GW`
      : 'onbeperkt';
  });

  protected readonly gridExportLimitText = computed(() => {
    return this.balanceStore.hydrogenGridExportLimitGW() > 0
      ? `${this.formatNumber(this.balanceStore.hydrogenGridExportLimitGW(), 1)} GW`
      : 'uit';
  });

  protected readonly gridInputText = computed(() => {
    return `${this.formatNumber(this.hydrogenSystem().gridInputKWh / 1_000_000_000, 1)} TWh/jaar uit grid-overschot`;
  });

  protected readonly windToBatteryText = computed(() => {
    return `${this.formatNumber(this.hydrogenSystem().dedicatedWindToBatteryKWh / 1_000_000_000, 1)} TWh/jaar naar opslag`;
  });

  protected readonly batteryToElectrolyserText = computed(() => {
    return `${this.formatNumber(this.hydrogenSystem().batteryToElectrolyserKWh / 1_000_000_000, 1)} TWh/jaar uit opslag`;
  });

  protected readonly batteryCapacityText = computed(() => {
    return `${this.formatNumber(this.balanceStore.hydrogenBatteryCapacityGWh() / 1_000, 1)} TWh`;
  });

  protected readonly batteryFinalSoCText = computed(() => {
    return `${this.formatNumber(this.hydrogenSystem().batteryFinalSoCKWh / 1_000_000_000, 1)} TWh`;
  });

  protected readonly dedicatedWindInputText = computed(() => {
    const system = this.hydrogenSystem();
    const totalDirect = system.dedicatedWindInputKWh / 1_000_000_000;
    const totalToBattery = system.dedicatedWindToBatteryKWh / 1_000_000_000;
    if (totalToBattery > 0) {
      return `${this.formatNumber(totalDirect + totalToBattery, 1)} TWh/jaar wind (${this.formatNumber(totalDirect, 1)} direct + ${this.formatNumber(totalToBattery, 1)} opslag)`;
    }
    return `${this.formatNumber(totalDirect, 1)} TWh/jaar direct`;
  });

  protected readonly gridExportPotentialText = computed(() => {
    return `${this.formatNumber(this.hydrogenSystem().potentialGridExportKWh / 1_000_000_000, 1)} TWh/jaar potentieel`;
  });

  protected readonly actualGridExportText = computed(() => {
    return `${this.formatNumber(this.hydrogenSystem().actualGridExportKWh / 1_000_000_000, 1)} TWh/jaar actief`;
  });

  protected readonly h2GridTransferPriceText = computed(() => {
    return `${this.formatCurrency(this.h2CostSummary().gridTransferPriceEurPerKWh, 3)} / kWh`;
  });

  protected readonly h2TotalAnnualCostText = computed(() => {
    return `${this.formatCurrency(this.h2CostSummary().totalAnnualCost / 1_000_000, 1)} mln/jaar`;
  });

  private readonly HYDROGEN_KWH_PER_KG_LHV = 33.33;

  protected readonly h2CostPerKwhText = computed(() => {
    return `${this.formatCurrency(this.h2CostSummary().costPerProducedKWhEur, 3)} / kWh`;
  });

  protected readonly h2CostPerKgText = computed(() => {
    const costPerKg = this.h2CostSummary().costPerProducedKWhEur * this.HYDROGEN_KWH_PER_KG_LHV;
    return `${this.formatCurrency(costPerKg, 2)} / kg`;
  });

  protected readonly h2DedicatedWindAnnualCostText = computed(() => {
    return `${this.formatCurrency(this.h2CostSummary().dedicatedWindAnnualCost / 1_000_000, 1)} mln/jaar`;
  });

  protected readonly h2ElectrolyzerAnnualCostText = computed(() => {
    return `${this.formatCurrency(this.h2CostSummary().electrolyzerAnnualCost / 1_000_000, 1)} mln/jaar`;
  });

  protected readonly h2BatteryAnnualCostText = computed(() => {
    return `${this.formatCurrency(this.h2CostSummary().batteryAnnualCost / 1_000_000, 1)} mln/jaar`;
  });

  protected readonly h2GridPurchaseAnnualCostText = computed(() => {
    return `${this.formatCurrency(this.h2CostSummary().gridPurchaseAnnualCost / 1_000_000, 1)} mln/jaar`;
  });

  protected readonly electrolyzerUtilizationText = computed(() => {
    const system = this.hydrogenSystem();
    const capacityGW = this.balanceStore.hydrogenElectrolyzerCapacityGW();
    if (capacityGW <= 0) {
      return '0% (geen capaciteit)';
    }

    const maxInputPossible = capacityGW * 1_000_000 * 8760;
    const totalInputUsed = system.dedicatedWindInputKWh + system.batteryToElectrolyserKWh + system.gridInputKWh;
    const utilization = maxInputPossible > 0 ? (totalInputUsed / maxInputPossible) * 100 : 0;

    return `${this.formatNumber(utilization, 1)}% (${this.formatNumber(totalInputUsed / 1_000_000_000, 1)} van ${this.formatNumber(maxInputPossible / 1_000_000_000, 1)} TWh)`;
  });

  protected formatNumber(value: number, digits = 1): string {
    return new Intl.NumberFormat('nl-NL', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value);
  }

  protected formatCurrency(value: number, digits = 0): string {
    return new Intl.NumberFormat('nl-NL', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value);
  }
}
