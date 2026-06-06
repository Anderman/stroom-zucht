import { computed, effect, inject, Injectable, signal } from '@angular/core';

import { euroFormatter, oneDecimalFormatter, statNumberFormatter } from '../core/formatters';

import {
  BATTERY_COST_SCENARIOS,
  BATTERY_REFERENCE_CELL_SIZE_KWH,
  BatteryCostModelSettings,
  createDefaultBatteryCostModelSettings,
  getBatteryCellSizePowerFactor,
  getBatteryCostBreakdown,
} from './battery-cost.model';
import { EnergyBalanceStore } from '../data/energy-balance.store';
import {
  buildCalculationTechnologyRow,
  createDefaultNuclearCfdSettings,
  createDefaultTechnologyCosts,
  ENERGY_TAX_BUSINESS_CT_PER_KWH,
  ENERGY_TAX_HOUSEHOLD_CT_PER_KWH,
  getAnnualNuclearCfdCost,
  getAnnualNuclearGenerationTWhForCost,
  getAnnualTechnologyCost,
  getAnnuityPayment,
  getNuclearCfdNoteText,
  HOUSEHOLD_CONSUMPTION_SHARE,
  NL_BUSINESS_CONNECTIONS,
  NL_HOUSEHOLDS,
  TECHNOLOGY_COST_DEFAULTS,
  VAT_RATE,
} from './energy-costs.model';
import {
  AFVAL_BIOGAS_BASELOAD_GW,
  BORSSELE_CAPACITY_GW,
  BORSSELE_FULL_LOAD_HOURS,
} from '../data/energy-dashboard.config';
import {
  parseStoredBatteryCostModelSettings,
  parseStoredNuclearCfdSettings,
  parseStoredNumber,
  parseStoredTechnologyCosts,
  readPersistedBalanceSettings,
  writePersistedBalanceSettings,
} from '../core/persistence';
import { EnergyDashboardStore } from '../data/energy-dashboard.store';
import {
  BatteryCostScenarioItem,
  BatteryCostSummaryItem,
  CalculationScenarioRow,
  CalculationTechnologyRow,
  NuclearCfdSettings,
  TechnologyCostKey,
  TechnologyCostValues,
} from '../data/energy-dashboard.types';

type TechnologyCostBucket = 'generation' | 'infra' | 'private';

type HydrogenSystemCostSettings = {
  dedicatedWindCapexPerGWEur: number;
  dedicatedWindOpexPerGWEur: number;
  dedicatedWindLifetimeYears: number;
  dedicatedWindInterestRatePercent: number;
  electrolyzerCapexPerGWEur: number;
  electrolyzerOpexPerGWEur: number;
  electrolyzerLifetimeYears: number;
  electrolyzerInterestRatePercent: number;
};

type TechnologyDeliveryRow = {
  label: string;
  potentialText: string;
  curtailmentText: string;
  deliveredText: string;
  totalText: string;
  behindMeterText?: string;
  gridText: string;
  hydrogenText: string;
  noteText: string;
};

type TechnologyDeliverySummary = {
  demandText: string;
  behindMeterText: string;
  deliveredText: string;
  gridDemandText: string;
  privateExportText: string;
  hydrogenText: string;
  potentialText: string;
  curtailmentText: string;
};

type TechnologyUnitCostRow = {
  label: string;
  priceText: string;
  annualCostText: string;
  potentialText: string;
  curtailmentText: string;
  deliveredText: string;
  noteText: string;
};

@Injectable({ providedIn: 'root' })
export class EnergyCostsStore {
  private static readonly SETTINGS_STORAGE_KEY = 'energyAtlas.balanceSettings';
  private static readonly AFVAL_BIOGAS_PRICE_PER_MWH_EUR = 30;
  private static readonly HYDROGEN_BACKUP_STANDBY_GW = 35;
  private static readonly HYDROGEN_BACKUP_CAPEX_PER_GW_EUR = 900_000_000;
  private static readonly HYDROGEN_BACKUP_OPEX_PER_GW_EUR = 20_000_000;
  private static readonly HYDROGEN_BACKUP_LIFETIME_YEARS = 30;
  private static readonly HYDROGEN_BACKUP_INTEREST_RATE_PERCENT = 5;
  private static readonly HYDROGEN_BACKUP_VARIABLE_EUR_PER_KWH = 0.18;
  private static readonly DEFAULT_H2_DEDICATED_WIND_CAPEX_PER_GW_EUR = 1_300_000_000;
  private static readonly DEFAULT_H2_DEDICATED_WIND_OPEX_PER_GW_EUR = 35_000_000;
  private static readonly DEFAULT_H2_DEDICATED_WIND_LIFETIME_YEARS = 27.5;
  private static readonly DEFAULT_H2_DEDICATED_WIND_INTEREST_RATE_PERCENT = 5;
  private static readonly DEFAULT_H2_ELECTROLYZER_CAPEX_PER_GW_EUR = 900_000_000;
  private static readonly DEFAULT_H2_ELECTROLYZER_OPEX_PER_GW_EUR = 20_000_000;
  private static readonly DEFAULT_H2_ELECTROLYZER_LIFETIME_YEARS = 30;
  private static readonly DEFAULT_H2_ELECTROLYZER_INTEREST_RATE_PERCENT = 5;

  private readonly balanceStore = inject(EnergyBalanceStore);
  private readonly dashboardStore = inject(EnergyDashboardStore);

  readonly technologyCosts = signal<Record<TechnologyCostKey, TechnologyCostValues>>(createDefaultTechnologyCosts());
  readonly nuclearCfdSettings = signal<NuclearCfdSettings>(createDefaultNuclearCfdSettings());
  readonly batteryCostModelSettings = signal<BatteryCostModelSettings>(createDefaultBatteryCostModelSettings());
  readonly hydrogenSystemCostSettings = signal<HydrogenSystemCostSettings>({
    dedicatedWindCapexPerGWEur: EnergyCostsStore.DEFAULT_H2_DEDICATED_WIND_CAPEX_PER_GW_EUR,
    dedicatedWindOpexPerGWEur: EnergyCostsStore.DEFAULT_H2_DEDICATED_WIND_OPEX_PER_GW_EUR,
    dedicatedWindLifetimeYears: EnergyCostsStore.DEFAULT_H2_DEDICATED_WIND_LIFETIME_YEARS,
    dedicatedWindInterestRatePercent: EnergyCostsStore.DEFAULT_H2_DEDICATED_WIND_INTEREST_RATE_PERCENT,
    electrolyzerCapexPerGWEur: EnergyCostsStore.DEFAULT_H2_ELECTROLYZER_CAPEX_PER_GW_EUR,
    electrolyzerOpexPerGWEur: EnergyCostsStore.DEFAULT_H2_ELECTROLYZER_OPEX_PER_GW_EUR,
    electrolyzerLifetimeYears: EnergyCostsStore.DEFAULT_H2_ELECTROLYZER_LIFETIME_YEARS,
    electrolyzerInterestRatePercent: EnergyCostsStore.DEFAULT_H2_ELECTROLYZER_INTEREST_RATE_PERCENT,
  });

  readonly calculationTechnologyRows = computed<CalculationTechnologyRow[]>(() => {
    const batterySettings = this.batteryCostModelSettings();
    const publicBatteryGWh = this.balanceStore.batteryCapacityGWh();
    const publicBatteryAnnualCost = getBatteryCostBreakdown({ ...batterySettings, energyCapacityTWh: publicBatteryGWh / 1_000 }).totalAnnualCost;
    const afvalBiogasEnergyTWh = this.getAnnualAfvalBiogasEnergyTWh();
    const hydrogenBackup = this.getHydrogenBackupCostBreakdown();

    const rows = [
      this.buildCalculationRow(
        'solarPublic',
        'Zon-PV publiek',
        this.balanceStore.publicSolarCapacityGW(),
        this.balanceStore.publicSolarCapacityGW() * this.balanceStore.solarFullLoadHours() / 1_000,
      ),
      this.buildCalculationRow(
        'solarPrivate',
        'Zon-PV privaat',
        this.balanceStore.privateSolarCapacityGW(),
        this.balanceStore.privateSolarCapacityGW() * this.balanceStore.solarFullLoadHours() / 1_000,
        'Niet in stroomprijs',
      ),
      this.buildCalculationRow(
        'windzee',
        'Wind op zee',
        this.balanceStore.windzeeCapacityGW(),
        this.balanceStore.windzeeCapacityGW() * this.balanceStore.windzeeFullLoadHours() / 1_000,
      ),
      this.buildCalculationRow(
        'offshoreConnection',
        'TenneT 2 GW aanlanding',
        this.balanceStore.offshoreConnectionSystems() * 2,
        this.balanceStore.windzeeCapacityGW() * this.balanceStore.windzeeFullLoadHours() / 1_000,
        `${this.balanceStore.offshoreConnectionSystems()} x 2 GW systeem, modelaanname op basis van TenneT 2 GW-programma`,
      ),
      this.buildCalculationRow(
        'windland',
        'Wind op land',
        this.balanceStore.windlandCapacityGW(),
        this.balanceStore.windlandCapacityGW() * this.balanceStore.windlandFullLoadHours() / 1_000,
      ),
      this.buildCalculationRow(
        'nuclear',
        'Kernenergie nieuwbouw',
        this.balanceStore.nuclearCapacityGW(),
        this.balanceStore.nuclearCapacityGW() * this.balanceStore.nuclearFullLoadHours() / 1_000,
      ),
      this.buildCalculationRow(
        'borssele',
        'Borssele (bestaand)',
        BORSSELE_CAPACITY_GW,
        BORSSELE_CAPACITY_GW * BORSSELE_FULL_LOAD_HOURS / 1_000,
        'Vaste bestaande opwek; alleen OPEX (geen CAPEX, geen rente).',
      ),
      this.buildFixedPriceCalculationRow(
        'afvalBiogas',
        'Afval en biogas',
        AFVAL_BIOGAS_BASELOAD_GW,
        afvalBiogasEnergyTWh,
        EnergyCostsStore.AFVAL_BIOGAS_PRICE_PER_MWH_EUR,
        'Vaste basislast in de balans; niet uitschakelbaar.',
      ),
      buildCalculationTechnologyRow({
        costKey: 'hydrogenBackup',
        label: 'Waterstof backup standby',
        capacityText: `${statNumberFormatter.format(hydrogenBackup.standbyGW)} GW`,
        energyText: `${statNumberFormatter.format(hydrogenBackup.shortageKWh / 1_000_000_000)} TWh/jaar tekort`,
        configuredCosts: this.technologyCosts().hydrogenBackup,
        annualCost: hydrogenBackup.totalAnnualCost,
        costUnitText: TECHNOLOGY_COST_DEFAULTS.hydrogenBackup.costUnitText,
        costFromModel: true,
        noteText: `${euroFormatter.format(hydrogenBackup.standbyAnnualCost)} standby (infra) + ${euroFormatter.format(hydrogenBackup.variableCostEur)} tekorturen (variabel). 35 GW wordt automatisch 0 GW als er geen tekort is.`,
        formatNumber: value => statNumberFormatter.format(value),
        formatCurrency: value => euroFormatter.format(value),
        toMillionEuroInputValue: value => this.toMillionEuroInputValue(value),
        annualGenerationCost: 0,
        annualInfraCost: hydrogenBackup.standbyAnnualCost,
        annualPrivateCost: hydrogenBackup.variableCostEur,
      }),
      this.buildStorageCalculationRow(
        'batteryPublic',
        'Batterij publiek',
        this.balanceStore.batteryCapacityGWh(),
        'Kosten op basis van het batterijkostmodel hierboven (cellen + hallen + power block + beheer).',
        publicBatteryAnnualCost,
      ),
    ];

    return rows;
  });

