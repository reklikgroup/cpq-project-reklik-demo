import type { DealSetup } from '@/types/quote';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { formatCurrency } from '@/lib/pricing';
import { FileDown, Upload } from 'lucide-react';

interface QuoteSummaryProps {
  deal: DealSetup;
  getYearSubtotal: (year: number) => number;
  totalContractValue: number;
  notes: string;
  onSetNotes: (notes: string) => void;
  onExportPDF: () => void;
  onSyncHubSpot: () => void;
}

export function QuoteSummary({
  deal,
  getYearSubtotal,
  totalContractValue,
  notes,
  onSetNotes,
  onExportPDF,
  onSyncHubSpot,
}: QuoteSummaryProps) {
  return (
    <div className="bg-card border rounded-lg p-5 space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide">Step 3 — Summary</h2>

      {/* Per-year subtotals */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {Array.from({ length: deal.termYears }, (_, i) => i + 1).map(yr => {
          const sub = getYearSubtotal(yr);
          const adj = deal.yearAdjustments[yr];
          return (
            <div key={yr} className="bg-muted/30 rounded-md p-3">
              <p className="text-[10px] text-muted-foreground font-medium uppercase">Year {yr}</p>
              <p className="text-lg font-bold">{formatCurrency(sub)}</p>
              {yr > 1 && (adj.discountPct > 0 || adj.increasePct > 0) && (
                <p className="text-[10px] text-muted-foreground">
                  {adj.increasePct > 0 && `+${adj.increasePct}% increase`}
                  {adj.increasePct > 0 && adj.discountPct > 0 && ' / '}
                  {adj.discountPct > 0 && `-${adj.discountPct}% discount`}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* TCV */}
      <div className="bg-primary/5 border border-primary/20 rounded-md p-4 text-center">
        <p className="text-xs text-primary font-medium uppercase">Total Contract Value</p>
        <p className="text-2xl font-bold text-primary">{formatCurrency(totalContractValue)}</p>
      </div>

      {/* Notes */}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Notes</Label>
        <Textarea
          value={notes}
          onChange={e => onSetNotes(e.target.value)}
          placeholder="Internal notes..."
          className="text-sm min-h-[60px]"
        />
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Button onClick={onExportPDF} variant="outline" className="flex-1 gap-2">
          <FileDown className="h-4 w-4" />
          Export PDF
        </Button>
        <Button onClick={onSyncHubSpot} className="flex-1 gap-2">
          <Upload className="h-4 w-4" />
          Sync to HubSpot
        </Button>
      </div>
    </div>
  );
}
