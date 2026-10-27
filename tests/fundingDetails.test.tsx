import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { FundingCard } from '../src/components/FundingCard';
import type { FundingAssessment } from '../src/lib/funding/assess';
import { market } from './funding/market';
import { scenario } from './funding/scenario';

const view = vi.hoisted(() => ({ assessment: null as FundingAssessment | null }));
vi.mock('../src/fundingContext', () => ({
  useFunding: () => ({ plan: null, ended: null }),
  useFundingScreen: () => ({ assessment: view.assessment, prices: market(), plan: null, view: null, snap: null }),
}));
vi.mock('../src/readinessContext', () => ({ useReadinessEngine: () => ({ plan: () => ({ coins: { need: 1 } }) }) }));
vi.mock('../src/lib/features', () => ({ useFeatures: () => ({ efficient: false }) }));

describe('funding totals with incomplete goal evidence', () => {
  it.each([{ unknown: 1, unpriced: 0 }, { unknown: 0, unpriced: 1 }])('does not present a partial subtotal as the full goal: %j', uncertainty => {
    const s = scenario(market(), { bagCoins: 400, bankCoins: 0 });
    view.assessment = { ...s.assessment, need: { ...s.need, objective: { ...s.need.objective, ...uncertainty, cost: 1000 } } };
    const html = renderToStaticMarkup(<FundingCard step={s.step} />);
    const text = html.replace(/<[^>]*>/g, '');
    expect(text).toContain('For the whole goal: not fully checked; known part 1,000 gp');
    expect(text).not.toContain('For the whole goal: 1,000 gp');
    expect(html).not.toMatch(/<details[^>]*\sopen/);
  });
});
