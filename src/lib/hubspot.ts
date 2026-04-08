// HubSpot API client — calls through /api/hubspot proxy
// In production, this would hit a Vercel serverless function or Supabase edge function

const API_BASE = '/api/hubspot';

export async function fetchDealLineItems(dealId: string) {
  try {
    const res = await fetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'fetch_line_items', dealId }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error('HubSpot fetch error:', err);
    throw err;
  }
}

export async function syncQuote(dealId: string, lineItems: any[]) {
  try {
    const res = await fetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'sync_quote', dealId, lineItems }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error('HubSpot sync error:', err);
    throw err;
  }
}

export async function syncUpgrade(
  upgradeDealId: string,
  renewalDealId: string,
  upgradeLineItems: any[]
) {
  try {
    const res = await fetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'sync_upgrade',
        upgradeDealId,
        renewalDealId,
        upgradeLineItems,
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error('HubSpot sync upgrade error:', err);
    throw err;
  }
}
