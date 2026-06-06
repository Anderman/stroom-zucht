import { DatasetConfig } from './energy-dashboard.types';

export const SUPPORTED_YEARS = [2020, 2021, 2022, 2023, 2024, 2025] as const;
export type SupportedYear = typeof SUPPORTED_YEARS[number];

export const GAS_HEATER_EFFICIENCY = 0.9;
export const HEAT_PUMP_COP = 3;
export const GAS_TO_ELECTRIC_EQUIVALENT_FACTOR = GAS_HEATER_EFFICIENCY / HEAT_PUMP_COP;
export const SOLAR_BASELINE_CAPACITY_GW_2025 = 28.6;
export const WINDLAND_BASELINE_CAPACITY_GW_2025 = 7.0;
export const WINDZEE_BASELINE_CAPACITY_GW_2025 = 4.75;
export const SOLAR_DEFAULT_FULL_LOAD_HOURS_2025 = 949;
export const WINDLAND_DEFAULT_FULL_LOAD_HOURS_2025 = 2390; // 16.731 TWh / 7 GW
export const WINDZEE_DEFAULT_FULL_LOAD_HOURS_2025 = 3348; // 15.905 TWh / 4.75 GW
export const BORSSELE_CAPACITY_GW = 0.485;
export const BORSSELE_FULL_LOAD_HOURS = 7630;
export const NUCLEAR_DEFAULT_CAPACITY_GW = 0;
export const NUCLEAR_DEFAULT_FULL_LOAD_HOURS = 7630;
export const AFVAL_BIOGAS_BASELOAD_GW = 0.3;
export const ELECTRICITY_COLOR = '#58c4dd';
export const SOLAR_COLOR = '#f6b73c';
export const GAS_COLOR = '#82d173';
export const TRANSPORT_COLOR = '#ff8a5b';
export const TOTAL_COLOR = '#f3f7ff';
export const PRICE_COLOR = '#ff5d8f';
export const TEMPERATURE_COLOR = '#7ec8ff';
export const BATTERY_COLOR = '#f6b73c';
export const PRICE_UNIT = 'ct/kWh';
export const TEMPERATURE_UNIT = '°C';
export const SOC_UNIT = '%';
export const WEEKEND_SHADE = 'rgba(111, 126, 150, 0.10)';

