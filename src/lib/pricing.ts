import type { QuoteLineItem, YearAdjustment, DealType } from '@/types/quote';

// ── Tiered model helpers ──

const TIERED_MODELS = [
  'tiered_learners', 'tiered_fixed', 'tiered_sponsors', 'tiered_products',
  'tiered_hours', 'tiered_count', 'tiered_storage', 'tiered_attendees',
];

export function isTieredModel(model: string): boolean {
  return TIERED_MODELS.includes(model);
}

export interface TierBucket {
  label: string;
  totalPrice: number | null;
  perUnitPrice: number | null;
  perUnitLabel: string;
  isTBD: boolean;
}

// Model → { unit noun (singular), per-unit suffix }
const TIER_UNIT_LABELS: Record<string, { noun: string; suffix: string }> = {
  tiered_learners:  { noun: 'learners',  suffix: '/learner'  },
  tiered_sponsors:  { noun: 'sponsors',  suffix: '/sponsor'  },
  tiered_products:  { noun: 'products',  suffix: '/product'  },
  tiered_hours:     { noun: 'hours',     suffix: '/hour'     },
  tiered_attendees: { noun: 'attendees', suffix: '/attendee' },
  tiered_count:     { noun: 'attendees', suffix: '/unit'     },
  tiered_storage:   { noun: 'GB',        suffix: '/GB'       },
  tiered_fixed:     { noun: 'units',     suffix: '/unit'     },
};

function formatThreshold(value: number | undefined | null): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '?';
  return value.toLocaleString();
}

export function parseTierBuckets(model: string, tiers: any[]): TierBucket[] {
  const unit = TIER_UNIT_LABELS[model] ?? { noun: 'units', suffix: '/unit' };

  return tiers.map((t) => {
    // Catalog shape: { label, min_qty, unit_price }
    // Fallbacks for legacy fields kept for safety.
    const qty =
      t.min_qty ??
      t.count ??
      t.learners ?? t.sponsors ?? t.products ?? t.hours ?? t.attendees ?? t.storage_gb;

    const price =
      t.unit_price ??
      t.total_price ?? t.price ?? t.cost ??
      t.price_per_learner ?? t.price_per_sponsor ?? t.price_per_product ?? t.price_per_attendee ?? t.price_per_unit;

    // Prefer the explicit catalog label if present, otherwise build a model-aware one.
    const label =
      (typeof t.label === 'string' && t.label.trim())
        ? `${t.label.trim()} ${unit.noun}`.replace(new RegExp(`${unit.noun}\\s+${unit.noun}$`), unit.noun)
        : t.note
          ? String(t.note)
          : `up to ${formatThreshold(qty)} ${unit.noun}`;

    const totalPrice: number | null = (price === null || price === undefined) ? null : Number(price);
    const perUnitPrice: number | null =
      totalPrice !== null && qty && Number(qty) > 0 ? totalPrice / Number(qty) : null;

    return {
      label,
      totalPrice,
      perUnitPrice,
      perUnitLabel: unit.suffix,
      isTBD: totalPrice === null,
    };
  });
}

// ── Price calculation ──

export function getCalculatedUnitPrice(item: QuoteLineItem, dealType?: DealType): number {
  const base = item.baseUnitPrice ?? 0;

  // Variant-based pricing — multiply by base when base > 0, else use variant price directly
  if (item.selectedVariantId && item.variants.length > 0) {
    const variant = item.variants.find(v => v.id === item.selectedVariantId);
    if (variant) {
      return base > 0 ? base * variant.price : variant.price;
    }
  }

  // Tiered models — multiply tier value by base when base > 0, else use tier total directly
  if (isTieredModel(item.pricingModel) && item.selectedTierIndex !== null && item.volumeTiers.length > 0) {
    const buckets = parseTierBuckets(item.pricingModel, item.volumeTiers);
    const bucket = buckets[item.selectedTierIndex];
    if (bucket && !bucket.isTBD) {
      return base > 0 ? base * bucket.totalPrice! : bucket.totalPrice!;
    }
  }

  // deal_type_based
  if (item.pricingModel === 'deal_type_based') {
    if (dealType === 'renewal' && item.priceRepeat != null) return item.priceRepeat;
    if (item.priceNew != null) return item.priceNew;
  }

  // Volume tier lookup for per_seat
  if (item.pricingModel === 'per_seat' && item.volumeTiers.length > 0) {
    return getVolumeTierPrice(item.volumeTiers, item.quantity);
  }

  return item.baseUnitPrice;
}

