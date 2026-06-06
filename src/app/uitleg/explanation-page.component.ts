import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { AssumptionsQaService } from './assumptions-qa.service';
import { ASSUMPTIONS_REGISTRY } from './assumptions.registry';
import { AssumptionEntry, AssumptionTheme, FaqEntry, GlobalPictureItem } from './assumptions.types';
import { FAQ_ENTRIES, GLOBAL_PICTURE_ITEMS } from './faq.registry';

type ThemeFilter = 'alle' | AssumptionTheme;
type FaqGroupKey = 'verbruik-warmte' | 'verbruik-vervoer' | 'verbruik-elektra' | 'kosten' | 'balans' | 'scenario';
type ChatTurn = {
  question: string;
  answer: string;
  confidence: 'hoog' | 'middel' | 'laag';
};

type FaqGroup = {
  key: FaqGroupKey;
  label: string;
  entries: FaqEntry[];
};

@Component({
  selector: 'app-explanation-page',
  standalone: true,
  templateUrl: './explanation-page.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExplanationPageComponent {
  private readonly qaService = inject(AssumptionsQaService);

  protected readonly assumptions = ASSUMPTIONS_REGISTRY;
  protected readonly globalPictureItems: readonly GlobalPictureItem[] = GLOBAL_PICTURE_ITEMS;
  protected readonly faqEntries: readonly FaqEntry[] = FAQ_ENTRIES;
  protected readonly faqGroups = computed<FaqGroup[]>(() => {
    const labels: Record<FaqGroupKey, string> = {
      'verbruik-warmte': 'Verbruik - Warmte',
      'verbruik-vervoer': 'Verbruik - Vervoer',
      'verbruik-elektra': 'Verbruik - Elektra',
      kosten: 'Kosten',
      balans: 'Balans en flexibiliteit',
      scenario: 'Scenario en aannames',
    };

    const grouped: Record<FaqGroupKey, FaqEntry[]> = {
      'verbruik-warmte': [],
      'verbruik-vervoer': [],
      'verbruik-elektra': [],
      kosten: [],
      balans: [],
      scenario: [],
    };

    for (const faq of this.faqEntries) {
      grouped[this.getFaqGroupKey(faq.id)].push(faq);
    }

    const order: FaqGroupKey[] = ['verbruik-warmte', 'verbruik-vervoer', 'verbruik-elektra', 'kosten', 'balans', 'scenario'];
    return order
      .map(key => ({ key, label: labels[key], entries: grouped[key] }))
      .filter(group => group.entries.length > 0);
  });
  protected readonly themeFilter = signal<ThemeFilter>('alle');
  protected readonly searchQuery = signal('');
  protected readonly question = signal('');
  protected readonly chatHistory = signal<ChatTurn[]>([]);

  protected readonly filteredAssumptions = computed(() => {
    const theme = this.themeFilter();
    const search = this.searchQuery().trim().toLowerCase();

    return this.assumptions.filter(entry => {
      if (theme !== 'alle' && entry.theme !== theme) {
        return false;
      }
      if (!search) {
        return true;
      }
      return this.matchesSearch(entry, search);
    });
  });

  protected readonly assumptionsByTheme = computed(() => {
    const map: Record<AssumptionTheme, AssumptionEntry[]> = {
      opwek: [],
      balans: [],
      kosten: [],
      waterstof: [],
      kritisch: [],
    };

    for (const entry of this.filteredAssumptions()) {
      map[entry.theme].push(entry);
    }

    return map;
  });

  protected readonly themeCounts = computed(() => {
    const counts: Record<ThemeFilter, number> = {
      alle: this.assumptions.length,
      opwek: 0,
      balans: 0,
      kosten: 0,
      waterstof: 0,
      kritisch: 0,
    };

    for (const entry of this.assumptions) {
      counts[entry.theme] += 1;
    }

    return counts;
  });

  protected readonly suggestedQuestions = [
    'Waarom staat de private winterreserve op 50%?',
    'Hoe wordt de huishoudelijke ct/kWh prijs opgebouwd?',
    'Welke waterstofaannames zijn hardcoded?',
    'Welke aannames maken dit model mogelijk te optimistisch?',
  ];

  protected setThemeFilter(theme: ThemeFilter): void {
    this.themeFilter.set(theme);
  }

  protected updateSearchQuery(value: string): void {
    this.searchQuery.set(value);
  }

  protected updateQuestion(value: string): void {
    this.question.set(value);
  }

  protected askQuestion(value?: string): void {
    const questionText = (value ?? this.question()).trim();
    if (!questionText) {
      return;
    }

    const answer = this.qaService.ask(questionText);
    this.chatHistory.update(history => [
      {
        question: questionText,
        answer: answer.answer,
        confidence: answer.confidence,
      },
      ...history,
    ]);
    this.question.set('');
  }

  protected trackById(_: number, entry: AssumptionEntry): string {
    return entry.id;
  }

  protected trackByQuestion(_: number, turn: ChatTurn): string {
    return `${turn.question}-${turn.answer}`;
  }

  protected trackByFaqId(_: number, faq: FaqEntry): string {
    return faq.id;
  }

  protected trackByFaqGroup(_: number, group: FaqGroup): string {
    return group.key;
  }

  protected trackByGlobalPictureId(_: number, item: GlobalPictureItem): string {
    return item.id;
  }

  protected getThemeLabel(theme: AssumptionTheme): string {
    switch (theme) {
      case 'opwek':
        return 'Opwek';
      case 'balans':
        return 'Balans';
      case 'kosten':
        return 'Kosten';
      case 'waterstof':
        return 'Waterstof';
      case 'kritisch':
        return 'Kritische noten';
      default:
        return theme;
    }
  }

  protected getConfidenceLabel(confidence: 'hoog' | 'middel' | 'laag'): string {
    return `Match: ${confidence}`;
  }

  private matchesSearch(entry: AssumptionEntry, search: string): boolean {
    const haystack = [
      entry.title,
      entry.assumption,
      entry.formula,
      entry.source,
      entry.impact,
      entry.criticalNote,
      entry.tags.join(' '),
      entry.theme,
    ].join(' ').toLowerCase();

    return haystack.includes(search);
  }

  private getFaqGroupKey(faqId: string): FaqGroupKey {
    const verbruikWarmteIds = new Set([
      'faq-heat-demand',
      'faq-winter-heat-profile-adjustment',
      'faq-hot-water-gw',
      'faq-hot-water-profile-model-limit',
    ]);

    const verbruikVervoerIds = new Set([
      'faq-transport-kwh-calculation',
      'faq-transport-ev-factor-375',
    ]);

    const verbruikElektraIds = new Set([
      'faq-electricity-profile-entso-visibility',
      'faq-electricity-dunkelflaute-current-provisions',
      'faq-electricity-grid-congestion-model-scope',
      'faq-grid-capacity-for-ev-charging',
    ]);

    const kostenIds = new Set([
      'faq-battery-cell-price',
      'faq-household-price',
      'faq-offshore-existing-connection-costs',
      'faq-kosten-bev-vs-benzine',
    ]);

    const balansIds = new Set([
      'faq-winter-reserve',
      'faq-private-grid-limit',
      'faq-v2g-modeling',
      'faq-v2g-1twh-origin',
    ]);

    if (verbruikWarmteIds.has(faqId)) {
      return 'verbruik-warmte';
    }
    if (verbruikVervoerIds.has(faqId)) {
      return 'verbruik-vervoer';
    }
    if (verbruikElektraIds.has(faqId)) {
      return 'verbruik-elektra';
    }
    if (kostenIds.has(faqId)) {
      return 'kosten';
    }
    if (balansIds.has(faqId)) {
      return 'balans';
    }
    return 'scenario';
  }
}