export const DATASETS: DatasetConfig[] = [
  {
    key: 'totaldemand',
    label: 'Totale vraag',
    description: 'Gestapelde vraag uit bestaande elektriciteit, gas voor warmte omgerekend naar een seizoensafhankelijk warmtepompprofiel, en een prijsgevoelig vervoersprofiel met vakantie- en seizoenseffecten op de gedeelde 8760-uras.',
    peakUnit: 'GW',
    totalUnit: 'TWh',
    color: TOTAL_COLOR,
    pointScale: 1 / 1_000_000,
    totalScale: 1 / 1_000_000_000,
  },
  {
    key: 'transport',
    label: 'Vervoer',
    description: 'EV-laadprofiel met prijssturing, vakantie-effecten en maandweging op basis van NOVE/CBS-brandstofomzet 2025 voor wegverkeer, plus een omzettingsfactor van 3,75 van fossiele eindenergie naar elektriciteit.',
    peakUnit: 'GW',
    totalUnit: 'TWh',
    color: TRANSPORT_COLOR,
    file: 'data-array/vervoer-2025-uur-array.json',
    pointScale: 1 / 1_000_000,
    totalScale: 1 / 1_000_000_000,
  },
  {
    key: 'generationtotal',
    label: 'Totaal opwek',
    description: 'Som van zon, wind op land en wind op zee op dezelfde 8760-uursas.',
    peakUnit: 'GW',
    totalUnit: 'TWh',
    color: TOTAL_COLOR,
    pointScale: 1 / 1_000_000,
    totalScale: 1 / 1_000_000_000,
  },
  {
    key: 'solar',
    label: 'Zon',
    description: 'Totale zonneproductie in Nederland, uur voor uur.',
    peakUnit: 'GW',
    totalUnit: 'TWh',
    color: SOLAR_COLOR,
    file: 'data-array/zon-2025-uur-array.json',
    pointScale: 1 / 1_000_000,
    totalScale: 1 / 1_000_000_000,
  },
  {
    key: 'electricity',
    label: 'Elektriciteit',
    description: 'Totale elektriciteitsvraag uit ENTSO-E load data, met de dynamische stroomprijs op dezelfde uur-as en een aparte rechter y-as.',
    peakUnit: 'GW',
    totalUnit: 'TWh',
    color: ELECTRICITY_COLOR,
    file: 'data-array/elektriciteit-2025-uur-array.json',
    pointScale: 1 / 1_000_000,
    totalScale: 1 / 1_000_000_000,
  },
  {
    key: 'electricitysolar',
    label: 'Elektriciteit + zon',
    description: 'Elektriciteitsvraag en zonneproductie over elkaar heen op dezelfde uur-as, zodat direct zichtbaar wordt hoeveel van de vraag samenvalt met zonproductie.',
    peakUnit: 'GW',
    totalUnit: 'TWh',
    color: ELECTRICITY_COLOR,
    pointScale: 1 / 1_000_000,
    totalScale: 1 / 1_000_000_000,
  },
  {
    key: 'gas',
    label: 'Gas',
    description: 'Gasreeks uit NED gebruikt type 31 `GasDistribution` met activity 2 `Consuming`. Dat sluit voor deze app grof aan op CBS aardgas bij `nijverheid + overige afnemers`, terwijl NED `industriële gasverbruikers` en `gascentrales` eerder terugkomen onder CBS `niet-energetisch gebruik`, `eigen verbruik` en `energieomzetting`.',
    peakUnit: 'GW',
    totalUnit: 'TWh',
    color: GAS_COLOR,
    file: 'data-array/aardgas-2025-uur-array.json',
    pointScale: 1 / 1_000_000,
    totalScale: 1 / 1_000_000_000,
  },
  {
    key: 'windland',
    label: 'Windland',
    description: 'Wind op land uit ENTSO-E actual generation per type.',
    peakUnit: 'GW',
    totalUnit: 'TWh',
    color: '#3f8cff',
    file: 'data-array/windland-2025-uur-array.json',
    pointScale: 1 / 1_000_000,
    totalScale: 1 / 1_000_000_000,
  },
  {
    key: 'windzee',
    label: 'Windzee',
    description: 'Wind op zee uit ENTSO-E actual generation per type.',
    peakUnit: 'GW',
    totalUnit: 'TWh',
    color: '#9d7cff',
    file: 'data-array/windzee-2025-uur-array.json',
    pointScale: 1 / 1_000_000,
    totalScale: 1 / 1_000_000_000,
  },
  {
    key: 'windzeewind',
    label: 'Zeewind potentieel (F3-JA-1)',
    description: 'Potentiële opwek op basis van de gemeten windsnelheid op 100m hoogte bij meetplatform F3-JA-1 in de Noordzee (Open-Meteo ERA5). De vermogenscurve gebruikt inschakelwindsnelheid 3 m/s, nominaal vermogen bij 11 m/s en uitschakelwindsnelheid 25 m/s. De waarden zijn als capaciteitsfactor opgeslagen (0–1 bij 1 GW referentie) en worden in de grafiek geschaald naar het ingestelde geïnstalleerde vermogen.',
    peakUnit: 'GW',
    totalUnit: 'TWh',
    color: '#c4a3ff',
    file: 'data-array/windzee-potentieel-2025-uur-array.json',
    optional: true,
    pointScale: 1 / 1_000_000,
    totalScale: 1 / 1_000_000_000,
  },
  {
    key: 'balance',
    label: 'Balans',
    description: 'Totaal opwek minus totale vraag op dezelfde uur-as. Positief is overschot, negatief is tekort.',
    peakUnit: 'GW',
    totalUnit: 'TWh',
    color: '#c5d7ff',
    pointScale: 1 / 1_000_000,
    totalScale: 1 / 1_000_000_000,
  },
  {
    key: 'publiccurtailment',
    label: 'Curtailment + waterstofvraag',
    description: 'Uurlijkse curtailment (publiek + privé) samen met waterstofvraag (tekort), in GW. Terugregelvolgorde: publiek eerst (windland, windzee, publieke zon, kern tot minimaal 50%) en privé als laatste.',
    peakUnit: 'GW',
    totalUnit: 'TWh',
    color: '#ffb347',
    pointScale: 1 / 1_000_000,
    totalScale: 1 / 1_000_000_000,
  },
];

/**
 * Returns a copy of DATASETS with all file paths adjusted for the given year.
 * File paths use the pattern `…-2025-…` which is replaced with `…-{year}-…`.
 */
export function getDatasets(year: number): DatasetConfig[] {
  return DATASETS.map(dataset => ({
    ...dataset,
    file: dataset.file ? dataset.file.replace(/-2025-/g, `-${year}-`) : dataset.file,
    // NED GasDistribution hourly data is only available from 2021 onwards
    optional: dataset.optional || (dataset.key === 'gas' && year < 2021),
  }));
}
