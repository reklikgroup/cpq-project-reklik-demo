import { useMemo } from 'react';
import { useQuote } from '@/hooks/useQuote';
import { DealSetupPanel } from '@/components/DealSetupPanel';
import { SkuBrowser } from '@/components/SkuBrowser';
import { LiveQuote } from '@/components/LiveQuote';
import { QuoteSummary } from '@/components/QuoteSummary';
import { exportQuotePDF } from '@/lib/pdf';
import catalogData from '@/data/products.json';
import type { ProductCatalog, SKU } from '@/types/quote';
import { toast } from 'sonner';

const catalog = catalogData as ProductCatalog;

const Index = () => {
  const {
    state,
    updateDeal,
    updateYearAdjustment,
    addLineItem,
    updateLineItem,
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

  const handleSyncHubSpot = () => {
    if (!state.deal.dealId) {
      toast.error('Please enter a Deal ID first');
      return;
    }
    toast.info('HubSpot sync requires a backend proxy — configure /api/hubspot endpoint');
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