  readonly calculationAnnualSplitRows = computed<CalculationScenarioRow[]>(() => {
    const batterySettings = this.batteryCostModelSettings();
    const publicBatteryGWh = this.balanceStore.batteryCapacityGWh();

    const offshoreAnnualCost = this.getConfiguredAnnualTechnologyCost('offshoreConnection', this.balanceStore.offshoreConnectionSystems() * 2);
    const publicBatteryAnnualCost = getBatteryCostBreakdown({ ...batterySettings, energyCapacityTWh: publicBatteryGWh / 1_000 }).totalAnnualCost;

    const generationAnnualCost =
      this.getConfiguredAnnualTechnologyCost('solarPublic', this.balanceStore.publicSolarCapacityGW()) +
      this.getConfiguredAnnualTechnologyCost('windzee', this.balanceStore.windzeeCapacityGW()) +
      this.getConfiguredAnnualTechnologyCost('windland', this.balanceStore.windlandCapacityGW()) +
      this.getConfiguredAnnualTechnologyCost('nuclear', this.balanceStore.nuclearCapacityGW()) +
      this.getConfiguredAnnualTechnologyCost('borssele', BORSSELE_CAPACITY_GW) +
      this.getConfiguredAnnualTechnologyCost('afvalBiogas', AFVAL_BIOGAS_BASELOAD_GW);

    const hydrogenBackup = this.getHydrogenBackupCostBreakdown();
    const infraAnnualCost = offshoreAnnualCost + publicBatteryAnnualCost + hydrogenBackup.standbyAnnualCost;
    const privateInkoopKWh = this.dashboardStore.privateSolarToPublicKWhTotal();
    const privateInkoopAnnualCost = privateInkoopKWh * 0.03;
    const gridRelevantAnnualCost = generationAnnualCost + infraAnnualCost + hydrogenBackup.variableCostEur;
    const totalAnnualCostIncludingPrivateInkoop = gridRelevantAnnualCost + privateInkoopAnnualCost;
    const balanceModel = this.dashboardStore.balanceModel();
    const publicGenerationKWh = balanceModel.adjustedPublicGenerationValues.reduce((sum, value) => sum + value, 0);
    const publicCurtailmentKWh = balanceModel.publicCurtailmentValues.reduce((sum, value) => sum + value, 0);
    const usefulGeneratedKWh = Math.max(0, publicGenerationKWh - publicCurtailmentKWh);
    const totalPricedKWh = usefulGeneratedKWh + privateInkoopKWh;

    return [
      {
        label: 'Kosten per jaar opwek',
        annualCostText: euroFormatter.format(generationAnnualCost),
        priceText: totalPricedKWh > 0 ? `${oneDecimalFormatter.format((generationAnnualCost / totalPricedKWh) * 100)} ct/kWh` : 'n.v.t.',
        noteText: `${euroFormatter.format(generationAnnualCost)} aan zon, wind, Borssele, kern en afval/biogas. Noemer: ${statNumberFormatter.format(usefulGeneratedKWh / 1_000_000_000)} TWh publiek nuttig + ${statNumberFormatter.format(privateInkoopKWh / 1_000_000_000)} TWh inkoop privé = ${statNumberFormatter.format(totalPricedKWh / 1_000_000_000)} TWh.`,
      },
      {
        label: 'Kosten per jaar infra',
        annualCostText: euroFormatter.format(infraAnnualCost + hydrogenBackup.variableCostEur),
        priceText: totalPricedKWh > 0 ? `${oneDecimalFormatter.format(((infraAnnualCost + hydrogenBackup.variableCostEur) / totalPricedKWh) * 100)} ct/kWh` : 'n.v.t.',
        noteText: `${euroFormatter.format(offshoreAnnualCost)} offshore aanlanding + ${euroFormatter.format(publicBatteryAnnualCost)} publieke batterij + ${euroFormatter.format(hydrogenBackup.standbyAnnualCost)} waterstof-backup standby + ${euroFormatter.format(hydrogenBackup.variableCostEur)} tekorturen-waterstof.`,
      },
      {
        label: 'Kosten per jaar inkoop privé PV (vast 3,0 ct/kWh)',
        annualCostText: euroFormatter.format(privateInkoopAnnualCost),
        priceText: totalPricedKWh > 0 ? `${oneDecimalFormatter.format((privateInkoopAnnualCost / totalPricedKWh) * 100)} ct/kWh` : 'n.v.t.',
        noteText: `${statNumberFormatter.format(privateInkoopKWh / 1_000_000_000)} TWh (${statNumberFormatter.format(privateInkoopKWh)} kWh) geleverd door privé-PV aan grid × 3,0 ct/kWh vaste inkoopprijs = ${euroFormatter.format(privateInkoopAnnualCost)}.`,
      },
      {
        label: 'Totaal kosten per jaar (publiek + inkoop privé)',
        annualCostText: euroFormatter.format(totalAnnualCostIncludingPrivateInkoop),
        priceText: totalPricedKWh > 0 ? `${oneDecimalFormatter.format((totalAnnualCostIncludingPrivateInkoop / totalPricedKWh) * 100)} ct/kWh` : 'n.v.t.',
        noteText: `${euroFormatter.format(generationAnnualCost)} opwek + ${euroFormatter.format(infraAnnualCost + hydrogenBackup.variableCostEur)} infra + ${euroFormatter.format(privateInkoopAnnualCost)} inkoop privé. Levering: ${statNumberFormatter.format(usefulGeneratedKWh / 1_000_000_000)} TWh publiek nuttig en ${statNumberFormatter.format(privateInkoopKWh / 1_000_000_000)} TWh privé→grid.`,
      },
    ];
  });

  readonly technologyDeliveryRows = computed<TechnologyDeliveryRow[]>(() => {
    const balanceModel = this.dashboardStore.balanceModel();
    const publicSolarKWh = this.dashboardStore.adjustedPublicSolarValues().reduce((sum, value) => sum + value, 0);
    const windzeeKWh = this.dashboardStore.adjustedWindzeeValues().reduce((sum, value) => sum + value, 0);
    const windlandKWh = this.dashboardStore.adjustedWindlandValues().reduce((sum, value) => sum + value, 0);
    const nuclearNewKWh = this.dashboardStore.nuclearValues().reduce((sum, value) => sum + value, 0);
    const borsseleKWh = this.dashboardStore.borsseleValues().reduce((sum, value) => sum + value, 0);
    const afvalBiogasKWh = this.dashboardStore.afvalBiogasValues().reduce((sum, value) => sum + value, 0);
    const privateToGridKWh = this.dashboardStore.privateSolarToPublicKWhTotal();
    const publicSolarCurtailmentKWh = balanceModel.publicSolarCurtailmentValues.reduce((sum, value) => sum + value, 0);
    const windzeeCurtailmentKWh = balanceModel.publicWindzeeCurtailmentValues.reduce((sum, value) => sum + value, 0);
    const windlandCurtailmentKWh = balanceModel.publicWindlandCurtailmentValues.reduce((sum, value) => sum + value, 0);
    const nuclearCurtailmentTotalKWh = balanceModel.publicNuclearCurtailmentValues.reduce((sum, value) => sum + value, 0);
    const afvalBiogasCurtailmentKWh = balanceModel.publicAfvalBiogasCurtailmentValues.reduce((sum, value) => sum + value, 0);
    const nuclearPotentialTotalKWh = nuclearNewKWh + borsseleKWh;
    const nuclearNewCurtailmentKWh = nuclearPotentialTotalKWh > 0 ? nuclearCurtailmentTotalKWh * (nuclearNewKWh / nuclearPotentialTotalKWh) : 0;
    const borsseleCurtailmentKWh = Math.max(0, nuclearCurtailmentTotalKWh - nuclearNewCurtailmentKWh);

    const annualDemandKWh = this.dashboardStore.totalDemandValues().reduce((sum, value) => sum + value, 0);
    const privateGenerationKWh = balanceModel.adjustedPrivateGenerationValues.reduce((sum, value) => sum + value, 0);
    const privateCurtailmentKWh = balanceModel.privateCurtailmentValues.reduce((sum, value) => sum + value, 0);
    const privateUsableKWh = Math.max(0, privateGenerationKWh - privateCurtailmentKWh);
    const privateExportForAccountingKWh = Math.min(privateToGridKWh, privateUsableKWh);
    const privateSelfServedKWh = Math.max(0, privateUsableKWh - privateExportForAccountingKWh);
    const publicDeliveredKWh = Math.max(0, annualDemandKWh - privateSelfServedKWh);
    const hydrogenDeliveredKWh = this.dashboardStore.hydrogenToFactoriesKWhTotal();
    const soldPublicEnergyKWh = publicDeliveredKWh + hydrogenDeliveredKWh;
    const gridShare = soldPublicEnergyKWh > 0 ? publicDeliveredKWh / soldPublicEnergyKWh : 0;
    const hydrogenShare = soldPublicEnergyKWh > 0 ? hydrogenDeliveredKWh / soldPublicEnergyKWh : 0;
    const buildPublicRow = (label: string, potentialKWh: number, curtailmentKWh: number): TechnologyDeliveryRow => {
      const deliveredKWh = Math.max(0, potentialKWh - curtailmentKWh);
      const toGridKWh = deliveredKWh * gridShare;
      const toHydrogenKWh = deliveredKWh * hydrogenShare;

      return {
        label,
        potentialText: `${statNumberFormatter.format(potentialKWh / 1_000_000_000)} TWh`,
        curtailmentText: `${statNumberFormatter.format(curtailmentKWh / 1_000_000_000)} TWh`,
        deliveredText: `${statNumberFormatter.format(deliveredKWh / 1_000_000_000)} TWh`,
        totalText: `${statNumberFormatter.format(deliveredKWh / 1_000_000_000)} TWh`,
        gridText: `${statNumberFormatter.format(toGridKWh / 1_000_000_000)} TWh`,
        hydrogenText: `${statNumberFormatter.format(toHydrogenKWh / 1_000_000_000)} TWh`,
        noteText: `Potentieel ${statNumberFormatter.format(potentialKWh / 1_000_000_000)} TWh minus curtailment ${statNumberFormatter.format(curtailmentKWh / 1_000_000_000)} TWh = geleverd ${statNumberFormatter.format(deliveredKWh / 1_000_000_000)} TWh. Verdeling van geleverd: ${oneDecimalFormatter.format(gridShare * 100)}% grid en ${oneDecimalFormatter.format(hydrogenShare * 100)}% waterstof.`,
      };
    };

    return [
      buildPublicRow('Zon publiek', publicSolarKWh, publicSolarCurtailmentKWh),
      buildPublicRow('Wind op zee', windzeeKWh, windzeeCurtailmentKWh),
      buildPublicRow('Wind op land', windlandKWh, windlandCurtailmentKWh),
      buildPublicRow('Kern nieuwbouw', nuclearNewKWh, nuclearNewCurtailmentKWh),
      buildPublicRow('Borssele', borsseleKWh, borsseleCurtailmentKWh),
      buildPublicRow('Afval/biogas', afvalBiogasKWh, afvalBiogasCurtailmentKWh),
      {
        label: 'Privé PV',
        potentialText: `${statNumberFormatter.format(privateGenerationKWh / 1_000_000_000)} TWh`,
        curtailmentText: `${statNumberFormatter.format(privateCurtailmentKWh / 1_000_000_000)} TWh`,
        deliveredText: `${statNumberFormatter.format(privateExportForAccountingKWh / 1_000_000_000)} TWh`,
        totalText: `${statNumberFormatter.format(privateExportForAccountingKWh / 1_000_000_000)} TWh`,
        behindMeterText: `${statNumberFormatter.format(privateSelfServedKWh / 1_000_000_000)} TWh`,
        gridText: `${statNumberFormatter.format(privateExportForAccountingKWh / 1_000_000_000)} TWh`,
        hydrogenText: '0,0 TWh',
        noteText: '',
      },
    ];
  });

