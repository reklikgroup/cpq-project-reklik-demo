import type { QuoteLineItem, YearAdjustment, DealType } from '@/types/quote';

export const TIERED_MODELS = [
  'tiered_learners', 'tiered_fixed', 'tiered_sponsors', 'tiered_products',
  'tiered_hours', 'tiered_count', 'tiered_storage',
];

export interface TierBucket {
  label: string;
  totalPrice: number;
  perUnitPrice: number | null;
  perUnitLabel: string;
  isTBD: boolean;
}

export function parseTierBuckets(model: string, tiers: any[]): TierBucket[] {
  if (!tiers || tiers.length === 0) return [];

  return tiers.map((t) => {
    switch (model) {
      case 'tiered_learners':
        return {
          label: `${t.learners} learners`,
          totalPrice: t.total_price,
          perUnitPrice: t.price_per_learner,
          perUnitLabel: '/learner',
          isTBD: !t.total_price && t.total_price !== 0,
        };
      case 'tiered_sponsors':
        return {
          label: `${t.sponsors} sponsors`,
          totalPrice: t.total_price,
          perUnitPrice: t.price_per_sponsor,
          perUnitLabel: '/sponsor',
          isTBD: !t.total_price && t.total_price !== 0,
        };
      case 'tiered_products':
        return {
          label: `${t.products} products`,
          totalPrice: t.total_price,
          perUnitPrice: t.price_per_product,
          perUnitLabel: '/product',
          isTBD: !t.total_price && t.total_price !== 0,
        };
      case 'tiered_hours':
        return {
          label: `${t.hours} hours`,
          totalPrice: t.cost,
          perUnitPrice: t.hours ? t.cost / t.hours : null,
          perUnitLabel: '/hour',
          isTBD: !t.cost && t.cost !== 0,
        };
      case 'tiered_storage':
        return {
          label: `${t.storage_gb} GB`,
          totalPrice: t.price,
          perUnitPrice: t.storage_gb ? t.price / t.storage_gb : null,
          perUnitLabel: '/GB',
          isTBD: !t.price && t.price !== 0,
        };
      case 'tiered_fixed':
        return {
          label: t.tier || `Tier ${tiers.indexOf(t) + 1}`,
          totalPrice: t.total_price,
          perUnitPrice: null,
          perUnitLabel: '',
          isTBD: !t.total_price && t.total_price !== 0,
        };
      default:
        return {
          label: `Tier ${tiers.indexOf(t) + 1}`,
          totalPrice: t.total_price || t.price || t.cost || 0,
          perUnitPrice: null,
          perUnitLabel: '',
          isTBD: false,
        };
    }
  });
}

export function getCalculatedUnitPrice(item: QuoteLineItem, dealType: DealType): number {
  // 1. Variant price
  if (item.selectedVariantId && item.variants.length > 0) {
    const variant = item.variants.find(v => v.id === item.selectedVariantId);
    if (variant) return variant.price;
  }

  // 2. Tiered bucket
  if (TIERED_MODELS.includes(item.pricingModel) && item.selectedTierIndex !== null && item.volumeTiers.length > 0) {
    const buckets = parseTierBuckets(item.pricingModel, item.volumeTiers);
    const bucket = buckets[item.selectedTierIndex];
    if (bucket) return bucket.totalPrice;
  }

  // 3. Deal type based
  if (item.pricingModel === 'deal_type_based') {
    if (dealType === 'new_business') return item.priceNew || 0;
    return item.priceRepeat || 0;
  }

  // 4. Per-seat volume tier
  if (item.pricingModel === 'per_seat' && item.volumeTiers.length > 0) {
    const tier = item.volumeTiers.find(
      (t: any) => item.quantity >= t.min_qty && item.quantity <= t.max_qty
    );
    if (tier) return tier.unit_price;
  }

  // 5. Fallback
  return item.baseUnitPrice;
}

export function getUnitPrice(item: QuoteLineItem, dealType: DealType, year?: number): number {
  // Check year-specific override first
  if (year !== undefined && item.yearOverrides?.[year]?.unitPriceOverride !== undefined) {
    const override = item.yearOverrides[year].unitPriceOverride;
    if (override !== null) return override;
  }
  if (item.unitPriceOverride !== null) return item.unitPriceOverride;
  return getCalculatedUnitPrice(item, dealType);
}

export function shouldApplyYearAdj(item: QuoteLineItem, yearAdj: YearAdjustment): boolean {
  if (yearAdj.applyToAll) return true;
  return !item.yearOverride;
}

export function calculateLineTotal(
  item: QuoteLineItem,
  yearAdj: YearAdjustment,
  year: number,
  dealType: DealType
): number {
  const unitPrice = getUnitPrice(item, dealType, year);

  // Qty: 1 for tiered/fixed, actual qty for per_seat/variable
  const isQtyBased = item.pricingModel === 'per_seat' || item.pricingModel === 'variable';
  const qty = isQtyBased ? item.quantity : 1;

  let total = unitPrice * qty;

  // Year-level adjustments (apply to all years now)
  if (shouldApplyYearAdj(item, yearAdj)) {
    total *= (1 + (yearAdj.increasePct || 0) / 100);
    total *= (1 - (yearAdj.discountPct || 0) / 100);
  }

  // Line-level manual adjustments (year-specific)
  const yearOvr = item.yearOverrides?.[year];
  const incPct = yearOvr?.manualIncreasePct ?? item.manualIncreasePct ?? 0;
  const discPct = yearOvr?.manualDiscountPct ?? item.manualDiscountPct ?? 0;
  total *= (1 + incPct / 100);
  total *= (1 - discPct / 100);

  return Math.round(total * 100) / 100;
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(amount);
}
