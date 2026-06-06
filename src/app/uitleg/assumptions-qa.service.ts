import { Injectable } from '@angular/core';

import { ASSUMPTIONS_REGISTRY } from './assumptions.registry';
import { AssumptionEntry, AssumptionQaAnswer } from './assumptions.types';

type ScoredEntry = {
  entry: AssumptionEntry;
  score: number;
};

const STOPWORDS = new Set([
  'de', 'het', 'een', 'en', 'van', 'in', 'op', 'voor', 'met', 'is', 'zijn', 'dit', 'dat', 'dan', 'als',
  'hoe', 'waarom', 'welke', 'wat', 'kan', 'kunnen', 'wordt', 'worden', 'naar', 'bij', 'ook', 'nog',
]);

@Injectable({ providedIn: 'root' })
export class AssumptionsQaService {
  ask(question: string): AssumptionQaAnswer {
    const normalizedQuestion = normalize(question);
    if (!normalizedQuestion) {
      return {
        answer: 'Stel een vraag over aannames, bijvoorbeeld: waarom is de winterreserve 50% of hoe wordt ct/kWh voor huishoudens opgebouwd?',
        confidence: 'laag',
        matchedEntries: [],
      };
    }

    const questionTokens = tokenize(normalizedQuestion);
    const scored = ASSUMPTIONS_REGISTRY
      .map(entry => ({ entry, score: this.scoreEntry(entry, normalizedQuestion, questionTokens) }))
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score);

    if (scored.length === 0) {
      return {
        answer: 'Deze vraag valt buiten de huidige kennisbasis van het model. In deze versie kan ik alleen antwoorden op vastgelegde aannames over opwek, balans, kosten en waterstof.',
        confidence: 'laag',
        matchedEntries: [],
      };
    }

    const topMatches = scored.slice(0, 3).map(item => item.entry);
    const confidence = this.getConfidence(scored[0].score);

    return {
      answer: this.composeAnswer(question, topMatches, confidence),
      confidence,
      matchedEntries: topMatches,
    };
  }

  private scoreEntry(entry: AssumptionEntry, normalizedQuestion: string, questionTokens: string[]): number {
    let score = 0;
    const haystack = normalize([
      entry.title,
      entry.assumption,
      entry.formula,
      entry.impact,
      entry.criticalNote,
      entry.tags.join(' '),
      entry.theme,
    ].join(' '));

    for (const token of questionTokens) {
      if (token.length < 3 || STOPWORDS.has(token)) {
        continue;
      }
      if (haystack.includes(token)) {
        score += 2;
      }
      if (entry.tags.some(tag => normalize(tag).includes(token))) {
        score += 3;
      }
      if (normalize(entry.theme).includes(token)) {
        score += 2;
      }
    }

    if (haystack.includes(normalizedQuestion)) {
      score += 4;
    }

    return score;
  }

  private getConfidence(score: number): 'hoog' | 'middel' | 'laag' {
    if (score >= 10) {
      return 'hoog';
    }
    if (score >= 6) {
      return 'middel';
    }
    return 'laag';
  }

  private composeAnswer(question: string, entries: AssumptionEntry[], confidence: 'hoog' | 'middel' | 'laag'): string {
    const primary = entries[0];
    const related = entries.slice(1);
    const relatedText = related.length > 0
      ? `Gerelateerde aannames: ${related.map(entry => entry.title).join('; ')}.`
      : 'Geen tweede sterke match in de huidige kennisbasis.';

    const adjustability = primary.isAdjustable
      ? `Deze aanname is instelbaar via: ${primary.adjustableVia ?? 'de scenario-instellingen in de app'}.`
      : 'Deze aanname is momenteel hardcoded en dus niet direct instelbaar in de UI.';

    return [
      `Vraag: ${question}`,
      `Kernantwoord: ${primary.assumption}`,
      `Formule: ${primary.formula}`,
      `Impact: ${primary.impact}`,
      `Kritische noot: ${primary.criticalNote}`,
      adjustability,
      relatedText,
      `Betrouwbaarheid match: ${confidence}.`,
    ].join('\n\n');
  }
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(value: string): string[] {
  return normalize(value)
    .split(' ')
    .filter(token => token.length > 0);
}