  readonly technologyDeliveryTotalText = computed(() => {
    const publicDeliveredKWh = this.dashboardStore.balanceModel().adjustedPublicGenerationValues.reduce((sum, value) => sum + value, 0)
      - this.dashboardStore.publicCurtailmentKWhTotal();
    const privateToGridKWh = this.dashboardStore.privateSolarToPublicKWhTotal();
    const totalKWh = Math.max(0, publicDeliveredKWh) + privateToGridKWh;
    return `${statNumberFormatter.format(totalKWh / 1_000_000_000)} TWh`;
  });

  readonly technologyUnitCostRows = computed<TechnologyUnitCostRow[]>(() => {
    const balanceModel = this.dashboardStore.balanceModel();
    const publicSolarKWh = this.dashboardStore.adjustedPublicSolarValues().reduce((sum, value) => sum + value, 0);
    const windzeeKWh = this.dashboardStore.adjustedWindzeeValues().reduce((sum, value) => sum + value, 0);
    const windlandKWh = this.dashboardStore.adjustedWindlandValues().reduce((sum, value) => sum + value, 0);
    const nuclearNewKWh = this.dashboardStore.nuclearValues().reduce((sum, value) => sum + value, 0);
    const borsseleKWh = this.dashboardStore.borsseleValues().reduce((sum, value) => sum + value, 0);
    const afvalBiogasKWh = this.dashboardStore.afvalBiogasValues().reduce((sum, value) => sum + value, 0);
    const publicSolarCurtailmentKWh = balanceModel.publicSolarCurtailmentValues.reduce((sum, value) => sum + value, 0);
    const windzeeCurtailmentKWh = balanceModel.publicWindzeeCurtailmentValues.reduce((sum, value) => sum + value, 0);
    const windlandCurtailmentKWh = balanceModel.publicWindlandCurtailmentValues.reduce((sum, value) => sum + value, 0);
    const nuclearCurtailmentTotalKWh = balanceModel.publicNuclearCurtailmentValues.reduce((sum, value) => sum + value, 0);
    const afvalBiogasCurtailmentKWh = balanceModel.publicAfvalBiogasCurtailmentValues.reduce((sum, value) => sum + value, 0);
    const nuclearPotentialTotalKWh = nuclearNewKWh + borsseleKWh;
    const nuclearNewCurtailmentKWh = nuclearPotentialTotalKWh > 0 ? nuclearCurtailmentTotalKWh * (nuclearNewKWh / nuclearPotentialTotalKWh) : 0;
    const borsseleCurtailmentKWh = Math.max(0, nuclearCurtailmentTotalKWh - nuclearNewCurtailmentKWh);

    const buildPublicTechnologyCostRow = (
      label: string,
      costKey: TechnologyCostKey,
      costCapacityGW: number,
      potentialKWh: number,
      curtailmentKWh: number,
    ): TechnologyUnitCostRow => {
      const annualCost = this.getConfiguredAnnualTechnologyCost(costKey, costCapacityGW);
      const deliveredKWh = Math.max(0, potentialKWh - curtailmentKWh);
      const ctPerKwh = deliveredKWh > 0 ? (annualCost / deliveredKWh) * 100 : 0;

      return {
        label,
        priceText: deliveredKWh > 0 ? `${oneDecimalFormatter.format(ctPerKwh)} ct/kWh` : 'n.v.t.',
        annualCostText: euroFormatter.format(annualCost),
        potentialText: `${statNumberFormatter.format(potentialKWh / 1_000_000_000)} TWh`,
        curtailmentText: `${statNumberFormatter.format(curtailmentKWh / 1_000_000_000)} TWh`,
        deliveredText: `${statNumberFormatter.format(deliveredKWh / 1_000_000_000)} TWh`,
        noteText: `Jaarlast ${euroFormatter.format(annualCost)} gedeeld door geleverd volume ${statNumberFormatter.format(deliveredKWh / 1_000_000_000)} TWh.`,
      };
    };

    const privateToGridKWh = this.dashboardStore.privateSolarToPublicKWhTotal();
    const privateInkoopAnnualCost = privateToGridKWh * 0.03;
    const privateGenerationKWh = balanceModel.adjustedPrivateGenerationValues.reduce((sum, value) => sum + value, 0);
    const privateCurtailmentKWh = balanceModel.privateCurtailmentValues.reduce((sum, value) => sum + value, 0);

    return [
      buildPublicTechnologyCostRow('Zon publiek', 'solarPublic', this.balanceStore.publicSolarCapacityGW(), publicSolarKWh, publicSolarCurtailmentKWh),
      buildPublicTechnologyCostRow('Wind op zee', 'windzee', this.balanceStore.windzeeCapacityGW(), windzeeKWh, windzeeCurtailmentKWh),
      buildPublicTechnologyCostRow('Wind op land', 'windland', this.balanceStore.windlandCapacityGW(), windlandKWh, windlandCurtailmentKWh),
      buildPublicTechnologyCostRow('Kern nieuwbouw', 'nuclear', this.balanceStore.nuclearCapacityGW(), nuclearNewKWh, nuclearNewCurtailmentKWh),
      buildPublicTechnologyCostRow('Borssele', 'borssele', BORSSELE_CAPACITY_GW, borsseleKWh, borsseleCurtailmentKWh),
      buildPublicTechnologyCostRow('Afval/biogas', 'afvalBiogas', AFVAL_BIOGAS_BASELOAD_GW, afvalBiogasKWh, afvalBiogasCurtailmentKWh),
      {
        label: 'Privé PV inkoop',
        priceText: privateToGridKWh > 0 ? '3,0 ct/kWh' : 'n.v.t.',
        annualCostText: euroFormatter.format(privateInkoopAnnualCost),
        potentialText: `${statNumberFormatter.format(privateGenerationKWh / 1_000_000_000)} TWh`,
        curtailmentText: `${statNumberFormatter.format(privateCurtailmentKWh / 1_000_000_000)} TWh`,
        deliveredText: `${statNumberFormatter.format(privateToGridKWh / 1_000_000_000)} TWh`,
        noteText: `${statNumberFormatter.format(privateToGridKWh / 1_000_000_000)} TWh geleverd aan grid tegen vaste inkoopprijs van 3,0 ct/kWh.`,
      },
    ];
  });

  readonly technologyDeliverySummary = computed<TechnologyDeliverySummary>(() => {
    const balanceModel = this.dashboardStore.balanceModel();
    const annualDemandKWh = this.dashboardStore.totalDemandValues().reduce((sum, value) => sum + value, 0);
    const privateToGridKWh = this.dashboardStore.privateSolarToPublicKWhTotal();
    const privatePotentialKWh = balanceModel.adjustedPrivateGenerationValues.reduce((sum, value) => sum + value, 0);
    const privateCurtailmentKWh = balanceModel.privateCurtailmentValues.reduce((sum, value) => sum + value, 0);
    const privateUsableKWh = Math.max(0, privatePotentialKWh - privateCurtailmentKWh);
    const privateExportForAccountingKWh = Math.min(privateToGridKWh, privateUsableKWh);
    const privateSelfServedKWh = Math.max(0, privateUsableKWh - privateExportForAccountingKWh);
    const hydrogenKWh = this.dashboardStore.hydrogenToFactoriesKWhTotal();
    const gridDemandKWh = Math.max(0, annualDemandKWh - privateSelfServedKWh);
    const publicPotentialKWh = this.dashboardStore.adjustedPublicSolarValues().reduce((sum, value) => sum + value, 0)
      + this.dashboardStore.adjustedWindzeeValues().reduce((sum, value) => sum + value, 0)
      + this.dashboardStore.adjustedWindlandValues().reduce((sum, value) => sum + value, 0)
      + this.dashboardStore.nuclearValues().reduce((sum, value) => sum + value, 0)
      + this.dashboardStore.borsseleValues().reduce((sum, value) => sum + value, 0)
      + this.dashboardStore.afvalBiogasValues().reduce((sum, value) => sum + value, 0);
    const publicCurtailmentKWh = this.dashboardStore.publicCurtailmentKWhTotal();
    // gridDemandKWh already includes the share served by private PV export.
    const deliveredKWh = gridDemandKWh + hydrogenKWh;

    return {
      demandText: `${statNumberFormatter.format(annualDemandKWh / 1_000_000_000)} TWh`,
      behindMeterText: `${statNumberFormatter.format(privateSelfServedKWh / 1_000_000_000)} TWh`,
      deliveredText: `${statNumberFormatter.format(deliveredKWh / 1_000_000_000)} TWh`,
      gridDemandText: `${statNumberFormatter.format(gridDemandKWh / 1_000_000_000)} TWh`,
      privateExportText: `${statNumberFormatter.format(privateExportForAccountingKWh / 1_000_000_000)} TWh`,
      hydrogenText: `${statNumberFormatter.format(hydrogenKWh / 1_000_000_000)} TWh`,
      potentialText: `${statNumberFormatter.format((publicPotentialKWh + privatePotentialKWh) / 1_000_000_000)} TWh`,
      curtailmentText: `${statNumberFormatter.format((publicCurtailmentKWh + privateCurtailmentKWh) / 1_000_000_000)} TWh`,
    };
  });

