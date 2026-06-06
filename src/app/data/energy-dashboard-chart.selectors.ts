import uPlot from 'uplot';

import {
  BATTERY_COLOR,
  ELECTRICITY_COLOR,
  GAS_COLOR,
  PRICE_COLOR, SOLAR_COLOR,
  TEMPERATURE_COLOR,
  TOTAL_COLOR,
  TRANSPORT_COLOR
} from './energy-dashboard.config';
import { BalanceChartMode, ChartLegendItem, ChartSeries, DatasetConfig, DatasetKey } from './energy-dashboard.types';

export function selectDatasetValues(params: {
  activeDataset: DatasetKey;
  activeBalanceChartMode: BalanceChartMode;
  totalDemandValues: number[];
  totalGenerationValues: number[];
  balanceValues: number[];
  publicCurtailmentValues: number[];
  sortedBalanceValues: number[];
  gasElectricValues: number[];
  valuesByDataset: Partial<Record<DatasetKey, number[]>>;
}): number[] {
  if (params.activeDataset === 'totaldemand') {
    return params.totalDemandValues;
  }
  if (params.activeDataset === 'generationtotal') {
    return params.totalGenerationValues;
  }
  if (params.activeDataset === 'balance') {
    return params.activeBalanceChartMode === 'sorted' ? params.sortedBalanceValues : params.balanceValues;
  }
  if (params.activeDataset === 'publiccurtailment') {
    return params.publicCurtailmentValues;
  }
  if (params.activeDataset === 'gas') {
    return params.gasElectricValues;
  }

  return params.valuesByDataset[params.activeDataset] ?? [];
}

export function buildChartOverlaySeries(params: {
  activeDataset: DatasetKey;
  activeBalanceChartMode: BalanceChartMode;
  totalBatteryCapacityGWh: number;
  publicBatteryCapacityGWh: number;
  privateBatteryCapacityGWh: number;
  priceDisplayValues: number[];
  temperatureDisplayValues: number[];
  batteryStateValues: number[];
  publicBatteryStateValues: number[];
  privateBatteryStateValues: number[];
}): ChartSeries[] {
  const overlays: ChartSeries[] = [];

  if (params.activeDataset === 'electricity' || params.activeDataset === 'totaldemand') {
    if (params.priceDisplayValues.length) {
      overlays.push({ label: 'Dynamische prijs', color: PRICE_COLOR, values: params.priceDisplayValues, scale: 'price', dash: [8, 4], width: 2 });
    }
  }

  if (params.activeDataset === 'gas' || params.activeDataset === 'totaldemand') {
    if (params.temperatureDisplayValues.length) {
      overlays.push({ label: 'Temperatuur', color: TEMPERATURE_COLOR, values: params.temperatureDisplayValues, scale: 'temperature', dash: [5, 4], width: 2 });
    }
  }

  if (params.activeDataset === 'balance' && params.totalBatteryCapacityGWh > 0) {
    if (params.activeBalanceChartMode === 'sorted') {
      return overlays;
    }

    const toSocPercent = (values: number[], capacityGWh: number): number[] => {
      if (capacityGWh <= 0) {
        return values.map(() => 0);
      }

      return values.map(value => (value / 1_000_000 / capacityGWh) * 100);
    };

    overlays.push({
      label: 'Batterij SOC',
      color: BATTERY_COLOR,
      values: toSocPercent(params.batteryStateValues, params.totalBatteryCapacityGWh),
      scale: 'soc',
      dash: [7, 4],
      width: 2,
    });

    if (params.publicBatteryCapacityGWh > 0) {
      overlays.push({
        label: 'Batterij SOC publiek',
        color: '#ffd166',
        values: toSocPercent(params.publicBatteryStateValues, params.publicBatteryCapacityGWh),
        scale: 'soc',
        dash: [3, 3],
        width: 2,
      });
    }

    if (params.privateBatteryCapacityGWh > 0) {
      overlays.push({
        label: 'Batterij SOC prive',
        color: '#ff5d8f',
        values: toSocPercent(params.privateBatteryStateValues, params.privateBatteryCapacityGWh),
        scale: 'soc',
        dash: [10, 4],
        width: 2,
      });
    }
  }

  return overlays;
}

