## Goal

Allow a HubSpot deal record to deep-link straight into Quote Builder so the deal ID auto-populates and line items auto-fetch — no copy/paste needed.

## How it will work

In HubSpot, create a calculated/formula deal property (e.g. "Quote Builder Link") with the value:

```
https://quote-master-eight.vercel.app/deal/{{deal_id}}
```

A rep clicks that link from the deal record → the app opens, reads the deal ID from the URL, fills the Deal ID field, and immediately fetches the line items.

## Implementation

1. **Add a route**: `/deal/:dealId` → renders the same `Index` page (Quote Builder).
   - Update `src/App.tsx` to add `<Route path="/deal/:dealId" element={<Index />} />` alongside the existing `/` route.

2. **Read the param in `Index.tsx`**:
   - Use `useParams()` from `react-router-dom` to grab `dealId`.
   - On mount (or when the param changes), if a `dealId` is present and differs from current state:
     - Call `setDealId(dealId)` to populate the Deal Setup field.
     - Call `handleFetchLineItems(dealId)` to auto-pull line items (same flow as clicking the existing Fetch button).
   - Guard with a `useRef` flag so it only runs once per dealId (avoids re-fetching on re-renders).

3. **Optional polish**: show a small toast like "Loading deal {id} from HubSpot…" so the rep knows what's happening.

## URL formats supported

- `https://quote-master-eight.vercel.app/deal/12345` — the new deep link
- `https://quote-master-eight.vercel.app/` — existing manual entry still works
- The existing `setDealId` already strips non-digits and parses `/deal/{id}` style URLs, so HubSpot deal URLs pasted into the field continue to work.

## HubSpot side (you do this once)

1. In HubSpot: **Settings → Properties → Deal properties → Create property**.
2. Type: **Calculation** → **Custom equation**.
3. Formula: `"https://quote-master-eight.vercel.app/deal/" + string(record_id)` (HubSpot uses the deal's `hs_object_id` — exact syntax shown in the property editor).
4. Add that property to the deal record sidebar/middle column so it's clickable.

## Files to edit

- `src/App.tsx` — add the `/deal/:dealId` route
- `src/pages/Index.tsx` — read param, auto-set deal ID, auto-fetch on first load

## Notes

- SPA routing on Lovable/Vercel hosting handles deep-link refreshes automatically — no redirect config needed.
- Works for both the published `quote-master-eight.vercel.app` URL and the Lovable preview URL (just swap the host in the HubSpot formula if you want to test against preview first).