  readonly calculationScenarioRows = computed<CalculationScenarioRow[]>(() => {
    const batterySettings = this.batteryCostModelSettings();
    const publicBatteryGWh = this.balanceStore.batteryCapacityGWh();

    const offshoreAnnualCost = this.getConfiguredAnnualTechnologyCost('offshoreConnection', this.balanceStore.offshoreConnectionSystems() * 2);
    const publicBatteryAnnualCost = getBatteryCostBreakdown({ ...batterySettings, energyCapacityTWh: publicBatteryGWh / 1_000 }).totalAnnualCost;

    // Opwekkosten = alles behalve de infra-component (offshore al meegenomen via infraAnnualCost).
    const generationAnnualCost =
      this.getConfiguredAnnualTechnologyCost('solarPublic', this.balanceStore.publicSolarCapacityGW()) +
      this.getConfiguredAnnualTechnologyCost('windzee', this.balanceStore.windzeeCapacityGW()) +
      this.getConfiguredAnnualTechnologyCost('windland', this.balanceStore.windlandCapacityGW()) +
      this.getConfiguredAnnualTechnologyCost('nuclear', this.balanceStore.nuclearCapacityGW()) +
      this.getConfiguredAnnualTechnologyCost('borssele', BORSSELE_CAPACITY_GW) +
      this.getConfiguredAnnualTechnologyCost('afvalBiogas', AFVAL_BIOGAS_BASELOAD_GW);

    const hydrogenBackup = this.getHydrogenBackupCostBreakdown();

    // Infrastructuurkosten = TenneT aansluiting + publieke batterij + standby waterstofvermogen.
    const infraAnnualCost = offshoreAnnualCost + publicBatteryAnnualCost + hydrogenBackup.standbyAnnualCost;

    // Transportkosten privé→publiek (3 ct/kWh tarief voor gebruik publiek net).
    const privateSolarToPublicKWh = this.dashboardStore.privateSolarToPublicKWhTotal();
    const transferCostEur = privateSolarToPublicKWh * 0.03;
    // Totale systeemkosten voor de grid-kWh-prijs: opwek + infra + tekorturen-waterstof.
    const gridRelevantAnnualCost = generationAnnualCost + infraAnnualCost + hydrogenBackup.variableCostEur;
    const grossAnnualCost = gridRelevantAnnualCost + transferCostEur;
    const baseAnnualCost = gridRelevantAnnualCost;
    const privateAndNvtAnnualCost = transferCostEur;

    // Prijs per kWh gebaseerd op totaal verbruik (niet opwek).
    const annualDemandKWh = this.dashboardStore.totalDemandValues().reduce((sum, v) => sum + v, 0);
    const annualDemandTWh = annualDemandKWh / 1_000_000_000;
    const ctPerKwh = annualDemandKWh > 0 ? (baseAnnualCost / annualDemandKWh) * 100 : 0;
    const behindMeterDemandShare = this.balanceStore.privateDemandShare();

    // Infrastructuurkosten verdeeld naar verbruiksaandeel: 35% huishoudens, 65% bedrijven.
    const householdInfraMonthly = (infraAnnualCost * HOUSEHOLD_CONSUMPTION_SHARE) / NL_HOUSEHOLDS / 12;
    const businessInfraMonthly = (infraAnnualCost * (1 - HOUSEHOLD_CONSUMPTION_SHARE)) / NL_BUSINESS_CONNECTIONS / 12;

    // Publiek geleverd volume = totale vraag minus privé-afdekking (direct + via privébatterij).
    // Benadering privé-afdekking: private opwek die niet naar publiek gaat en niet wordt gecurtaild.
    const privateGenerationKWh = this.dashboardStore.balanceModel().adjustedPrivateGenerationValues.reduce((sum, v) => sum + v, 0);
    const privateCurtailmentKWh = this.dashboardStore.balanceModel().privateCurtailmentValues.reduce((sum, v) => sum + v, 0);
    const privateDemandKWh = annualDemandKWh * behindMeterDemandShare;
    const privateNetForOwnUseKWh = Math.max(0, privateGenerationKWh - privateCurtailmentKWh - privateSolarToPublicKWh);
    const privateSelfServedKWh = Math.min(privateDemandKWh, privateNetForOwnUseKWh);
    const publicDeliveredKWh = Math.max(0, annualDemandKWh - privateSelfServedKWh);
    const hydrogenDeliveredKWh = this.dashboardStore.hydrogenToFactoriesKWhTotal();
    const publicCurtailmentKWh = this.dashboardStore.publicCurtailmentKWhTotal();
    const publicGenerationKWh = this.dashboardStore.balanceModel().adjustedPublicGenerationValues.reduce((sum, value) => sum + value, 0);
    const usefulGeneratedKWh = Math.max(0, publicGenerationKWh - publicCurtailmentKWh);

    // Verdeel totale publieke opwekkosten evenredig over verkoop naar grid en elektrolyse.
    // Curtailment wordt hierdoor impliciet in dezelfde verhouding toegerekend.
    const soldPublicEnergyKWh = publicDeliveredKWh + hydrogenDeliveredKWh;
    const gridShareOfPublicSales = soldPublicEnergyKWh > 0 ? publicDeliveredKWh / soldPublicEnergyKWh : 0;
    const electrolysisShareOfPublicSales = soldPublicEnergyKWh > 0 ? hydrogenDeliveredKWh / soldPublicEnergyKWh : 0;
    const gridAttributedGenerationAnnualCost = generationAnnualCost * gridShareOfPublicSales;
    const electrolysisAttributedGenerationAnnualCost = generationAnnualCost * electrolysisShareOfPublicSales;

    // Opwek (variabele) kosten per kWh publiek geleverd.
    const ctPerKwhGeneration = publicDeliveredKWh > 0
      ? ((gridAttributedGenerationAnnualCost + hydrogenBackup.variableCostEur) / publicDeliveredKWh) * 100
      : 0;

    // Segment-specifieke geleverde volumes (kWh/jaar) voor variabele tarieven.
    const meaningfulDeliveryThresholdKWh = 1_000_000_000;
    const hasMeaningfulPublicDelivery = publicDeliveredKWh >= meaningfulDeliveryThresholdKWh;
    const householdDemandKWh = annualDemandKWh * HOUSEHOLD_CONSUMPTION_SHARE;
    const businessDemandKWh = annualDemandKWh * (1 - HOUSEHOLD_CONSUMPTION_SHARE);
    const householdPrivateSelfServedKWh = privateSelfServedKWh * HOUSEHOLD_CONSUMPTION_SHARE;
    const businessPrivateSelfServedKWh = privateSelfServedKWh * (1 - HOUSEHOLD_CONSUMPTION_SHARE);
    const householdDeliveredRawKWh = Math.max(0, householdDemandKWh - householdPrivateSelfServedKWh);
    const businessDeliveredRawKWh = Math.max(0, businessDemandKWh - businessPrivateSelfServedKWh);
    const deliveredRawTotalKWh = householdDeliveredRawKWh + businessDeliveredRawKWh;
    const householdDeliveredKWh = deliveredRawTotalKWh > 0
      ? publicDeliveredKWh * (householdDeliveredRawKWh / deliveredRawTotalKWh)
      : 0;
    const businessDeliveredKWh = Math.max(0, publicDeliveredKWh - householdDeliveredKWh);
    const hasMeaningfulHouseholdDelivery = householdDeliveredKWh >= meaningfulDeliveryThresholdKWh;
    const hasMeaningfulBusinessDelivery = businessDeliveredKWh >= meaningfulDeliveryThresholdKWh;

    // Verdeel totale variabele opwekkosten over segmenten naar geleverd volume.
    const variableGenerationAnnualCost = gridAttributedGenerationAnnualCost + hydrogenBackup.variableCostEur;
    const householdGenerationAnnualCost = publicDeliveredKWh > 0
      ? variableGenerationAnnualCost * (householdDeliveredKWh / publicDeliveredKWh)
      : 0;
    const businessGenerationAnnualCost = publicDeliveredKWh > 0
      ? variableGenerationAnnualCost * (businessDeliveredKWh / publicDeliveredKWh)
      : 0;

    const householdGenerationCtPerKwh = householdDeliveredKWh > 0
      ? (householdGenerationAnnualCost / householdDeliveredKWh) * 100
      : 0;
    const businessGenerationCtPerKwh = businessDeliveredKWh > 0
      ? (businessGenerationAnnualCost / businessDeliveredKWh) * 100
      : 0;

    // Gemiddeld geleverd volume per aansluiting per maand (kWh).
    const avgHouseholdDeliveredMonthlyKWh = householdDeliveredKWh / NL_HOUSEHOLDS / 12;
    const avgBusinessDeliveredMonthlyKWh = businessDeliveredKWh / NL_BUSINESS_CONNECTIONS / 12;
    const privateBatteryGWh = this.balanceStore.privateBatteryCapacityGWh();
    const privateBatteryCapacityKWh = privateBatteryGWh * 1_000_000;
    const householdBatteryPerConnectionKWh = (privateBatteryCapacityKWh * HOUSEHOLD_CONSUMPTION_SHARE) / NL_HOUSEHOLDS;
    const businessBatteryPerConnectionKWh = (privateBatteryCapacityKWh * (1 - HOUSEHOLD_CONSUMPTION_SHARE)) / NL_BUSINESS_CONNECTIONS;

    // Totale variabele kWh-prijs incl. energiebelasting (+ BTW voor huishoudens).
    const householdTotalCtPerKwh = householdDeliveredKWh > 0
      ? (householdGenerationCtPerKwh + ENERGY_TAX_HOUSEHOLD_CT_PER_KWH) * (1 + VAT_RATE)
      : 0;
    const businessTotalCtPerKwh = businessDeliveredKWh > 0
      ? businessGenerationCtPerKwh + ENERGY_TAX_BUSINESS_CT_PER_KWH
      : 0;

    // Maandelijkse variabele kosten op basis van gemiddeld geleverd volume.
    const householdVariableMonthly = (householdTotalCtPerKwh / 100) * avgHouseholdDeliveredMonthlyKWh;
    const businessVariableMonthly = (businessTotalCtPerKwh / 100) * avgBusinessDeliveredMonthlyKWh;

    return [
      {
        label: 'Systeemprijs basis (publiek + inkoop privé)',
        annualCostText: `${statNumberFormatter.format((usefulGeneratedKWh + privateSolarToPublicKWh) / 1_000_000_000)} TWh geprijsd`,
        priceText: (usefulGeneratedKWh + privateSolarToPublicKWh) > 0
          ? `${oneDecimalFormatter.format(((baseAnnualCost + transferCostEur) / (usefulGeneratedKWh + privateSolarToPublicKWh)) * 100)} ct/kWh`
          : 'n.v.t.',
        noteText: `Formule: (${euroFormatter.format(baseAnnualCost)} publiek + ${euroFormatter.format(transferCostEur)} inkoop privé) / (${statNumberFormatter.format(usefulGeneratedKWh / 1_000_000_000)} TWh publiek nuttig + ${statNumberFormatter.format(privateSolarToPublicKWh / 1_000_000_000)} TWh inkoop privé).`,
      },
      {
        label: 'Vast: infrastructuur huishouden',
        annualCostText: euroFormatter.format(infraAnnualCost * HOUSEHOLD_CONSUMPTION_SHARE),
        priceText: `€ ${statNumberFormatter.format(householdInfraMonthly)} / maand extra (excl. BTW)`,
        noteText: `${statNumberFormatter.format(HOUSEHOLD_CONSUMPTION_SHARE * 100)}% van infra-kosten (TenneT + batterij publiek) / ${statNumberFormatter.format(NL_HOUSEHOLDS / 1_000_000)} mln aansluitingen; huishoudens betalen hierover doorgaans nog 21% BTW`,
      },
      {
        label: 'Afname huishouden (incl. opwek, EB + BTW)',
        annualCostText: `${oneDecimalFormatter.format(householdGenerationCtPerKwh)} ct opwek + ${oneDecimalFormatter.format(ENERGY_TAX_HOUSEHOLD_CT_PER_KWH)} ct EB × 1,21 BTW = ${oneDecimalFormatter.format(householdTotalCtPerKwh)} ct/kWh`,
        priceText: hasMeaningfulHouseholdDelivery ? `€ ${statNumberFormatter.format(householdVariableMonthly)} / maand` : 'n.v.t.',
        noteText: hasMeaningfulHouseholdDelivery
          ? `${statNumberFormatter.format(householdDeliveredKWh / 1_000_000_000)} TWh geleverd aan huishoudens / ${statNumberFormatter.format(NL_HOUSEHOLDS / 1_000_000)} mln / 12 = ${statNumberFormatter.format(avgHouseholdDeliveredMonthlyKWh)} kWh/maand · Toegerekende private batterij: ${statNumberFormatter.format(householdBatteryPerConnectionKWh)} kWh/aansluiting (35% × ${statNumberFormatter.format(privateBatteryGWh)} GWh / ${statNumberFormatter.format(NL_HOUSEHOLDS / 1_000_000)} mln)`
          : `Geen betekenisvolle levering aan huishoudens; variabele maandkosten niet zinvol · Toegerekende private batterij: ${statNumberFormatter.format(householdBatteryPerConnectionKWh)} kWh/aansluiting (35% × ${statNumberFormatter.format(privateBatteryGWh)} GWh / ${statNumberFormatter.format(NL_HOUSEHOLDS / 1_000_000)} mln)`,
      },
      {
        label: 'Opwek kosten totaal per kWh publiek geleverd',
        annualCostText: euroFormatter.format(variableGenerationAnnualCost),
        priceText: hasMeaningfulPublicDelivery
          ? `${oneDecimalFormatter.format(ctPerKwhGeneration)} ct/kWh publiek geleverd`
          : 'n.v.t. bij ~0 TWh publiek geleverd',
        noteText: hasMeaningfulPublicDelivery
          ? `${euroFormatter.format(variableGenerationAnnualCost)} grid-toegerekend opwek+H2-backup. Opwektoerekening: ${oneDecimalFormatter.format(gridShareOfPublicSales * 100)}% grid (${statNumberFormatter.format(publicDeliveredKWh / 1_000_000_000)} TWh) en ${oneDecimalFormatter.format(electrolysisShareOfPublicSales * 100)}% elektrolyse (${statNumberFormatter.format(hydrogenDeliveredKWh / 1_000_000_000)} TWh), incl. evenredige toerekening van ${statNumberFormatter.format(publicCurtailmentKWh / 1_000_000_000)} TWh curtailment. Elektrolyse krijgt ${euroFormatter.format(electrolysisAttributedGenerationAnnualCost)} van de opwekkosten. Privé→publiek transport (${euroFormatter.format(transferCostEur)}) valt buiten deze publieke kWh-prijs.`
          : `${euroFormatter.format(variableGenerationAnnualCost)} grid-toegerekend opwek+H2-backup, maar ~0 TWh publiek geleverd; prijs per kWh niet zinvol als vrijwel alles AchterDeMeter-afgedekt wordt`,
      },
      {
        label: 'Vast: infrastructuur bedrijf',
        annualCostText: euroFormatter.format(infraAnnualCost * (1 - HOUSEHOLD_CONSUMPTION_SHARE)),
        priceText: `€ ${statNumberFormatter.format(businessInfraMonthly)} / maand extra`,
        noteText: `${statNumberFormatter.format((1 - HOUSEHOLD_CONSUMPTION_SHARE) * 100)}% van infra-kosten (TenneT + batterij publiek) / ${statNumberFormatter.format(NL_BUSINESS_CONNECTIONS / 1_000)} k aansluitingen`,
      },
      {
        label: 'Afname bedrijf (incl. opwek en EB)',
        annualCostText: `${oneDecimalFormatter.format(businessGenerationCtPerKwh)} ct opwek + ${oneDecimalFormatter.format(ENERGY_TAX_BUSINESS_CT_PER_KWH)} ct EB = ${oneDecimalFormatter.format(businessTotalCtPerKwh)} ct/kWh`,
        priceText: hasMeaningfulBusinessDelivery ? `€ ${statNumberFormatter.format(businessVariableMonthly)} / maand` : 'n.v.t.',
        noteText: hasMeaningfulBusinessDelivery
          ? `${statNumberFormatter.format(businessDeliveredKWh / 1_000_000_000)} TWh geleverd aan bedrijven / ${statNumberFormatter.format(NL_BUSINESS_CONNECTIONS / 1_000)} k / 12 = ${statNumberFormatter.format(avgBusinessDeliveredMonthlyKWh)} kWh/maand · Toegerekende private batterij: ${statNumberFormatter.format(businessBatteryPerConnectionKWh)} kWh/aansluiting (65% × ${statNumberFormatter.format(privateBatteryGWh)} GWh / ${statNumberFormatter.format(NL_BUSINESS_CONNECTIONS / 1_000)} k)`
          : `Geen betekenisvolle levering aan bedrijven; variabele maandkosten niet zinvol · Toegerekende private batterij: ${statNumberFormatter.format(businessBatteryPerConnectionKWh)} kWh/aansluiting (65% × ${statNumberFormatter.format(privateBatteryGWh)} GWh / ${statNumberFormatter.format(NL_BUSINESS_CONNECTIONS / 1_000)} k)`,
      },
      {
        label: 'Waterstof backup (standby + tekorturen)',
        annualCostText: euroFormatter.format(hydrogenBackup.totalAnnualCost),
        priceText: `${statNumberFormatter.format(hydrogenBackup.standbyGW)} GW standby · ${statNumberFormatter.format(hydrogenBackup.shortageKWh / 1_000_000_000)} TWh inzet`,
        noteText: `${euroFormatter.format(hydrogenBackup.standbyAnnualCost)} infra standby + ${euroFormatter.format(hydrogenBackup.variableCostEur)} variabel (tekorturen)`,
      },
    ];
  });