export function buildChartSeries(params: {
  selectedDataset: DatasetConfig;
  valuesByDataset: Partial<Record<DatasetKey, number[]>>;
  gasElectricValues: number[];
  transportElectricValues: number[];
  totalGenerationValues: number[];
  solarDisplayValues: number[];
  windlandDisplayValues: number[];
  windzeeDisplayValues: number[];
  windzeewindDisplayValues: number[];
  publicCurtailmentDisplayValues: number[];
  privateCurtailmentDisplayValues: number[];
  publicWindlandCurtailmentDisplayValues: number[];
  publicWindzeeCurtailmentDisplayValues: number[];
  publicSolarCurtailmentDisplayValues: number[];
  publicNuclearCurtailmentDisplayValues: number[];
  hydrogenDemandDisplayValues: number[];
  electricityDisplayValues: number[];
  selectedDisplayValues: number[];
  chartOverlaySeries: ChartSeries[];
}): ChartSeries[] {
  const dataset = params.selectedDataset;
  if (dataset.key === 'totaldemand') {
    const electricityValues = (params.valuesByDataset.electricity ?? []).map(value => value * dataset.pointScale);
    const gasValues = params.gasElectricValues.map(value => value * dataset.pointScale);
    const transportValues = params.transportElectricValues.map(value => value * dataset.pointScale);
    const electricityPlusGas = electricityValues.map((value, index) => value + (gasValues[index] ?? 0));
    const totalValues = electricityPlusGas.map((value, index) => value + (transportValues[index] ?? 0));

    return [
      { label: 'Elektriciteit', color: ELECTRICITY_COLOR, values: electricityValues, fill: `${ELECTRICITY_COLOR}2a` },
      { label: 'Gas voor warmte', color: GAS_COLOR, values: gasValues },
      { label: 'Vervoer', color: TRANSPORT_COLOR, values: transportValues },
      { label: 'Totaal', color: TOTAL_COLOR, values: totalValues },
      { label: 'Elektriciteit + gas', color: GAS_COLOR, values: electricityPlusGas, width: 0, alpha: 0, hideFromLegend: true },
      ...params.chartOverlaySeries,
    ];
  }

  if (dataset.key === 'generationtotal') {
    const totalValues = params.totalGenerationValues.map(value => value * dataset.pointScale);
    return [
      { label: 'Zon', color: SOLAR_COLOR, values: params.solarDisplayValues, fill: `${SOLAR_COLOR}20` },
      { label: 'Windland', color: '#3f8cff', values: params.windlandDisplayValues, fill: '#3f8cff20' },
      { label: 'Windzee', color: '#9d7cff', values: params.windzeeDisplayValues, fill: '#9d7cff20' },
      { label: 'Totaal opwek', color: TOTAL_COLOR, values: totalValues },
    ];
  }

  if (dataset.key === 'electricitysolar') {
    return [
      { label: 'Elektriciteitsvraag', color: ELECTRICITY_COLOR, values: params.electricityDisplayValues, fill: `${ELECTRICITY_COLOR}22` },
      { label: 'Zonneproductie', color: SOLAR_COLOR, values: params.solarDisplayValues, fill: `${SOLAR_COLOR}22` },
    ];
  }

  if (dataset.key === 'windzee') {
    const series: ChartSeries[] = [
      { label: 'Windzee (ENTSO-E)', color: '#9d7cff', values: params.windzeeDisplayValues, fill: '#9d7cff22' },
    ];
    if (params.windzeewindDisplayValues.length) {
      series.push({ label: 'Potentieel F3-JA-1', color: '#c4a3ff', values: params.windzeewindDisplayValues, dash: [6, 4], width: 2 });
    }
    return series;
  }

  if (dataset.key === 'publiccurtailment') {
    return [
      { label: 'Windland curtailment', color: '#3f8cff', values: params.publicWindlandCurtailmentDisplayValues, fill: '#3f8cff22' },
      { label: 'Windzee curtailment', color: '#9d7cff', values: params.publicWindzeeCurtailmentDisplayValues, fill: '#9d7cff22' },
      { label: 'Publieke zon curtailment', color: SOLAR_COLOR, values: params.publicSolarCurtailmentDisplayValues, fill: `${SOLAR_COLOR}22` },
      { label: 'Kern curtailment', color: '#ff7f50', values: params.publicNuclearCurtailmentDisplayValues, fill: '#ff7f5022' },
      { label: 'Waterstof vraag (tekort)', color: '#58c4dd', values: params.hydrogenDemandDisplayValues, dash: [8, 4], width: 2 },
      { label: 'Publiek totaal', color: '#ffb347', values: params.publicCurtailmentDisplayValues, width: 2 },
      { label: 'Privé curtailment (laatste stap)', color: '#ff5d8f', values: params.privateCurtailmentDisplayValues, dash: [6, 4], width: 2 },
    ];
  }

  return [{ label: dataset.label, color: dataset.color, values: params.selectedDisplayValues, fill: `${dataset.color}22` }, ...params.chartOverlaySeries];
}

