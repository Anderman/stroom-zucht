import { Injectable, computed, effect, signal } from '@angular/core';

import { statNumberFormatter } from '../core/formatters';

import { HOUSEHOLD_CONSUMPTION_SHARE } from '../grid-systeem/energy-costs.model';
import {
    NUCLEAR_DEFAULT_CAPACITY_GW,
    NUCLEAR_DEFAULT_FULL_LOAD_HOURS, SOLAR_DEFAULT_FULL_LOAD_HOURS_2025,
    WINDLAND_BASELINE_CAPACITY_GW_2025,
    WINDLAND_DEFAULT_FULL_LOAD_HOURS_2025,
    WINDZEE_BASELINE_CAPACITY_GW_2025,
    WINDZEE_DEFAULT_FULL_LOAD_HOURS_2025
} from './energy-dashboard.config';
import {
    PersistedBalanceSettings,
    parseStoredBoolean,
    parseStoredNumber,
    parseStoredPercentage,
    readPersistedBalanceSettings,
    writePersistedBalanceSettings,
} from '../core/persistence';

@Injectable({ providedIn: 'root' })
export class EnergyBalanceStore {
  private static readonly SETTINGS_STORAGE_KEY = 'energyAtlas.balanceSettings';
  private static readonly EXISTING_OFFSHORE_CONNECTION_CAPACITY_GW = 4.75;
  private static readonly SOLAR_PUBLIC_DEFAULT_CAPACITY_GW_2025 = 6;
  private static readonly SOLAR_PRIVATE_DEFAULT_CAPACITY_GW_2025 = 22.6;
  private static readonly SOLAR_PUBLIC_SCENARIO_CAPACITY_GW = 6;
  private static readonly SOLAR_PRIVATE_SCENARIO_CAPACITY_GW = 122;
  private static readonly DEFAULT_HYDROGEN_TARGET_TWH = 0;
  private static readonly HYDROGEN_SCENARIO_TARGET_TWH = 5;
  private static readonly DEFAULT_ELECTROLYZER_EFFICIENCY_PERCENT = 70;
  private static readonly MIN_ELECTROLYZER_EFFICIENCY_PERCENT = 1;
  private static readonly MAX_ELECTROLYZER_EFFICIENCY_PERCENT = 100;
  private static readonly DEFAULT_HYDROGEN_DEDICATED_OFFSHORE_WIND_CAPACITY_GW = 0;
  private static readonly DEFAULT_HYDROGEN_ELECTROLYZER_CAPACITY_GW = 0;
  private static readonly DEFAULT_HYDROGEN_GRID_IMPORT_LIMIT_GW = 35;
  private static readonly DEFAULT_HYDROGEN_GRID_EXPORT_LIMIT_GW = 0;

  readonly batteryCapacityGWh = signal(0);
  readonly privateBatteryCapacityGWh = signal(0);
  readonly publicBatteryChargePowerGW = signal(0);
  readonly hydrogenOutputTargetTWh = signal(EnergyBalanceStore.DEFAULT_HYDROGEN_TARGET_TWH);
  readonly electrolyzerEfficiencyPercent = signal(EnergyBalanceStore.DEFAULT_ELECTROLYZER_EFFICIENCY_PERCENT);
  readonly privateGridMaxLoadGW = signal(35);
  readonly hydrogenDedicatedOffshoreWindCapacityGW = signal(EnergyBalanceStore.DEFAULT_HYDROGEN_DEDICATED_OFFSHORE_WIND_CAPACITY_GW);
  readonly hydrogenElectrolyzerCapacityGW = signal(EnergyBalanceStore.DEFAULT_HYDROGEN_ELECTROLYZER_CAPACITY_GW);
  readonly hydrogenGridImportLimitGW = signal(EnergyBalanceStore.DEFAULT_HYDROGEN_GRID_IMPORT_LIMIT_GW);
  readonly hydrogenGridExportLimitGW = signal(EnergyBalanceStore.DEFAULT_HYDROGEN_GRID_EXPORT_LIMIT_GW);
  readonly privateDemandShare = signal(HOUSEHOLD_CONSUMPTION_SHARE);
  readonly privateSolarCapacityGW = signal(EnergyBalanceStore.SOLAR_PRIVATE_DEFAULT_CAPACITY_GW_2025);
  readonly solarCapacityGW = signal(EnergyBalanceStore.SOLAR_PUBLIC_DEFAULT_CAPACITY_GW_2025);
  readonly windlandCapacityGW = signal(WINDLAND_BASELINE_CAPACITY_GW_2025);
  readonly windzeeCapacityGW = signal(WINDZEE_BASELINE_CAPACITY_GW_2025);
  readonly solarFullLoadHours = signal(SOLAR_DEFAULT_FULL_LOAD_HOURS_2025);
  readonly windlandFullLoadHours = signal(WINDLAND_DEFAULT_FULL_LOAD_HOURS_2025);
  readonly windzeeFullLoadHours = signal(WINDZEE_DEFAULT_FULL_LOAD_HOURS_2025);
  readonly nuclearCapacityGW = signal(NUCLEAR_DEFAULT_CAPACITY_GW);
  readonly nuclearFullLoadHours = signal(NUCLEAR_DEFAULT_FULL_LOAD_HOURS);

