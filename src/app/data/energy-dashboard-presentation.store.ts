import { computed, inject, Injectable } from '@angular/core';

import { EnergyBalanceStore } from './energy-balance.store';
import { buildChartLegendItems } from './energy-dashboard-chart.selectors';
import { EnergyDashboardDataStore } from './energy-dashboard-data.store';
import { EnergyDashboardViewStore } from './energy-dashboard-view.store';
import {
    BATTERY_COLOR,
    ELECTRICITY_COLOR,
    GAS_COLOR,
    PRICE_COLOR,
    PRICE_UNIT,
    SOC_UNIT,
    SOLAR_COLOR,
    TEMPERATURE_COLOR,
    TEMPERATURE_UNIT,
    TOTAL_COLOR,
    TRANSPORT_COLOR,
} from './energy-dashboard.config';
import { statNumberFormatter } from '../core/formatters';
import { EnergyDashboardStore } from './energy-dashboard.store';
import { BreakdownItem, ChartLegendItem, DemandSummaryItem } from './energy-dashboard.types';

@Injectable({ providedIn: 'root' })
export class EnergyDashboardPresentationStore {
  private readonly balanceStore = inject(EnergyBalanceStore);
  private readonly dataStore = inject(EnergyDashboardDataStore);
  private readonly dashboardStore = inject(EnergyDashboardStore);
  private readonly viewStore = inject(EnergyDashboardViewStore);

  readonly selectedDatasetLabel = computed(() => {
    if (this.viewStore.activeDataset() === 'balance' && this.viewStore.activeBalanceChartMode() === 'sorted') {
      return 'Balansduurcurve';
    }

    return this.dashboardStore.selectedDataset().label;
  });

  readonly selectedDatasetDescription = computed(() => {
    if (this.viewStore.activeDataset() === 'balance' && this.viewStore.activeBalanceChartMode() === 'sorted') {
      return 'Restbalans gesorteerd van grootste overschotten naar grootste tekorten, zoals in veel energietransitierapporten voor duurcurves en backup-elektrolyseanalyse.';
    }

    return this.dashboardStore.selectedDataset().description;
  });

  readonly chartLegendItems = computed<ChartLegendItem[]>(() => {
    return buildChartLegendItems(this.dashboardStore.chartSeries(), this.viewStore.hiddenLegendLabels());
  });

  readonly totalValueText = computed(() => {
    if (this.viewStore.activeDataset() === 'electricitysolar') {
      const electricityTotal = this.dashboardStore.electricityDisplayValues().reduce((sum, value) => sum + value, 0) / 1_000;
      const solarTotal = this.dashboardStore.solarDisplayValues().reduce((sum, value) => sum + value, 0) / 1_000;
      return `Vraag ${statNumberFormatter.format(electricityTotal)} TWh · Zon ${statNumberFormatter.format(solarTotal)} TWh`;
    }

    if (this.viewStore.activeDataset() === 'balance') {
      const netBalanceTWh = this.dashboardStore.balanceValues().reduce((sum, value) => sum + value, 0) / 1_000_000_000;
      if (netBalanceTWh > 0) {
        return `Overschot ${statNumberFormatter.format(netBalanceTWh)} TWh`;
      }
      if (netBalanceTWh < 0) {
        return `Tekort ${statNumberFormatter.format(Math.abs(netBalanceTWh))} TWh`;
      }
      return `0 ${this.dashboardStore.selectedDataset().totalUnit}`;
    }

    const dataset = this.dashboardStore.selectedDataset();
    const total = this.dashboardStore.selectedValues().reduce((sum, value) => sum + value, 0) * dataset.totalScale;
    return `${statNumberFormatter.format(total)} ${dataset.totalUnit}`;
  });

  readonly balanceShortageTWhText = computed(() => {
    const shortageTotal = this.dashboardStore.balanceValues().reduce((sum, value) => {
      return value < 0 ? sum + Math.abs(value) : sum;
    }, 0);

    return `${statNumberFormatter.format(shortageTotal / 1_000_000_000)} TWh`;
  });

