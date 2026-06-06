import { Injectable, signal, computed, effect } from '@angular/core';

export type ThemeMode = 'auto' | 'light' | 'dark';

const STORAGE_KEY = 'angular-energy-theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly modeSignal = signal<ThemeMode>(loadMode());
  private readonly prefersDark = signal(
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : false,
  );

  readonly mode = this.modeSignal.asReadonly();
  readonly effective = computed(() => {
    if (this.modeSignal() === 'auto') {
      return this.prefersDark() ? 'dark' : 'light';
    }
    return this.modeSignal();
  });

  constructor() {
    if (typeof window !== 'undefined') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      mq.addEventListener('change', (e) => this.prefersDark.set(e.matches));

      effect(() => {
        const theme = this.effective();
        document.documentElement.setAttribute('data-theme', theme);
        persistMode(this.modeSignal());
      });
    }
  }

  setMode(mode: ThemeMode): void {
    this.modeSignal.set(mode);
  }

  cycleMode(): void {
    const order: ThemeMode[] = ['auto', 'light', 'dark'];
    const next = order[(order.indexOf(this.modeSignal()) + 1) % order.length];
    this.modeSignal.set(next);
  }
}

function loadMode(): ThemeMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'auto') return stored;
  } catch { /* ignore */ }
  return 'auto';
}

function persistMode(mode: ThemeMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch { /* ignore */ }
}
