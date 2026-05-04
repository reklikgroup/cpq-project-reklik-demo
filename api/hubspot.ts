import type { VercelRequest, VercelResponse } from '@vercel/node';

const HUBSPOT_BASE = 'https://api.hubapi.com';

function getHeaders() {
  const apiKey = process.env.HUBSPOT_API_KEY;
  if (!apiKey) throw new Error('HUBSPOT_API_KEY is not configured');
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
}

async function hubspotFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${HUBSPOT_BASE}${path}`, {
    ...options,
    headers: { ...getHeaders(), ...(options.headers || {}) },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = body
      ? (body.message || JSON.stringify(body))
      : `HubSpot API error: ${res.status}`;
    throw new Error(`[${res.status}] ${detail}`);
  }
  return body;
}

async function fetchLineItems(dealId: string) {
  const assoc = await hubspotFetch(
    `/crm/v3/objects/deals/${dealId}/associations/line_items`
  );
  const ids: string[] = (assoc.results || []).map((r: any) => r.id);
  const propList = [
    'name', 'quantity', 'price', 'discount', 'amount', 'hs_product_id',
    'hs_sku', 'description', 'category', 'product_category',
    'base_price', 'event_name', 'event_start_date', 'event_end_date',
    'hs_recurring_billing_period',
  ].join(',');
  const lineItems = await Promise.all(
    ids.map((id) =>
      hubspotFetch(`/crm/v3/objects/line_items/${id}?properties=${propList}`)
    )
  );
  return lineItems;
}

interface LineItem {
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
  event_start_date?: number | null;
  event_end_date?: number | null;
  term_months?: number;
  hubspot_line_item_id?: string;
}

// Convert an ISO yyyy-MM-dd (interpreted as Eastern Time) to a midnight-UTC
// epoch ms value, which is the format HubSpot date properties expect.
// HubSpot date properties must be midnight UTC; we treat the user's input as
// the calendar date in Eastern Time (America/New_York).
function easternDateToHubSpotMs(input: number | string | null | undefined): number | null {
  if (input == null || input === '') return null;
  if (typeof input === 'number') return input;
  // Parse yyyy-MM-dd → midnight UTC of that calendar date.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(input);
  if (!m) return null;
  return Date.UTC(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
}

function monthsToIsoDuration(months?: number): string | null {
  if (!months || months <= 0) return null;
  if (months % 12 === 0) return `P${months / 12}Y`;
  return `P${Math.round(months)}M`;
}

function buildLineItemProperties(item: LineItem): Record<string, string> {
  const properties: Record<string, string> = {
    name: item.sku_name,
    quantity: String(item.quantity),
    price: String(item.unit_price),
    discount: String(item.discount_pct),
    amount: String(item.final_price),
  };
  if (item.sku_group) properties.category = String(item.sku_group);
  if (item.sku_code) properties.hs_sku = String(item.sku_code);
  if (item.description) properties.description = String(item.description);
  if (item.base_price != null) properties.base_price = String(item.base_price);
  if (item.product_category) properties.product_category = String(item.product_category);
  if (item.event_name) properties.event_name = String(item.event_name);
  const start = easternDateToHubSpotMs(item.event_start_date as any);
  if (start != null) properties.event_start_date = String(start);
  const end = easternDateToHubSpotMs(item.event_end_date as any);
  if (end != null) properties.event_end_date = String(end);
  const term = monthsToIsoDuration(item.term_months);
  if (term) properties.hs_recurring_billing_period = term;
  return properties;
}

async function upsertLineItem(item: LineItem) {
  const properties = buildLineItemProperties(item);

  if (item.hubspot_line_item_id) {
    return hubspotFetch(
      `/crm/v3/objects/line_items/${item.hubspot_line_item_id}`,
      { method: 'PATCH', body: JSON.stringify({ properties }) }
    );
  }
  return hubspotFetch('/crm/v3/objects/line_items', {
    method: 'POST',
    body: JSON.stringify({ properties }),
  });
}

async function associateLineItemsToDeal(lineItemIds: string[], dealId: string) {
  if (!lineItemIds.length) return;
  const inputs = lineItemIds.map((id) => ({
    from: { id },
    to: { id: dealId },
    type: 'line_item_to_deal',
  }));
  await hubspotFetch('/crm/v3/associations/line_items/deals/batch/create', {
    method: 'POST',
    body: JSON.stringify({ inputs }),
  });
}

interface DealMetrics {
  tcv: number;
  acv: number;
  arr: number;
  mrr: number;
}

async function patchDealProperties(dealId: string, properties: Record<string, string>) {
  return hubspotFetch(`/crm/v3/objects/deals/${dealId}`, {
    method: 'PATCH',
    body: JSON.stringify({ properties }),
  });
}

async function updateDealMetrics(dealId: string, amount: number, metrics?: DealMetrics) {
  const acvAmount = metrics ? metrics.acv : amount;

  // Build the full property set we want to write.
  const fullProps: Record<string, string> = { amount: String(acvAmount) };
  if (metrics) {
    fullProps.cadmium_tcv = String(metrics.tcv);
    fullProps.cadmium_acv = String(metrics.acv);
    fullProps.arr_cadmium = String(metrics.arr);
    fullProps.cadmium_mrr = String(metrics.mrr);
  }

  // First try: write everything in one PATCH.
  try {
    await patchDealProperties(dealId, fullProps);
    return { written: Object.keys(fullProps), skipped: [] as Array<{ property: string; error: string }> };
  } catch (e: any) {
    console.error('[updateDealMetrics] bulk PATCH failed, falling back per-property:', e.message);
  }

  // Fallback: write each property individually so one bad/missing custom
  // property (e.g., hs_tcv not defined on the portal) doesn't block the rest.
  const written: string[] = [];
  const skipped: Array<{ property: string; error: string }> = [];
  for (const [key, value] of Object.entries(fullProps)) {
    try {
      await patchDealProperties(dealId, { [key]: value });
      written.push(key);
    } catch (e: any) {
      skipped.push({ property: key, error: e.message });
      console.error(`[updateDealMetrics] failed to write ${key}:`, e.message);
    }
  }
  return { written, skipped };
}

async function deleteAllDealLineItems(dealId: string) {
  const assoc = await hubspotFetch(
    `/crm/v3/objects/deals/${dealId}/associations/line_items`
  );
  const ids: string[] = (assoc.results || []).map((r: any) => r.id);
  if (!ids.length) return { deleted: [], failed: [] as Array<{ id: string; error: string }> };

  const deleted: string[] = [];
  const failed: Array<{ id: string; error: string }> = [];

  await Promise.all(
    ids.map(async (id) => {
      try {
        await hubspotFetch(`/crm/v3/objects/line_items/${id}`, { method: 'DELETE' });
        deleted.push(id);
      } catch (e: any) {
        // Fallback: disassociate from deal so it stops showing on the deal
        try {
          await hubspotFetch(
            `/crm/v3/objects/deals/${dealId}/associations/line_items/${id}/line_item_to_deal`,
            { method: 'DELETE' }
          );
          deleted.push(id);
        } catch (e2: any) {
          failed.push({ id, error: `delete: ${e.message} | disassoc: ${e2.message}` });
        }
      }
    })
  );

  return { deleted, failed };
}

// Replaced by buildLineItemProperties — kept as thin wrapper for create flow.
async function createLineItem(item: LineItem) {
  const properties = buildLineItemProperties(item);
  return hubspotFetch('/crm/v3/objects/line_items', {
    method: 'POST',
    body: JSON.stringify({ properties }),
  });
}

async function createQuoteForDeal(
  dealId: string,
  lineItems: LineItem[],
  _quoteName: string,
  _expirationDays = 90
) {
  // 1. Fetch the deal name to use in the quote title
  let dealName = `Deal ${dealId}`;
  try {
    const deal = await hubspotFetch(
      `/crm/v3/objects/deals/${dealId}?properties=dealname`
    );
    if (deal?.properties?.dealname) dealName = deal.properties.dealname;
  } catch (e: any) {
    console.error('Failed to fetch deal name:', e.message);
  }

  // 2. Create the quote — only the 5 required properties, nothing else
  const quotePayload = {
    properties: {
      hs_title: `Quote - ${dealName} - ${new Date().toISOString().split('T')[0]}`,
      hs_status: 'DRAFT',
      hs_language: 'en',
      hs_expiration_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0],
      hs_currency: 'USD',
    },
  };

  const quote = await hubspotFetch('/crm/v3/objects/quotes', {
    method: 'POST',
    body: JSON.stringify(quotePayload),
  });

  const quoteId = quote.id;

  // 3. Associate quote to deal using association type ID 64
  try {
    await hubspotFetch('/crm/v4/associations/quotes/deals/batch/create', {
      method: 'POST',
      body: JSON.stringify({
        inputs: [
          {
            from: { id: quoteId },
            to: { id: dealId },
            types: [
              {
                associationCategory: 'HUBSPOT_DEFINED',
                associationTypeId: 64,
              },
            ],
          },
        ],
      }),
    });
  } catch (e: any) {
    console.error('Quote->Deal association failed:', e.message);
  }

  // 4. Create line items
  const created = await Promise.all(
    lineItems.map(async (item) => {
      try {
        const result = await createLineItem(item);
        return { sku_name: item.sku_name, year: item.year, success: true, id: result.id };
      } catch (e: any) {
        return { sku_name: item.sku_name, year: item.year, success: false, error: e.message };
      }
    })
  );

  // 5. Associate all line items to quote using association type ID 67
  const lineItemIds = created.filter((r) => r.success && r.id).map((r) => r.id!);
  if (lineItemIds.length) {
    try {
      await hubspotFetch('/crm/v4/associations/quotes/line_items/batch/create', {
        method: 'POST',
        body: JSON.stringify({
          inputs: lineItemIds.map((id) => ({
            from: { id: quoteId },
            to: { id },
            types: [
              {
                associationCategory: 'HUBSPOT_DEFINED',
                associationTypeId: 67,
              },
            ],
          })),
        }),
      });
    } catch (e: any) {
      console.error('Quote->LineItems association failed:', e.message);
    }
  }

  return { quote_id: quoteId, line_items: created };
}

async function syncQuoteToDeal(
  dealId: string,
  lineItems: LineItem[],
  totalValue: number,
  namePrefix = '',
  dealMetrics?: DealMetrics
) {
  // Replace strategy: delete all existing line items on the deal first
  const deletion = await deleteAllDealLineItems(dealId).catch((e) => {
    console.error('Failed to clear existing line items:', e.message);
    return { deleted: [] as string[], failed: [{ id: '_all', error: e.message }] };
  });

  const results: Array<{ sku_name: string; success: boolean; id?: string; error?: string }> = [];
  results.push({ sku_name: '_deleted', success: true, id: `${deletion.deleted.length}` });
  for (const f of deletion.failed) {
    results.push({ sku_name: `_delete_failed_${f.id}`, success: false, error: f.error });
  }

  const created = await Promise.all(
    lineItems.map(async (item) => {
      try {
        const prefixed = namePrefix
          ? { ...item, sku_name: `${namePrefix}${item.sku_name}` }
          : item;
        // Always create fresh — we just deleted the old ones
        const { hubspot_line_item_id: _ignored, ...fresh } = prefixed;
        const result = await upsertLineItem(fresh as LineItem);
        return { sku_name: item.sku_name, success: true, id: result.id };
      } catch (e: any) {
        return { sku_name: item.sku_name, success: false, error: e.message };
      }
    })
  );
  results.push(...created);

  const newIds = created.filter((r) => r.success && r.id).map((r) => r.id!);
  try {
    await associateLineItemsToDeal(newIds, dealId);
  } catch (e: any) {
    results.push({ sku_name: '_association', success: false, error: e.message });
  }

  try {
    const metricsResult = await updateDealMetrics(dealId, totalValue, dealMetrics);
    results.push({
      sku_name: '_deal_metrics_written',
      success: true,
      id: metricsResult.written.join(','),
    });
    for (const s of metricsResult.skipped) {
      results.push({
        sku_name: `_deal_metric_skipped_${s.property}`,
        success: false,
        error: s.error,
      });
    }
  } catch (e: any) {
    results.push({ sku_name: '_deal_metrics', success: false, error: e.message });
  }

  return results;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    getHeaders(); // validate key exists
  } catch {
    return res.status(500).json({ error: 'HUBSPOT_API_KEY is not configured on the server' });
  }

  const { action } = req.body || {};

  try {
    switch (action) {
      case 'fetch_line_items': {
        const { deal_id } = req.body;
        if (!deal_id) return res.status(400).json({ error: 'deal_id is required' });
        const items = await fetchLineItems(deal_id);
        return res.status(200).json(items);
      }

      case 'sync_quote': {
        const { deal_id, line_items, total_value, deal_metrics } = req.body;
        if (!deal_id || !line_items) return res.status(400).json({ error: 'deal_id and line_items are required' });
        const results = await syncQuoteToDeal(deal_id, line_items, total_value ?? deal_metrics?.tcv ?? 0, '', deal_metrics);
        return res.status(200).json({ results });
      }

      case 'sync_upgrade': {
        const { upgrade_deal_id, renewal_deal_id, upgrade_line_items, deal_metrics } = req.body;
        if (!upgrade_deal_id || !renewal_deal_id || !upgrade_line_items) {
          return res.status(400).json({ error: 'upgrade_deal_id, renewal_deal_id, and upgrade_line_items are required' });
        }
        const totalValue = upgrade_line_items.reduce((s: number, i: LineItem) => s + i.final_price, 0);
        const [upgradeResults, renewalResults] = await Promise.all([
          syncQuoteToDeal(upgrade_deal_id, upgrade_line_items, totalValue, '', deal_metrics),
          syncQuoteToDeal(renewal_deal_id, upgrade_line_items, 0, '[Upgrade] '),
        ]);
        return res.status(200).json({ upgrade_results: upgradeResults, renewal_results: renewalResults });
      }

      case 'create_quote': {
        const { deal_id, line_items, quote_name, expiration_days } = req.body;
        if (!deal_id || !line_items) return res.status(400).json({ error: 'deal_id and line_items are required' });
        const result = await createQuoteForDeal(deal_id, line_items, quote_name || `Quote for Deal ${deal_id}`, expiration_days);
        return res.status(200).json(result);
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
}
