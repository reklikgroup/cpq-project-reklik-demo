import { useMemo } from 'react';
import { useQuote } from '@/hooks/useQuote';
import { DealSetupPanel } from '@/components/DealSetupPanel';
import { SkuBrowser } from '@/components/SkuBrowser';
import { LiveQuote } from '@/components/LiveQuote';
import { QuoteSummary } from '@/components/QuoteSummary';
import { exportQuotePDF } from '@/lib/pdf';
import { syncQuote } from '@/lib/hubspot';
import { calculateLineTotal } from '@/lib/pricing';
import catalogData from '@/data/products.json';
import type { ProductCatalog, SKU } from '@/types/quote';
import { toast } from 'sonner';
import { useState } from 'react';

const catalog = catalogData as ProductCatalog;

const Index = () => {
  const {
    state,
    updateDeal,
    updateYearAdjustment,
    addLineItem,
    updateLineItem,
    updateLineItemYear,
    removeLineItem,
    setNotes,
    getYearItems,
    getYearSubtotal,
    totalContractValue,
  } = useQuote();

  const allSkuIds = useMemo(
    () => new Set(state.lineItems.map(li => li.skuId)),
    [state.lineItems]
  );

  const handleAddSku = (sku: SKU, productName: string) => {
    addLineItem(sku, productName);
    toast.success(`Added ${sku.name}`);
  };

  const handleExportPDF = () => {
    exportQuotePDF(state.deal, state.lineItems, state.notes, getYearItems, getYearSubtotal, totalContractValue);
    toast.success('PDF exported');
  };

  const [syncing, setSyncing] = useState(false);
  const handleSyncHubSpot = async () => {
    if (!state.deal.dealId) {
      toast.error('Please enter a Deal ID first');
      return;
    }
    if (state.lineItems.length === 0) {
      toast.error('Add at least one line item');
      return;
    }

    const payload: { name: string; quantity: number; unitPrice: number; year: number; skuCode?: string }[] = [];
    for (let yr = 1; yr <= state.deal.termYears; yr++) {
      const items = getYearItems(yr);
      const yearAdj = state.deal.yearAdjustments[yr];
      for (const li of items) {
        const total = calculateLineTotal(li, yearAdj, yr, state.deal.dealType);
        payload.push({
          name: `${li.productName} — ${li.skuName}`,
          quantity: 1,
          unitPrice: total,
          year: yr,
        });
      }
    }

    setSyncing(true);
    const t = toast.loading('Syncing to HubSpot...');
    try {
      const res = await syncQuote(state.deal.dealId, payload);
      toast.success(`Synced: ${res.created} line items created, ${res.deleted} replaced`, { id: t });
    } catch (err: any) {
      toast.error(`Sync failed: ${err?.message || 'Unknown error'}`, { id: t });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4 lg:p-6 min-h-screen">
      {/* Step 1 */}
      <DealSetupPanel
        deal={state.deal}
        onUpdateDeal={updateDeal}
        onUpdateYearAdj={updateYearAdjustment}
      />

      {/* Step 2 — Side by side */}
      <div className="flex gap-4 flex-1 min-h-0">
        <div className="w-80 shrink-0">
          <SkuBrowser catalog={catalog} onAddSku={handleAddSku} />
        </div>
        <div className="flex-1 min-w-0">
          <LiveQuote
            deal={state.deal}
            lineItems={state.lineItems}
            getYearItems={getYearItems}
            getYearSubtotal={getYearSubtotal}
            onUpdateLineItem={updateLineItem}
            onUpdateLineItemYear={updateLineItemYear}
            onRemoveLineItem={removeLineItem}
            allSkuIds={allSkuIds}
          />
        </div>
      </div>

      {/* Step 3 */}
      <QuoteSummary
        deal={state.deal}
        getYearSubtotal={getYearSubtotal}
        totalContractValue={totalContractValue}
        notes={state.notes}
        onSetNotes={setNotes}
        onExportPDF={handleExportPDF}
        onSyncHubSpot={handleSyncHubSpot}
      />
    </div>
  );
};

export default Index;
