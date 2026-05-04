import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Download, CalendarIcon } from 'lucide-react';
import { format, parseISO, addYears, addDays, isValid, parse, differenceInMonths } from 'date-fns';
import { cn } from '@/lib/utils';
import type { DealType, DealSetup, YearAdjustment } from '@/types/quote';

interface DealSetupPanelProps {
  deal: DealSetup;
  onSetDealType: (dt: DealType) => void;
  onSetDealId: (id: string) => void;
  onSetRenewalDealId: (id: string) => void;
  onSetTermYears: (years: 1 | 2 | 3 | 4 | 5 | 6 | 7) => void;
  onSetContractStartDate: (iso: string | null) => void;
  onSetContractEndDate: (iso: string | null) => void;
  onSetYearAdjustment: (year: number, adj: Partial<YearAdjustment>) => void;
  onSetEventName: (year: number, name: string) => void;
  onFetchLineItems: (dealId: string) => void;
  isFetching: boolean;
}

function toIso(d: Date | undefined): string | null {
  return d ? format(d, 'yyyy-MM-dd') : null;
}
function fromIso(iso: string | null): Date | undefined {
  return iso ? parseISO(iso) : undefined;
}

const DATE_FORMATS = ['MM/dd/yyyy', 'M/d/yyyy', 'yyyy-MM-dd', 'MMM d yyyy', 'MMMM d yyyy', 'MMM d, yyyy', 'MMMM d, yyyy'];
function tryParseDate(input: string): Date | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  for (const fmt of DATE_FORMATS) {
    const d = parse(trimmed, fmt, new Date());
    if (isValid(d)) return d;
  }
  const d = new Date(trimmed);
  return isValid(d) ? d : null;
}

interface DateFieldProps {
  value: Date | undefined;
  onChange: (d: Date | undefined) => void;
  placeholder?: string;
  disabled?: (date: Date) => boolean;
  defaultMonth?: Date;
}

function DateField({ value, onChange, placeholder, disabled, defaultMonth }: DateFieldProps) {
  const [text, setText] = useState(value ? format(value, 'MM/dd/yyyy') : '');
  const [open, setOpen] = useState(false);
  const currentYear = new Date().getFullYear();

  useEffect(() => {
    setText(value ? format(value, 'MM/dd/yyyy') : '');
  }, [value]);

  const commitText = () => {
    if (!text.trim()) {
      onChange(undefined);
      return;
    }
    const parsed = tryParseDate(text);
    if (parsed) {
      onChange(parsed);
      setText(format(parsed, 'MM/dd/yyyy'));
    } else {
      // revert to last valid
      setText(value ? format(value, 'MM/dd/yyyy') : '');
    }
  };

  return (
    <div className="relative">
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commitText}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.currentTarget.blur();
          }
        }}
        placeholder={placeholder ?? 'MM/DD/YYYY'}
        className="h-10 pr-10"
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
            aria-label="Open calendar"
          >
            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="single"
            selected={value}
            defaultMonth={value ?? defaultMonth}
            onSelect={(d) => {
              onChange(d ?? undefined);
              if (d) setOpen(false);
            }}
            disabled={disabled}
            captionLayout="dropdown-buttons"
            fromYear={currentYear - 5}
            toYear={currentYear + 15}
            initialFocus
            className={cn('p-3 pointer-events-auto')}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

const dealTypes: { value: DealType; label: string }[] = [
  { value: 'new_business', label: 'New Business' },
  { value: 'renewal', label: 'Renewal' },
  { value: 'mid_term_upgrade', label: 'Mid-Term Upgrade' },
];

const termOptions: (1 | 2 | 3 | 4 | 5 | 6 | 7)[] = [1, 2, 3, 4, 5, 6, 7];