export function buildVisibleChartSeries(activeDataset: DatasetKey, chartSeries: ChartSeries[], hiddenLegendLabels: string[]): ChartSeries[] {
  const hiddenLabels = new Set(hiddenLegendLabels);

  if (activeDataset !== 'totaldemand') {
    return chartSeries.filter(seriesDefinition => seriesDefinition.hideFromLegend || !hiddenLabels.has(seriesDefinition.label));
  }

  const visibleLabels = (labels: string[]) => labels.every(label => !hiddenLabels.has(label));
  const getSeries = (label: string) => chartSeries.find(seriesDefinition => seriesDefinition.label === label);
  const visibleSeries: ChartSeries[] = [];
  const electricitySeries = getSeries('Elektriciteit');
  const gasSeries = getSeries('Gas voor warmte');
  const transportSeries = getSeries('Vervoer');
  const totalSeries = getSeries('Totaal');
  const bridgeSeries = getSeries('Elektriciteit + gas');
  const priceSeries = getSeries('Dynamische prijs');
  const temperatureSeries = getSeries('Temperatuur');

  if (electricitySeries && !hiddenLabels.has(electricitySeries.label)) visibleSeries.push(electricitySeries);
  if (gasSeries && !hiddenLabels.has(gasSeries.label)) visibleSeries.push(gasSeries);
  if (transportSeries && !hiddenLabels.has(transportSeries.label)) visibleSeries.push(transportSeries);
  if (totalSeries && !hiddenLabels.has(totalSeries.label)) visibleSeries.push(totalSeries);
  if (bridgeSeries && visibleLabels(['Elektriciteit', 'Gas voor warmte'])) visibleSeries.push(bridgeSeries);
  if (priceSeries && !hiddenLabels.has(priceSeries.label)) visibleSeries.push(priceSeries);
  if (temperatureSeries && !hiddenLabels.has(temperatureSeries.label)) visibleSeries.push(temperatureSeries);

  return visibleSeries;
}

export function buildVisibleChartBands(activeDataset: DatasetKey, visibleChartSeries: ChartSeries[]): uPlot.Band[] {
  if (activeDataset !== 'totaldemand') {
    return [];
  }

  const indexByLabel = new Map(visibleChartSeries.map((seriesDefinition, index) => [seriesDefinition.label, index + 1]));
  const electricityIndex = indexByLabel.get('Elektriciteit');
  const bridgeIndex = indexByLabel.get('Elektriciteit + gas');
  const totalIndex = indexByLabel.get('Totaal');
  const transportVisible = indexByLabel.has('Vervoer');
  const bands: uPlot.Band[] = [];

  if (electricityIndex != null && bridgeIndex != null) {
    bands.push({ series: [electricityIndex, bridgeIndex], fill: `${GAS_COLOR}34` });
  }
  if (bridgeIndex != null && totalIndex != null && transportVisible) {
    bands.push({ series: [bridgeIndex, totalIndex], fill: `${TRANSPORT_COLOR}52` });
  }

  return bands;
}

export function buildChartLegendItems(chartSeries: ChartSeries[], hiddenLegendLabels: string[]): ChartLegendItem[] {
  const hiddenLabels = new Set(hiddenLegendLabels);
  return chartSeries.filter(seriesDefinition => !seriesDefinition.hideFromLegend).map(seriesDefinition => ({
    label: seriesDefinition.label,
    color: seriesDefinition.color,
    dashed: Boolean(seriesDefinition.dash?.length),
    active: !hiddenLabels.has(seriesDefinition.label),
  }));
}
