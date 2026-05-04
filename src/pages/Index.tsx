import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useQuote } from '@/hooks/useQuote';
import { DealSetupPanel } from '@/components/DealSetupPanel';
import { SkuBrowser } from '@/components/SkuBrowser';
import { LiveQuote } from '@/components/LiveQuote';
import { QuoteSummary } from '@/components/QuoteSummary';
import { exportQuotePdf } from '@/lib/pdf';
import { syncQuote, syncUpgrade, fetchDealLineItems, createQuote } from '@/lib/hubspot';
import type { ProductCatalog } from '@/types/quote';
import catalogData from '@/data/products.json';

const catalog = catalogData as ProductCatalog;

export default function QuoteBuilderPage() {
  const {
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
  } = useQuote();

  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isFetching, setIsFetching] = useState(false);

  const skuIdsInQuote = useMemo(
    () => state.lineItems.map((li) => li.skuId),
    [state.lineItems]
  );

  const handleFetchLineItems = useCallback(async (dealId: string) => {
    if (!dealId) return;
    setFetchError(null);
    setIsFetching(true);
    try {
      const data = await fetchDealLineItems(dealId);
      const items = data.line_items || data || [];
      if (Array.isArray(items) && items.length > 0) {
        loadHubSpotItems(items.map((li: any) => {
          const p = li.properties || {};
          const epochToIso = (v: any): string | null => {
            if (!v) return null;
            const n = typeof v === 'string' ? Number(v) : v;
            if (!Number.isFinite(n)) {
              // Try ISO string passthrough
              if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
              return null;
            }
            const d = new Date(n);
            if (isNaN(d.getTime())) return null;
            return d.toISOString().slice(0, 10);
          };
          return {
            id: li.id,
            name: p.name || li.name || '',
            quantity: parseFloat(p.quantity ?? li.quantity) || 1,
            price: parseFloat(p.price ?? li.price) || 0,
            discount: parseFloat(p.discount ?? li.discount) || 0,
            amount: parseFloat(p.amount) || undefined,
            sku_code: p.hs_sku || undefined,
            description: p.description || undefined,
            sku_group: p.category || undefined,
            product_category: p.product_category || undefined,
            base_price: p.base_price != null ? parseFloat(p.base_price) : undefined,
            event_name: p.event_name || undefined,
            event_start_date: epochToIso(p.event_start_date),
            event_end_date: epochToIso(p.event_end_date),
          };
        }));
        toast.success(`Loaded ${items.length} line item(s) from HubSpot`);
      } else {
        toast.info('No existing line items found on this deal');
      }
    } catch (err: any) {
      setFetchError('Failed to fetch line items from HubSpot. You can still build from the catalog.');
    } finally {
      setIsFetching(false);
    }
  }, [loadHubSpotItems]);

  // Deep-link support: /deal/:dealId auto-fills the Deal ID and fetches line items.
  // Lets a HubSpot calculated field link directly into the quote builder.
  const { dealId: dealIdParam } = useParams<{ dealId: string }>();
  const autoLoadedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!dealIdParam) return;
    const cleaned = dealIdParam.replace(/\D/g, '');
    if (!cleaned) return;
    if (autoLoadedRef.current === cleaned) return;
    autoLoadedRef.current = cleaned;
    setDealId(cleaned);
    toast.info(`Loading deal ${cleaned} from HubSpot…`);
    handleFetchLineItems(cleaned);
  }, [dealIdParam, setDealId, handleFetchLineItems]);

  const handleExportPdf = () => {
    exportQuotePdf(state, getYearItems, getYearSubtotal, totalContractValue);
    toast.success('PDF exported');
  };

  const handleSyncHubSpot = async () => {
    if (!state.deal.dealId) {
      toast.error('Enter a Deal ID first');
      return;
    }

    const allLineItems = [];
    for (let y = 1; y <= state.deal.termYears; y++) {
      const items = getYearItems(y);
      const adj = state.deal.yearAdjustments[y];
      for (const item of items) {
        const { calculateLineTotal, shouldApplyYearAdj, getUnitPrice, getTermMonths } = await import('@/lib/pricing');
        const applyAdj = shouldApplyYearAdj(item, adj);
        const total = calculateLineTotal(item, adj, applyAdj, state.deal.dealType);
        const yearPrefix = state.deal.termYears > 1 ? `[Y${y}] ` : '';
        const termMonths = getTermMonths(item.lineItemStartDate, item.lineItemEndDate);
        allLineItems.push({
          sku_name: `${yearPrefix}${item.skuName}`,
          quantity: item.quantity,
          unit_price: getUnitPrice(item, state.deal.dealType),
          discount_pct: item.manualDiscountPct,
          final_price: total,
          year: y,
          sku_group: item.skuGroup || undefined,
          sku_code: item.skuCode || undefined,
          description: item.description || undefined,
          base_price: item.baseUnitPrice ?? undefined,
          product_category: item.category || undefined,
          event_name: state.deal.eventNames[y] || undefined,
          event_start_date: item.lineItemStartDate || null,
          event_end_date: item.lineItemEndDate || null,
          term_months: termMonths ?? undefined,
          hubspot_line_item_id: item.hubspotLineItemId,
        });
      }
    }

    try {
      const termYears = state.deal.termYears;
      const tcv = totalContractValue;
      const acv = termYears >= 1 ? tcv / termYears : tcv;
      const months = termYears * 12;
      const mrr = months > 0 ? tcv / months : 0;
      const dealMetrics = { tcv, acv, arr: acv, mrr };

      let response: any;
      if (state.deal.dealType === 'mid_term_upgrade' && state.deal.renewalDealId) {
        response = await syncUpgrade(state.deal.dealId, state.deal.renewalDealId, allLineItems, dealMetrics);
      } else {
        response = await syncQuote(state.deal.dealId, allLineItems, dealMetrics);
      }

      // Surface any deal-property write failures so reps know which custom
      // HubSpot properties (e.g. hs_tcv) need to be created in the portal.
      const allResults: any[] = [
        ...(response?.results || []),
        ...(response?.upgrade_results || []),
      ];
      const skipped = allResults.filter((r) => r?.sku_name?.startsWith?.('_deal_metric_skipped_'));
      if (skipped.length) {
        const props = skipped.map((s) => s.sku_name.replace('_deal_metric_skipped_', '')).join(', ');
        toast.warning(`Synced, but these deal properties were rejected by HubSpot: ${props}. Create them as custom properties or check field permissions.`);
      } else {
        toast.success('Synced to HubSpot');
      }
    } catch (err: any) {
      toast.error(err?.message || 'HubSpot sync failed — ensure /api/hubspot is configured');
    }
  };

  const buildAllLineItems = async () => {
    const allLineItems: any[] = [];
    for (let y = 1; y <= state.deal.termYears; y++) {
      const items = getYearItems(y);
      const adj = state.deal.yearAdjustments[y];
      const { calculateLineTotal, shouldApplyYearAdj, getUnitPrice, getTermMonths } = await import('@/lib/pricing');
      for (const item of items) {
        const applyAdj = shouldApplyYearAdj(item, adj);
        const total = calculateLineTotal(item, adj, applyAdj, state.deal.dealType);
        const yearPrefix = state.deal.termYears > 1 ? `[Y${y}] ` : '';
        const termMonths = getTermMonths(item.lineItemStartDate, item.lineItemEndDate);
        allLineItems.push({
          sku_name: `${yearPrefix}${item.skuName}`,
          quantity: item.quantity,
          unit_price: getUnitPrice(item, state.deal.dealType),
          discount_pct: item.manualDiscountPct,
          final_price: total,
          year: y,
          sku_group: item.skuGroup || undefined,
          sku_code: item.skuCode || undefined,
          description: item.description || undefined,
          base_price: item.baseUnitPrice ?? undefined,
          product_category: item.category || undefined,
          event_name: state.deal.eventNames[y] || undefined,
          event_start_date: item.lineItemStartDate || null,
          event_end_date: item.lineItemEndDate || null,
          term_months: termMonths ?? undefined,
        });
      }
    }
    return allLineItems;
  };

  const handleCreateHubSpotQuote = async () => {
    if (!state.deal.dealId) {
      toast.error('Enter a Deal ID first');
      return;
    }
    try {
      const lineItems = await buildAllLineItems();
      const result = await createQuote(
        state.deal.dealId,
        lineItems,
        `Quote for Deal ${state.deal.dealId} (${state.deal.termYears}yr)`
      );
      toast.success(`Quote created in HubSpot (ID: ${result.quote_id})`);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to create HubSpot quote');
    }
  };

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground" style={{ lineHeight: '1.1' }}>
          Quote Builder
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure, price, and generate quotes
        </p>
      </div>

      <DealSetupPanel
        deal={state.deal}
        onSetDealType={setDealType}
        onSetDealId={setDealId}
        onSetRenewalDealId={setRenewalDealId}
        onSetTermYears={setTermYears}
        onSetContractStartDate={setContractStartDate}
        onSetContractEndDate={setContractEndDate}
        onSetYearAdjustment={setYearAdjustment}
        onSetEventName={setEventName}
        onFetchLineItems={handleFetchLineItems}
        isFetching={isFetching}
      />

      {fetchError && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {fetchError}
        </div>
      )}

      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Step 2 — Build Quote
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
          <div className="h-[500px]">
            <SkuBrowser
              catalog={catalog}
              termYears={state.deal.termYears}
              onAddSku={(sku, productName, options) => addLineItem(sku, productName, options)}
            />
          </div>
          <LiveQuote
            lineItems={state.lineItems}
            termYears={state.deal.termYears}
            yearAdjustments={state.deal.yearAdjustments}
            eventNames={state.deal.eventNames}
            dealType={state.deal.dealType}
            getYearItems={getYearItems}
            onUpdateLineItem={updateLineItem}
            onRemoveLineItem={removeLineItem}
            onSetEventName={setEventName}
            onAddBlankLineItem={addBlankLineItem}
            skuIdsInQuote={skuIdsInQuote}
          />
        </div>
      </div>

      {state.lineItems.length > 0 && (
        <QuoteSummary
          termYears={state.deal.termYears}
          getYearSubtotal={getYearSubtotal}
          yearAdjustments={state.deal.yearAdjustments}
          totalContractValue={totalContractValue}
          notes={state.notes}
          onSetNotes={setNotes}
          onExportPdf={handleExportPdf}
          onSyncHubSpot={handleSyncHubSpot}
          onCreateHubSpotQuote={handleCreateHubSpotQuote}
        />
      )}
    </div>
  );
}
