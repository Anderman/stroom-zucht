import { Injectable, computed, inject } from '@angular/core';
import uPlot from 'uplot';

import { BalanceModel, BalanceModelService } from './balance-model.service';
import { EnergyBalanceStore } from './energy-balance.store';
import {
    buildChartOverlaySeries,
    buildChartSeries,
    buildVisibleChartBands,
    buildVisibleChartSeries,
    selectDatasetValues
} from './energy-dashboard-chart.selectors';
import { EnergyDashboardDataStore } from './energy-dashboard-data.store';
import { EnergyDashboardViewStore } from './energy-dashboard-view.store';
import {
    AFVAL_BIOGAS_BASELOAD_GW,
    BORSSELE_CAPACITY_GW,
    BORSSELE_FULL_LOAD_HOURS,
    DATASETS,
} from './energy-dashboard.config';
import {
    BalanceChartMode,
    ChartSeries,
    ChartXAxisMode,
    HydrogenSystemMetrics,
    TimeRange
} from './energy-dashboard.types';
import { HeatPumpProfileService } from './heat-pump-profile.service';

type SortedBalancePoint = {
  value: number;
  sourceIndex: number;
};

@Injectable({ providedIn: 'root' })
export class EnergyDashboardStore {
  private static readonly HOUR_MS = 60 * 60 * 1000;
  private static readonly BALANCE_CHART_MODE_LABELS: Record<BalanceChartMode, string> = {
    timeline: 'Tijdlijn',
    sorted: 'Gesorteerd tekort/overschot',
  };