  private static readonly SCENARIO_LARGE_BATTERY = {
    batteryCapacityGWh: 4_000,
    privateBatteryCapacityGWh: 1_000,
    privateDemandShare: 0.7,
    windlandCapacityGW: 12,
    windlandFullLoadHours: 2_800,
    windzeeCapacityGW: 31,
    windzeeFullLoadHours: 4_000,
    nuclearCapacityGW: 0,
    hydrogenOutputTargetTWh: EnergyBalanceStore.DEFAULT_HYDROGEN_TARGET_TWH,
  };

  private static readonly SCENARIO_WIND_NUCLEAR = {
    batteryCapacityGWh: 100,
    privateBatteryCapacityGWh: 100,
    privateDemandShare: 0.7,
    windlandCapacityGW: 12,
    windlandFullLoadHours: 2_800,
    windzeeCapacityGW: 70,
    windzeeFullLoadHours: 5_000,
    nuclearCapacityGW: 5.4,
    hydrogenOutputTargetTWh: EnergyBalanceStore.HYDROGEN_SCENARIO_TARGET_TWH,
  };

  private static readonly SCENARIO_LARGE_BATTERY_HYDROGEN = {
    batteryCapacityGWh: 4_000,
    privateBatteryCapacityGWh: 1_000,
    privateDemandShare: 0.7,
    windlandCapacityGW: 12,
    windlandFullLoadHours: 2_800,
    windzeeCapacityGW: 70,
    windzeeFullLoadHours: 5_000,
    nuclearCapacityGW: 0,
    nuclearFullLoadHours: NUCLEAR_DEFAULT_FULL_LOAD_HOURS,
    hydrogenOutputTargetTWh: EnergyBalanceStore.HYDROGEN_SCENARIO_TARGET_TWH,
    hydrogenDedicatedOffshoreWindCapacityGW: 35,
    hydrogenElectrolyzerCapacityGW: 35,
    hydrogenGridImportLimitGW: 35,
    hydrogenGridExportLimitGW: 0,
  };

  private static readonly SCENARIO_ONLY_NUCLEAR_HYDROGEN = {
    batteryCapacityGWh: 0,
    privateBatteryCapacityGWh: 0,
    privateDemandShare: 0.7,
    solarCapacityGW: 0,
    privateSolarCapacityGW: 0,
    windlandCapacityGW: 0,
    windlandFullLoadHours: WINDLAND_DEFAULT_FULL_LOAD_HOURS_2025,
    windzeeCapacityGW: 0,
    windzeeFullLoadHours: WINDZEE_DEFAULT_FULL_LOAD_HOURS_2025,
    nuclearCapacityGW: 65,
    nuclearFullLoadHours: NUCLEAR_DEFAULT_FULL_LOAD_HOURS,
    hydrogenOutputTargetTWh: EnergyBalanceStore.HYDROGEN_SCENARIO_TARGET_TWH,
    hydrogenDedicatedOffshoreWindCapacityGW: 35,
    hydrogenElectrolyzerCapacityGW: 35,
    hydrogenGridImportLimitGW: 35,
    hydrogenGridExportLimitGW: 0,
  };

  readonly hydrogenProductionTargetTWh = computed(() => {
    const hydrogenOutputTarget = this.hydrogenOutputTargetTWh();
    const efficiencyFraction = this.electrolyzerEfficiencyPercent() / 100;
    if (efficiencyFraction <= 0) {
      return 0;
    }

    return hydrogenOutputTarget / efficiencyFraction;
  });

