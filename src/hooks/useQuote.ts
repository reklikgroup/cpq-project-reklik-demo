import { useState, useCallback, useMemo } from 'react';
import type { QuoteState, QuoteLineItem, DealType, YearAdjustment, SKU } from '@/types/quote';
import { calculateLineTotal, shouldApplyYearAdj, parseTierBuckets } from '@/lib/pricing';

const defaultYearAdj = (): YearAdjustment => ({
  discountPct: 0,
  increasePct: 0,
  discountAmt: 0,
  increaseAmt: 0,
  discountMode: 'pct',
  increaseMode: 'pct',
  applyToAll: true,
});

const initialState: QuoteState = {
  deal: {
    dealType: 'new_business',
    dealId: '',
    renewalDealId: '',
    termYears: 1,
    contractStartDate: null,
    contractEndDate: null,
    yearAdjustments: {
      1: defaultYearAdj(),
      2: defaultYearAdj(),
      3: defaultYearAdj(),
      4: defaultYearAdj(),
      5: defaultYearAdj(),
      6: defaultYearAdj(),
      7: defaultYearAdj(),
    },
    eventNames: { 1: '', 2: '', 3: '', 4: '', 5: '', 6: '', 7: '' },
  },
  lineItems: [],
  notes: '',
};

let lineIdCounter = 0;

const createLineId = () => `line_${++lineIdCounter}`;

const toStructuredItem = (item: QuoteLineItem): QuoteLineItem => ({
  ...item,
  year: item.year ?? 1,
  sourceLineItemId: item.sourceLineItemId ?? item.id,
});

const createYearCopies = (item: QuoteLineItem, startYear: number, endYear: number): QuoteLineItem[] => {
  const structuredItem = toStructuredItem(item);

  if (!structuredItem.recurring || endYear < 2) {
    return [];
  }

  return Array.from({ length: Math.max(0, endYear - Math.max(startYear, 2) + 1) }, (_, idx) => {
    const year = Math.max(startYear, 2) + idx;

    return {
      ...structuredItem,
      id: createLineId(),
      year,
      sourceLineItemId: structuredItem.sourceLineItemId,
      hubspotLineItemId: undefined,
    };
  });
};

const normalizeStructuredItems = (items: QuoteLineItem[], termYears: number): QuoteLineItem[] => {
  const structuredItems = items.map(toStructuredItem);
  // An item is the "anchor" if id === sourceLineItemId (independent of year).
  // Anchors are always kept (within term). Non-anchor copies require their anchor to be recurring.
  const anchorsBySourceId = new Map<string, QuoteLineItem>();
  for (const item of structuredItems) {
    if (item.id === item.sourceLineItemId) {
      anchorsBySourceId.set(item.sourceLineItemId, item);
    }
  }

  return structuredItems.filter((item) => {
    if (item.year < 1 || item.year > termYears) return false;
    if (item.id === item.sourceLineItemId) return true;
    const anchor = anchorsBySourceId.get(item.sourceLineItemId);
    return Boolean(anchor?.recurring);
  });
};

const migrateLegacyItems = (items: QuoteLineItem[], termYears: number): QuoteLineItem[] => {
  const yearOneItems = items.map((item) => {
    const id = item.id ?? createLineId();
    return {
      ...item,
      id,
      year: 1,
      sourceLineItemId: id,
    };
  });

  return yearOneItems.flatMap((item) => [
    item,
    ...createYearCopies(item, 2, termYears),
  ]);
};

const ensureStructuredItems = (items: QuoteLineItem[], termYears: number): QuoteLineItem[] => {
  if (items.length === 0) return [];

  const isLegacyState = items.every(
    (item) => item.year === undefined && item.sourceLineItemId === undefined
  );

  if (isLegacyState) {
    return migrateLegacyItems(items, termYears);
  }

  return normalizeStructuredItems(items, termYears);
};