  readonly balanceShortageHoursText = computed(() => {
    const shortageHours = this.dashboardStore.balanceValues().reduce((sum, value) => {
      return value < 0 ? sum + 1 : sum;
    }, 0);

    return `${statNumberFormatter.format(shortageHours)} uur`;
  });

  readonly balanceElectrolysisTWhText = computed(() => {
    const surplusTotal = this.dashboardStore.balanceValues().reduce((sum, value) => {
      return value > 0 ? sum + value : sum;
    }, 0);

    return `${statNumberFormatter.format(surplusTotal / 1_000_000_000)} TWh`;
  });

  readonly balanceSurplusHoursText = computed(() => {
    const surplusHours = this.dashboardStore.balanceValues().reduce((sum, value) => {
      return value > 0 ? sum + 1 : sum;
    }, 0);

    return `${statNumberFormatter.format(surplusHours)} uur`;
  });

  readonly balanceSurplusPeakGWText = computed(() => {
    const peakKWh = this.dashboardStore.balanceValues().reduce((maxValue, value) => value > maxValue ? value : maxValue, 0);
    return `${statNumberFormatter.format(peakKWh / 1_000_000)} GW`;
  });

  readonly balanceShortagePeakGWText = computed(() => {
    const peakKWh = this.dashboardStore.balanceValues().reduce((maxValue, value) => value < 0 ? Math.max(maxValue, Math.abs(value)) : maxValue, 0);
    return `${statNumberFormatter.format(peakKWh / 1_000_000)} GW`;
  });

  readonly annualDemandTWhText = computed(() => {
    const twh = this.dashboardStore.totalDemandValues().reduce((sum, value) => sum + value, 0) / 1_000_000_000;
    return `${statNumberFormatter.format(twh)} TWh`;
  });

  readonly annualGenerationTWhText = computed(() => {
    const twh = this.dashboardStore.balanceModel().adjustedGenerationValues.reduce((sum, v) => sum + v, 0) / 1_000_000_000;
    return `${statNumberFormatter.format(twh)} TWh`;
  });

  readonly balanceGrossDifferenceTWhText = computed(() => {
    const generationTWh = this.dashboardStore.balanceModel().adjustedGenerationValues.reduce((sum, v) => sum + v, 0) / 1_000_000_000;
    const demandTWh = this.dashboardStore.totalDemandValues().reduce((sum, value) => sum + value, 0) / 1_000_000_000;
    const diffTWh = generationTWh - demandTWh;
    if (diffTWh > 0) {
      return `Overschot ${statNumberFormatter.format(diffTWh)} TWh`;
    }
    if (diffTWh < 0) {
      return `Tekort ${statNumberFormatter.format(Math.abs(diffTWh))} TWh`;
    }
    return '0 TWh';
  });

  readonly curtailmentTWhText = computed(() => {
    // Publiek restoverschot na batterijopslag.
    const twh = this.dashboardStore.balanceModel().publicCurtailmentValues.reduce((sum, v) => sum + v, 0) / 1_000_000_000;
    return `${statNumberFormatter.format(twh)} TWh`;
  });

  readonly publicCurtailmentHoursText = computed(() => {
    const hours = this.dashboardStore.balanceModel().publicCurtailmentValues.reduce((sum, value) => {
      return value > 0 ? sum + 1 : sum;
    }, 0);

    return `${statNumberFormatter.format(hours)} uur`;
  });

  readonly privateCurtailmentTWhText = computed(() => {
    // Privé restoverschot na batterijopslag (privé zon die nergens heen kan).
    const twh = this.dashboardStore.balanceModel().privateCurtailmentValues.reduce((sum, v) => sum + v, 0) / 1_000_000_000;
    return `${statNumberFormatter.format(twh)} TWh`;
  });

  readonly hydrogenToFactoriesTWhText = computed(() => {
    const hydrogenSystem = this.dashboardStore.hydrogenSystem();
    const inputToHydrogenKWh = hydrogenSystem.dedicatedWindInputKWh + hydrogenSystem.gridInputKWh;
    const twh = inputToHydrogenKWh / 1_000_000_000;
    return `${statNumberFormatter.format(twh)} TWh`;
  });