export function DealSetupPanel({
  deal,
  onSetDealType,
  onSetDealId,
  onSetRenewalDealId,
  onSetTermYears,
  onSetContractStartDate,
  onSetContractEndDate,
  onSetYearAdjustment,
  onSetEventName,
  onFetchLineItems,
  isFetching,
}: DealSetupPanelProps) {
  const startDate = fromIso(deal.contractStartDate);
  const endDate = fromIso(deal.contractEndDate);

  const syncTermFromDates = (s: Date | undefined, e: Date | undefined) => {
    if (!s || !e || e < s) return;
    const months = differenceInMonths(addDays(e, 1), s);
    if (months <= 0) return;
    const years = Math.min(7, Math.max(1, Math.round(months / 12))) as 1 | 2 | 3 | 4 | 5 | 6 | 7;
    if (years !== deal.termYears) onSetTermYears(years);
  };

  const handleStartChange = (d: Date | undefined) => {
    const iso = toIso(d);
    onSetContractStartDate(iso);
    // Auto-fill end date if empty: start + termYears years - 1 day
    if (d && !deal.contractEndDate) {
      const suggested = addDays(addYears(d, deal.termYears), -1);
      onSetContractEndDate(toIso(suggested));
      return;
    }
    syncTermFromDates(d, endDate);
  };

  const handleEndChange = (d: Date | undefined) => {
    onSetContractEndDate(toIso(d));
    syncTermFromDates(startDate, d);
  };

  return (
    <div className="bg-card rounded-lg border p-6 space-y-5 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Step 1 — Deal Setup
      </h2>

      {/* Deal Type Toggle */}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Deal Type</Label>
        <div className="inline-flex rounded-lg border bg-muted p-0.5 gap-0.5">
          {dealTypes.map((dt) => (
            <button
              key={dt.value}
              onClick={() => onSetDealType(dt.value)}
              className={`px-4 py-1.5 text-sm rounded-md transition-all ${
                deal.dealType === dt.value
                  ? 'bg-primary text-primary-foreground shadow-sm font-medium'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {dt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Deal IDs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="deal-id" className="text-xs text-muted-foreground">
            HubSpot Deal ID or URL
          </Label>
          <div className="flex gap-2">
            <Input
              id="deal-id"
              placeholder="e.g. 12345678 or https://app.hubspot.com/..."
              value={deal.dealId}
              onChange={(e) => onSetDealId(e.target.value)}
            />
            {deal.dealId && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onFetchLineItems(deal.dealId)}
                disabled={isFetching}
                className="shrink-0"
              >
                {isFetching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                <span className="ml-1.5 text-xs">Pull</span>
              </Button>
            )}
          </div>
          {deal.dealId && (
            <p className="text-xs text-success">Deal ID: {deal.dealId}</p>
          )}
        </div>

        {deal.dealType === 'mid_term_upgrade' && (
          <div className="space-y-1.5">
            <Label htmlFor="renewal-deal-id" className="text-xs text-muted-foreground">
              Renewal Deal ID or URL
            </Label>
            <Input
              id="renewal-deal-id"
              placeholder="Renewal deal to append upgrade to"
              value={deal.renewalDealId}
              onChange={(e) => onSetRenewalDealId(e.target.value)}
            />
            {deal.renewalDealId && (
              <p className="text-xs text-success">Renewal Deal ID: {deal.renewalDealId}</p>
            )}
          </div>
        )}
      </div>

      {/* Term Length */}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Term Length</Label>
        <Select
          value={String(deal.termYears)}
          onValueChange={(v) => onSetTermYears(Number(v) as 1 | 2 | 3 | 4 | 5 | 6 | 7)}
        >
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {termOptions.map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y} Year{y > 1 ? 's' : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Contract Dates */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Contract Start Date</Label>
          <DateField
            value={startDate}
            onChange={handleStartChange}
            placeholder="MM/DD/YYYY"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Contract End Date</Label>
          <DateField
            value={endDate}
            onChange={handleEndChange}
            placeholder="MM/DD/YYYY"
            disabled={(date) => (startDate ? date < startDate : false)}
            defaultMonth={startDate ? addYears(startDate, 1) : undefined}
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Term (months)</Label>
          <Input
            readOnly
            value={
              startDate && endDate && endDate >= startDate
                ? String(differenceInMonths(addDays(endDate, 1), startDate))
                : ''
            }
            placeholder="—"
            className="h-10 bg-muted"
          />
        </div>
      </div>

      {/* Year Adjustments */}
      <div className="space-y-3">
        <Label className="text-xs text-muted-foreground">Year-Level Adjustments</Label>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {Array.from({ length: deal.termYears }, (_, i) => i + 1).map((year) => {
            const adj = deal.yearAdjustments[year];
            const discMode = adj.discountMode ?? 'pct';
            const incMode = adj.increaseMode ?? 'pct';
            return (
              <div
                key={year}
                className="rounded-lg border bg-muted/50 p-3 space-y-2"
              >
                <span className="text-xs font-semibold text-foreground">
                  Year {year}
                </span>
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Event Name
                  </Label>
                  <Input
                    value={deal.eventNames?.[year] ?? ''}
                    onChange={(e) => onSetEventName(year, e.target.value)}
                    placeholder="e.g. Annual Conference 2026"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Discount
                    </Label>
                    <div className="flex items-stretch gap-1">
                      <Input
                        type="number"
                        min={0}
                        max={discMode === 'pct' ? 100 : undefined}
                        value={
                          discMode === 'pct'
                            ? adj.discountPct || ''
                            : adj.discountAmt || ''
                        }
                        onChange={(e) => {
                          const v = parseFloat(e.target.value) || 0;
                          onSetYearAdjustment(
                            year,
                            discMode === 'pct' ? { discountPct: v } : { discountAmt: v }
                          );
                        }}
                        className="h-8 text-sm flex-1 min-w-0"
                        placeholder="0"
                      />
                      <Select
                        value={discMode}
                        onValueChange={(v) =>
                          onSetYearAdjustment(year, { discountMode: v as 'pct' | 'amount' })
                        }
                      >
                        <SelectTrigger className="h-8 w-12 px-2 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pct" className="text-xs">%</SelectItem>
                          <SelectItem value="amount" className="text-xs">$</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Increase
                    </Label>
                    <div className="flex items-stretch gap-1">
                      <Input
                        type="number"
                        min={0}
                        value={
                          incMode === 'pct'
                            ? adj.increasePct || ''
                            : adj.increaseAmt || ''
                        }
                        onChange={(e) => {
                          const v = parseFloat(e.target.value) || 0;
                          onSetYearAdjustment(
                            year,
                            incMode === 'pct' ? { increasePct: v } : { increaseAmt: v }
                          );
                        }}
                        className="h-8 text-sm flex-1 min-w-0"
                        placeholder="0"
                      />
                      <Select
                        value={incMode}
                        onValueChange={(v) =>
                          onSetYearAdjustment(year, { increaseMode: v as 'pct' | 'amount' })
                        }
                      >
                        <SelectTrigger className="h-8 w-12 px-2 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pct" className="text-xs">%</SelectItem>
                          <SelectItem value="amount" className="text-xs">$</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id={`apply-all-${year}`}
                    checked={adj.applyToAll}
                    onCheckedChange={(checked) =>
                      onSetYearAdjustment(year, { applyToAll: !!checked })
                    }
                  />
                  <Label htmlFor={`apply-all-${year}`} className="text-xs text-muted-foreground cursor-pointer">
                    Apply to all lines
                  </Label>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}