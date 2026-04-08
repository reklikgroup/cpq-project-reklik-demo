import { useState, useCallback, useMemo } from 'react';
import type { QuoteState, QuoteLineItem, SKU, DealSetup, YearAdjustment, LineYearOverride } from '@/types/quote';
import { calculateLineTotal, TIERED_MODELS } from '@/lib/pricing';

const defaultYearAdj = (): YearAdjustment => ({
  discountPct: 0,
  increasePct: 0,
  applyToAll: true,
});

const initialDeal: DealSetup = {
  dealType: 'new_business',
  dealId: '',
  renewalDealId: '',
  termYears: 1,
  yearAdjustments: { 1: defaultYearAdj(), 2: defaultYearAdj(), 3: defaultYearAdj() },
};

const initialState: QuoteState = {
  deal: initialDeal,
  lineItems: [],
  notes: '',
};

export function parseDealId(input: string): string {
  if (!input) return '';
  const match = input.match(/\/deal\/(\d+)/);
  if (match) return match[1];
  const clean = input.replace(/\D/g, '');
  return clean;
}

/** Get year-specific value for a line item field, falling back to base */
export function getYearValue<K extends keyof LineYearOverride>(
  item: QuoteLineItem,
  year: number,
  field: K
): LineYearOverride[K] | undefined {
  return item.yearOverrides?.[year]?.[field];
}

export function useQuote() {
  const [state, setState] = useState<QuoteState>(initialState);

  const updateDeal = useCallback((updates: Partial<DealSetup>) => {
    setState(prev => ({ ...prev, deal: { ...prev.deal, ...updates } }));
  }, []);

  const updateYearAdjustment = useCallback((year: number, updates: Partial<YearAdjustment>) => {
    setState(prev => ({
      ...prev,
      deal: {
        ...prev.deal,
        yearAdjustments: {
          ...prev.deal.yearAdjustments,
          [year]: { ...prev.deal.yearAdjustments[year], ...updates },
        },
      },
    }));
  }, []);

  const addLineItem = useCallback((sku: SKU, productName: string) => {
    const isTiered = TIERED_MODELS.includes(sku.pricing_model);
    let defaultTierIndex: number | null = null;
    if (isTiered && sku.volume_tiers.length > 0) {
      defaultTierIndex = 0;
    }

    const item: QuoteLineItem = {
      id: `li-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      skuId: sku.id,
      skuName: sku.name,
      productName,
      pricingModel: sku.pricing_model,
      quantity: 1,
      selectedVariantId: sku.variants.length > 0 ? sku.variants[0].id : null,
      selectedTierIndex: defaultTierIndex,
      baseUnitPrice: sku.base_price || 0,
      unitPriceOverride: null,
      manualDiscountPct: 0,
      manualIncreasePct: 0,
      yearOverride: false,
      recurring: sku.recurring,
      variants: sku.variants,
      volumeTiers: sku.volume_tiers,
      dependencies: sku.dependencies,
      source: 'catalog',
      variableUnit: sku.variable_unit,
      priceNew: sku.price_new,
      priceRepeat: sku.price_repeat,
      yearOverrides: {},
    };

    setState(prev => ({ ...prev, lineItems: [...prev.lineItems, item] }));
  }, []);

  /** Update base line item properties (shared across years like qty, variant, tier) */
  const updateLineItem = useCallback((id: string, updates: Partial<QuoteLineItem>) => {
    setState(prev => ({
      ...prev,
      lineItems: prev.lineItems.map(li => (li.id === id ? { ...li, ...updates } : li)),
    }));
  }, []);

  /** Update year-specific overrides (discount, increase, unit price) */
  const updateLineItemYear = useCallback((id: string, year: number, updates: Partial<LineYearOverride>) => {
    setState(prev => ({
      ...prev,
      lineItems: prev.lineItems.map(li => {
        if (li.id !== id) return li;
        return {
          ...li,
          yearOverrides: {
            ...li.yearOverrides,
            [year]: { ...li.yearOverrides[year], ...updates },
          },
        };
      }),
    }));
  }, []);

  const removeLineItem = useCallback((id: string) => {
    setState(prev => ({
      ...prev,
      lineItems: prev.lineItems.filter(li => li.id !== id),
    }));
  }, []);

  const setNotes = useCallback((notes: string) => {
    setState(prev => ({ ...prev, notes }));
  }, []);

  const getYearItems = useCallback(
    (year: number): QuoteLineItem[] => {
      if (year === 1) return state.lineItems;
      return state.lineItems.filter(li => li.recurring);
    },
    [state.lineItems]
  );

  const getYearSubtotal = useCallback(
    (year: number): number => {
      const items = getYearItems(year);
      const yearAdj = state.deal.yearAdjustments[year] || defaultYearAdj();
      return items.reduce(
        (sum, item) => sum + calculateLineTotal(item, yearAdj, year, state.deal.dealType),
        0
      );
    },
    [getYearItems, state.deal.yearAdjustments, state.deal.dealType]
  );

  const totalContractValue = useMemo(() => {
    let total = 0;
    for (let yr = 1; yr <= state.deal.termYears; yr++) {
      total += getYearSubtotal(yr);
    }
    return total;
  }, [state.deal.termYears, getYearSubtotal]);

  return {
    state,
    updateDeal,
    updateYearAdjustment,
    addLineItem,
    updateLineItem,
    updateLineItemYear,
    removeLineItem,
    setNotes,
    getYearItems,
    getYearSubtotal,
    totalContractValue,
  };
}
