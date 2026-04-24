// Vercel serverless function: /api/hubspot
// Requires env var HUBSPOT_ACCESS_TOKEN (HubSpot Private App token with
// scopes: crm.objects.line_items.write, crm.objects.line_items.read,
// crm.objects.deals.write, crm.objects.deals.read)

const HS_BASE = 'https://api.hubapi.com';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

interface SyncLineItem {
  name: string;
  quantity: number;
  unitPrice: number;
  year: number;
  skuCode?: string;
}

async function hs(token: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`${HS_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    throw new Error(`HubSpot ${res.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
  }
  return data;
}

async function getDealLineItems(token: string, dealId: string): Promise<string[]> {
  const data = await hs(token, `/crm/v3/objects/deals/${dealId}/associations/line_items`);
  return (data.results || []).map((r: any) => r.id ?? r.toObjectId).filter(Boolean);
}

async function deleteLineItem(token: string, id: string) {
  await hs(token, `/crm/v3/objects/line_items/${id}`, { method: 'DELETE' });
}

async function createLineItem(token: string, dealId: string, item: SyncLineItem, multiYear: boolean) {
  const displayName = multiYear ? `[Y${item.year}] ${item.name}` : item.name;
  const properties: Record<string, string> = {
    name: displayName,
    quantity: String(item.quantity),
    price: item.unitPrice.toFixed(2),
  };
  if (item.skuCode) properties.hs_sku = item.skuCode;

  const created = await hs(token, '/crm/v3/objects/line_items', {
    method: 'POST',
    body: JSON.stringify({ properties }),
  });

  // Associate to deal (default association type)
  await hs(
    token,
    `/crm/v4/objects/line_items/${created.id}/associations/default/deals/${dealId}`,
    { method: 'PUT' }
  );

  return created.id as string;
}

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!token) return json(500, { error: 'HUBSPOT_ACCESS_TOKEN not configured on server' });

  let body: any;
  try { body = await req.json(); } catch { return json(400, { error: 'Invalid JSON' }); }

  const { action } = body || {};

  try {
    if (action === 'sync_quote') {
      const dealId: string = body.dealId;
      const lineItems: SyncLineItem[] = body.lineItems || [];
      if (!dealId) return json(400, { error: 'dealId required' });

      // Replace mode: delete existing line items first
      const existing = await getDealLineItems(token, dealId);
      for (const id of existing) {
        try { await deleteLineItem(token, id); } catch (e) { console.error('delete fail', id, e); }
      }

      const multiYear = new Set(lineItems.map(l => l.year)).size > 1;
      const created: string[] = [];
      for (const li of lineItems) {
        const id = await createLineItem(token, dealId, li, multiYear);
        created.push(id);
      }
      return json(200, { ok: true, created: created.length, deleted: existing.length });
    }

    return json(400, { error: `Unknown action: ${action}` });
  } catch (err: any) {
    console.error('hubspot handler error', err);
    return json(500, { error: err?.message || 'Unknown error' });
  }
}

export const config = { runtime: 'edge' };
