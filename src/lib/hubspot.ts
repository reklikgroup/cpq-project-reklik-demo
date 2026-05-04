const HUBSPOT_PROXY = '/api/hubspot';

export async function fetchDealLineItems(dealId: string) {
  const res = await fetch(HUBSPOT_PROXY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'fetch_line_items', deal_id: dealId }),
  });
  if (!res.ok) throw new Error(`HubSpot API error: ${res.status}`);
  return res.json();
}

export interface SyncLineItem {
  sku_name: string;
  quantity: number;
  unit_price: number;
  discount_pct: number;
  final_price: number;
  year: number;
  sku_group?: string;
  sku_code?: string;
  description?: string;
  base_price?: number;
  product_category?: string;
  event_name?: string;
  event_start_date?: number | null; // epoch ms (HubSpot date property)
  event_end_date?: number | null;
  term_months?: number; // converted to ISO 8601 duration server-side
  hubspot_line_item_id?: string;
}

export interface DealMetrics {
  tcv: number;
  acv: number;
  arr: number;
  mrr: number;
}

export async function syncQuote(
  dealId: string,
  lineItems: SyncLineItem[],
  dealMetrics?: DealMetrics
) {
  const res = await fetch(HUBSPOT_PROXY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'sync_quote',
      deal_id: dealId,
      line_items: lineItems,
      deal_metrics: dealMetrics,
    }),
  });
  if (!res.ok) throw new Error(`HubSpot API error: ${res.status}`);
  return res.json();
}

export async function createQuote(
  dealId: string,
  lineItems: SyncLineItem[],
  quoteName?: string,
  expirationDays?: number
) {
  const res = await fetch(HUBSPOT_PROXY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'create_quote',
      deal_id: dealId,
      line_items: lineItems,
      quote_name: quoteName,
      expiration_days: expirationDays,
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error || `HubSpot API error: ${res.status}`);
  }
  return res.json();
}

export async function syncUpgrade(
  upgradeDealId: string,
  renewalDealId: string,
  upgradeLineItems: SyncLineItem[],
  dealMetrics?: DealMetrics
) {
  const res = await fetch(HUBSPOT_PROXY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'sync_upgrade',
      upgrade_deal_id: upgradeDealId,
      renewal_deal_id: renewalDealId,
      upgrade_line_items: upgradeLineItems,
      deal_metrics: dealMetrics,
    }),
  });
  if (!res.ok) throw new Error(`HubSpot API error: ${res.status}`);
  return res.json();
}