  readonly totalBatteryCapacityGWh = computed(() => {
    return this.batteryCapacityGWh() + this.privateBatteryCapacityGWh();
  });

  readonly offshoreConnectionSystems = computed(() => {
    const newOffshoreCapacityGW = Math.max(0, this.windzeeCapacityGW() - EnergyBalanceStore.EXISTING_OFFSHORE_CONNECTION_CAPACITY_GW);
    return Math.ceil(newOffshoreCapacityGW / 2);
  });

  readonly publicSolarCapacityGW = computed(() => {
    return this.solarCapacityGW();
  });

  readonly adjustedSolarTWhText = computed(() => {
    return `${statNumberFormatter.format(this.solarCapacityGW() * this.solarFullLoadHours() / 1_000)} TWh/jaar`;
  });

  readonly adjustedWindlandTWhText = computed(() => {
    return `${statNumberFormatter.format(this.windlandCapacityGW() * this.windlandFullLoadHours() / 1_000)} TWh/jaar`;
  });

  readonly adjustedWindzeeTWhText = computed(() => {
    return `${statNumberFormatter.format(this.windzeeCapacityGW() * this.windzeeFullLoadHours() / 1_000)} TWh/jaar`;
  });

  readonly nuclearTWhText = computed(() => {
    return `${statNumberFormatter.format(this.nuclearCapacityGW() * this.nuclearFullLoadHours() / 1_000)} TWh/jaar`;
  });

  readonly privateSolarTWhText = computed(() => {
    return `${statNumberFormatter.format(this.privateSolarCapacityGW() * this.solarFullLoadHours() / 1_000)} TWh/jaar`;
  });

  readonly publicBatteryText = computed(() => {
    return `${statNumberFormatter.format(this.batteryCapacityGWh())} GWh opslag`;
  });

  readonly privateBatteryText = computed(() => {
    return `${statNumberFormatter.format(this.privateBatteryCapacityGWh())} GWh opslag`;
  });

  constructor() {
    this.hydrateSettings();
    effect(() => {
      this.persistSettings({
        batteryCapacityGWh: this.batteryCapacityGWh(),
        privateBatteryCapacityGWh: this.privateBatteryCapacityGWh(),
        hydrogenOutputTargetTWh: this.hydrogenOutputTargetTWh(),
        electrolyzerEfficiencyPercent: this.electrolyzerEfficiencyPercent(),
        hydrogenDedicatedOffshoreWindCapacityGW: this.hydrogenDedicatedOffshoreWindCapacityGW(),
        hydrogenElectrolyzerCapacityGW: this.hydrogenElectrolyzerCapacityGW(),
        hydrogenGridImportLimitGW: this.hydrogenGridImportLimitGW(),
        hydrogenGridExportLimitGW: this.hydrogenGridExportLimitGW(),
        privateGridMaxLoadGW: this.privateGridMaxLoadGW(),
        privateDemandShare: this.privateDemandShare(),
        privateSolarCapacityGW: this.privateSolarCapacityGW(),
        solarCapacityGW: this.solarCapacityGW(),
        solarFullLoadHours: this.solarFullLoadHours(),
        windlandCapacityGW: this.windlandCapacityGW(),
        windlandFullLoadHours: this.windlandFullLoadHours(),
        windzeeCapacityGW: this.windzeeCapacityGW(),
        windzeeFullLoadHours: this.windzeeFullLoadHours(),
        nuclearCapacityGW: this.nuclearCapacityGW(),
        nuclearFullLoadHours: this.nuclearFullLoadHours(),
      });
    });
  }

  setBatteryCapacityGWh(value: string): void {
    this.batteryCapacityGWh.set(this.parseNonNegativeNumber(value, 0));
  }

  setPrivateBatteryCapacityGWh(value: string): void {
    this.privateBatteryCapacityGWh.set(this.parseNonNegativeNumber(value, 0));
  }

  setPrivateGridMaxLoadGW(value: string): void {
    this.privateGridMaxLoadGW.set(this.parseNonNegativeNumber(value, 35));
  }

  setHydrogenDedicatedOffshoreWindCapacityGW(value: string): void {
    this.hydrogenDedicatedOffshoreWindCapacityGW.set(this.parseNonNegativeNumber(value, EnergyBalanceStore.DEFAULT_HYDROGEN_DEDICATED_OFFSHORE_WIND_CAPACITY_GW));
  }

