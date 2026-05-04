import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { FileDown, Upload, FilePlus } from 'lucide-react';
import { formatCurrency } from '@/lib/pricing';
import type { YearAdjustment } from '@/types/quote';

interface QuoteSummaryProps {
  termYears: number;
  getYearSubtotal: (year: number) => number;
  yearAdjustments: Record<number, YearAdjustment>;
  totalContractValue: number;
  notes: string;
  onSetNotes: (notes: string) => void;
  onExportPdf: () => void;
  onSyncHubSpot: () => void;
  onCreateHubSpotQuote: () => void;
}

export function QuoteSummary({
  termYears,
  getYearSubtotal,
  yearAdjustments,
  totalContractValue,
  notes,
  onSetNotes,
  onExportPdf,
  onSyncHubSpot,
  onCreateHubSpotQuote,
}: QuoteSummaryProps) {
  const years = Array.from({ length: termYears }, (_, i) => i + 1);

  return (
    <div className="bg-card rounded-lg border shadow-sm p-6 space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Step 3 — Quote Summary
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {years.map((year) => {
          const subtotal = getYearSubtotal(year);
          const adj = yearAdjustments[year];
          const discMode = adj.discountMode ?? 'pct';
          const incMode = adj.increaseMode ?? 'pct';
          const discLabel = discMode === 'pct'
            ? (adj.discountPct > 0 ? `Disc: ${adj.discountPct}%` : '')
            : ((adj.discountAmt || 0) > 0 ? `Disc: ${formatCurrency(adj.discountAmt || 0)}` : '');
          const incLabel = incMode === 'pct'
            ? (adj.increasePct > 0 ? `Inc: ${adj.increasePct}%` : '')
            : ((adj.increaseAmt || 0) > 0 ? `Inc: ${formatCurrency(adj.increaseAmt || 0)}` : '');
          return (
            <div key={year} className="rounded-lg border bg-muted/30 p-4 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Year {year}
              </p>
              <p className="text-xl font-bold text-foreground tabular-nums">
                {formatCurrency(subtotal)}
              </p>
              <div className="flex gap-3 text-[11px] text-muted-foreground">
                {discLabel && <span>{discLabel}</span>}
                {incLabel && <span>{incLabel}</span>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between pt-2 border-t">
        <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Total Contract Value
        </span>
        <span className="text-2xl font-bold text-foreground tabular-nums">
          {formatCurrency(totalContractValue)}
        </span>
      </div>

      {(() => {
        const tcv = totalContractValue;
        const acv = termYears >= 1 ? tcv / termYears : tcv;
        const months = termYears * 12;
        const mrr = months > 0 ? tcv / months : 0;
        const dealAmount = acv;
        const arr = acv;
        const metrics = [
          { label: 'TCV', value: tcv, hint: 'Total Contract Value' },
          { label: 'ACV', value: acv, hint: termYears >= 1 ? `TCV ÷ ${termYears} yr${termYears > 1 ? 's' : ''}` : 'TCV (term < 1 yr)' },
          { label: 'MRR', value: mrr, hint: `TCV ÷ ${months} mo` },
          { label: 'Deal Amount', value: dealAmount, hint: '= ACV' },
          { label: 'ARR', value: arr, hint: '= ACV' },
        ];
        return (
          <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Deal Metrics — please confirm before sync
              </p>
              <span className="text-[11px] text-muted-foreground">
                Term: {termYears} yr{termYears > 1 ? 's' : ''} ({months} mo)
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {metrics.map((m) => (
                <div key={m.label} className="rounded-md border bg-card p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {m.label}
                  </p>
                  <p className="text-base font-bold text-foreground tabular-nums mt-0.5">
                    {formatCurrency(m.value)}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{m.hint}</p>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground">Notes</label>
        <Textarea
          value={notes}
          onChange={(e) => onSetNotes(e.target.value)}
          placeholder="Add any notes for this quote..."
          className="min-h-[80px] text-sm"
        />
      </div>

      <div className="flex gap-3 pt-2">
        <Button onClick={onExportPdf} variant="outline" className="gap-2">
          <FileDown className="h-4 w-4" />
          Export PDF
        </Button>
        <Button onClick={onSyncHubSpot} className="gap-2">
          <Upload className="h-4 w-4" />
          Sync to HubSpot
        </Button>
        <Button onClick={onCreateHubSpotQuote} variant="secondary" className="gap-2">
          <FilePlus className="h-4 w-4" />
          Create HubSpot Quote
        </Button>
      </div>
    </div>
  );
}
