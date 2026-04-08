import { useState } from 'react';
import type { QuoteLineItem, DealSetup, LineYearOverride } from '@/types/quote';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  calculateLineTotal,
  getUnitPrice,
  getCalculatedUnitPrice,
  formatCurrency,
  parseTierBuckets,
  TIERED_MODELS,
} from '@/lib/pricing';
import { ChevronDown, ChevronRight, Trash2, RotateCcw, AlertTriangle } from 'lucide-react';

interface LiveQuoteProps {
  deal: DealSetup;
  lineItems: QuoteLineItem[];
  getYearItems: (year: number) => QuoteLineItem[];
  getYearSubtotal: (year: number) => number;
  onUpdateLineItem: (id: string, updates: Partial<QuoteLineItem>) => void;
  onUpdateLineItemYear: (id: string, year: number, updates: Partial<LineYearOverride>) => void;
  onRemoveLineItem: (id: string) => void;
  allSkuIds: Set<string>;
}

function YearSection({
  year,
  items,
  deal,
  subtotal,
  onUpdateLineItem,
  onUpdateLineItemYear,
  onRemoveLineItem,
  allSkuIds,
}: {
  year: number;
  items: QuoteLineItem[];
  deal: DealSetup;
  subtotal: number;
  onUpdateLineItem: (id: string, updates: Partial<QuoteLineItem>) => void;
  onUpdateLineItemYear: (id: string, year: number, updates: Partial<LineYearOverride>) => void;
  onRemoveLineItem: (id: string) => void;
  allSkuIds: Set<string>;
}) {
  const [open, setOpen] = useState(true);
  const yearAdj = deal.yearAdjustments[year] || { discountPct: 0, increasePct: 0, applyToAll: true };
  const hasYearAdj = yearAdj.discountPct > 0 || yearAdj.increasePct > 0;

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-muted/30 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <span className="text-sm font-semibold">Year {year}</span>
          <Badge variant="secondary" className="text-[10px]">{items.length} items</Badge>
        </div>
        <span className="text-sm font-bold text-primary">{formatCurrency(subtotal)}</span>
      </button>

      {open && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/20">
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">SKU</th>
                <th className="text-left px-2 py-2 font-medium text-muted-foreground w-28">Tier / Variant</th>
                <th className="text-center px-2 py-2 font-medium text-muted-foreground w-16">Qty</th>
                <th className="text-right px-2 py-2 font-medium text-muted-foreground w-24">Unit $</th>
                {hasYearAdj && <th className="text-center px-2 py-2 font-medium text-muted-foreground w-16">Yr Adj</th>}
                {hasYearAdj && !yearAdj.applyToAll && (
                  <th className="text-center px-2 py-2 font-medium text-muted-foreground w-14">Opt-In</th>
                )}
                <th className="text-center px-2 py-2 font-medium text-muted-foreground w-16">Inc %</th>
                <th className="text-center px-2 py-2 font-medium text-muted-foreground w-16">Disc %</th>
                <th className="text-right px-2 py-2 font-medium text-muted-foreground w-24">Total</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => {
                const yearOvr = item.yearOverrides?.[year] || {};
                const unitPrice = getUnitPrice(item, deal.dealType, year);
                const total = calculateLineTotal(item, yearAdj, year, deal.dealType);
                const hasOverride = yearOvr.unitPriceOverride !== undefined && yearOvr.unitPriceOverride !== null;
                const isTiered = TIERED_MODELS.includes(item.pricingModel);
                const buckets = isTiered ? parseTierBuckets(item.pricingModel, item.volumeTiers) : [];
                const isQtyEditable = item.pricingModel === 'per_seat' || item.pricingModel === 'variable';
                const calcPrice = getCalculatedUnitPrice(item, deal.dealType);

                const incPct = yearOvr.manualIncreasePct ?? item.manualIncreasePct ?? 0;
                const discPct = yearOvr.manualDiscountPct ?? item.manualDiscountPct ?? 0;

                // Dependency warnings
                const unmetDeps = item.dependencies.filter(d => !allSkuIds.has(d.depends_on_sku_id));

                return (
                  <tr key={item.id} className="border-b last:border-0 hover:bg-muted/10">
                    <td className="px-3 py-2">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium">{item.skuName}</span>
                        <div className="flex items-center gap-1">
                          <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5">{item.pricingModel}</Badge>
                          {item.source === 'hubspot' && (
                            <Badge className="text-[8px] px-1 py-0 h-3.5 bg-warning/20 text-warning-foreground">HS</Badge>
                          )}
                          {!item.recurring && year === 1 && (
                            <Badge variant="secondary" className="text-[8px] px-1 py-0 h-3.5">One-time</Badge>
                          )}
                        </div>
                        {unmetDeps.map(dep => (
                          <div key={dep.depends_on_sku_id} className="flex items-center gap-1 mt-1 text-[10px] text-warning-foreground bg-warning/20 rounded px-1.5 py-0.5">
                            <AlertTriangle className="h-3 w-3 text-warning" />
                            <span>{dep.message}</span>
                          </div>
                        ))}
                      </div>
                    </td>

                    {/* Tier/Variant */}
                    <td className="px-2 py-2">
                      {item.variants.length > 0 ? (
                        <Select
                          value={item.selectedVariantId || ''}
                          onValueChange={v => onUpdateLineItem(item.id, { selectedVariantId: v, unitPriceOverride: null })}
                        >
                          <SelectTrigger className="h-7 text-[10px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {item.variants.map(v => (
                              <SelectItem key={v.id} value={v.id} className="text-xs">
                                {v.name} — {formatCurrency(v.price)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : isTiered && buckets.length > 0 ? (
                        <Select
                          value={item.selectedTierIndex?.toString() || '0'}
                          onValueChange={v => onUpdateLineItem(item.id, { selectedTierIndex: parseInt(v), unitPriceOverride: null })}
                        >
                          <SelectTrigger className="h-7 text-[10px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {buckets.map((b, i) => (
                              <SelectItem key={i} value={i.toString()} disabled={b.isTBD} className="text-xs">
                                {b.label} — {formatCurrency(b.totalPrice)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>

                    {/* Qty */}
                    <td className="px-2 py-2 text-center">
                      {isQtyEditable ? (
                        <Input
                          type="number"
                          min={1}
                          value={item.quantity}
                          onChange={e => onUpdateLineItem(item.id, { quantity: parseInt(e.target.value) || 1 })}
                          className="h-7 w-14 text-center text-xs mx-auto"
                        />
                      ) : (
                        <span>1</span>
                      )}
                    </td>

                    {/* Unit Price — always editable */}
                    <td className="px-2 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Input
                          type="number"
                          min={0}
                          step={0.01}
                          value={unitPrice}
                          onChange={e => onUpdateLineItemYear(item.id, year, { unitPriceOverride: parseFloat(e.target.value) || 0 })}
                          className={cn('h-7 w-20 text-right text-xs', hasOverride && 'border-warning text-warning-foreground')}
                        />
                        {hasOverride && (
                          <button
                            onClick={() => onUpdateLineItemYear(item.id, year, { unitPriceOverride: undefined })}
                            title={`Reset to ${formatCurrency(calcPrice)}`}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <RotateCcw className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </td>

                    {/* Year Adj display */}
                    {hasYearAdj && (
                      <td className="px-2 py-2 text-center text-[10px] text-muted-foreground">
                        {yearAdj.increasePct > 0 && <span className="text-success">+{yearAdj.increasePct}%</span>}
                        {yearAdj.increasePct > 0 && yearAdj.discountPct > 0 && ' / '}
                        {yearAdj.discountPct > 0 && <span className="text-destructive">-{yearAdj.discountPct}%</span>}
                      </td>
                    )}

                    {/* Opt-in checkbox */}
                    {hasYearAdj && !yearAdj.applyToAll && (
                      <td className="px-2 py-2 text-center">
                        <Checkbox
                          checked={!item.yearOverride}
                          onCheckedChange={checked => onUpdateLineItem(item.id, { yearOverride: !checked })}
                        />
                      </td>
                    )}

                    {/* Inc % (year-specific) */}
                    <td className="px-2 py-2">
                      <Input
                        type="number"
                        min={0}
                        value={incPct || ''}
                        onChange={e => onUpdateLineItemYear(item.id, year, { manualIncreasePct: parseFloat(e.target.value) || 0 })}
                        className="h-7 w-14 text-center text-xs mx-auto"
                      />
                    </td>

                    {/* Disc % (year-specific) */}
                    <td className="px-2 py-2">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={discPct || ''}
                        onChange={e => onUpdateLineItemYear(item.id, year, { manualDiscountPct: parseFloat(e.target.value) || 0 })}
                        className="h-7 w-14 text-center text-xs mx-auto"
                      />
                    </td>

                    {/* Total */}
                    <td className="px-2 py-2 text-right font-semibold">{formatCurrency(total)}</td>

                    {/* Delete */}
                    <td className="px-2 py-2">
                      {year === 1 && (
                        <button
                          onClick={() => onRemoveLineItem(item.id)}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {items.length === 0 && (
                <tr>
                  <td colSpan={10} className="text-center py-8 text-muted-foreground">
                    No items — add products from the left panel
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function LiveQuote({ deal, lineItems, getYearItems, getYearSubtotal, onUpdateLineItem, onUpdateLineItemYear, onRemoveLineItem, allSkuIds }: LiveQuoteProps) {
  return (
    <div className="space-y-3">
      {Array.from({ length: deal.termYears }, (_, i) => i + 1).map(yr => (
        <YearSection
          key={yr}
          year={yr}
          items={getYearItems(yr)}
          deal={deal}
          subtotal={getYearSubtotal(yr)}
          onUpdateLineItem={onUpdateLineItem}
          onUpdateLineItemYear={onUpdateLineItemYear}
          onRemoveLineItem={onRemoveLineItem}
          allSkuIds={allSkuIds}
        />
      ))}
    </div>
  );
}