  setHydrogenElectrolyzerCapacityGW(value: string): void {
    this.hydrogenElectrolyzerCapacityGW.set(this.parseNonNegativeNumber(value, EnergyBalanceStore.DEFAULT_HYDROGEN_ELECTROLYZER_CAPACITY_GW));
  }

  setHydrogenGridImportLimitGW(value: string): void {
    this.hydrogenGridImportLimitGW.set(this.parseNonNegativeNumber(value, EnergyBalanceStore.DEFAULT_HYDROGEN_GRID_IMPORT_LIMIT_GW));
  }

  setHydrogenGridExportLimitGW(value: string): void {
    this.hydrogenGridExportLimitGW.set(this.parseNonNegativeNumber(value, EnergyBalanceStore.DEFAULT_HYDROGEN_GRID_EXPORT_LIMIT_GW));
  }

  setHydrogenOutputTargetTWh(value: string | number): void {
    this.hydrogenOutputTargetTWh.set(this.parseNonNegativeNumber(value, EnergyBalanceStore.DEFAULT_HYDROGEN_TARGET_TWH));
  }

  setElectrolyzerEfficiencyPercent(value: string | number): void {
    const parsedValue = Number(value);
    if (!Number.isFinite(parsedValue)) {
      this.electrolyzerEfficiencyPercent.set(EnergyBalanceStore.DEFAULT_ELECTROLYZER_EFFICIENCY_PERCENT);
      return;
    }

    this.electrolyzerEfficiencyPercent.set(
      Math.min(
        EnergyBalanceStore.MAX_ELECTROLYZER_EFFICIENCY_PERCENT,
        Math.max(EnergyBalanceStore.MIN_ELECTROLYZER_EFFICIENCY_PERCENT, parsedValue),
      ),
    );
  }

  setPrivateDemandShare(value: string): void {
    const parsedValue = Number(value);
    if (!Number.isFinite(parsedValue)) {
      this.privateDemandShare.set(HOUSEHOLD_CONSUMPTION_SHARE);
      return;
    }

    this.privateDemandShare.set(Math.min(1, Math.max(0, parsedValue / 100)));
  }

  setPrivateSolarCapacityGW(value: string): void {
    this.privateSolarCapacityGW.set(this.parseNonNegativeNumber(value, EnergyBalanceStore.SOLAR_PRIVATE_DEFAULT_CAPACITY_GW_2025));
  }

  setSolarCapacityGW(value: string): void {
    this.solarCapacityGW.set(this.parseNonNegativeNumber(value, EnergyBalanceStore.SOLAR_PUBLIC_DEFAULT_CAPACITY_GW_2025));
  }

  setSolarFullLoadHours(value: string): void {
    this.solarFullLoadHours.set(this.parseNonNegativeNumber(value, SOLAR_DEFAULT_FULL_LOAD_HOURS_2025));
  }

  setWindlandCapacityGW(value: string): void {
    this.windlandCapacityGW.set(this.parseNonNegativeNumber(value, WINDLAND_BASELINE_CAPACITY_GW_2025));
  }

  setWindlandFullLoadHours(value: string): void {
    this.windlandFullLoadHours.set(this.parseNonNegativeNumber(value, WINDLAND_DEFAULT_FULL_LOAD_HOURS_2025));
  }

  setWindzeeCapacityGW(value: string): void {
    this.windzeeCapacityGW.set(this.parseNonNegativeNumber(value, WINDZEE_BASELINE_CAPACITY_GW_2025));
  }

  setWindzeeFullLoadHours(value: string): void {
    this.windzeeFullLoadHours.set(this.parseNonNegativeNumber(value, WINDZEE_DEFAULT_FULL_LOAD_HOURS_2025));
  }

  setNuclearCapacityGW(value: string): void {
    this.nuclearCapacityGW.set(this.parseNonNegativeNumber(value, NUCLEAR_DEFAULT_CAPACITY_GW));
  }

  setNuclearFullLoadHours(value: string): void {
    this.nuclearFullLoadHours.set(this.parseNonNegativeNumber(value, NUCLEAR_DEFAULT_FULL_LOAD_HOURS));
  }