  private readonly balanceStore = inject(EnergyBalanceStore);
  private readonly dataStore = inject(EnergyDashboardDataStore);
  private readonly viewStore = inject(EnergyDashboardViewStore);
  private readonly balanceModelService = inject(BalanceModelService);
  private readonly heatPumpProfileService = inject(HeatPumpProfileService);
  private readonly weekendWeekdayFormatter = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    timeZone: 'Europe/Amsterdam',
  });

  readonly balanceChartModes = Object.entries(EnergyDashboardStore.BALANCE_CHART_MODE_LABELS).map(([key, label]) => ({ key: key as BalanceChartMode, label }));

  readonly fullXRange = computed(() => {
    const timestamps = this.dataStore.timestamps();
    if (!timestamps.length) {
      return null;
    }

    return {
      min: timestamps[0],
      max: timestamps[timestamps.length - 1],
    };
  });

  readonly hasActiveZoom = computed(() => {
    const fullXRange = this.fullXRange();
    const xWindow = this.viewStore.xWindow();
    if (!fullXRange || !xWindow) {
      return false;
    }

    return Math.abs(xWindow.min - fullXRange.min) > 1 || Math.abs(xWindow.max - fullXRange.max) > 1;
  });

  readonly weekendRanges = computed<TimeRange[]>(() => {
    const timestamps = this.dataStore.timestamps();
    if (!timestamps.length) {
      return [];
    }

    const weekendRanges: TimeRange[] = [];
    let rangeStart: number | null = null;

    for (let index = 0; index < timestamps.length; index += 1) {
      const timestamp = timestamps[index];
      const isWeekend = this.isWeekendTimestamp(timestamp);

      if (isWeekend && rangeStart == null) {
        rangeStart = timestamp;
        continue;
      }

      if (!isWeekend && rangeStart != null) {
        weekendRanges.push({ start: rangeStart, end: timestamp });
        rangeStart = null;
      }
    }

    if (rangeStart != null) {
      weekendRanges.push({
        start: rangeStart,
        end: timestamps[timestamps.length - 1] + EnergyDashboardStore.HOUR_MS,
      });
    }

    return weekendRanges;
  });

  readonly selectedDataset = computed(() => {
    return DATASETS.find(dataset => dataset.key === this.viewStore.activeDataset()) ?? DATASETS[0];
  });

  readonly gasElectricValues = computed(() => {
    return this.heatPumpProfileService.toElectricProfile(
      this.dataStore.valuesByDataset().gas ?? [],
      this.dataStore.timestamps(),
      this.dataStore.valuesByDataset().temperature ?? [],
    );
  });

  readonly electricityDisplayValues = computed(() => (this.dataStore.valuesByDataset().electricity ?? []).map(value => value / 1_000_000));
  readonly priceDisplayValues = computed(() => (this.dataStore.valuesByDataset().price ?? []).map(value => value * 100));
  readonly temperatureDisplayValues = computed(() => this.dataStore.valuesByDataset().temperature ?? []);
  readonly solarDisplayValues = computed(() => (this.dataStore.valuesByDataset().solar ?? []).map(value => value / 1_000_000));
  readonly windlandDisplayValues = computed(() => (this.dataStore.valuesByDataset().windland ?? []).map(value => value / 1_000_000));
  readonly windzeeDisplayValues = computed(() => (this.dataStore.valuesByDataset().windzee ?? []).map(value => value / 1_000_000));
  // Capaciteitsfactor (0–1) geschaald naar geïnstalleerd vermogen zodat vergelijking met windzeeDisplayValues direct mogelijk is
  readonly windzeewindDisplayValues = computed(() => {
    const installedGW = this.balanceStore.windzeeCapacityGW();
    return (this.dataStore.valuesByDataset().windzeewind ?? []).map(value => (value / 1_000_000) * installedGW);
  });
  readonly transportElectricValues = computed(() => this.dataStore.valuesByDataset().transport ?? []);
  readonly publicCurtailmentDisplayValues = computed(() => this.balanceModel().publicCurtailmentValues.map(value => value / 1_000_000));
  readonly publicCurtailmentBeforeHydrogenDisplayValues = computed(() => this.balanceModel().publicCurtailmentBeforeHydrogenValues.map(value => value / 1_000_000));
  readonly privateCurtailmentDisplayValues = computed(() => this.balanceModel().privateCurtailmentValues.map(value => value / 1_000_000));
  readonly publicWindlandCurtailmentDisplayValues = computed(() => this.balanceModel().publicWindlandCurtailmentValues.map(value => value / 1_000_000));
  readonly publicWindzeeCurtailmentDisplayValues = computed(() => this.balanceModel().publicWindzeeCurtailmentValues.map(value => value / 1_000_000));
  readonly publicSolarCurtailmentDisplayValues = computed(() => this.balanceModel().publicSolarCurtailmentValues.map(value => value / 1_000_000));
  readonly publicNuclearCurtailmentDisplayValues = computed(() => this.balanceModel().publicNuclearCurtailmentValues.map(value => value / 1_000_000));
  readonly hydrogenDemandDisplayValues = computed(() => this.balanceValues().map(value => value < 0 ? Math.abs(value) / 1_000_000 : 0));

  readonly totalGenerationValues = computed(() => {
    const solarValues = this.dataStore.valuesByDataset().solar ?? [];
    const windlandValues = this.dataStore.valuesByDataset().windland ?? [];
    const windzeeValues = this.dataStore.valuesByDataset().windzee ?? [];

    return solarValues.map((value, index) => value + (windlandValues[index] ?? 0) + (windzeeValues[index] ?? 0));
  });

  readonly totalSolarCapacityGW = computed(() => {
    return this.balanceStore.solarCapacityGW() + this.balanceStore.privateSolarCapacityGW();
  });

  readonly adjustedPublicSolarValues = computed(() => {
    const targetAnnualKWh = this.balanceStore.solarCapacityGW() * this.balanceStore.solarFullLoadHours() * 1_000_000;
    return this.dataStore.scaleProfileToAnnualTarget(this.dataStore.valuesByDataset().solar ?? [], targetAnnualKWh);
  });

  readonly adjustedPrivateSolarValues = computed(() => {
    const targetAnnualKWh = this.balanceStore.privateSolarCapacityGW() * this.balanceStore.solarFullLoadHours() * 1_000_000;
    return this.dataStore.scaleProfileToAnnualTarget(this.dataStore.valuesByDataset().solar ?? [], targetAnnualKWh);
  });

  // Gecombineerd voor backward compat (grafiek, presentatie)
  readonly adjustedSolarValues = computed(() =>
    this.adjustedPublicSolarValues().map((v, i) => v + (this.adjustedPrivateSolarValues()[i] ?? 0)),
  );
  readonly adjustedWindlandValues = computed(() => {
    const targetAnnualKWh = this.balanceStore.windlandCapacityGW() * this.balanceStore.windlandFullLoadHours() * 1_000_000;
    return this.dataStore.scaleProfileToAnnualTarget(this.dataStore.valuesByDataset().windland ?? [], targetAnnualKWh);
  });
  readonly adjustedWindzeeValues = computed(() => {
    const targetAnnualKWh = this.balanceStore.windzeeCapacityGW() * this.balanceStore.windzeeFullLoadHours() * 1_000_000;
    return this.dataStore.scaleProfileToAnnualTarget(this.dataStore.valuesByDataset().windzee ?? [], targetAnnualKWh);
  });
  readonly hydrogenDedicatedOffshoreWindValues = computed(() => {
    const targetAnnualKWh = this.balanceStore.hydrogenDedicatedOffshoreWindCapacityGW() * this.balanceStore.hydrogenDedicatedOffshoreWindFullLoadHours() * 1_000_000;
    return this.dataStore.scaleProfileToAnnualTarget(this.dataStore.valuesByDataset().windzee ?? [], targetAnnualKWh);
  });
  readonly nuclearValues = computed(() => {
    const timestamps = this.dataStore.timestamps();
    if (!timestamps.length) {
      return [];
    }

    const annualKWh = this.balanceStore.nuclearCapacityGW() * this.balanceStore.nuclearFullLoadHours() * 1_000_000;
    const perHourKWh = annualKWh / timestamps.length;
    return timestamps.map(() => perHourKWh);
  });

  readonly borsseleValues = computed(() => {
    const timestamps = this.dataStore.timestamps();
    if (!timestamps.length) {
      return [];
    }

    const annualKWh = BORSSELE_CAPACITY_GW * BORSSELE_FULL_LOAD_HOURS * 1_000_000;
    const perHourKWh = annualKWh / timestamps.length;
    return timestamps.map(() => perHourKWh);
  });

  readonly afvalBiogasValues = computed(() => {
    const timestamps = this.dataStore.timestamps();
    return timestamps.map(() => AFVAL_BIOGAS_BASELOAD_GW * 1_000_000);
  });

  readonly totalDemandValues = computed(() => {
    const electricityValues = this.dataStore.valuesByDataset().electricity ?? [];
    const gasValues = this.gasElectricValues();
    const transportValues = this.transportElectricValues();

    return electricityValues.map((value, index) => value + (gasValues[index] ?? 0) + (transportValues[index] ?? 0));
  });

  readonly balanceModel = computed<BalanceModel>(() => {
    return this.balanceModelService.buildModel({
      privateSolarValues: this.adjustedPrivateSolarValues(),
      publicSolarValues: this.adjustedPublicSolarValues(),
      windlandValues: this.adjustedWindlandValues(),
      windzeeValues: this.adjustedWindzeeValues(),
      nuclearValues: this.nuclearValues().map((value, index) => value + (this.borsseleValues()[index] ?? 0)),
      afvalBiogasValues: this.afvalBiogasValues(),
      demandValues: this.totalDemandValues(),
      publicBatteryCapacityGWh: this.balanceStore.batteryCapacityGWh(),
      publicBatteryChargePowerGW: this.balanceStore.publicBatteryChargePowerGW(),
      privateBatteryCapacityGWh: this.balanceStore.privateBatteryCapacityGWh(),
      privateGridMaxLoadGW: this.balanceStore.privateGridMaxLoadGW(),
      privateDemandShare: this.balanceStore.privateDemandShare(),
      hydrogenProductionTargetTWh: this.balanceStore.hydrogenProductionTargetTWh(),
      hydrogenElectrolyzerCapacityGW: this.balanceStore.hydrogenElectrolyzerCapacityGW(),
      timestamps: this.dataStore.timestamps(),
    });
  });

  readonly balanceValues = computed(() => this.balanceModel().residualBalanceValues);

  // Jaarstotalen voor kostprijsberekening
  readonly publicCurtailmentKWhTotal = computed(() =>
    this.balanceModel().publicCurtailmentValues.reduce((sum, v) => sum + v, 0),
  );
  readonly hydrogenToFactoriesKWhTotal = computed(() =>
    this.balanceModel().hydrogenToFactoriesValues.reduce((sum, v) => sum + v, 0),
  );
  readonly privateSelfServedKWhTotal = computed(() =>
    this.balanceModel().privateSelfServedValues.reduce((sum, v) => sum + v, 0),
  );

  readonly hydrogenSystem = computed<HydrogenSystemMetrics>(() => {
    const targetOutputKWh = this.balanceStore.hydrogenOutputTargetTWh() * 1_000_000_000;
    const efficiencyFraction = this.balanceStore.electrolyzerEfficiencyPercent() / 100;
    const targetInputKWh = efficiencyFraction > 0 ? targetOutputKWh / efficiencyFraction : 0;
    const electrolyzerCapacityKWh = this.balanceStore.hydrogenElectrolyzerCapacityGW() > 0
      ? this.balanceStore.hydrogenElectrolyzerCapacityGW() * 1_000_000
      : 0;
    const gridImportLimitKWh = this.balanceStore.hydrogenGridImportLimitGW() > 0
      ? this.balanceStore.hydrogenGridImportLimitGW() * 1_000_000
      : Infinity;
    const batteryCapacityKWh = this.balanceStore.hydrogenBatteryCapacityGWh() * 1_000_000;
    const dedicatedWindValues = this.hydrogenDedicatedOffshoreWindValues();
    const gridSurplusValues = this.balanceModel().publicCurtailmentBeforeHydrogenValues;

    let remainingInputTargetKWh = targetInputKWh;
    let batterySoC = 0;
    let totalProducedOutputKWh = 0;
    let totalDedicatedWindInputKWh = 0;
    let totalDedicatedWindToBatteryKWh = 0;
    let totalBatteryToElectrolyserKWh = 0;
    let totalGridInputKWh = 0;
    let totalSurplusKWh = 0;

    for (let index = 0; index < gridSurplusValues.length; index += 1) {
      const dedicatedAvailable = dedicatedWindValues[index] ?? 0;
      const gridAvailable = Math.max(0, gridSurplusValues[index] ?? 0);

      let directWindUse = Math.min(dedicatedAvailable, electrolyzerCapacityKWh, remainingInputTargetKWh);
      const windToElectrolyser = directWindUse;

      let chargeKWh = 0;
      if (dedicatedAvailable > directWindUse && batteryCapacityKWh > 0) {
        chargeKWh = Math.min(dedicatedAvailable - directWindUse, batteryCapacityKWh - batterySoC);
        batterySoC += chargeKWh;
        totalDedicatedWindToBatteryKWh += chargeKWh;
      }

      if (directWindUse < electrolyzerCapacityKWh && remainingInputTargetKWh > directWindUse && batterySoC > 0) {
        const batteryGap = Math.min(electrolyzerCapacityKWh - directWindUse, remainingInputTargetKWh - directWindUse);
        const dischargeKWh = Math.min(batteryGap, batterySoC);
        batterySoC -= dischargeKWh;
        totalBatteryToElectrolyserKWh += dischargeKWh;
        directWindUse += dischargeKWh;
      }

      const gridUsedKWh = Math.min(
        gridAvailable,
        Math.max(0, electrolyzerCapacityKWh - directWindUse),
        gridImportLimitKWh,
        Math.max(0, remainingInputTargetKWh - directWindUse),
      );
      const inputUsedKWh = directWindUse + gridUsedKWh;
      const outputProducedKWh = inputUsedKWh * efficiencyFraction;

      remainingInputTargetKWh = Math.max(0, remainingInputTargetKWh - inputUsedKWh);
      totalDedicatedWindInputKWh += windToElectrolyser;
      totalGridInputKWh += gridUsedKWh;
      totalProducedOutputKWh += outputProducedKWh;
      totalSurplusKWh += Math.max(0, dedicatedAvailable - windToElectrolyser - chargeKWh)
        + Math.max(0, gridAvailable - gridUsedKWh);
    }

    return {
      targetOutputKWh,
      targetInputKWh,
      producedOutputKWh: totalProducedOutputKWh,
      dedicatedWindInputKWh: totalDedicatedWindInputKWh,
      dedicatedWindToBatteryKWh: totalDedicatedWindToBatteryKWh,
      batteryToElectrolyserKWh: totalBatteryToElectrolyserKWh,
      gridInputKWh: totalGridInputKWh,
      surplusKWh: totalSurplusKWh,
      shortageKWh: Math.max(0, targetOutputKWh - totalProducedOutputKWh),
      potentialGridExportKWh: totalSurplusKWh,
      actualGridExportKWh: 0,
      batteryCapacityKWh,
      batteryFinalSoCKWh: batterySoC,
    };
  });
  readonly privateSolarToPublicKWhTotal = computed(() =>
    this.balanceModel().privateSolarToPublicValues.reduce((sum, v) => sum + v, 0),
  );

  readonly sortedBalancePoints = computed<SortedBalancePoint[]>(() => {
    return this.balanceValues()
      .map((value, sourceIndex) => ({ value, sourceIndex }))
      .sort((left, right) => right.value - left.value);
  });
  readonly sortedBalanceValues = computed(() => this.sortedBalancePoints().map(point => point.value));
  readonly sortedBalanceRankTimestamps = computed(() => this.sortedBalancePoints().map((_point, index) => index + 1));
  readonly chartXAxisMode = computed<ChartXAxisMode>(() => {
    return this.viewStore.activeDataset() === 'balance' && this.viewStore.activeBalanceChartMode() === 'sorted' ? 'rank' : 'time';
  });
  readonly chartTimestamps = computed(() => {
    return this.chartXAxisMode() === 'rank' ? this.sortedBalanceRankTimestamps() : this.dataStore.timestamps();
  });
  readonly visibleWeekendRanges = computed<TimeRange[]>(() => {
    return this.chartXAxisMode() === 'rank' ? [] : this.weekendRanges();
  });

  readonly selectedValues = computed(() => {
    return selectDatasetValues({
      activeDataset: this.viewStore.activeDataset(),
      activeBalanceChartMode: this.viewStore.activeBalanceChartMode(),
      totalDemandValues: this.totalDemandValues(),
      totalGenerationValues: this.totalGenerationValues(),
      balanceValues: this.balanceValues(),
      publicCurtailmentValues: this.balanceModel().publicCurtailmentValues,
      sortedBalanceValues: this.sortedBalanceValues(),
      gasElectricValues: this.gasElectricValues(),
      valuesByDataset: this.dataStore.valuesByDataset(),
    });
  });

  readonly selectedDisplayValues = computed(() => {
    const dataset = this.selectedDataset();
    return this.selectedValues().map(value => value * dataset.pointScale);
  });

  readonly chartOverlaySeries = computed<ChartSeries[]>(() => {
    return buildChartOverlaySeries({
      activeDataset: this.viewStore.activeDataset(),
      activeBalanceChartMode: this.viewStore.activeBalanceChartMode(),
      totalBatteryCapacityGWh: this.balanceStore.totalBatteryCapacityGWh(),
      publicBatteryCapacityGWh: this.balanceStore.batteryCapacityGWh(),
      privateBatteryCapacityGWh: this.balanceStore.privateBatteryCapacityGWh(),
      priceDisplayValues: this.priceDisplayValues(),
      temperatureDisplayValues: this.temperatureDisplayValues(),
      batteryStateValues: this.balanceModel().batteryStateValues,
      publicBatteryStateValues: this.balanceModel().publicBatteryStateValues,
      privateBatteryStateValues: this.balanceModel().privateBatteryStateValues,
    });
  });

  readonly chartSeries = computed<ChartSeries[]>(() => {
    return buildChartSeries({
      selectedDataset: this.selectedDataset(),
      valuesByDataset: this.dataStore.valuesByDataset(),
      gasElectricValues: this.gasElectricValues(),
      transportElectricValues: this.transportElectricValues(),
      totalGenerationValues: this.totalGenerationValues(),
      solarDisplayValues: this.solarDisplayValues(),
      windlandDisplayValues: this.windlandDisplayValues(),
      windzeeDisplayValues: this.windzeeDisplayValues(),
      windzeewindDisplayValues: this.windzeewindDisplayValues(),
      publicCurtailmentDisplayValues: this.publicCurtailmentDisplayValues(),
      privateCurtailmentDisplayValues: this.privateCurtailmentDisplayValues(),
      publicWindlandCurtailmentDisplayValues: this.publicWindlandCurtailmentDisplayValues(),
      publicWindzeeCurtailmentDisplayValues: this.publicWindzeeCurtailmentDisplayValues(),
      publicSolarCurtailmentDisplayValues: this.publicSolarCurtailmentDisplayValues(),
      publicNuclearCurtailmentDisplayValues: this.publicNuclearCurtailmentDisplayValues(),
      hydrogenDemandDisplayValues: this.hydrogenDemandDisplayValues(),
      electricityDisplayValues: this.electricityDisplayValues(),
      selectedDisplayValues: this.selectedDisplayValues(),
      chartOverlaySeries: this.chartOverlaySeries(),
    });
  });

  readonly visibleChartSeries = computed<ChartSeries[]>(() => {
    return buildVisibleChartSeries(this.viewStore.activeDataset(), this.chartSeries(), this.viewStore.hiddenLegendLabels());
  });

  readonly visibleChartBands = computed<uPlot.Band[]>(() => {
    return buildVisibleChartBands(this.viewStore.activeDataset(), this.visibleChartSeries());
  });

  private isWeekendTimestamp(timestamp: number): boolean {
    const weekday = this.weekendWeekdayFormatter.format(timestamp);
    return weekday === 'Sat' || weekday === 'Sun';
  }

}