export function getUnitPrice(item: QuoteLineItem, dealType?: DealType): number {
  if (item.unitPriceOverride !== null && item.unitPriceOverride !== undefined) {
    return item.unitPriceOverride;
  }
  return getCalculatedUnitPrice(item, dealType);
}

export function getVolumeTierPrice(tiers: any[], qty: number): number {
  const tier = tiers.find((t: any) => qty >= t.min_qty && qty <= t.max_qty);
  return tier ? tier.unit_price : tiers[tiers.length - 1]?.unit_price ?? 0;
}

// ── Term / proration helpers ──

/**
 * Months between two ISO yyyy-MM-dd dates (rounded to nearest integer).
 * Returns null if either date is missing or invalid.
 */
export function getTermMonths(startIso?: string | null, endIso?: string | null): number | null {
  if (!startIso || !endIso) return null;
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return null;
  const msPerDay = 1000 * 60 * 60 * 24;
  const days = (end.getTime() - start.getTime()) / msPerDay;
  // Average month length; round to nearest int.
  const months = days / 30.4375;
  return Math.max(0, Math.round(months));
}

/**
 * Proration factor for a line item. Catalog prices are annualized.
 * If term < 12 months, prorate (months/12). Otherwise no upcharge (factor = 1).
 */
export function getProrationFactor(item: QuoteLineItem): number {
  const months = getTermMonths(item.lineItemStartDate, item.lineItemEndDate);
  if (months === null) return 1;
  if (months >= 12) return 1;
  return months / 12;
}

export function calculateLineTotal(
  item: QuoteLineItem,
  yearAdj: YearAdjustment,
  applyYearAdj: boolean,
  dealType?: DealType
): number {
  const unitPrice = getUnitPrice(item, dealType);

  // For tiered and deal_type_based models, total is baked into the unit price.
  // For 'fixed', 'per_seat', and 'variable', multiply unit price by quantity.
  const isTiered = isTieredModel(item.pricingModel);
  const isBakedTotal = isTiered || item.pricingModel === 'deal_type_based';

  let qty: number;
  if (isBakedTotal) {
    qty = 1;
  } else {
    // fixed, per_seat, variable, custom — all respect quantity
    qty = item.quantity || 1;
  }

  let total = unitPrice * qty;

  // Prorate when line item term is < 12 months. Catalog prices are annualized.
  total = total * getProrationFactor(item);

  if (applyYearAdj) {
    // Year-level percentages still applied per line; amount mode handled at year-subtotal level.
    if ((yearAdj.increaseMode ?? 'pct') === 'pct') {
      total = total * (1 + (yearAdj.increasePct || 0) / 100);
    }
    if ((yearAdj.discountMode ?? 'pct') === 'pct') {
      total = total * (1 - (yearAdj.discountPct || 0) / 100);
    }
  }

  // Per-line increase
  if ((item.manualIncreaseMode ?? 'pct') === 'pct') {
    total = total * (1 + (item.manualIncreasePct || 0) / 100);
  } else {
    total = total + (item.manualIncreaseAmt || 0);
  }
  // Per-line discount
  if ((item.manualDiscountMode ?? 'pct') === 'pct') {
    total = total * (1 - (item.manualDiscountPct || 0) / 100);
  } else {
    total = total - (item.manualDiscountAmt || 0);
  }
  return Math.round(total * 100) / 100;
}

export function shouldApplyYearAdj(item: QuoteLineItem, yearAdj: YearAdjustment): boolean {
  if (yearAdj.applyToAll) return true;
  return !item.yearOverride;
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(amount);
}