  resetBalanceDefaults(): void {
    this.batteryCapacityGWh.set(0);
    this.privateBatteryCapacityGWh.set(0);
    this.hydrogenOutputTargetTWh.set(EnergyBalanceStore.DEFAULT_HYDROGEN_TARGET_TWH);
    this.electrolyzerEfficiencyPercent.set(EnergyBalanceStore.DEFAULT_ELECTROLYZER_EFFICIENCY_PERCENT);
    this.privateGridMaxLoadGW.set(35);
    this.privateDemandShare.set(HOUSEHOLD_CONSUMPTION_SHARE);
    this.privateSolarCapacityGW.set(EnergyBalanceStore.SOLAR_PRIVATE_DEFAULT_CAPACITY_GW_2025);
    this.solarCapacityGW.set(EnergyBalanceStore.SOLAR_PUBLIC_DEFAULT_CAPACITY_GW_2025);
    this.solarFullLoadHours.set(SOLAR_DEFAULT_FULL_LOAD_HOURS_2025);
    this.windlandCapacityGW.set(WINDLAND_BASELINE_CAPACITY_GW_2025);
    this.windlandFullLoadHours.set(WINDLAND_DEFAULT_FULL_LOAD_HOURS_2025);
    this.windzeeCapacityGW.set(WINDZEE_BASELINE_CAPACITY_GW_2025);
    this.windzeeFullLoadHours.set(WINDZEE_DEFAULT_FULL_LOAD_HOURS_2025);
    this.nuclearCapacityGW.set(NUCLEAR_DEFAULT_CAPACITY_GW);
    this.nuclearFullLoadHours.set(NUCLEAR_DEFAULT_FULL_LOAD_HOURS);
  }

  applyLargeBatteryScenario(): void {
    this.batteryCapacityGWh.set(EnergyBalanceStore.SCENARIO_LARGE_BATTERY.batteryCapacityGWh);
    this.privateBatteryCapacityGWh.set(EnergyBalanceStore.SCENARIO_LARGE_BATTERY.privateBatteryCapacityGWh);
    this.hydrogenOutputTargetTWh.set(EnergyBalanceStore.SCENARIO_LARGE_BATTERY.hydrogenOutputTargetTWh);
    this.hydrogenDedicatedOffshoreWindCapacityGW.set(EnergyBalanceStore.DEFAULT_HYDROGEN_DEDICATED_OFFSHORE_WIND_CAPACITY_GW);
    this.hydrogenElectrolyzerCapacityGW.set(EnergyBalanceStore.DEFAULT_HYDROGEN_ELECTROLYZER_CAPACITY_GW);
    this.hydrogenGridImportLimitGW.set(EnergyBalanceStore.DEFAULT_HYDROGEN_GRID_IMPORT_LIMIT_GW);
    this.hydrogenGridExportLimitGW.set(EnergyBalanceStore.DEFAULT_HYDROGEN_GRID_EXPORT_LIMIT_GW);
    this.privateDemandShare.set(EnergyBalanceStore.SCENARIO_LARGE_BATTERY.privateDemandShare);
    this.solarCapacityGW.set(EnergyBalanceStore.SOLAR_PUBLIC_SCENARIO_CAPACITY_GW);
    this.privateSolarCapacityGW.set(EnergyBalanceStore.SOLAR_PRIVATE_SCENARIO_CAPACITY_GW);
    this.windlandCapacityGW.set(EnergyBalanceStore.SCENARIO_LARGE_BATTERY.windlandCapacityGW);
    this.windlandFullLoadHours.set(EnergyBalanceStore.SCENARIO_LARGE_BATTERY.windlandFullLoadHours);
    this.windzeeCapacityGW.set(EnergyBalanceStore.SCENARIO_LARGE_BATTERY.windzeeCapacityGW);
    this.windzeeFullLoadHours.set(EnergyBalanceStore.SCENARIO_LARGE_BATTERY.windzeeFullLoadHours);
    this.nuclearCapacityGW.set(EnergyBalanceStore.SCENARIO_LARGE_BATTERY.nuclearCapacityGW);
  }