  readonly hydrogenFromSystemGenerationTWhText = computed(() => {
    const twh = this.dashboardStore.hydrogenSystem().dedicatedWindInputKWh / 1_000_000_000;
    return `${statNumberFormatter.format(twh)} TWh`;
  });

  readonly hydrogenFromGridTWhText = computed(() => {
    const twh = this.dashboardStore.hydrogenSystem().gridInputKWh / 1_000_000_000;
    return `${statNumberFormatter.format(twh)} TWh`;
  });

  readonly hydrogenCurtailmentAfterDispatchTWhText = computed(() => {
    const twh = this.dashboardStore.hydrogenSystem().surplusKWh / 1_000_000_000;
    return `${statNumberFormatter.format(twh)} TWh`;
  });

  readonly totalDemandSummaryItems = computed<DemandSummaryItem[]>(() => {
    if (this.viewStore.activeDataset() !== 'totaldemand') {
      return [];
    }

    const electricityTotal = (this.dataStore.valuesByDataset().electricity ?? []).reduce((sum, value) => sum + value, 0);
    const heatPumpTotal = this.dashboardStore.gasElectricValues().reduce((sum, value) => sum + value, 0);
    const transportTotal = this.dashboardStore.transportElectricValues().reduce((sum, value) => sum + value, 0);
    const totalDemand = electricityTotal + heatPumpTotal + transportTotal;
    const toItem = (label: string, color: string, total: number): DemandSummaryItem => ({
      label,
      color,
      totalText: `${statNumberFormatter.format(total / 1_000_000_000)} TWh`,
      shareText: `${statNumberFormatter.format(totalDemand > 0 ? (total / totalDemand) * 100 : 0)}% van totaal`,
    });

    return [
      toItem('Elektriciteit', ELECTRICITY_COLOR, electricityTotal),
      toItem('Warmtepompen', GAS_COLOR, heatPumpTotal),
      toItem('Vervoer', TRANSPORT_COLOR, transportTotal),
    ];
  });

  readonly peakValueText = computed(() => {
    if (this.viewStore.activeDataset() === 'electricitysolar') {
      return `${statNumberFormatter.format(Math.max(...this.dashboardStore.electricityDisplayValues(), 0))} / ${statNumberFormatter.format(Math.max(...this.dashboardStore.solarDisplayValues(), 0))}`;
    }

    const values = this.dashboardStore.selectedDisplayValues();
    return values.length ? statNumberFormatter.format(Math.max(...values)) : '0';
  });

