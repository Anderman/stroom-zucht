import { Injectable, signal } from '@angular/core';

import { SupportedYear } from './energy-dashboard.config';
import { BalanceChartMode, DatasetKey, HoverPosition, XWindow } from './energy-dashboard.types';

@Injectable({ providedIn: 'root' })
export class EnergyDashboardViewStore {
  readonly activeBalanceChartMode = signal<BalanceChartMode>('timeline');
  readonly activeDataset = signal<DatasetKey>('totaldemand');
  readonly xWindow = signal<XWindow | null>(null);
  readonly hoveredIndex = signal<number | null>(null);
  readonly hoverPosition = signal<HoverPosition | null>(null);
  readonly hiddenLegendLabels = signal<string[]>([]);
  readonly selectedYear = signal<SupportedYear>(2025);

  selectDataset(key: DatasetKey): void {
    this.activeDataset.set(key);
    if (key !== 'balance') {
      this.activeBalanceChartMode.set('timeline');
    }

    this.resetChartInteractions();
  }

  selectYear(year: SupportedYear): void {
    if (this.selectedYear() === year) {
      return;
    }

    this.selectedYear.set(year);
    this.resetChartInteractions();
  }

  selectBalanceChartMode(mode: BalanceChartMode): void {
    if (this.activeBalanceChartMode() === mode) {
      return;
    }

    this.activeBalanceChartMode.set(mode);
    this.resetChartInteractions();
  }

  toggleLegendItem(label: string): void {
    this.hiddenLegendLabels.update(currentLabels => currentLabels.includes(label)
      ? currentLabels.filter(currentLabel => currentLabel !== label)
      : [...currentLabels, label]);
  }

  resetZoom(): void {
    this.xWindow.set(null);
  }

  setHoveredIndex(index: number | null): void {
    this.hoveredIndex.set(index);
  }

  setHoverPosition(position: HoverPosition | null): void {
    this.hoverPosition.set(position);
  }

  setXWindow(nextWindow: XWindow | null): void {
    const currentWindow = this.xWindow();
    if (!currentWindow && !nextWindow) {
      return;
    }

    if (currentWindow && nextWindow && Math.abs(currentWindow.min - nextWindow.min) <= 1 && Math.abs(currentWindow.max - nextWindow.max) <= 1) {
      return;
    }

    this.xWindow.set(nextWindow);
  }

  private resetChartInteractions(): void {
    this.hiddenLegendLabels.set([]);
    this.hoveredIndex.set(null);
    this.hoverPosition.set(null);
    this.resetZoom();
  }
}