  applyWindAndNuclearScenario(): void {
    this.batteryCapacityGWh.set(EnergyBalanceStore.SCENARIO_WIND_NUCLEAR.batteryCapacityGWh);
    this.privateBatteryCapacityGWh.set(EnergyBalanceStore.SCENARIO_WIND_NUCLEAR.privateBatteryCapacityGWh);
    this.hydrogenOutputTargetTWh.set(EnergyBalanceStore.SCENARIO_WIND_NUCLEAR.hydrogenOutputTargetTWh);
    this.hydrogenDedicatedOffshoreWindCapacityGW.set(EnergyBalanceStore.DEFAULT_HYDROGEN_DEDICATED_OFFSHORE_WIND_CAPACITY_GW);
    this.hydrogenElectrolyzerCapacityGW.set(EnergyBalanceStore.DEFAULT_HYDROGEN_ELECTROLYZER_CAPACITY_GW);
    this.hydrogenGridImportLimitGW.set(EnergyBalanceStore.DEFAULT_HYDROGEN_GRID_IMPORT_LIMIT_GW);
    this.hydrogenGridExportLimitGW.set(EnergyBalanceStore.DEFAULT_HYDROGEN_GRID_EXPORT_LIMIT_GW);
    this.privateDemandShare.set(EnergyBalanceStore.SCENARIO_WIND_NUCLEAR.privateDemandShare);
    this.solarCapacityGW.set(EnergyBalanceStore.SOLAR_PUBLIC_SCENARIO_CAPACITY_GW);
    this.privateSolarCapacityGW.set(EnergyBalanceStore.SOLAR_PRIVATE_SCENARIO_CAPACITY_GW);
    this.windlandCapacityGW.set(EnergyBalanceStore.SCENARIO_WIND_NUCLEAR.windlandCapacityGW);
    this.windlandFullLoadHours.set(EnergyBalanceStore.SCENARIO_WIND_NUCLEAR.windlandFullLoadHours);
    this.windzeeCapacityGW.set(EnergyBalanceStore.SCENARIO_WIND_NUCLEAR.windzeeCapacityGW);
    this.windzeeFullLoadHours.set(EnergyBalanceStore.SCENARIO_WIND_NUCLEAR.windzeeFullLoadHours);
    this.nuclearCapacityGW.set(EnergyBalanceStore.SCENARIO_WIND_NUCLEAR.nuclearCapacityGW);
    this.nuclearFullLoadHours.set(NUCLEAR_DEFAULT_FULL_LOAD_HOURS);
  }

  applyLargeBatteryHydrogenScenario(): void {
    this.batteryCapacityGWh.set(EnergyBalanceStore.SCENARIO_LARGE_BATTERY_HYDROGEN.batteryCapacityGWh);
    this.privateBatteryCapacityGWh.set(EnergyBalanceStore.SCENARIO_LARGE_BATTERY_HYDROGEN.privateBatteryCapacityGWh);
    this.hydrogenOutputTargetTWh.set(EnergyBalanceStore.SCENARIO_LARGE_BATTERY_HYDROGEN.hydrogenOutputTargetTWh);
    this.hydrogenDedicatedOffshoreWindCapacityGW.set(EnergyBalanceStore.SCENARIO_LARGE_BATTERY_HYDROGEN.hydrogenDedicatedOffshoreWindCapacityGW);
    this.hydrogenElectrolyzerCapacityGW.set(EnergyBalanceStore.SCENARIO_LARGE_BATTERY_HYDROGEN.hydrogenElectrolyzerCapacityGW);
    this.hydrogenGridImportLimitGW.set(EnergyBalanceStore.SCENARIO_LARGE_BATTERY_HYDROGEN.hydrogenGridImportLimitGW);
    this.hydrogenGridExportLimitGW.set(EnergyBalanceStore.SCENARIO_LARGE_BATTERY_HYDROGEN.hydrogenGridExportLimitGW);
    this.privateDemandShare.set(EnergyBalanceStore.SCENARIO_LARGE_BATTERY_HYDROGEN.privateDemandShare);
    this.solarCapacityGW.set(EnergyBalanceStore.SOLAR_PUBLIC_SCENARIO_CAPACITY_GW);
    this.privateSolarCapacityGW.set(EnergyBalanceStore.SOLAR_PRIVATE_SCENARIO_CAPACITY_GW);
    this.windlandCapacityGW.set(EnergyBalanceStore.SCENARIO_LARGE_BATTERY_HYDROGEN.windlandCapacityGW);
    this.windlandFullLoadHours.set(EnergyBalanceStore.SCENARIO_LARGE_BATTERY_HYDROGEN.windlandFullLoadHours);
    this.windzeeCapacityGW.set(EnergyBalanceStore.SCENARIO_LARGE_BATTERY_HYDROGEN.windzeeCapacityGW);
    this.windzeeFullLoadHours.set(EnergyBalanceStore.SCENARIO_LARGE_BATTERY_HYDROGEN.windzeeFullLoadHours);
    this.nuclearCapacityGW.set(EnergyBalanceStore.SCENARIO_LARGE_BATTERY_HYDROGEN.nuclearCapacityGW);
    this.nuclearFullLoadHours.set(EnergyBalanceStore.SCENARIO_LARGE_BATTERY_HYDROGEN.nuclearFullLoadHours);
  }

