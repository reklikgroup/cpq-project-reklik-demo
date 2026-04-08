import type { DealSetup, DealType, YearAdjustment } from '@/types/quote';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { parseDealId } from '@/hooks/useQuote';

interface DealSetupPanelProps {
  deal: DealSetup;
  onUpdateDeal: (updates: Partial<DealSetup>) => void;
  onUpdateYearAdj: (year: number, updates: Partial<YearAdjustment>) => void;
}

const dealTypes: { value: DealType; label: string }[] = [
  { value: 'new_business', label: 'New Business' },
  { value: 'renewal', label: 'Renewal' },
  { value: 'mid_term_upgrade', label: 'Mid-Term Upgrade' },
];

const termOptions = [1, 2, 3] as const;

export function DealSetupPanel({ deal, onUpdateDeal, onUpdateYearAdj }: DealSetupPanelProps) {
  return (
    <div className="bg-card border rounded-lg p-5 space-y-5">
      <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">Step 1 — Deal Setup</h2>

      {/* Deal Type */}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Deal Type</Label>
        <div className="flex gap-1 bg-muted rounded-md p-1">
          {dealTypes.map(dt => (
            <button
              key={dt.value}
              onClick={() => onUpdateDeal({ dealType: dt.value })}
              className={cn(
                'flex-1 text-xs font-medium py-1.5 px-3 rounded transition-colors',
                deal.dealType === dt.value
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {dt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Deal ID */}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Deal ID or HubSpot URL</Label>
        <Input
          placeholder="e.g. 12345 or https://app.hubspot.com/contacts/.../deal/12345"
          value={deal.dealId}
          onChange={e => onUpdateDeal({ dealId: parseDealId(e.target.value) })}
          className="text-sm"
        />
        {deal.dealId && (
          <p className="text-xs text-muted-foreground">Parsed Deal ID: <span className="font-mono font-semibold text-foreground">{deal.dealId}</span></p>
        )}
      </div>

      {/* Renewal Deal ID */}
      {deal.dealType === 'mid_term_upgrade' && (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Renewal Deal ID</Label>
          <Input
            placeholder="Renewal deal ID"
            value={deal.renewalDealId}
            onChange={e => onUpdateDeal({ renewalDealId: parseDealId(e.target.value) })}
            className="text-sm"
          />
        </div>
      )}

      {/* Term Length */}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Term Length</Label>
        <div className="flex gap-1 bg-muted rounded-md p-1">
          {termOptions.map(yr => (
            <button
              key={yr}
              onClick={() => onUpdateDeal({ termYears: yr })}
              className={cn(
                'flex-1 text-xs font-medium py-1.5 px-3 rounded transition-colors',
                deal.termYears === yr
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {yr} Year{yr > 1 ? 's' : ''}
            </button>
          ))}
        </div>
      </div>

      {/* Year Adjustments */}
      <div className="space-y-3">
        <Label className="text-xs text-muted-foreground">Year-Level Adjustments</Label>
        {Array.from({ length: deal.termYears }, (_, i) => i + 1).map(yr => {
          const adj = deal.yearAdjustments[yr];
          return (
            <div key={yr} className="bg-muted/50 rounded-md p-3 space-y-2">
              <span className="text-xs font-semibold">Year {yr}</span>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[10px] text-muted-foreground">Discount %</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={adj.discountPct || ''}
                    onChange={e => onUpdateYearAdj(yr, { discountPct: parseFloat(e.target.value) || 0 })}
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">Increase %</Label>
                  <Input
                    type="number"
                    min={0}
                    value={adj.increasePct || ''}
                    onChange={e => onUpdateYearAdj(yr, { increasePct: parseFloat(e.target.value) || 0 })}
                    className="h-8 text-xs"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id={`applyAll-${yr}`}
                  checked={adj.applyToAll}
                  onCheckedChange={(checked) => onUpdateYearAdj(yr, { applyToAll: !!checked })}
                />
                <label htmlFor={`applyAll-${yr}`} className="text-xs text-muted-foreground">Apply to all lines</label>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
