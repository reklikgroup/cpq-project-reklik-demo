export type DealType = 'new_business' | 'renewal' | 'mid_term_upgrade';

export interface VolumeTier {
  min_qty: number;
  max_qty: number;
  unit_price: number;
}

export interface Variant {
  id: string;
  name: string;
  price: number;
}

export interface Dependency {
  depends_on_sku_id: string;
  type: 'soft' | 'hard';
  message: string;
}

export type PricingModel =
  | 'per_seat' | 'fixed' | 'custom' | 'variable' | 'deal_type_based'
  | 'tiered_learners' | 'tiered_fixed' | 'tiered_sponsors' | 'tiered_products'
  | 'tiered_hours' | 'tiered_count' | 'tiered_storage';

export interface SKU {
  id: string;
  sku_code: string;
  name: string;
  pricing_model: PricingModel;
  base_price?: number;
  currency: string;
  active: boolean;
  recurring: boolean;
  variants: Variant[];
  volume_tiers: any[];
  dependencies: Dependency[];
  variable_unit?: string;
  price_new?: number;
  price_repeat?: number;
}

export interface Product {
  id: string;
  name: string;
  category: string;
  type: 'base' | 'addon';
  skus: SKU[];
}

export interface ProductCatalog {
  categories: string[];
  products: Product[];
}

export interface YearAdjustment {
  discountPct: number;
  increasePct: number;
  applyToAll: boolean;
}

export interface LineYearOverride {
  manualDiscountPct?: number;
  manualIncreasePct?: number;
  unitPriceOverride?: number | null;
}

export interface QuoteLineItem {
  id: string;
  skuId: string;
  skuName: string;
  productName: string;
  pricingModel: string;
  quantity: number;
  selectedVariantId: string | null;
  selectedTierIndex: number | null;
  baseUnitPrice: number;
  unitPriceOverride: number | null;
  manualDiscountPct: number;
  manualIncreasePct: number;
  yearOverride: boolean;
  recurring: boolean;
  variants: Variant[];
  volumeTiers: any[];
  dependencies: Dependency[];
  hubspotLineItemId?: string;
  source: 'catalog' | 'hubspot';
  variableUnit?: string;
  priceNew?: number;
  priceRepeat?: number;
  yearOverrides: Record<number, LineYearOverride>;
}

export interface DealSetup {
  dealType: DealType;
  dealId: string;
  renewalDealId: string;
  termYears: 1 | 2 | 3;
  yearAdjustments: Record<number, YearAdjustment>;
}

export interface QuoteState {
  deal: DealSetup;
  lineItems: QuoteLineItem[];
  notes: string;
}