  applyOnlyNuclearHydrogenScenario(): void {
    this.batteryCapacityGWh.set(EnergyBalanceStore.SCENARIO_ONLY_NUCLEAR_HYDROGEN.batteryCapacityGWh);
    this.privateBatteryCapacityGWh.set(EnergyBalanceStore.SCENARIO_ONLY_NUCLEAR_HYDROGEN.privateBatteryCapacityGWh);
    this.hydrogenOutputTargetTWh.set(EnergyBalanceStore.SCENARIO_ONLY_NUCLEAR_HYDROGEN.hydrogenOutputTargetTWh);
    this.hydrogenDedicatedOffshoreWindCapacityGW.set(EnergyBalanceStore.SCENARIO_ONLY_NUCLEAR_HYDROGEN.hydrogenDedicatedOffshoreWindCapacityGW);
    this.hydrogenElectrolyzerCapacityGW.set(EnergyBalanceStore.SCENARIO_ONLY_NUCLEAR_HYDROGEN.hydrogenElectrolyzerCapacityGW);
    this.hydrogenGridImportLimitGW.set(EnergyBalanceStore.SCENARIO_ONLY_NUCLEAR_HYDROGEN.hydrogenGridImportLimitGW);
    this.hydrogenGridExportLimitGW.set(EnergyBalanceStore.SCENARIO_ONLY_NUCLEAR_HYDROGEN.hydrogenGridExportLimitGW);
    this.privateDemandShare.set(EnergyBalanceStore.SCENARIO_ONLY_NUCLEAR_HYDROGEN.privateDemandShare);
    this.solarCapacityGW.set(EnergyBalanceStore.SCENARIO_ONLY_NUCLEAR_HYDROGEN.solarCapacityGW);
    this.privateSolarCapacityGW.set(EnergyBalanceStore.SCENARIO_ONLY_NUCLEAR_HYDROGEN.privateSolarCapacityGW);
    this.windlandCapacityGW.set(EnergyBalanceStore.SCENARIO_ONLY_NUCLEAR_HYDROGEN.windlandCapacityGW);
    this.windlandFullLoadHours.set(EnergyBalanceStore.SCENARIO_ONLY_NUCLEAR_HYDROGEN.windlandFullLoadHours);
    this.windzeeCapacityGW.set(EnergyBalanceStore.SCENARIO_ONLY_NUCLEAR_HYDROGEN.windzeeCapacityGW);
    this.windzeeFullLoadHours.set(EnergyBalanceStore.SCENARIO_ONLY_NUCLEAR_HYDROGEN.windzeeFullLoadHours);
    this.nuclearCapacityGW.set(EnergyBalanceStore.SCENARIO_ONLY_NUCLEAR_HYDROGEN.nuclearCapacityGW);
    this.nuclearFullLoadHours.set(EnergyBalanceStore.SCENARIO_ONLY_NUCLEAR_HYDROGEN.nuclearFullLoadHours);
  }

  private parseNonNegativeNumber(value: string | number, fallback: number): number {
    const parsedValue = Number(value);
    if (!Number.isFinite(parsedValue)) {
      return fallback;
    }

    return Math.max(parsedValue, 0);
  }