  readonly hydrogenSystemCostSummary = computed(() => {
    const settings = this.hydrogenSystemCostSettings();
    const hydrogenSystem = this.dashboardStore.hydrogenSystem();
    const dedicatedWindCapacityGW = this.balanceStore.hydrogenDedicatedOffshoreWindCapacityGW();
    const electrolyzerCapacityGW = this.balanceStore.hydrogenElectrolyzerCapacityGW();

    const dedicatedWindAnnualCost = getAnnualTechnologyCost(
      dedicatedWindCapacityGW,
      settings.dedicatedWindCapexPerGWEur,
      settings.dedicatedWindOpexPerGWEur,
      settings.dedicatedWindLifetimeYears,
      settings.dedicatedWindInterestRatePercent,
    );
    const electrolyzerAnnualCost = getAnnualTechnologyCost(
      electrolyzerCapacityGW,
      settings.electrolyzerCapexPerGWEur,
      settings.electrolyzerOpexPerGWEur,
      settings.electrolyzerLifetimeYears,
      settings.electrolyzerInterestRatePercent,
    );

    const gridCostBasis = this.getGridSystemCostBasis();
    const gridTransferPriceEurPerKWh = gridCostBasis.usefulGeneratedKWh > 0
      ? gridCostBasis.totalAnnualCost / gridCostBasis.usefulGeneratedKWh
      : 0;
    const gridPurchaseAnnualCost = hydrogenSystem.gridInputKWh * gridTransferPriceEurPerKWh;

    const totalAnnualCost = dedicatedWindAnnualCost + electrolyzerAnnualCost + gridPurchaseAnnualCost;
    const producedOutputKWh = hydrogenSystem.producedOutputKWh;
    const costPerProducedKWhEur = producedOutputKWh > 0
      ? totalAnnualCost / producedOutputKWh
      : 0;

    return {
      dedicatedWindAnnualCost,
      electrolyzerAnnualCost,
      gridPurchaseAnnualCost,
      gridTransferPriceEurPerKWh,
      totalAnnualCost,
      producedOutputKWh,
      costPerProducedKWhEur,
    };
  });

  readonly batteryCostModelPowerElectronicsInputValue = computed(() => {
    return this.toMillionEuroInputValue(this.batteryCostModelSettings().powerElectronicsCapexPerGWEur);
  });

  readonly batteryCostModelHallCapexInputValue = computed(() => {
    return Math.round(this.batteryCostModelSettings().hallCapexPerHallEur / 1_000_000);
  });

