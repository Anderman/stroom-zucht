import {
    ChangeDetectionStrategy,
    Component,
    DestroyRef,
    ElementRef,
    computed,
    effect,
    inject,
    input,
    output,
    viewChild,
} from '@angular/core';
import uPlot from 'uplot';

import { formatRankXAxisValue, formatXAxisValue, getRankXAxisSplits, getXAxisSplits } from '../data/chart-x-axis';
import {
    BATTERY_COLOR,
    PRICE_COLOR,
    PRICE_UNIT,
    SOC_UNIT,
    TEMPERATURE_COLOR,
    TEMPERATURE_UNIT,
    WEEKEND_SHADE,
} from '../data/energy-dashboard.config';
import { ChartSeries, ChartXAxisMode, DatasetConfig, HoverPosition, TimeRange, XWindow } from '../data/energy-dashboard.types';

@Component({
  selector: 'app-energy-chart',
  standalone: true,
  templateUrl: './energy-chart.component.html',
  styles: [':host { display: block; }'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EnergyChartComponent {
  private static readonly MIN_ZOOM_SPAN_MS = 24 * 60 * 60 * 1000;
  private static readonly MIN_RANK_ZOOM_SPAN = 24;

  readonly timestamps = input.required<number[]>();
  readonly dataset = input.required<DatasetConfig>();
  readonly chartSeries = input.required<ChartSeries[]>();
  readonly chartBands = input.required<uPlot.Band[]>();
  readonly weekendRanges = input.required<TimeRange[]>();
  readonly xAxisMode = input<ChartXAxisMode>('time');
  readonly xWindow = input<XWindow | null>(null);

  readonly hoveredIndexChange = output<number | null>();
  readonly hoverPositionChange = output<HoverPosition | null>();
  readonly xWindowChange = output<XWindow | null>();
  readonly resetZoomRequested = output<void>();

  private readonly destroyRef = inject(DestroyRef);
  private readonly chartHost = viewChild<ElementRef<HTMLDivElement>>('chartHost');
  private chart: uPlot | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private readonly fullXRange = computed(() => {
    const timestamps = this.timestamps();
    if (!timestamps.length) {
      return null;
    }

    return {
      min: timestamps[0],
      max: timestamps[timestamps.length - 1],
    };
  });

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.resizeObserver?.disconnect();
      this.chart?.destroy();
    });

    effect(() => {
      const host = this.chartHost()?.nativeElement;
      const timestamps = this.timestamps();
      const dataset = this.dataset();
      const chartSeries = this.chartSeries();
      const chartBands = this.chartBands();
      const xAxisMode = this.xAxisMode();

      if (!host) {
        return;
      }

      if (!timestamps.length || !chartSeries.length || !chartSeries[0]?.values.length) {
        this.chart?.destroy();
        this.chart = null;
        host.innerHTML = '';
        return;
      }

      this.renderChart(host, timestamps, dataset, chartSeries, chartBands, xAxisMode);
      this.attachResizeObserver(host);
    });
  }

  private attachResizeObserver(host: HTMLDivElement): void {
    if (this.resizeObserver) {
      return;
    }

    this.resizeObserver = new ResizeObserver(() => {
      if (!this.chart) {
        return;
      }

      const width = Math.max(host.clientWidth, 320);
      const height = Math.max(host.clientHeight, 320);
      this.updateHoverPositionBounds(width, height);
      this.chart.setSize({ width, height });
    });

    this.resizeObserver.observe(host);
  }

  private renderChart(
    host: HTMLDivElement,
    timestamps: number[],
    dataset: DatasetConfig,
    chartSeries: ChartSeries[],
    chartBands: uPlot.Band[],
    xAxisMode: ChartXAxisMode,
  ): void {
    this.chart?.destroy();
    host.innerHTML = '';

    const width = Math.max(host.clientWidth, 320);
    const height = Math.max(host.clientHeight, 320);
    const valueFormatter = new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 1 });
    const hasPriceAxis = chartSeries.some(seriesDefinition => seriesDefinition.scale === 'price');
    const hasTemperatureAxis = chartSeries.some(seriesDefinition => seriesDefinition.scale === 'temperature');
    const hasSocAxis = chartSeries.some(seriesDefinition => seriesDefinition.scale === 'soc');

    const series: uPlot.Series[] = [
      {},
      ...chartSeries.map(seriesDefinition => ({
        label: seriesDefinition.label,
        stroke: seriesDefinition.color,
        scale: seriesDefinition.scale ?? 'y',
        width: seriesDefinition.width ?? 2,
        alpha: seriesDefinition.alpha,
        points: { show: false },
        fill: seriesDefinition.fill,
        dash: seriesDefinition.dash,
      })),
    ];

    const data: uPlot.AlignedData = [
      timestamps,
      ...chartSeries.map(seriesDefinition => seriesDefinition.values),
    ];

    this.chart = new uPlot(
      {
        width,
        height,
        padding: [12, 18, 8, 12],
        legend: { show: false },
        cursor: {
          focus: { prox: 32 },
          drag: { x: true, y: false, setScale: true },
        },
        scales: {
          x: { time: false },
          y: { auto: true },
          ...(hasPriceAxis ? { price: { auto: true } } : {}),
          ...(hasTemperatureAxis ? { temperature: { auto: true } } : {}),
          ...(hasSocAxis ? { soc: { auto: true, range: [0, 100] } } : {}),
        },
        bands: chartBands,
        hooks: {
          drawClear: [plot => this.drawWeekendShading(plot)],
          ready: [plot => {
            const onWheel = (event: WheelEvent) => {
              if (!event.ctrlKey && !event.metaKey) {
                return;
              }

              event.preventDefault();
              this.handleWheelZoom(plot, event);
            };

            plot.over.addEventListener('wheel', onWheel, { passive: false });
            plot.over.addEventListener('dblclick', () => this.resetZoomRequested.emit());

            // Touch-to-zoom: horizontale drag → zoom-selectie, verticaal → scrollen.
            let touchStartX = 0;
            let touchStartY = 0;
            let touchCurrentX = 0;
            let touchDragging = false;

            const onTouchStart = (e: TouchEvent) => {
              if (e.touches.length !== 1) { return; }
              touchStartX = e.touches[0].clientX;
              touchStartY = e.touches[0].clientY;
              touchCurrentX = touchStartX;
              touchDragging = false;
            };

            const onTouchMove = (e: TouchEvent) => {
              if (e.touches.length !== 1) { return; }
              const dx = e.touches[0].clientX - touchStartX;
              const dy = e.touches[0].clientY - touchStartY;
              if (!touchDragging && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
                touchDragging = true;
              }
              if (touchDragging) {
                touchCurrentX = e.touches[0].clientX;
                e.preventDefault();
              }
            };

            const onTouchEnd = () => {
              if (!touchDragging) { return; }
              touchDragging = false;
              const rect = plot.over.getBoundingClientRect();
              const startLeft = Math.max(0, touchStartX - rect.left);
              const endLeft = Math.max(0, touchCurrentX - rect.left);
              if (Math.abs(endLeft - startLeft) < 20) { return; }
              this.applyTouchZoom(plot, startLeft, endLeft);
            };

            plot.over.addEventListener('touchstart', onTouchStart, { passive: true });
            plot.over.addEventListener('touchmove', onTouchMove, { passive: false });
            plot.over.addEventListener('touchend', onTouchEnd, { passive: true });
          }],
          setCursor: [plot => {
            const nextIndex = typeof plot.cursor.idx === 'number' ? plot.cursor.idx : null;
            this.hoveredIndexChange.emit(nextIndex);

            if (nextIndex == null) {
              this.hoverPositionChange.emit(null);
              return;
            }

            this.hoverPositionChange.emit(this.getHoverPosition(plot));
          }],
          setScale: [(_plot, key) => {
            if (key !== 'x' || !this.chart) {
              return;
            }

            const min = this.chart.scales['x']?.min;
            const max = this.chart.scales['x']?.max;
            const fullXRange = this.fullXRange();
            if (min == null || max == null || !fullXRange) {
              return;
            }

            if (Math.abs(min - fullXRange.min) <= 1 && Math.abs(max - fullXRange.max) <= 1) {
              this.xWindowChange.emit(null);
              return;
            }

            this.xWindowChange.emit({ min, max });
          }],
        },
        axes: [
          {
            stroke: '#6b778a',
            grid: { stroke: 'rgba(107, 119, 138, 0.14)' },
            splits: (_plot, _axisIdx, scaleMin, scaleMax) => xAxisMode === 'rank'
              ? getRankXAxisSplits(this.timestamps(), scaleMin, scaleMax)
              : getXAxisSplits(this.timestamps(), scaleMin, scaleMax),
            values: (plot, splits) => {
              if (xAxisMode === 'rank') {
                return splits.map(split => formatRankXAxisValue(split as number));
              }

              const xSpan = (plot.scales['x']?.max ?? 0) - (plot.scales['x']?.min ?? 0);
              return splits.map(split => formatXAxisValue(split as number, xSpan));
            },
          },
          {
            stroke: '#6b778a',
            grid: { stroke: 'rgba(107, 119, 138, 0.14)' },
            values: (_plot, splits) => splits.map(split => `${valueFormatter.format(split as number)} ${dataset.peakUnit}`),
          },
          ...(hasPriceAxis
            ? [{
              scale: 'price',
              side: 1,
              stroke: PRICE_COLOR,
              grid: { show: false },
              values: (_plot: uPlot, splits: number[]) => splits.map(split => `${valueFormatter.format(split)} ${PRICE_UNIT}`),
            }]
            : []),
          ...(hasTemperatureAxis
            ? [{
              scale: 'temperature',
              side: 1,
              stroke: TEMPERATURE_COLOR,
              grid: { show: false },
              values: (_plot: uPlot, splits: number[]) => splits.map(split => `${valueFormatter.format(split)} ${TEMPERATURE_UNIT}`),
            }]
            : []),
          ...(hasSocAxis
            ? [{
              scale: 'soc',
              side: 1,
              stroke: BATTERY_COLOR,
              grid: { show: false },
              values: (_plot: uPlot, splits: number[]) => splits.map(split => `${valueFormatter.format(split)} ${SOC_UNIT}`),
            }]
            : []),
        ],
        series,
      },
      data,
      host,
    );

    const fullXRange = this.fullXRange();
    if (fullXRange) {
      this.applyChartXWindow(this.xWindow() ?? fullXRange);
    }
  }

  private drawWeekendShading(plot: uPlot): void {
    if (this.xAxisMode() === 'rank') {
      return;
    }

    const scale = plot.scales['x'];
    const min = scale?.min;
    const max = scale?.max;
    if (min == null || max == null) {
      return;
    }

    const visibleRanges = this.weekendRanges().filter(range => range.end > min && range.start < max);
    if (!visibleRanges.length) {
      return;
    }

    const ctx = plot.ctx;
    ctx.save();
    ctx.fillStyle = WEEKEND_SHADE;

    for (const range of visibleRanges) {
      const start = Math.max(range.start, min);
      const end = Math.min(range.end, max);
      const left = Math.max(plot.bbox.left, plot.valToPos(start, 'x', true));
      const right = Math.min(plot.bbox.left + plot.bbox.width, plot.valToPos(end, 'x', true));
      const width = right - left;

      if (width <= 0) {
        continue;
      }

      ctx.fillRect(left, plot.bbox.top, width, plot.bbox.height);
    }

    ctx.restore();
  }

  private getHoverPosition(plot: uPlot): HoverPosition {
    const host = this.chartHost()?.nativeElement;
    const width = Math.max(host?.clientWidth ?? 320, 320);
    const height = Math.max(host?.clientHeight ?? 320, 320);
    const rawLeft = (plot.cursor.left ?? plot.bbox.width / 2) + plot.bbox.left;
    const rawTop = (plot.cursor.top ?? plot.bbox.height / 2) + plot.bbox.top;

    return {
      left: this.clamp(rawLeft, 110, Math.max(width - 110, 110)),
      top: this.clamp(rawTop, 72, Math.max(height - 18, 72)),
    };
  }

  private updateHoverPositionBounds(width: number, height: number): void {
    const plot = this.chart;
    if (!plot || typeof plot.cursor.left !== 'number' || typeof plot.cursor.top !== 'number') {
      return;
    }

    const rawLeft = plot.cursor.left + plot.bbox.left;
    const rawTop = plot.cursor.top + plot.bbox.top;
    this.hoverPositionChange.emit({
      left: this.clamp(rawLeft, 110, Math.max(width - 110, 110)),
      top: this.clamp(rawTop, 72, Math.max(height - 18, 72)),
    });
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }

  private handleWheelZoom(plot: uPlot, event: WheelEvent): void {
    const fullXRange = this.fullXRange();
    const currentMin = plot.scales['x']?.min;
    const currentMax = plot.scales['x']?.max;
    if (!fullXRange || currentMin == null || currentMax == null) {
      return;
    }

    const currentSpan = currentMax - currentMin;
    const fullSpan = fullXRange.max - fullXRange.min;
    if (currentSpan <= 0 || fullSpan <= 0) {
      return;
    }

    const minimumSpan = this.xAxisMode() === 'rank'
      ? EnergyChartComponent.MIN_RANK_ZOOM_SPAN
      : EnergyChartComponent.MIN_ZOOM_SPAN_MS;
    const nextSpan = Math.min(
      fullSpan,
      Math.max(minimumSpan, currentSpan * (event.deltaY < 0 ? 0.8 : 1.25)),
    );

    if (Math.abs(nextSpan - currentSpan) < 1) {
      return;
    }

    const cursorLeft = typeof plot.cursor.left === 'number' && plot.cursor.left >= 0
      ? plot.cursor.left
      : plot.bbox.width / 2;
    const anchor = plot.posToVal(cursorLeft, 'x');
    if (!Number.isFinite(anchor)) {
      return;
    }

    const ratio = (anchor - currentMin) / currentSpan;
    let nextMin = anchor - ratio * nextSpan;
    let nextMax = nextMin + nextSpan;

    if (nextMin < fullXRange.min) {
      nextMin = fullXRange.min;
      nextMax = nextMin + nextSpan;
    }

    if (nextMax > fullXRange.max) {
      nextMax = fullXRange.max;
      nextMin = nextMax - nextSpan;
    }

    this.applyChartXWindow({ min: nextMin, max: nextMax });
  }

  private applyTouchZoom(plot: uPlot, startLeft: number, endLeft: number): void {
    const fullXRange = this.fullXRange();
    if (!fullXRange) { return; }

    const startVal = plot.posToVal(startLeft, 'x');
    const endVal = plot.posToVal(endLeft, 'x');
    if (!Number.isFinite(startVal) || !Number.isFinite(endVal)) { return; }

    const minimumSpan = this.xAxisMode() === 'rank'
      ? EnergyChartComponent.MIN_RANK_ZOOM_SPAN
      : EnergyChartComponent.MIN_ZOOM_SPAN_MS;

    const nextMin = Math.max(fullXRange.min, Math.min(startVal, endVal));
    const nextMax = Math.min(fullXRange.max, Math.max(startVal, endVal));

    if (nextMax - nextMin < minimumSpan) { return; }

    this.applyChartXWindow({ min: nextMin, max: nextMax });
  }

  private applyChartXWindow(xWindow: XWindow): void {
    if (!this.chart) {
      return;
    }

    this.chart.setScale('x', xWindow);
  }
}
