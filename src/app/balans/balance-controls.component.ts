import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  selector: 'app-balance-controls',
  standalone: true,
  templateUrl: './balance-controls.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BalanceControlsComponent {
  readonly showHydrogenProductionControl = input(true);
  readonly batteryCapacityGWh = input.required<number>();
  readonly privateBatteryCapacityGWh = input.required<number>();
  readonly hydrogenOutputTargetTWh = input.required<number>();
  readonly electrolyzerEfficiencyPercent = input.required<number>();
  readonly hydrogenRequiredElectricityTWh = input.required<number>();
  readonly privateGridMaxLoadGW = input.required<number>();
  readonly privateDemandSharePercent = input.required<number>();
  readonly privateSolarCapacityGW = input.required<number>();
  readonly solarCapacityGW = input.required<number>();
  readonly solarFullLoadHours = input.required<number>();
  readonly windlandCapacityGW = input.required<number>();
  readonly windlandFullLoadHours = input.required<number>();
  readonly windzeeCapacityGW = input.required<number>();
  readonly windzeeFullLoadHours = input.required<number>();
  readonly nuclearCapacityGW = input.required<number>();
  readonly nuclearFullLoadHours = input.required<number>();
  readonly solarOutputText = input.required<string>();
  readonly privateSolarOutputText = input.required<string>();
  readonly publicBatteryText = input.required<string>();
  readonly privateBatteryText = input.required<string>();
  readonly windlandOutputText = input.required<string>();
  readonly windzeeOutputText = input.required<string>();
  readonly nuclearOutputText = input.required<string>();

  readonly batteryCapacityGWhChange = output<string>();
  readonly privateBatteryCapacityGWhChange = output<string>();
  readonly hydrogenOutputTargetTWhChange = output<string>();
  readonly electrolyzerEfficiencyPercentChange = output<string>();
  readonly privateGridMaxLoadGWChange = output<string>();
  readonly privateDemandSharePercentChange = output<string>();
  readonly privateSolarCapacityGWChange = output<string>();
  readonly solarCapacityGWChange = output<string>();
  readonly solarFullLoadHoursChange = output<string>();
  readonly windlandCapacityGWChange = output<string>();
  readonly windlandFullLoadHoursChange = output<string>();
  readonly windzeeCapacityGWChange = output<string>();
  readonly windzeeFullLoadHoursChange = output<string>();
  readonly nuclearCapacityGWChange = output<string>();
  readonly nuclearFullLoadHoursChange = output<string>();
  readonly largeBatteryScenarioRequested = output<void>();
  readonly largeBatteryHydrogenScenarioRequested = output<void>();
  readonly windNuclearScenarioRequested = output<void>();
  readonly onlyNuclearHydrogenScenarioRequested = output<void>();
  readonly resetDefaultsRequested = output<void>();

  applyScenarioSelection(selection: string): void {
    if (selection === 'large-battery') {
      this.largeBatteryScenarioRequested.emit();
      return;
    }

    if (selection === 'wind-nuclear') {
      this.windNuclearScenarioRequested.emit();
      return;
    }

    if (selection === 'large-battery-hydrogen') {
      this.largeBatteryHydrogenScenarioRequested.emit();
      return;
    }

    if (selection === 'only-nuclear-hydrogen') {
      this.onlyNuclearHydrogenScenarioRequested.emit();
      return;
    }

    if (selection === 'baseline-2025') {
      this.resetDefaultsRequested.emit();
    }
  }
}