  readonly batteryCostSummaryItems = computed<BatteryCostSummaryItem[]>(() => {
    const settings = this.batteryCostModelSettings();
    const publicBatteryTWh = this.balanceStore.batteryCapacityGWh() / 1_000;
    const effectiveSettings = { ...settings, energyCapacityTWh: publicBatteryTWh };
    const breakdown = getBatteryCostBreakdown(effectiveSettings);

    return [
      {
        label: 'Cellen',
        valueText: euroFormatter.format(breakdown.cellCapex),
        noteText: `${statNumberFormatter.format(publicBatteryTWh)} TWh x ${statNumberFormatter.format(settings.cellPricePerKWhEur)} EUR/kWh`,
      },
      {
        label: 'Power block',
        valueText: euroFormatter.format(breakdown.powerElectronicsCapex),
        noteText: `${statNumberFormatter.format(breakdown.requiredPowerCapacityGW)} GW maatgevend vermogen x ${statNumberFormatter.format(settings.powerElectronicsCapexPerGWEur / 1_000_000)} mln/GW`,
      },
      {
        label: 'Beheer en balancing',
        valueText: euroFormatter.format(breakdown.manageCapex),
        noteText: `${statNumberFormatter.format(settings.manageCapexPerKWhAtReferenceCellEur)} EUR/kWh bij ${BATTERY_REFERENCE_CELL_SIZE_KWH} kWh referentiecel, geschaald met factor ${statNumberFormatter.format(getBatteryCellSizePowerFactor(settings.cellSizeKWh))}`,
      },
      {
        label: 'Hallen (HS/MS-stations)',
        valueText: euroFormatter.format(breakdown.hallCapex),
        noteText: `${statNumberFormatter.format(breakdown.hallCount)} hallen bij ${statNumberFormatter.format(effectiveSettings.hallCapacityMWh)} MWh per hal en ${statNumberFormatter.format(effectiveSettings.hallCapexPerHallEur / 1_000_000)} mln EUR per hal`,
      },
      {
        label: 'Totale CAPEX',
        valueText: euroFormatter.format(breakdown.totalCapex),
        noteText: `${statNumberFormatter.format(breakdown.capexPerStoredKWh)} EUR/kWh opslag en ${statNumberFormatter.format(breakdown.capexPerPowerKW)} EUR/kW maatgevend vermogen`,
      },
      {
        label: 'Jaarlijkse annuïteit',
        valueText: euroFormatter.format(breakdown.annualizedCapex),
        noteText: `Annuïteit over ${statNumberFormatter.format(settings.lifetimeYears)} jaar bij ${statNumberFormatter.format(settings.interestRatePercent)}% rente`,
      },
      {
        label: 'Jaarlijkse OPEX',
        valueText: euroFormatter.format(breakdown.annualOpex),
        noteText: `${statNumberFormatter.format(settings.opexPercentOfCapex)}% van totale CAPEX per jaar`,
      },
      {
        label: 'Totale jaarkosten',
        valueText: euroFormatter.format(breakdown.totalAnnualCost),
        noteText: `Annuïteit + OPEX`,
      },
      {
        label: 'Aantal cellen',
        valueText: statNumberFormatter.format(breakdown.cellCount),
        noteText: `${statNumberFormatter.format(settings.energyCapacityTWh * 1_000_000_000)} kWh gedeeld door ${statNumberFormatter.format(settings.cellSizeKWh)} kWh per cel`,
      },
      {
        label: 'Aantal hallen',
        valueText: statNumberFormatter.format(breakdown.hallCount),
        noteText: `${statNumberFormatter.format(publicBatteryTWh * 1_000_000)} MWh gedeeld door ${statNumberFormatter.format(effectiveSettings.hallCapacityMWh)} MWh per hal`,
      },
      {
        label: 'Laadduur',
        valueText: `${statNumberFormatter.format(breakdown.chargeDurationHours)} uur`,
        noteText: `${statNumberFormatter.format(breakdown.energyCapacityGWh)} GWh gedeeld door ${statNumberFormatter.format(settings.chargePowerCapacityGW)} GW laadvermogen`,
      },
      {
        label: 'Ontlaadduur',
        valueText: `${statNumberFormatter.format(breakdown.dischargeDurationHours)} uur`,
        noteText: `${statNumberFormatter.format(breakdown.energyCapacityGWh)} GWh gedeeld door ${statNumberFormatter.format(settings.dischargePowerCapacityGW)} GW ontlaadvermogen`,
      },
    ];
  });

  readonly batteryCostScenarioItems = computed<BatteryCostScenarioItem[]>(() => {
    const settings = this.batteryCostModelSettings();
    const publicBatteryTWh = this.balanceStore.batteryCapacityGWh() / 1_000;

    return BATTERY_COST_SCENARIOS.map(scenario => {
      const breakdown = getBatteryCostBreakdown({
        ...settings,
        energyCapacityTWh: publicBatteryTWh,
        powerElectronicsCapexPerGWEur: scenario.powerElectronicsCapexPerGWEur,
        manageCapexPerKWhAtReferenceCellEur: scenario.manageCapexPerKWhAtReferenceCellEur,
        hallCapacityMWh: scenario.hallCapacityMWh,
        hallCapexPerHallEur: scenario.hallCapexPerHallEur,
      });

      return {
        label: scenario.label,
        valueText: euroFormatter.format(breakdown.totalCapex),
        noteText: `${euroFormatter.format(breakdown.totalAnnualCost)} per jaar · power ${statNumberFormatter.format(scenario.powerElectronicsCapexPerGWEur / 1_000_000)} mln/GW · beheer ${statNumberFormatter.format(scenario.manageCapexPerKWhAtReferenceCellEur)} EUR/kWh · hal ${statNumberFormatter.format(scenario.hallCapacityMWh)} MWh / ${statNumberFormatter.format(scenario.hallCapexPerHallEur / 1_000_000)} mln EUR · ${statNumberFormatter.format(settings.interestRatePercent)}% rente · ${statNumberFormatter.format(settings.lifetimeYears)} jr afschrijving · ${statNumberFormatter.format(settings.opexPercentOfCapex)}% OPEX. ${scenario.noteText}`,
      };
    });
  });

  constructor() {
    this.hydrateCostSettings();
    effect(() => {
      this.balanceStore.publicBatteryChargePowerGW.set(this.batteryCostModelSettings().chargePowerCapacityGW);
    });
    effect(() => {
      const currentSettings = readPersistedBalanceSettings(EnergyCostsStore.SETTINGS_STORAGE_KEY) ?? {};
      writePersistedBalanceSettings(EnergyCostsStore.SETTINGS_STORAGE_KEY, {
        ...currentSettings,
        batteryCostModelSettings: this.batteryCostModelSettings(),
        technologyCosts: this.technologyCosts(),
        nuclearCfdSettings: this.nuclearCfdSettings(),
        hydrogenSystemCostSettings: this.hydrogenSystemCostSettings(),
      });
    });
  }

  setHydrogenDedicatedWindCapexPerGW(value: string): void {
    this.hydrogenSystemCostSettings.update(currentSettings => ({
      ...currentSettings,
      dedicatedWindCapexPerGWEur: this.parseMillionEuroInput(value, EnergyCostsStore.DEFAULT_H2_DEDICATED_WIND_CAPEX_PER_GW_EUR),
    }));
  }

  setHydrogenDedicatedWindOpexPerGW(value: string): void {
    this.hydrogenSystemCostSettings.update(currentSettings => ({
      ...currentSettings,
      dedicatedWindOpexPerGWEur: this.parseMillionEuroInput(value, EnergyCostsStore.DEFAULT_H2_DEDICATED_WIND_OPEX_PER_GW_EUR),
    }));
  }

  setHydrogenDedicatedWindLifetimeYears(value: string): void {
    this.hydrogenSystemCostSettings.update(currentSettings => ({
      ...currentSettings,
      dedicatedWindLifetimeYears: this.parseNonNegativeNumber(value, EnergyCostsStore.DEFAULT_H2_DEDICATED_WIND_LIFETIME_YEARS),
    }));
  }

  setHydrogenDedicatedWindInterestRatePercent(value: string): void {
    this.hydrogenSystemCostSettings.update(currentSettings => ({
      ...currentSettings,
      dedicatedWindInterestRatePercent: this.parseNonNegativeNumber(value, EnergyCostsStore.DEFAULT_H2_DEDICATED_WIND_INTEREST_RATE_PERCENT),
    }));
  }

  setHydrogenElectrolyzerCapexPerGW(value: string): void {
    this.hydrogenSystemCostSettings.update(currentSettings => ({
      ...currentSettings,
      electrolyzerCapexPerGWEur: this.parseMillionEuroInput(value, EnergyCostsStore.DEFAULT_H2_ELECTROLYZER_CAPEX_PER_GW_EUR),
    }));
  }

  setHydrogenElectrolyzerOpexPerGW(value: string): void {
    this.hydrogenSystemCostSettings.update(currentSettings => ({
      ...currentSettings,
      electrolyzerOpexPerGWEur: this.parseMillionEuroInput(value, EnergyCostsStore.DEFAULT_H2_ELECTROLYZER_OPEX_PER_GW_EUR),
    }));
  }

  setHydrogenElectrolyzerLifetimeYears(value: string): void {
    this.hydrogenSystemCostSettings.update(currentSettings => ({
      ...currentSettings,
      electrolyzerLifetimeYears: this.parseNonNegativeNumber(value, EnergyCostsStore.DEFAULT_H2_ELECTROLYZER_LIFETIME_YEARS),
    }));
  }

  setHydrogenElectrolyzerInterestRatePercent(value: string): void {
    this.hydrogenSystemCostSettings.update(currentSettings => ({
      ...currentSettings,
      electrolyzerInterestRatePercent: this.parseNonNegativeNumber(value, EnergyCostsStore.DEFAULT_H2_ELECTROLYZER_INTEREST_RATE_PERCENT),
    }));
  }

  setNuclearBuildTimeYears(value: string): void {
    this.nuclearCfdSettings.update(currentSettings => ({
      ...currentSettings,
      buildTimeYears: this.parseNonNegativeNumber(value, createDefaultNuclearCfdSettings().buildTimeYears),
    }));
  }

  setNuclearCfdPeriodYears(value: string): void {
    this.nuclearCfdSettings.update(currentSettings => ({
      ...currentSettings,
      cfdPeriodYears: this.parseNonNegativeNumber(value, createDefaultNuclearCfdSettings().cfdPeriodYears),
    }));
  }

  setNuclearInterestRatePercent(value: string): void {
    this.nuclearCfdSettings.update(currentSettings => ({
      ...currentSettings,
      interestRatePercent: this.parseNonNegativeNumber(value, createDefaultNuclearCfdSettings().interestRatePercent),
    }));
  }

  setTechnologyCapex(costKey: TechnologyCostKey, value: string): void {
    const defaults = TECHNOLOGY_COST_DEFAULTS[costKey];
    const capexPerUnitEur = this.parseMillionEuroInput(value, defaults.capexPerUnitEur);
    this.technologyCosts.update(currentCosts => ({
      ...currentCosts,
      [costKey]: {
        ...currentCosts[costKey],
        capexPerUnitEur,
      },
    }));
  }

  setTechnologyOpex(costKey: TechnologyCostKey, value: string): void {
    const defaults = TECHNOLOGY_COST_DEFAULTS[costKey];
    const opexPerUnitEur = this.parseMillionEuroInput(value, defaults.opexPerUnitEur);
    this.technologyCosts.update(currentCosts => ({
      ...currentCosts,
      [costKey]: {
        ...currentCosts[costKey],
        opexPerUnitEur,
      },
    }));
  }