  readonly peakMomentText = computed(() => {
    const formatter = new Intl.DateTimeFormat('nl-NL', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Amsterdam' });
    if (this.viewStore.activeDataset() === 'electricitysolar') {
      const timestamps = this.dataStore.timestamps();
      const electricityValues = this.dashboardStore.electricityDisplayValues();
      const solarValues = this.dashboardStore.solarDisplayValues();
      if (!timestamps.length || !electricityValues.length || !solarValues.length) {
        return 'Onbekend';
      }

      const electricityPeakIndex = electricityValues.reduce((maxIndex, value, index, array) => value > array[maxIndex] ? index : maxIndex, 0);
      const solarPeakIndex = solarValues.reduce((maxIndex, value, index, array) => value > array[maxIndex] ? index : maxIndex, 0);
      return `Vraag ${formatter.format(timestamps[electricityPeakIndex])} · Zon ${formatter.format(timestamps[solarPeakIndex])}`;
    }

    if (this.viewStore.activeDataset() === 'balance' && this.viewStore.activeBalanceChartMode() === 'sorted') {
      const values = this.dashboardStore.selectedValues();
      if (!values.length) {
        return 'Onbekend';
      }

      const peakValue = values[0] ?? 0;
      return peakValue >= 0 ? 'Grootste overschot' : 'Grootste tekort';
    }

    const values = this.dashboardStore.selectedValues();
    const timestamps = this.dataStore.timestamps();
    if (!values.length || !timestamps.length) {
      return 'Onbekend';
    }

    const peakIndex = values.reduce((maxIndex, value, index, array) => value > array[maxIndex] ? index : maxIndex, 0);
    return formatter.format(timestamps[peakIndex]);
  });

  readonly hoveredMomentText = computed(() => {
    const hoveredIndex = this.viewStore.hoveredIndex();
    if (hoveredIndex == null) {
      return 'Beweeg over de grafiek';
    }

    if (this.viewStore.activeDataset() === 'balance' && this.viewStore.activeBalanceChartMode() === 'sorted') {
      const sourceIndex = this.dashboardStore.sortedBalancePoints()[hoveredIndex]?.sourceIndex;
      const timestamps = this.dataStore.timestamps();
      if (sourceIndex == null || !timestamps.length) {
        return `Rang ${statNumberFormatter.format(hoveredIndex + 1)}`;
      }

      const originalMoment = new Intl.DateTimeFormat('nl-NL', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Amsterdam' }).format(timestamps[sourceIndex]);
      return `Rang ${statNumberFormatter.format(hoveredIndex + 1)} · ${originalMoment}`;
    }

    const timestamps = this.dataStore.timestamps();
    if (!timestamps.length) {
      return 'Beweeg over de grafiek';
    }

    return new Intl.DateTimeFormat('nl-NL', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Amsterdam' }).format(timestamps[hoveredIndex]);
  });

  readonly hoveredValueText = computed(() => {
    const hoveredIndex = this.viewStore.hoveredIndex();
    if (this.viewStore.activeDataset() === 'electricitysolar') {
      if (hoveredIndex == null) return 'Beweeg over de grafiek';
      return `Vraag ${statNumberFormatter.format(this.dashboardStore.electricityDisplayValues()[hoveredIndex] ?? 0)} GW · Zon ${statNumberFormatter.format(this.dashboardStore.solarDisplayValues()[hoveredIndex] ?? 0)} GW`;
    }

    if (this.viewStore.activeDataset() === 'electricity') {
      if (hoveredIndex == null) return 'Beweeg over de grafiek';
      const electricityValue = this.dashboardStore.electricityDisplayValues()[hoveredIndex] ?? 0;
      const priceValue = this.dashboardStore.priceDisplayValues()[hoveredIndex];
      return priceValue == null
        ? `${statNumberFormatter.format(electricityValue)} GW`
        : `Vraag ${statNumberFormatter.format(electricityValue)} GW · Prijs ${statNumberFormatter.format(priceValue)} ${PRICE_UNIT}`;
    }

    const values = this.dashboardStore.selectedDisplayValues();
    if (hoveredIndex == null || !values.length) {
      return 'Beweeg over de grafiek';
    }
    return `${statNumberFormatter.format(values[hoveredIndex] ?? 0)} ${this.dashboardStore.selectedDataset().peakUnit}`;
  });

  readonly hoveredBreakdownItems = computed<BreakdownItem[]>(() => {
    const hoveredIndex = this.viewStore.hoveredIndex();
    if (hoveredIndex == null) {
      return [];
    }

    if (this.viewStore.activeDataset() === 'electricitysolar') {
      const electricityValue = this.dashboardStore.electricityDisplayValues()[hoveredIndex] ?? 0;
      const solarValue = this.dashboardStore.solarDisplayValues()[hoveredIndex] ?? 0;
      const solarShare = electricityValue > 0 ? (solarValue / electricityValue) * 100 : 0;
      const netAfterSolar = electricityValue - solarValue;
      return [
        { label: 'Elektriciteitsvraag', color: ELECTRICITY_COLOR, valueText: `${statNumberFormatter.format(electricityValue)} GW` },
        { label: 'Zonneproductie', color: SOLAR_COLOR, valueText: `${statNumberFormatter.format(solarValue)} GW` },
        { label: 'Zon dekt', color: SOLAR_COLOR, valueText: `${statNumberFormatter.format(solarShare)}% van vraag` },
        { label: 'Vraag minus zon', color: TOTAL_COLOR, valueText: `${statNumberFormatter.format(netAfterSolar)} GW` },
      ];
    }

    if (this.viewStore.activeDataset() === 'generationtotal') {
      const totalValue = (this.dashboardStore.totalGenerationValues()[hoveredIndex] ?? 0) * this.dashboardStore.selectedDataset().pointScale;
      return [
        { label: 'Zon', color: SOLAR_COLOR, valueText: `${statNumberFormatter.format(this.dashboardStore.solarDisplayValues()[hoveredIndex] ?? 0)} GW` },
        { label: 'Windland', color: '#3f8cff', valueText: `${statNumberFormatter.format(this.dashboardStore.windlandDisplayValues()[hoveredIndex] ?? 0)} GW` },
        { label: 'Windzee', color: '#9d7cff', valueText: `${statNumberFormatter.format(this.dashboardStore.windzeeDisplayValues()[hoveredIndex] ?? 0)} GW` },
        { label: 'Totaal opwek', color: TOTAL_COLOR, valueText: `${statNumberFormatter.format(totalValue)} GW` },
      ];
    }

    if (this.viewStore.activeDataset() === 'balance') {
      const pointScale = this.dashboardStore.selectedDataset().pointScale;
      if (this.viewStore.activeBalanceChartMode() === 'sorted') {
        const sortedPoint = this.dashboardStore.sortedBalancePoints()[hoveredIndex];
        const sourceIndex = sortedPoint?.sourceIndex;
        if (sortedPoint == null || sourceIndex == null) {
          return [];
        }

        return [
          { label: 'Restbalans', color: this.dashboardStore.selectedDataset().color, valueText: `${statNumberFormatter.format(sortedPoint.value * pointScale)} GW` },
          { label: 'Ruwe balans', color: '#8fa7c9', valueText: `${statNumberFormatter.format((this.dashboardStore.balanceModel().rawBalanceValues[sourceIndex] ?? 0) * pointScale)} GW` },
          { label: 'Vraag', color: TOTAL_COLOR, valueText: `${statNumberFormatter.format((this.dashboardStore.totalDemandValues()[sourceIndex] ?? 0) * pointScale)} GW` },
          { label: 'Opwek', color: TOTAL_COLOR, valueText: `${statNumberFormatter.format((this.dashboardStore.balanceModel().adjustedGenerationValues[sourceIndex] ?? 0) * pointScale)} GW` },
        ];
      }

      const balanceModel = this.dashboardStore.balanceModel();
      const pubBatSoC = (balanceModel.publicBatteryStateValues[hoveredIndex] ?? 0) / 1_000_000;
      const privBatSoC = (balanceModel.privateBatteryStateValues[hoveredIndex] ?? 0) / 1_000_000;
      const pubBatCapGWh = this.balanceStore.batteryCapacityGWh();
      const privBatCapGWh = this.balanceStore.privateBatteryCapacityGWh();
      const pubBatSocPct = pubBatCapGWh > 0 ? (pubBatSoC / pubBatCapGWh) * 100 : 0;
      const privBatSocPct = privBatCapGWh > 0 ? (privBatSoC / privBatCapGWh) * 100 : 0;

      // Ontlaad-stromen afleiden uit SoC-delta
      const prevPubSoC = hoveredIndex > 0 ? (balanceModel.publicBatteryStateValues[hoveredIndex - 1] ?? pubBatSoC) / 1_000_000 : pubBatSoC;
      const prevPrivSoC = hoveredIndex > 0 ? (balanceModel.privateBatteryStateValues[hoveredIndex - 1] ?? privBatSoC) / 1_000_000 : privBatSoC;
      const pubDelta = pubBatSoC - prevPubSoC;
      const privDelta = privBatSoC - prevPrivSoC;
      const pubCharge = Math.max(0, pubDelta);
      const pubDischarge = Math.max(0, -pubDelta);
      const privCharge = Math.max(0, privDelta);
      const privDischarge = Math.max(0, -privDelta);

      const privateSolarToPublic = (balanceModel.privateSolarToPublicValues[hoveredIndex] ?? 0) * pointScale;
      const publicToPrivate = (balanceModel.publicToPrivateValues[hoveredIndex] ?? 0) * pointScale;
      const pubCurtailment = (balanceModel.publicCurtailmentValues[hoveredIndex] ?? 0) * pointScale;
      const privCurtailment = (balanceModel.privateCurtailmentValues[hoveredIndex] ?? 0) * pointScale;

      const items: BreakdownItem[] = [
        { label: 'Opwek publiek', color: '#3f8cff', valueText: `${statNumberFormatter.format((balanceModel.adjustedPublicGenerationValues[hoveredIndex] ?? 0) * pointScale)} GW` },
        { label: 'Opwek privé zon', color: SOLAR_COLOR, valueText: `${statNumberFormatter.format((balanceModel.adjustedPrivateGenerationValues[hoveredIndex] ?? 0) * pointScale)} GW` },
        { label: 'Vraag', color: TOTAL_COLOR, valueText: `${statNumberFormatter.format((this.dashboardStore.totalDemandValues()[hoveredIndex] ?? 0) * pointScale)} GW` },
        { label: 'Ruwe balans', color: '#8fa7c9', valueText: `${statNumberFormatter.format((balanceModel.rawBalanceValues[hoveredIndex] ?? 0) * pointScale)} GW` },
      ];

      if (privateSolarToPublic > 0) {
        items.push({ label: 'Privé→publieke batterij', color: SOLAR_COLOR, valueText: `${statNumberFormatter.format(privateSolarToPublic)} GW` });
      }
      if (publicToPrivate > 0) {
        items.push({ label: 'Publiek→privébatterij', color: '#3f8cff', valueText: `${statNumberFormatter.format(publicToPrivate)} GW` });
      }
      if (privCharge > 0) {
        items.push({ label: 'Privébatterij +geladen', color: BATTERY_COLOR, valueText: `+${statNumberFormatter.format(privCharge)} GWh` });
      }
      if (privDischarge > 0) {
        items.push({ label: 'Privébatterij −ontlaad', color: BATTERY_COLOR, valueText: `−${statNumberFormatter.format(privDischarge)} GWh` });
      }
      if (pubCharge > 0) {
        items.push({ label: 'Publieke batt. +geladen', color: BATTERY_COLOR, valueText: `+${statNumberFormatter.format(pubCharge)} GWh` });
      }
      if (pubDischarge > 0) {
        items.push({ label: 'Publieke batt. −ontlaad', color: BATTERY_COLOR, valueText: `−${statNumberFormatter.format(pubDischarge)} GWh` });
      }

      items.push(
        { label: 'Publieke batterij', color: BATTERY_COLOR, valueText: `${statNumberFormatter.format(pubBatSoC)} GWh (${statNumberFormatter.format(pubBatSocPct)}${SOC_UNIT})` },
        { label: 'Privébatterij', color: BATTERY_COLOR, valueText: `${statNumberFormatter.format(privBatSoC)} GWh (${statNumberFormatter.format(privBatSocPct)}${SOC_UNIT})` },
      );

      if (pubCurtailment > 0) {
        items.push({ label: 'Publiek curtailment', color: '#ff8c00', valueText: `${statNumberFormatter.format(pubCurtailment)} GW` });
      }
      if (privCurtailment > 0) {
        items.push({ label: 'Privé curtailment', color: '#ffb347', valueText: `${statNumberFormatter.format(privCurtailment)} GW` });
      }

      items.push({ label: 'Restbalans', color: this.dashboardStore.selectedDataset().color, valueText: `${statNumberFormatter.format((this.dashboardStore.balanceValues()[hoveredIndex] ?? 0) * pointScale)} GW` });
      return items;
    }

    if (this.viewStore.activeDataset() === 'electricity') {
      const items: BreakdownItem[] = [
        { label: 'Elektriciteitsvraag', color: ELECTRICITY_COLOR, valueText: `${statNumberFormatter.format(this.dashboardStore.electricityDisplayValues()[hoveredIndex] ?? 0)} GW` },
      ];
      const priceValue = this.dashboardStore.priceDisplayValues()[hoveredIndex];
      if (priceValue != null) {
        items.push({ label: 'Dynamische prijs', color: PRICE_COLOR, valueText: `${statNumberFormatter.format(priceValue)} ${PRICE_UNIT}` });
      }
      return items;
    }

    if (this.viewStore.activeDataset() === 'totaldemand') {
      const pointScale = this.dashboardStore.selectedDataset().pointScale;
      const items: BreakdownItem[] = [
        { label: 'Elektriciteit', color: ELECTRICITY_COLOR, valueText: `${statNumberFormatter.format((this.dataStore.valuesByDataset().electricity?.[hoveredIndex] ?? 0) * pointScale)} ${this.dashboardStore.selectedDataset().peakUnit}` },
        { label: 'Gas warmte', color: GAS_COLOR, valueText: `${statNumberFormatter.format((this.dashboardStore.gasElectricValues()[hoveredIndex] ?? 0) * pointScale)} ${this.dashboardStore.selectedDataset().peakUnit}` },
        { label: 'Vervoer', color: TRANSPORT_COLOR, valueText: `${statNumberFormatter.format((this.dashboardStore.transportElectricValues()[hoveredIndex] ?? 0) * pointScale)} ${this.dashboardStore.selectedDataset().peakUnit}` },
        { label: 'Totaal', color: TOTAL_COLOR, valueText: `${statNumberFormatter.format((this.dashboardStore.totalDemandValues()[hoveredIndex] ?? 0) * pointScale)} ${this.dashboardStore.selectedDataset().peakUnit}` },
      ];
      const priceValue = this.dashboardStore.priceDisplayValues()[hoveredIndex];
      const temperatureValue = this.dashboardStore.temperatureDisplayValues()[hoveredIndex];
      if (priceValue != null) items.push({ label: 'Dynamische prijs', color: PRICE_COLOR, valueText: `${statNumberFormatter.format(priceValue)} ${PRICE_UNIT}` });
      if (temperatureValue != null) items.push({ label: 'Temperatuur', color: TEMPERATURE_COLOR, valueText: `${statNumberFormatter.format(temperatureValue)} ${TEMPERATURE_UNIT}` });
      return items;
    }

    if (this.viewStore.activeDataset() === 'gas') {
      const items: BreakdownItem[] = [
        { label: 'Warmtepompvraag', color: GAS_COLOR, valueText: `${statNumberFormatter.format(this.dashboardStore.selectedDisplayValues()[hoveredIndex] ?? 0)} ${this.dashboardStore.selectedDataset().peakUnit}` },
      ];
      const temperatureValue = this.dashboardStore.temperatureDisplayValues()[hoveredIndex];
      if (temperatureValue != null) items.push({ label: 'Temperatuur', color: TEMPERATURE_COLOR, valueText: `${statNumberFormatter.format(temperatureValue)} ${TEMPERATURE_UNIT}` });
      return items;
    }

    if (this.viewStore.activeDataset() === 'windzee') {
      const actual = this.dashboardStore.windzeeDisplayValues()[hoveredIndex] ?? 0;
      const potential = this.dashboardStore.windzeewindDisplayValues()[hoveredIndex] ?? 0;
      const items: BreakdownItem[] = [
        { label: 'Windzee (ENTSO-E)', color: '#9d7cff', valueText: `${statNumberFormatter.format(actual)} GW` },
      ];
      if (potential > 0) {
        const curtailmentShare = potential > 0 ? ((potential - actual) / potential) * 100 : 0;
        items.push({ label: 'Potentieel F3-JA-1', color: '#c4a3ff', valueText: `${statNumberFormatter.format(potential)} GW` });
        items.push({ label: 'Curtailment/afwijking', color: '#8fa7c9', valueText: `${statNumberFormatter.format(curtailmentShare)}%` });
      }
      return items;
    }

    if (this.viewStore.activeDataset() === 'windzeewind') {
      const potential = this.dashboardStore.windzeewindDisplayValues()[hoveredIndex] ?? 0;
      return [
        { label: 'Windsnelheidspotentieel F3-JA-1', color: '#c4a3ff', valueText: `${statNumberFormatter.format(potential)} GW` },
      ];
    }

    return [];
  });

  readonly isTooltipVisible = computed(() => this.viewStore.hoveredIndex() != null && this.viewStore.hoverPosition() != null);
  readonly tooltipLeft = computed(() => this.viewStore.hoverPosition()?.left ?? 0);
  readonly tooltipTop = computed(() => this.viewStore.hoverPosition()?.top ?? 0);
}
