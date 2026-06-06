import { Injectable } from '@angular/core';

import { GAS_TO_ELECTRIC_EQUIVALENT_FACTOR } from './energy-dashboard.config';

@Injectable({ providedIn: 'root' })
export class HeatPumpProfileService {
  toElectricProfile(gasValues: number[], timestamps: number[], temperatureValues: number[] = []): number[] {
    const directHeatPumpEquivalent = gasValues.map(value => value * GAS_TO_ELECTRIC_EQUIVALENT_FACTOR);
    return this.reshapeHeatPumpEquivalent(directHeatPumpEquivalent, timestamps, temperatureValues);
  }

  private getHeatPumpLocalParts(timestamp: number): { year: number; month: number; day: number; hour: number } {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Amsterdam',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      hourCycle: 'h23',
    }).formatToParts(new Date(timestamp));
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));

    return {
      year: Number(values['year']),
      month: Number(values['month']),
      day: Number(values['day']),
      hour: Number(values['hour']),
    };
  }

  private getHeatPumpDayKey(timestamp: number): string {
    const { year, month, day } = this.getHeatPumpLocalParts(timestamp);
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  private shouldApplyCorrectionForDay(dayIndices: number[], temperatureValues: number[]): boolean {
    if (!temperatureValues.length) {
      return false;
    }

    const hasHourBelow10 = dayIndices.some(index => {
      const temperature = temperatureValues[index];
      return temperature < 10;
    });

    return hasHourBelow10;
  }

  private getHeatPumpHourlyPreference(hour: number): number {
    if (hour <= 6 || hour >= 22) {
      return 1.06;
    }

    if (hour <= 8 || hour >= 20) {
      return 1.02;
    }

    if (hour >= 11 && hour <= 17) {
      return 0.92;
    }

    return 0.98;
  }

  private reshapeHeatPumpEquivalent(values: number[], timestamps: number[], temperatureValues: number[]): number[] {
    if (!values.length || values.length !== timestamps.length) {
      return values;
    }

    const indicesByDay = new Map<string, number[]>();
    timestamps.forEach((timestamp, index) => {
      const key = this.getHeatPumpDayKey(timestamp);
      const indices = indicesByDay.get(key) ?? [];
      indices.push(index);
      indicesByDay.set(key, indices);
    });

    const reshaped = [...values];

    for (const dayIndices of indicesByDay.values()) {
      // Alleen corrigeren als de temperatuur ergens in die 24 uur onder 10°C komt.
      if (!this.shouldApplyCorrectionForDay(dayIndices, temperatureValues)) {
        continue;
      }

      const dayTotal = dayIndices.reduce((sum, index) => sum + values[index], 0);
      if (dayTotal <= 0) {
        continue;
      }

      const rawWeights = dayIndices.map(index => {
        const { hour } = this.getHeatPumpLocalParts(timestamps[index]);
        return this.getHeatPumpHourlyPreference(hour);
      });
      const weightSum = rawWeights.reduce((sum, value) => sum + value, 0);
      const targetValues = rawWeights.map(weight => (dayTotal * weight) / weightSum);

      dayIndices.forEach((index, offset) => {
        reshaped[index] = targetValues[offset];
      });
    }

    return reshaped;
  }
}