  setTechnologyInterestRate(costKey: TechnologyCostKey, value: string): void {
    const defaults = TECHNOLOGY_COST_DEFAULTS[costKey];
    const interestRatePercent = this.parseNonNegativeNumber(value, defaults.interestRatePercent);
    this.technologyCosts.update(currentCosts => ({
      ...currentCosts,
      [costKey]: {
        ...currentCosts[costKey],
        interestRatePercent,
      },
    }));
  }

  setTechnologyLifetimeYears(costKey: TechnologyCostKey, value: string): void {
    const defaults = TECHNOLOGY_COST_DEFAULTS[costKey];
    const lifetimeYears = this.parseNonNegativeNumber(value, defaults.lifetimeYears);
    this.technologyCosts.update(currentCosts => ({
      ...currentCosts,
      [costKey]: {
        ...currentCosts[costKey],
        lifetimeYears,
      },
    }));
  }

  setBatteryCostModelEnergyCapacityTWh(value: string): void {
    this.batteryCostModelSettings.update(currentSettings => ({
      ...currentSettings,
      energyCapacityTWh: this.parseNonNegativeNumber(value, createDefaultBatteryCostModelSettings().energyCapacityTWh),
    }));
  }

  setBatteryCostModelChargePowerCapacityGW(value: string): void {
    this.batteryCostModelSettings.update(currentSettings => ({
      ...currentSettings,
      chargePowerCapacityGW: this.parseNonNegativeNumber(value, createDefaultBatteryCostModelSettings().chargePowerCapacityGW),
    }));
  }

  setBatteryCostModelDischargePowerCapacityGW(value: string): void {
    this.batteryCostModelSettings.update(currentSettings => ({
      ...currentSettings,
      dischargePowerCapacityGW: this.parseNonNegativeNumber(value, createDefaultBatteryCostModelSettings().dischargePowerCapacityGW),
    }));
  }

  setBatteryCostModelCellPricePerKWhEur(value: string): void {
    this.batteryCostModelSettings.update(currentSettings => ({
      ...currentSettings,
      cellPricePerKWhEur: this.parseNonNegativeNumber(value, createDefaultBatteryCostModelSettings().cellPricePerKWhEur),
    }));
  }

  setBatteryCostModelPowerElectronicsCapexPerGW(value: string): void {
    this.batteryCostModelSettings.update(currentSettings => ({
      ...currentSettings,
      powerElectronicsCapexPerGWEur: this.parseMillionEuroInput(value, createDefaultBatteryCostModelSettings().powerElectronicsCapexPerGWEur),
    }));
  }

  setBatteryCostModelManageCapexPerKWhAtReferenceCell(value: string): void {
    this.batteryCostModelSettings.update(currentSettings => ({
      ...currentSettings,
      manageCapexPerKWhAtReferenceCellEur: this.parseNonNegativeNumber(value, createDefaultBatteryCostModelSettings().manageCapexPerKWhAtReferenceCellEur),
    }));
  }

  setBatteryCostModelHallCapacityMWh(value: string): void {
    this.batteryCostModelSettings.update(currentSettings => ({
      ...currentSettings,
      hallCapacityMWh: this.parseNonNegativeNumber(value, createDefaultBatteryCostModelSettings().hallCapacityMWh),
    }));
  }

  setBatteryCostModelHallCapex(value: string): void {
    this.batteryCostModelSettings.update(currentSettings => ({
      ...currentSettings,
      hallCapexPerHallEur: this.parseNonNegativeNumber(value, createDefaultBatteryCostModelSettings().hallCapexPerHallEur / 1_000_000) * 1_000_000,
    }));
  }

  setBatteryCostModelCellSizeKWh(value: string): void {
    this.batteryCostModelSettings.update(currentSettings => ({
      ...currentSettings,
      cellSizeKWh: this.parseNonNegativeNumber(value, createDefaultBatteryCostModelSettings().cellSizeKWh),
    }));
  }

  setBatteryCostModelLifetimeYears(value: string): void {
    this.batteryCostModelSettings.update(currentSettings => ({
      ...currentSettings,
      lifetimeYears: this.parseNonNegativeNumber(value, createDefaultBatteryCostModelSettings().lifetimeYears),
    }));
  }

  setBatteryCostModelInterestRatePercent(value: string): void {
    this.batteryCostModelSettings.update(currentSettings => ({
      ...currentSettings,
      interestRatePercent: this.parseNonNegativeNumber(value, createDefaultBatteryCostModelSettings().interestRatePercent),
    }));
  }

  setBatteryCostModelOpexPercent(value: string): void {
    this.batteryCostModelSettings.update(currentSettings => ({
      ...currentSettings,
      opexPercentOfCapex: this.parseNonNegativeNumber(value, createDefaultBatteryCostModelSettings().opexPercentOfCapex),
    }));
  }

  resetTechnologyCostDefaults(): void {
    this.technologyCosts.set(createDefaultTechnologyCosts());
    this.nuclearCfdSettings.set(createDefaultNuclearCfdSettings());
    this.batteryCostModelSettings.set(createDefaultBatteryCostModelSettings());
    this.hydrogenSystemCostSettings.set({
      dedicatedWindCapexPerGWEur: EnergyCostsStore.DEFAULT_H2_DEDICATED_WIND_CAPEX_PER_GW_EUR,
      dedicatedWindOpexPerGWEur: EnergyCostsStore.DEFAULT_H2_DEDICATED_WIND_OPEX_PER_GW_EUR,
      dedicatedWindLifetimeYears: EnergyCostsStore.DEFAULT_H2_DEDICATED_WIND_LIFETIME_YEARS,
      dedicatedWindInterestRatePercent: EnergyCostsStore.DEFAULT_H2_DEDICATED_WIND_INTEREST_RATE_PERCENT,
      electrolyzerCapexPerGWEur: EnergyCostsStore.DEFAULT_H2_ELECTROLYZER_CAPEX_PER_GW_EUR,
      electrolyzerOpexPerGWEur: EnergyCostsStore.DEFAULT_H2_ELECTROLYZER_OPEX_PER_GW_EUR,
      electrolyzerLifetimeYears: EnergyCostsStore.DEFAULT_H2_ELECTROLYZER_LIFETIME_YEARS,
      electrolyzerInterestRatePercent: EnergyCostsStore.DEFAULT_H2_ELECTROLYZER_INTEREST_RATE_PERCENT,
    });
  }

  private hydrateCostSettings(): void {
    const parsed = readPersistedBalanceSettings(EnergyCostsStore.SETTINGS_STORAGE_KEY);
    if (!parsed) {
      return;
    }

    this.batteryCostModelSettings.set(parseStoredBatteryCostModelSettings(parsed.batteryCostModelSettings, createDefaultBatteryCostModelSettings()));
    this.technologyCosts.set(parseStoredTechnologyCosts(parsed.technologyCosts, createDefaultTechnologyCosts()));
    this.nuclearCfdSettings.set(parseStoredNuclearCfdSettings(parsed.nuclearCfdSettings, createDefaultNuclearCfdSettings()));
    this.hydrogenSystemCostSettings.set(this.parseStoredHydrogenSystemCostSettings(parsed.hydrogenSystemCostSettings));
  }

  private parseStoredHydrogenSystemCostSettings(value: unknown): HydrogenSystemCostSettings {
    if (!value || typeof value !== 'object') {
      return {
        dedicatedWindCapexPerGWEur: EnergyCostsStore.DEFAULT_H2_DEDICATED_WIND_CAPEX_PER_GW_EUR,
        dedicatedWindOpexPerGWEur: EnergyCostsStore.DEFAULT_H2_DEDICATED_WIND_OPEX_PER_GW_EUR,
        dedicatedWindLifetimeYears: EnergyCostsStore.DEFAULT_H2_DEDICATED_WIND_LIFETIME_YEARS,
        dedicatedWindInterestRatePercent: EnergyCostsStore.DEFAULT_H2_DEDICATED_WIND_INTEREST_RATE_PERCENT,
        electrolyzerCapexPerGWEur: EnergyCostsStore.DEFAULT_H2_ELECTROLYZER_CAPEX_PER_GW_EUR,
        electrolyzerOpexPerGWEur: EnergyCostsStore.DEFAULT_H2_ELECTROLYZER_OPEX_PER_GW_EUR,
        electrolyzerLifetimeYears: EnergyCostsStore.DEFAULT_H2_ELECTROLYZER_LIFETIME_YEARS,
        electrolyzerInterestRatePercent: EnergyCostsStore.DEFAULT_H2_ELECTROLYZER_INTEREST_RATE_PERCENT,
      };
    }

    const stored = value as Partial<Record<keyof HydrogenSystemCostSettings, unknown>>;
    return {
      dedicatedWindCapexPerGWEur: parseStoredNumber(stored.dedicatedWindCapexPerGWEur, EnergyCostsStore.DEFAULT_H2_DEDICATED_WIND_CAPEX_PER_GW_EUR),
      dedicatedWindOpexPerGWEur: parseStoredNumber(stored.dedicatedWindOpexPerGWEur, EnergyCostsStore.DEFAULT_H2_DEDICATED_WIND_OPEX_PER_GW_EUR),
      dedicatedWindLifetimeYears: parseStoredNumber(stored.dedicatedWindLifetimeYears, EnergyCostsStore.DEFAULT_H2_DEDICATED_WIND_LIFETIME_YEARS),
      dedicatedWindInterestRatePercent: parseStoredNumber(stored.dedicatedWindInterestRatePercent, EnergyCostsStore.DEFAULT_H2_DEDICATED_WIND_INTEREST_RATE_PERCENT),
      electrolyzerCapexPerGWEur: parseStoredNumber(stored.electrolyzerCapexPerGWEur, EnergyCostsStore.DEFAULT_H2_ELECTROLYZER_CAPEX_PER_GW_EUR),
      electrolyzerOpexPerGWEur: parseStoredNumber(stored.electrolyzerOpexPerGWEur, EnergyCostsStore.DEFAULT_H2_ELECTROLYZER_OPEX_PER_GW_EUR),
      electrolyzerLifetimeYears: parseStoredNumber(stored.electrolyzerLifetimeYears, EnergyCostsStore.DEFAULT_H2_ELECTROLYZER_LIFETIME_YEARS),
      electrolyzerInterestRatePercent: parseStoredNumber(stored.electrolyzerInterestRatePercent, EnergyCostsStore.DEFAULT_H2_ELECTROLYZER_INTEREST_RATE_PERCENT),
    };
  }

