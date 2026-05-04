export type DealType = 'new_business' | 'renewal' | 'mid_term_upgrade';

export type SkuGroup = 'Software' | 'Services' | 'Implementation' | 'Travel' | 'Other';
export const SKU_GROUPS: SkuGroup[] = ['Software', 'Services', 'Implementation', 'Travel', 'Other'];

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
  volume_tiers: any[]; // flexible shape per pricing model
  dependencies: Dependency[];
  variable_unit?: string;
  price_new?: number;
  price_repeat?: number;
  description?: string;
  notes?: string;
  sku_group?: string;
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

export type AdjustmentMode = 'pct' | 'amount';

export interface YearAdjustment {
  discountPct: number;
  increasePct: number;
  discountAmt?: number;
  increaseAmt?: number;
  discountMode?: AdjustmentMode;
  increaseMode?: AdjustmentMode;
  applyToAll: boolean;
}

export interface QuoteLineItem {
  id: string;
  year: number;
  sourceLineItemId: string;
  skuId: string;
  skuName: string;
  productName: string;
  category?: string;
  pricingModel: string;
  quantity: number;
  selectedVariantId: string | null;
  selectedTierIndex: number | null; // for tiered pricing models
  baseUnitPrice: number;
  unitPriceOverride: number | null;
  manualDiscountPct: number;
  manualIncreasePct: number;
  manualDiscountAmt?: number;
  manualIncreaseAmt?: number;
  manualDiscountMode?: AdjustmentMode;
  manualIncreaseMode?: AdjustmentMode;
  yearOverride: boolean;
  recurring: boolean;
  variants: Variant[];
  volumeTiers: any[];
  dependencies: Dependency[];
  hubspotLineItemId?: string;
  source: 'catalog' | 'hubspot';
  skuCode?: string;
  variableUnit?: string;
  priceNew?: number;
  priceRepeat?: number;
  description?: string;
  skuGroup?: SkuGroup | '';
  lineItemStartDate?: string | null; // ISO yyyy-MM-dd
  lineItemEndDate?: string | null;   // ISO yyyy-MM-dd
}

export interface DealSetup {
  dealType: DealType;
  dealId: string;
  renewalDealId: string;
  termYears: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  yearAdjustments: Record<number, YearAdjustment>;
  contractStartDate: string | null; // ISO yyyy-MM-dd
  contractEndDate: string | null;   // ISO yyyy-MM-dd
  eventNames: Record<number, string>; // event name per year
}

export interface QuoteState {
  deal: DealSetup;
  lineItems: QuoteLineItem[];
  notes: string;
}