export function useQuote() {
  const [state, setState] = useState<QuoteState>(initialState);

  const setDealType = useCallback((dt: DealType) => {
    setState(s => ({ ...s, deal: { ...s.deal, dealType: dt } }));
  }, []);

  const setDealId = useCallback((id: string) => {
    // Parse HubSpot deal ID from URL or raw ID
    const match = id.match(/\/deal\/(\d+)/);
    const parsed = match ? match[1] : id.replace(/\D/g, '');
    setState(s => ({ ...s, deal: { ...s.deal, dealId: parsed } }));
  }, []);

  const setRenewalDealId = useCallback((id: string) => {
    const match = id.match(/\/deal\/(\d+)/);
    const parsed = match ? match[1] : id.replace(/\D/g, '');
    setState(s => ({ ...s, deal: { ...s.deal, renewalDealId: parsed } }));
  }, []);

  const setTermYears = useCallback((years: 1 | 2 | 3 | 4 | 5 | 6 | 7) => {
    setState((s) => {
      const currentItems = ensureStructuredItems(s.lineItems, s.deal.termYears);
      const expandedItems = years > s.deal.termYears
        ? [
            ...currentItems,
            ...currentItems
              .filter((item) => item.year === 1)
              .flatMap((item) => createYearCopies(item, s.deal.termYears + 1, years)),
          ]
        : currentItems;

      return {
        ...s,
        deal: { ...s.deal, termYears: years },
        lineItems: normalizeStructuredItems(expandedItems, years),
      };
    });
  }, []);

  const setContractStartDate = useCallback((iso: string | null) => {
    setState(s => ({ ...s, deal: { ...s.deal, contractStartDate: iso } }));
  }, []);

  const setContractEndDate = useCallback((iso: string | null) => {
    setState(s => ({ ...s, deal: { ...s.deal, contractEndDate: iso } }));
  }, []);

  const setYearAdjustment = useCallback((year: number, adj: Partial<YearAdjustment>) => {
    setState(s => ({
      ...s,
      deal: {
        ...s.deal,
        yearAdjustments: {
          ...s.deal.yearAdjustments,
          [year]: { ...s.deal.yearAdjustments[year], ...adj },
        },
      },
    }));
  }, []);

  const addLineItem = useCallback((
    sku: SKU,
    productName: string,
    options?: { category?: string; years?: number[]; skuGroup?: string }
  ) => {
    // For tiered models, default to first non-TBD tier
    let defaultTierIndex: number | null = null;
    if (['tiered_learners','tiered_sponsors','tiered_products','tiered_hours','tiered_count','tiered_storage','tiered_attendees'].includes(sku.pricing_model) && sku.volume_tiers.length > 0) {
      const buckets = parseTierBuckets(sku.pricing_model, sku.volume_tiers);
      const firstValid = buckets.findIndex((b) => !b.isTBD);
      defaultTierIndex = firstValid >= 0 ? firstValid : 0;
    }

    // Resolve skuGroup: prefer explicit override, fall back to sku.sku_group
    const resolvedGroup = (options?.skuGroup ?? sku.sku_group ?? '') as any;

    const sourceId = createLineId();
    const baseFields = {
      sourceLineItemId: sourceId,
      skuId: sku.id,
      skuName: sku.name,
      productName,
      category: options?.category,
      pricingModel: sku.pricing_model,
      quantity: 1,
      selectedVariantId: sku.variants.length > 0 ? sku.variants[0].id : null,
      selectedTierIndex: defaultTierIndex,
      baseUnitPrice: sku.base_price ?? 0,
      unitPriceOverride: null,
      manualDiscountPct: 0,
      manualIncreasePct: 0,
      yearOverride: false,
      recurring: sku.recurring,
      variants: sku.variants,
      volumeTiers: sku.volume_tiers,
      dependencies: sku.dependencies,
      source: 'catalog' as const,
      variableUnit: sku.variable_unit,
      priceNew: sku.price_new,
      priceRepeat: sku.price_repeat,
      description: sku.description,
      skuGroup: resolvedGroup,
      skuCode: sku.sku_code,
    };

    setState((s) => {
      const currentItems = ensureStructuredItems(s.lineItems, s.deal.termYears);
      const termYears = s.deal.termYears;

      // Determine target years
      let targetYears: number[];
      if (options?.years && options.years.length > 0) {
        targetYears = options.years.filter((y) => y >= 1 && y <= termYears);
        // If non-recurring, only allow first selected year
        if (!sku.recurring) targetYears = targetYears.slice(0, 1);
      } else {
        // Default: propagate to every year in the term so multi-year setups
        // get all line items by default. Users can remove from specific years.
        targetYears = Array.from({ length: termYears }, (_, i) => i + 1);
      }

      // Default each year copy's dates to the full contract dates (independent per year — user can edit).
      const defaultStart = s.deal.contractStartDate ?? null;
      const defaultEnd = s.deal.contractEndDate ?? null;

      const newItems: QuoteLineItem[] = targetYears.map((year, idx) => ({
        ...baseFields,
        id: idx === 0 ? sourceId : createLineId(),
        year,
        lineItemStartDate: defaultStart,
        lineItemEndDate: defaultEnd,
      }));

      return { ...s, lineItems: [...currentItems, ...newItems] };
    });
  }, []);

  const loadHubSpotItems = useCallback((hsItems: Array<{
    id: string;
    name: string;
    quantity: number;
    price: number;
    discount: number;
    amount?: number;
    sku_code?: string;
    description?: string;
    sku_group?: string;
    product_category?: string;
    base_price?: number;
    event_name?: string;
    event_start_date?: string | null;
    event_end_date?: string | null;
  }>) => {
    // Parse [Yn] prefix from name → year, return cleaned name + year.
    const parseYear = (raw: string): { name: string; year: number } => {
      const m = /^\s*\[Y(\d+)\]\s*/i.exec(raw || '');
      if (m) {
        return { name: raw.replace(m[0], '').trim(), year: Math.max(1, parseInt(m[1], 10)) };
      }
      return { name: raw, year: 1 };
    };

    setState((s) => {
      // Detect max year so we can grow termYears if HubSpot has Y2+ items
      let maxYear = 1;
      const parsed = hsItems.map((hs) => {
        const { name, year } = parseYear(hs.name || '');
        if (year > maxYear) maxYear = year;
        return { hs, name, year };
      });

      const newTermYears = Math.min(7, Math.max(s.deal.termYears, maxYear)) as 1|2|3|4|5|6|7;

      // Capture any per-year event names from HubSpot
      const eventNames = { ...s.deal.eventNames };
      for (const { hs, year } of parsed) {
        if (hs.event_name && !eventNames[year]) {
          eventNames[year] = hs.event_name;
        }
      }

      const items: QuoteLineItem[] = parsed.map(({ hs, name, year }) => {
        const id = createLineId();
        return {
          id,
          year,
          sourceLineItemId: id,
          skuId: '',
          skuName: name || 'Unnamed Line Item',
          productName: '',
          category: hs.product_category,
          pricingModel: 'fixed',
          quantity: hs.quantity || 1,
          selectedVariantId: null,
          selectedTierIndex: null,
          baseUnitPrice: hs.base_price ?? hs.price ?? 0,
          unitPriceOverride: (hs.base_price != null && hs.price != null && hs.price !== hs.base_price) ? hs.price : null,
          manualDiscountPct: hs.discount || 0,
          manualIncreasePct: 0,
          yearOverride: false,
          recurring: true,
          variants: [],
          volumeTiers: [],
          dependencies: [],
          hubspotLineItemId: hs.id,
          source: 'hubspot',
          skuCode: hs.sku_code,
          description: hs.description ?? '',
          skuGroup: (hs.sku_group as any) ?? '',
          lineItemStartDate: hs.event_start_date ?? null,
          lineItemEndDate: hs.event_end_date ?? null,
        };
      });

      const currentItems = ensureStructuredItems(s.lineItems, s.deal.termYears);
      const catalogItems = currentItems.filter((item) => item.source === 'catalog');

      return {
        ...s,
        deal: { ...s.deal, termYears: newTermYears, eventNames },
        lineItems: normalizeStructuredItems([...items, ...catalogItems], newTermYears),
      };
    });
  }, []);

  const updateLineItem = useCallback((id: string, updates: Partial<QuoteLineItem>) => {
    setState((s) => {
      const currentItems = ensureStructuredItems(s.lineItems, s.deal.termYears);
      const nextItems = currentItems.map((item) => (
        item.id === id ? { ...item, ...updates } : item
      ));

      return {
        ...s,
        lineItems: normalizeStructuredItems(nextItems, s.deal.termYears),
      };
    });
  }, []);

  const removeLineItem = useCallback((id: string) => {
    setState((s) => {
      const currentItems = ensureStructuredItems(s.lineItems, s.deal.termYears);
      const targetItem = currentItems.find((item) => item.id === id);

      if (!targetItem) return s;

      // If removing the anchor (id === sourceLineItemId), remove all year copies.
      // Otherwise just remove that single year's copy.
      const isAnchor = targetItem.id === targetItem.sourceLineItemId;
      const nextItems = isAnchor
        ? currentItems.filter((item) => item.sourceLineItemId !== targetItem.sourceLineItemId)
        : currentItems.filter((item) => item.id !== id);

      return {
        ...s,
        lineItems: normalizeStructuredItems(nextItems, s.deal.termYears),
      };
    });
  }, []);

  const addBlankLineItem = useCallback((year: number) => {
    setState((s) => {
      const currentItems = ensureStructuredItems(s.lineItems, s.deal.termYears);
      const id = createLineId();
      const blank: QuoteLineItem = {
        id,
        sourceLineItemId: id,
        year,
        skuId: '',
        skuName: '',
        productName: '',
        category: undefined,
        pricingModel: 'fixed',
        quantity: 1,
        selectedVariantId: null,
        selectedTierIndex: null,
        baseUnitPrice: 0,
        unitPriceOverride: null,
        manualDiscountPct: 0,
        manualIncreasePct: 0,
        yearOverride: false,
        recurring: false,
        variants: [],
        volumeTiers: [],
        dependencies: [],
        source: 'catalog',
        description: '',
        skuGroup: '',
        lineItemStartDate: s.deal.contractStartDate,
        lineItemEndDate: s.deal.contractEndDate,
      };
      return {
        ...s,
        lineItems: normalizeStructuredItems([...currentItems, blank], s.deal.termYears),
      };
    });
  }, []);

  const setNotes = useCallback((notes: string) => {
    setState(s => ({ ...s, notes }));
  }, []);

  const setEventName = useCallback((year: number, name: string) => {
    setState((s) => ({
      ...s,
      deal: {
        ...s.deal,
        eventNames: { ...s.deal.eventNames, [year]: name },
      },
    }));
  }, []);

  const getYearItems = useCallback((year: number): QuoteLineItem[] => {
    const currentItems = ensureStructuredItems(state.lineItems, state.deal.termYears);
    return currentItems.filter((item) => item.year === year);
  }, [state.lineItems, state.deal.termYears]);

  const getYearSubtotal = useCallback((year: number): number => {
    const items = getYearItems(year);
    const adj = state.deal.yearAdjustments[year];
    let subtotal = items.reduce((sum, item) => {
      const apply = shouldApplyYearAdj(item, adj);
      return sum + calculateLineTotal(item, adj, apply, state.deal.dealType);
    }, 0);
    // Apply year-level flat amount adjustments to the subtotal as a whole.
    if ((adj.increaseMode ?? 'pct') === 'amount') {
      subtotal += adj.increaseAmt || 0;
    }
    if ((adj.discountMode ?? 'pct') === 'amount') {
      subtotal -= adj.discountAmt || 0;
    }
    return Math.round(subtotal * 100) / 100;
  }, [getYearItems, state.deal.yearAdjustments, state.deal.dealType]);

  const totalContractValue = useMemo(() => {
    let total = 0;
    for (let y = 1; y <= state.deal.termYears; y++) {
      total += getYearSubtotal(y);
    }
    return total;
  }, [state.deal.termYears, getYearSubtotal]);

  return {
    state,
    setDealType,
    setDealId,
    setRenewalDealId,
    setTermYears,
    setContractStartDate,
    setContractEndDate,
    setYearAdjustment,
    addLineItem,
    addBlankLineItem,
    loadHubSpotItems,
    updateLineItem,
    removeLineItem,
    setNotes,
    setEventName,
    getYearItems,
    getYearSubtotal,
    totalContractValue,
  };
}