  private getGridSystemCostBasis(): {
    totalAnnualCost: number;
    usefulGeneratedKWh: number;
  } {
    const batterySettings = this.batteryCostModelSettings();
    const publicBatteryGWh = this.balanceStore.batteryCapacityGWh();

    const offshoreAnnualCost = this.getConfiguredAnnualTechnologyCost('offshoreConnection', this.balanceStore.offshoreConnectionSystems() * 2);
    const publicBatteryAnnualCost = getBatteryCostBreakdown({ ...batterySettings, energyCapacityTWh: publicBatteryGWh / 1_000 }).totalAnnualCost;

    const generationAnnualCost =
      this.getConfiguredAnnualTechnologyCost('solarPublic', this.balanceStore.publicSolarCapacityGW()) +
      this.getConfiguredAnnualTechnologyCost('windzee', this.balanceStore.windzeeCapacityGW()) +
      this.getConfiguredAnnualTechnologyCost('windland', this.balanceStore.windlandCapacityGW()) +
      this.getConfiguredAnnualTechnologyCost('nuclear', this.balanceStore.nuclearCapacityGW()) +
      this.getConfiguredAnnualTechnologyCost('borssele', BORSSELE_CAPACITY_GW) +
      this.getConfiguredAnnualTechnologyCost('afvalBiogas', AFVAL_BIOGAS_BASELOAD_GW);

    const hydrogenBackup = this.getHydrogenBackupCostBreakdown();
    const infraAnnualCost = offshoreAnnualCost + publicBatteryAnnualCost + hydrogenBackup.standbyAnnualCost;
    const totalAnnualCost = generationAnnualCost + infraAnnualCost + hydrogenBackup.variableCostEur;
    const balanceModel = this.dashboardStore.balanceModel();
    const publicGenerationKWh = balanceModel.adjustedPublicGenerationValues.reduce((sum, value) => sum + value, 0);
    const publicCurtailmentKWh = balanceModel.publicCurtailmentValues.reduce((sum, value) => sum + value, 0);
    const usefulGeneratedKWh = Math.max(0, publicGenerationKWh - publicCurtailmentKWh);

    return {
      totalAnnualCost,
      usefulGeneratedKWh,
    };
  }

  private parseNonNegativeNumber(value: string, fallback: number): number {
    const parsedValue = Number(value);
    if (!Number.isFinite(parsedValue)) {
      return fallback;
    }

    return Math.max(parsedValue, 0);
  }

  private parseMillionEuroInput(value: string, fallbackEur: number): number {
    return this.parseNonNegativeNumber(value, fallbackEur / 1_000_000) * 1_000_000;
  }

  private toMillionEuroInputValue(valueEur: number): number {
    return Math.round((valueEur / 1_000_000) * 10) / 10;
  }

  private buildCalculationRow(
    costKey: TechnologyCostKey,
    label: string,
    capacityGW: number,
    energyTWh: number,
    noteText?: string,
  ): CalculationTechnologyRow {
    const costDefinition = TECHNOLOGY_COST_DEFAULTS[costKey];
    const configuredCosts = this.technologyCosts()[costKey];
    // Voor kernenergie gebruikt de CfD-berekening de rente uit nuclearCfdSettings, niet technologyCosts.
    const effectiveConfiguredCosts = costKey === 'nuclear'
      ? { ...configuredCosts, interestRatePercent: this.nuclearCfdSettings().interestRatePercent }
      : configuredCosts;
    const annualCost = costKey === 'nuclear'
      ? this.getAnnualNuclearCfdCost(capacityGW)
      : getAnnualTechnologyCost(capacityGW, configuredCosts.capexPerUnitEur, configuredCosts.opexPerUnitEur, configuredCosts.lifetimeYears, configuredCosts.interestRatePercent);
    const resolvedEnergyTWh = costKey === 'nuclear'
      ? getAnnualNuclearGenerationTWhForCost(capacityGW, this.balanceStore.nuclearFullLoadHours())
      : energyTWh;
    const annualEnergyMWh = resolvedEnergyTWh * 1_000_000;
    const resolvedNoteText = costKey === 'nuclear'
      ? getNuclearCfdNoteText(this.nuclearCfdSettings(), value => statNumberFormatter.format(value))
      : noteText;
    const annualBuckets = this.getAnnualCostBuckets(costKey, annualCost);

    return buildCalculationTechnologyRow({
      costKey,
      label,
      capacityText: `${statNumberFormatter.format(capacityGW)} GW`,
      energyText: `${statNumberFormatter.format(resolvedEnergyTWh)} TWh/jaar`,
      configuredCosts: effectiveConfiguredCosts,
      annualCost,
      costUnitText: costDefinition.costUnitText,
      buildTimeInputValue: costKey === 'nuclear' ? this.nuclearCfdSettings().buildTimeYears : 0,
      noteText: resolvedNoteText,
      formatNumber: value => statNumberFormatter.format(value),
      formatCurrency: value => euroFormatter.format(value),
      toMillionEuroInputValue: value => this.toMillionEuroInputValue(value),
      annualEnergyMWh,
      annualGenerationCost: annualBuckets.generation,
      annualInfraCost: annualBuckets.infra,
      annualPrivateCost: annualBuckets.private,
    });
  }

  private buildStorageCalculationRow(
    costKey: TechnologyCostKey,
    label: string,
    capacityGWh: number,
    noteText?: string,
    annualCostOverride?: number,
  ): CalculationTechnologyRow {
    const costDefinition = TECHNOLOGY_COST_DEFAULTS[costKey];
    const configuredCosts = this.technologyCosts()[costKey];
    const annualCost = annualCostOverride ?? getAnnualTechnologyCost(capacityGWh, configuredCosts.capexPerUnitEur, configuredCosts.opexPerUnitEur, configuredCosts.lifetimeYears, configuredCosts.interestRatePercent);
    const annualBuckets = this.getAnnualCostBuckets(costKey, annualCost);

    return buildCalculationTechnologyRow({
      costKey,
      label,
      capacityText: `${statNumberFormatter.format(capacityGWh)} GWh`,
      energyText: `${statNumberFormatter.format(capacityGWh)} GWh opslag`,
      configuredCosts,
      annualCost,
      costUnitText: costDefinition.costUnitText,
      costFromModel: true,
      noteText,
      formatNumber: value => statNumberFormatter.format(value),
      formatCurrency: value => euroFormatter.format(value),
      toMillionEuroInputValue: value => this.toMillionEuroInputValue(value),
      annualGenerationCost: annualBuckets.generation,
      annualInfraCost: annualBuckets.infra,
      annualPrivateCost: annualBuckets.private,
    });
  }

  private buildFixedPriceCalculationRow(
    costKey: TechnologyCostKey,
    label: string,
    capacityGW: number,
    energyTWh: number,
    pricePerMWhEur: number,
    noteText?: string,
  ): CalculationTechnologyRow {
    const costDefinition = TECHNOLOGY_COST_DEFAULTS[costKey];
    const configuredCosts = this.technologyCosts()[costKey];
    const annualEnergyMWh = energyTWh * 1_000_000;
    const annualCost = annualEnergyMWh * pricePerMWhEur;
    const annualBuckets = this.getAnnualCostBuckets(costKey, annualCost);

    return buildCalculationTechnologyRow({
      costKey,
      label,
      capacityText: `${statNumberFormatter.format(capacityGW)} GW`,
      energyText: `${statNumberFormatter.format(energyTWh)} TWh/jaar`,
      configuredCosts,
      annualCost,
      costUnitText: costDefinition.costUnitText,
      costFromModel: true,
      noteText,
      formatNumber: value => statNumberFormatter.format(value),
      formatCurrency: value => euroFormatter.format(value),
      toMillionEuroInputValue: value => this.toMillionEuroInputValue(value),
      annualEnergyMWh,
      annualGenerationCost: annualBuckets.generation,
      annualInfraCost: annualBuckets.infra,
      annualPrivateCost: annualBuckets.private,
    });
  }

  private getAnnualCostBuckets(costKey: TechnologyCostKey, annualCost: number): {
    generation: number;
    infra: number;
    private: number;
  } {
    const bucket = this.getTechnologyCostBucket(costKey);
    return {
      generation: bucket === 'generation' ? annualCost : 0,
      infra: bucket === 'infra' ? annualCost : 0,
      private: bucket === 'private' ? annualCost : 0,
    };
  }

  private getTechnologyCostBucket(costKey: TechnologyCostKey): TechnologyCostBucket {
    switch (costKey) {
      case 'offshoreConnection':
      case 'hydrogenBackup':
      case 'batteryPublic':
        return 'infra';
      case 'solarPrivate':
      case 'batteryPrivate':
        return 'private';
      default:
        return 'generation';
    }
  }

  private getConfiguredAnnualTechnologyCost(costKey: TechnologyCostKey, capacity: number): number {
    if (costKey === 'nuclear') {
      return this.getAnnualNuclearCfdCost(capacity);
    }

    if (costKey === 'afvalBiogas') {
      return this.getAnnualAfvalBiogasEnergyTWh() * 1_000_000 * EnergyCostsStore.AFVAL_BIOGAS_PRICE_PER_MWH_EUR;
    }

    const configuredCosts = this.technologyCosts()[costKey];
    return getAnnualTechnologyCost(capacity, configuredCosts.capexPerUnitEur, configuredCosts.opexPerUnitEur, configuredCosts.lifetimeYears, configuredCosts.interestRatePercent);
  }

  private getAnnualNuclearCfdCost(capacityGW: number): number {
    const configuredCosts = this.technologyCosts().nuclear;
    return getAnnualNuclearCfdCost(capacityGW, configuredCosts, this.nuclearCfdSettings());
  }

  private getAnnualAfvalBiogasEnergyTWh(): number {
    const annualKWh = this.dashboardStore.afvalBiogasValues().reduce((sum, value) => sum + value, 0);
    return annualKWh / 1_000_000_000;
  }

  private getHydrogenBackupCostBreakdown(): {
    shortageKWh: number;
    standbyGW: number;
    standbyAnnualCost: number;
    variableCostEur: number;
    totalAnnualCost: number;
  } {
    const shortageKWh = this.dashboardStore.balanceValues().reduce((sum, value) => {
      return value < 0 ? sum + Math.abs(value) : sum;
    }, 0);
    const hasShortage = shortageKWh > 0;
    const standbyGW = hasShortage ? EnergyCostsStore.HYDROGEN_BACKUP_STANDBY_GW : 0;
    const standbyCapex = standbyGW * EnergyCostsStore.HYDROGEN_BACKUP_CAPEX_PER_GW_EUR;
    const standbyAnnualizedCapex = getAnnuityPayment(
      standbyCapex,
      EnergyCostsStore.HYDROGEN_BACKUP_INTEREST_RATE_PERCENT / 100,
      EnergyCostsStore.HYDROGEN_BACKUP_LIFETIME_YEARS,
    );
    const standbyAnnualOpex = standbyGW * EnergyCostsStore.HYDROGEN_BACKUP_OPEX_PER_GW_EUR;
    const standbyAnnualCost = standbyAnnualizedCapex + standbyAnnualOpex;
    const variableCostEur = shortageKWh * EnergyCostsStore.HYDROGEN_BACKUP_VARIABLE_EUR_PER_KWH;

    return {
      shortageKWh,
      standbyGW,
      standbyAnnualCost,
      variableCostEur,
      totalAnnualCost: standbyAnnualCost + variableCostEur,
    };
  }
}