  private hydrateSettings(): void {
    const parsed = readPersistedBalanceSettings(EnergyBalanceStore.SETTINGS_STORAGE_KEY);
    if (!parsed) {
      return;
    }

    this.batteryCapacityGWh.set(parseStoredNumber(parsed.batteryCapacityGWh, 0));
    this.privateBatteryCapacityGWh.set(parseStoredNumber(parsed.privateBatteryCapacityGWh, 0));
    if (typeof parsed.hydrogenOutputTargetTWh === 'number') {
      this.hydrogenOutputTargetTWh.set(parseStoredNumber(parsed.hydrogenOutputTargetTWh, EnergyBalanceStore.DEFAULT_HYDROGEN_TARGET_TWH));
    } else if (typeof parsed.hydrogenProductionTargetTWh === 'number') {
      this.hydrogenOutputTargetTWh.set(parseStoredNumber(parsed.hydrogenProductionTargetTWh, EnergyBalanceStore.DEFAULT_HYDROGEN_TARGET_TWH));
    } else {
      const migratedHydrogenTarget = parseStoredBoolean(parsed.hydrogenProductionEnabled, false)
        ? EnergyBalanceStore.HYDROGEN_SCENARIO_TARGET_TWH
        : EnergyBalanceStore.DEFAULT_HYDROGEN_TARGET_TWH;
      this.hydrogenOutputTargetTWh.set(migratedHydrogenTarget);
    }
    this.electrolyzerEfficiencyPercent.set(
      this.parseBoundedNumber(
        parsed.electrolyzerEfficiencyPercent,
        EnergyBalanceStore.DEFAULT_ELECTROLYZER_EFFICIENCY_PERCENT,
        EnergyBalanceStore.MIN_ELECTROLYZER_EFFICIENCY_PERCENT,
        EnergyBalanceStore.MAX_ELECTROLYZER_EFFICIENCY_PERCENT,
      ),
    );
    this.hydrogenDedicatedOffshoreWindCapacityGW.set(parseStoredNumber(parsed.hydrogenDedicatedOffshoreWindCapacityGW, EnergyBalanceStore.DEFAULT_HYDROGEN_DEDICATED_OFFSHORE_WIND_CAPACITY_GW));
    this.hydrogenElectrolyzerCapacityGW.set(parseStoredNumber(parsed.hydrogenElectrolyzerCapacityGW, EnergyBalanceStore.DEFAULT_HYDROGEN_ELECTROLYZER_CAPACITY_GW));
    this.hydrogenGridImportLimitGW.set(parseStoredNumber(parsed.hydrogenGridImportLimitGW, EnergyBalanceStore.DEFAULT_HYDROGEN_GRID_IMPORT_LIMIT_GW));
    this.hydrogenGridExportLimitGW.set(parseStoredNumber(parsed.hydrogenGridExportLimitGW, EnergyBalanceStore.DEFAULT_HYDROGEN_GRID_EXPORT_LIMIT_GW));
    this.privateGridMaxLoadGW.set(parseStoredNumber(parsed.privateGridMaxLoadGW, 35));
    this.privateDemandShare.set(parseStoredPercentage(parsed.privateDemandShare, HOUSEHOLD_CONSUMPTION_SHARE));
    this.privateSolarCapacityGW.set(parseStoredNumber(parsed.privateSolarCapacityGW, EnergyBalanceStore.SOLAR_PRIVATE_DEFAULT_CAPACITY_GW_2025));
    this.solarCapacityGW.set(parseStoredNumber(parsed.solarCapacityGW, EnergyBalanceStore.SOLAR_PUBLIC_DEFAULT_CAPACITY_GW_2025));
    this.solarFullLoadHours.set(parseStoredNumber(parsed.solarFullLoadHours, SOLAR_DEFAULT_FULL_LOAD_HOURS_2025));
    this.windlandCapacityGW.set(parseStoredNumber(parsed.windlandCapacityGW, WINDLAND_BASELINE_CAPACITY_GW_2025));
    this.windlandFullLoadHours.set(parseStoredNumber(parsed.windlandFullLoadHours, WINDLAND_DEFAULT_FULL_LOAD_HOURS_2025));
    this.windzeeCapacityGW.set(parseStoredNumber(parsed.windzeeCapacityGW, WINDZEE_BASELINE_CAPACITY_GW_2025));
    this.windzeeFullLoadHours.set(parseStoredNumber(parsed.windzeeFullLoadHours, WINDZEE_DEFAULT_FULL_LOAD_HOURS_2025));
    this.nuclearCapacityGW.set(parseStoredNumber(parsed.nuclearCapacityGW, NUCLEAR_DEFAULT_CAPACITY_GW));
    this.nuclearFullLoadHours.set(parseStoredNumber(parsed.nuclearFullLoadHours, NUCLEAR_DEFAULT_FULL_LOAD_HOURS));
  }

  private persistSettings(settings: PersistedBalanceSettings): void {
    writePersistedBalanceSettings(EnergyBalanceStore.SETTINGS_STORAGE_KEY, settings);
  }

  private parseBoundedNumber(value: unknown, fallback: number, min: number, max: number): number {
    const parsedValue = Number(value);
    if (!Number.isFinite(parsedValue)) {
      return fallback;
    }

    return Math.min(max, Math.max(min, parsedValue));
  }
}
