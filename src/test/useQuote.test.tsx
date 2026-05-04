import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useQuote } from '@/hooks/useQuote';
import type { SKU } from '@/types/quote';

const createSku = (overrides: Partial<SKU> = {}): SKU => ({
  id: overrides.id ?? 'sku-core',
  sku_code: overrides.sku_code ?? 'CORE-001',
  name: overrides.name ?? 'Core Platform',
  pricing_model: overrides.pricing_model ?? 'fixed',
  base_price: overrides.base_price ?? 1000,
  currency: overrides.currency ?? 'USD',
  active: overrides.active ?? true,
  recurring: overrides.recurring ?? true,
  variants: overrides.variants ?? [],
  volume_tiers: overrides.volume_tiers ?? [],
  dependencies: overrides.dependencies ?? [],
  variable_unit: overrides.variable_unit,
  price_new: overrides.price_new,
  price_repeat: overrides.price_repeat,
});

describe('useQuote multi-year behavior', () => {
  it('copies recurring year 1 items into newly selected future years', () => {
    const { result } = renderHook(() => useQuote());

    act(() => {
      result.current.addLineItem(createSku(), 'Platform');
      result.current.setTermYears(3);
    });

    expect(result.current.getYearItems(1)).toHaveLength(1);
    expect(result.current.getYearItems(2)).toHaveLength(1);
    expect(result.current.getYearItems(3)).toHaveLength(1);
    expect(result.current.getYearItems(2)[0].id).not.toBe(result.current.getYearItems(1)[0].id);
  });

  it('keeps one-time items only in year 1', () => {
    const { result } = renderHook(() => useQuote());

    act(() => {
      result.current.setTermYears(4);
      result.current.addLineItem(createSku({ id: 'sku-once', name: 'Site Redesign', recurring: false }), 'Services');
    });

    expect(result.current.getYearItems(1)).toHaveLength(1);
    expect(result.current.getYearItems(2)).toHaveLength(0);
    expect(result.current.getYearItems(3)).toHaveLength(0);
    expect(result.current.getYearItems(4)).toHaveLength(0);
  });

  it('lets each year keep its own per-line increase and discount values', () => {
    const { result } = renderHook(() => useQuote());

    act(() => {
      result.current.setTermYears(3);
      result.current.addLineItem(createSku(), 'Platform');
    });

    const year2Item = result.current.getYearItems(2)[0];

    act(() => {
      result.current.updateLineItem(year2Item.id, {
        manualIncreasePct: 7,
        manualDiscountPct: 11,
      });
    });

    expect(result.current.getYearItems(1)[0].manualIncreasePct).toBe(0);
    expect(result.current.getYearItems(1)[0].manualDiscountPct).toBe(0);
    expect(result.current.getYearItems(2)[0].manualIncreasePct).toBe(7);
    expect(result.current.getYearItems(2)[0].manualDiscountPct).toBe(11);
    expect(result.current.getYearItems(3)[0].manualIncreasePct).toBe(0);
    expect(result.current.getYearItems(3)[0].manualDiscountPct).toBe(0);
  });
});