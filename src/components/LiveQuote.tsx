import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Trash2, AlertTriangle, ChevronDown, ChevronRight, Pencil, RotateCcw, CalendarDays, Layers, Plus } from 'lucide-react';
import { useState, useMemo, Fragment } from 'react';
import { SKU_GROUPS, type QuoteLineItem, type YearAdjustment, type DealType } from '@/types/quote';
import {
  calculateLineTotal, getUnitPrice, getCalculatedUnitPrice,
  shouldApplyYearAdj, formatCurrency, isTieredModel, parseTierBuckets,
  getTermMonths,
} from '@/lib/pricing';

interface LiveQuoteProps {
  lineItems: QuoteLineItem[];
  termYears: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  yearAdjustments: Record<number, YearAdjustment>;
  eventNames: Record<number, string>;
  dealType: DealType;
  getYearItems: (year: number) => QuoteLineItem[];
  onUpdateLineItem: (id: string, updates: Partial<QuoteLineItem>) => void;
  onRemoveLineItem: (id: string) => void;
  onSetEventName: (year: number, name: string) => void;
  onAddBlankLineItem: (year: number) => void;
  skuIdsInQuote: string[];
}

function categoryBadgeClass(category?: string): string {
  const key = (category || '').toLowerCase();
  if (key.includes('platform')) return 'bg-blue-100 text-blue-700 hover:bg-blue-100 border-0';
  if (key.includes('studio')) return 'bg-purple-100 text-purple-700 hover:bg-purple-100 border-0';
  if (key.includes('cloud')) return 'bg-amber-100 text-amber-700 hover:bg-amber-100 border-0';
  return 'bg-slate-100 text-slate-700 hover:bg-slate-100 border-0';
}

function ItemBadges({ item }: { item: QuoteLineItem }) {
  if (item.source === 'hubspot') {
    return <Badge variant="secondary" className="text-[9px] ml-2 font-normal">From HubSpot</Badge>;
  }
  return (
    <>
      {item.category && (
        <Badge className={`text-[9px] ml-2 font-normal ${categoryBadgeClass(item.category)}`}>
          {item.category}
        </Badge>
      )}
      <Badge variant="outline" className="text-[9px] ml-1 font-normal">
        {item.recurring ? 'Recurring' : 'One-time'}
      </Badge>
    </>
  );
}

function UnitPriceCell({
  item, year, onUpdateLineItem, dealType,
}: {
  item: QuoteLineItem; year: number; dealType: DealType;
  onUpdateLineItem: (id: string, updates: Partial<QuoteLineItem>) => void;
}) {
  const currentPrice = getUnitPrice(item, dealType);
  const calculatedPrice = getCalculatedUnitPrice(item, dealType);
  const isOverridden = item.unitPriceOverride !== null && item.unitPriceOverride !== undefined;
  const isCustomModel = item.pricingModel === 'custom';

  return (
    <div className="flex items-center gap-1 justify-end">
      {isOverridden && !isCustomModel && (
        <button
          onClick={() => onUpdateLineItem(item.id, { unitPriceOverride: null })}
          className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
          title={`Reset to ${formatCurrency(calculatedPrice)}`}
        >
          <RotateCcw className="h-3 w-3" />
        </button>
      )}
      <div className="relative">
        <Input
          type="number"
          min={0}
          step={0.01}
          value={currentPrice}
          onChange={(e) => {
            const val = parseFloat(e.target.value);
            if (!isNaN(val)) {
              onUpdateLineItem(item.id, { unitPriceOverride: val });
            }
          }}
          className={`h-7 w-24 text-xs text-right pr-1 ${isOverridden && !isCustomModel ? 'border-amber-400 bg-amber-50' : ''}`}
        />
        {isOverridden && !isCustomModel && (
          <Pencil className="h-2.5 w-2.5 text-amber-500 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        )}
      </div>
    </div>
  );
}

function TierSelector({
  item, onUpdateLineItem,
}: {
  item: QuoteLineItem;
  onUpdateLineItem: (id: string, updates: Partial<QuoteLineItem>) => void;
}) {
  const buckets = parseTierBuckets(item.pricingModel, item.volumeTiers);
  if (buckets.length === 0) return <span className="text-xs text-muted-foreground">—</span>;

  return (
    <TooltipProvider>
      <Select
        value={item.selectedTierIndex?.toString() ?? ''}
        onValueChange={(v) => {
          const idx = parseInt(v);
          const bucket = buckets[idx];
          if (bucket && !bucket.isTBD) {
            onUpdateLineItem(item.id, { selectedTierIndex: idx, unitPriceOverride: null });
          }
        }}
      >
        <SelectTrigger className="h-7 text-xs w-40">
          <SelectValue placeholder="Select tier..." />
        </SelectTrigger>
        <SelectContent>
          {buckets.map((bucket, idx) => (
            <Tooltip key={idx}>
              <TooltipTrigger asChild>
                <div>
                  <SelectItem
                    value={idx.toString()}
                    className="text-xs"
                    disabled={bucket.isTBD}
                  >
                    {bucket.isTBD
                      ? `${bucket.label} — Contact for pricing`
                      : `${bucket.label} — ${formatCurrency(bucket.totalPrice!)}`}
                  </SelectItem>
                </div>
              </TooltipTrigger>
              {bucket.isTBD && (
                <TooltipContent side="left" className="max-w-[220px] text-xs">
                  Please contact your account manager for pricing on this tier.
                </TooltipContent>
              )}
            </Tooltip>
          ))}
        </SelectContent>
      </Select>
    </TooltipProvider>
  );
}

function TierPerUnitRef({ item }: { item: QuoteLineItem }) {
  if (item.selectedTierIndex === null) return null;
  const buckets = parseTierBuckets(item.pricingModel, item.volumeTiers);
  const bucket = buckets[item.selectedTierIndex];
  if (!bucket || bucket.isTBD || bucket.perUnitPrice === null) return null;
  return (
    <span className="text-[10px] text-muted-foreground whitespace-nowrap">
      ({formatCurrency(bucket.perUnitPrice)}{bucket.perUnitLabel})
    </span>
  );
}

function DealTypeLabel({ item, dealType }: { item: QuoteLineItem; dealType: DealType }) {
  if (item.pricingModel !== 'deal_type_based') return null;
  const isRenewal = dealType === 'renewal';
  return (
    <Badge variant="outline" className="text-[9px] ml-1 font-normal">
      {isRenewal ? 'Repeat' : 'New'}
    </Badge>
  );
}

type ViewMode = 'year' | 'category';

function CategoryBreakdown({
  termYears, yearAdjustments, dealType, getYearItems,
}: {
  termYears: number;
  yearAdjustments: Record<number, YearAdjustment>;
  dealType: DealType;
  getYearItems: (year: number) => QuoteLineItem[];
}) {
  const years = Array.from({ length: termYears }, (_, i) => i + 1);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const toggle = (cat: string) => setExpanded((e) => ({ ...e, [cat]: !e[cat] }));

  const groups = useMemo(() => {
    // category -> { totalsByYear, total, skus: Map<skuId, { name, totalsByYear, total }> }
    const map = new Map<string, {
      totalsByYear: Record<number, number>;
      total: number;
      skus: Map<string, { name: string; totalsByYear: Record<number, number>; total: number }>;
    }>();

    for (const year of years) {
      const adj = yearAdjustments[year];
      const items = getYearItems(year);
      for (const item of items) {
        const cat = item.category || 'Uncategorized';
        const apply = shouldApplyYearAdj(item, adj);
        const total = calculateLineTotal(item, adj, apply, dealType);
        if (!map.has(cat)) {
          map.set(cat, { totalsByYear: {}, total: 0, skus: new Map() });
        }
        const g = map.get(cat)!;
        g.totalsByYear[year] = (g.totalsByYear[year] || 0) + total;
        g.total += total;

        const skuKey = item.skuId || item.skuName;
        if (!g.skus.has(skuKey)) {
          g.skus.set(skuKey, { name: item.skuName, totalsByYear: {}, total: 0 });
        }
        const s = g.skus.get(skuKey)!;
        s.totalsByYear[year] = (s.totalsByYear[year] || 0) + total;
        s.total += total;
      }
    }
    return Array.from(map.entries())
      .map(([cat, g]) => ({
        cat,
        totalsByYear: g.totalsByYear,
        total: g.total,
        skus: Array.from(g.skus.values()).sort((a, b) => b.total - a.total),
      }))
      .sort((a, b) => b.total - a.total);
  }, [termYears, yearAdjustments, dealType, getYearItems, years]);

  const grandTotal = groups.reduce((s, g) => s + g.total, 0);
  const colSpan = 2 + years.length + 1; // chevron+name, years, total

  return (
    <div className="bg-card rounded-lg border shadow-sm overflow-hidden">
      <div className="border-b bg-muted/30 px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">Breakdown by Category</h3>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/10">
            <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Category / SKU</th>
            <th className="text-center px-3 py-2 text-xs font-medium text-muted-foreground w-16">SKUs</th>
            {years.map((y) => (
              <th key={y} className="text-right px-3 py-2 text-xs font-medium text-muted-foreground w-28">
                Year {y}
              </th>
            ))}
            <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground w-32">Total</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => {
            const isOpen = expanded[g.cat];
            return (
              <Fragment key={g.cat}>
                <tr
                  className="border-b hover:bg-muted/20 transition-colors cursor-pointer"
                  onClick={() => toggle(g.cat)}
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      {isOpen ? (
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                      <Badge className={`text-[10px] font-normal ${categoryBadgeClass(g.cat)}`}>
                        {g.cat}
                      </Badge>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-center text-xs tabular-nums text-muted-foreground">
                    {g.skus.length}
                  </td>
                  {years.map((y) => (
                    <td key={y} className="px-3 py-2.5 text-right tabular-nums text-xs text-muted-foreground">
                      {g.totalsByYear[y] ? formatCurrency(g.totalsByYear[y]) : '—'}
                    </td>
                  ))}
                  <td className="px-4 py-2.5 text-right tabular-nums text-sm font-medium text-foreground">
                    {formatCurrency(g.total)}
                  </td>
                </tr>
                {isOpen && g.skus.map((s, idx) => (
                  <tr key={`${g.cat}-${idx}`} className="border-b last:border-0 bg-muted/10">
                    <td className="px-4 py-2 pl-12 text-xs text-foreground">{s.name}</td>
                    <td />
                    {years.map((y) => (
                      <td key={y} className="px-3 py-2 text-right tabular-nums text-xs text-muted-foreground">
                        {s.totalsByYear[y] ? formatCurrency(s.totalsByYear[y]) : '—'}
                      </td>
                    ))}
                    <td className="px-4 py-2 text-right tabular-nums text-xs font-medium text-foreground">
                      {formatCurrency(s.total)}
                    </td>
                  </tr>
                ))}
              </Fragment>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="bg-muted/30 border-t-2">
            <td className="px-4 py-3 text-xs font-semibold text-foreground">Grand Total</td>
            <td />
            {years.map((y) => {
              const yearTotal = groups.reduce((s, g) => s + (g.totalsByYear[y] || 0), 0);
              return (
                <td key={y} className="px-3 py-3 text-right tabular-nums text-xs font-medium text-foreground">
                  {yearTotal > 0 ? formatCurrency(yearTotal) : '—'}
                </td>
              );
            })}
            <td className="px-4 py-3 text-right tabular-nums text-sm font-semibold text-foreground">
              {formatCurrency(grandTotal)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export function LiveQuote({
  lineItems, termYears, yearAdjustments, eventNames, dealType,
  getYearItems, onUpdateLineItem, onRemoveLineItem, onSetEventName, onAddBlankLineItem, skuIdsInQuote,
}: LiveQuoteProps) {
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});
  const [viewMode, setViewMode] = useState<ViewMode>('year');
  const toggleYear = (year: number) => setCollapsed((c) => ({ ...c, [year]: !c[year] }));

  if (lineItems.length === 0) {
    return (
      <div className="bg-card rounded-lg border shadow-sm p-12 flex items-center justify-center min-h-[300px]">
        <p className="text-sm text-muted-foreground">
          Add SKUs from the browser to start building your quote.
        </p>
      </div>
    );
  }

  const years = Array.from({ length: termYears }, (_, i) => i + 1);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <ToggleGroup
          type="single"
          value={viewMode}
          onValueChange={(v) => v && setViewMode(v as ViewMode)}
          className="bg-muted/40 rounded-md p-0.5"
        >
          <ToggleGroupItem value="year" size="sm" className="h-7 px-3 text-xs gap-1.5 data-[state=on]:bg-background data-[state=on]:shadow-sm">
            <CalendarDays className="h-3.5 w-3.5" />
            By Year
          </ToggleGroupItem>
          <ToggleGroupItem value="category" size="sm" className="h-7 px-3 text-xs gap-1.5 data-[state=on]:bg-background data-[state=on]:shadow-sm">
            <Layers className="h-3.5 w-3.5" />
            By Category
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {viewMode === 'category' ? (
        <CategoryBreakdown
          termYears={termYears}
          yearAdjustments={yearAdjustments}
          dealType={dealType}
          getYearItems={getYearItems}
        />
      ) : (
        <>
      {years.map((year) => {
        const items = getYearItems(year);
        const adj = yearAdjustments[year];
        const isCollapsed = collapsed[year];

        return (
          <div key={year} className="bg-card rounded-lg border shadow-sm overflow-hidden">
            <button
              onClick={() => toggleYear(year)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-center gap-2">
                {isCollapsed ? (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
                <h3 className="text-sm font-semibold text-foreground">Year {year}</h3>
                <Badge variant="secondary" className="text-[10px]">
                  {items.length} item{items.length !== 1 ? 's' : ''}
                </Badge>
              </div>
              <span className="text-sm font-medium text-foreground tabular-nums">
                {formatCurrency(
                  items.reduce((sum, item) => {
                    const apply = shouldApplyYearAdj(item, adj);
                    return sum + calculateLineTotal(item, adj, apply, dealType);
                  }, 0)
                )}
              </span>
            </button>

            {!isCollapsed && (
              <div className="border-t overflow-x-auto">
                <table className="text-sm min-w-[1800px] w-full">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">SKU</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground w-32">Group</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground w-96">Description</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground w-44">Tier / Variant</th>
                      <th className="text-center px-3 py-2 text-xs font-medium text-muted-foreground w-20">Qty</th>
                      <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground w-32">Unit $</th>
                      <th className="text-center px-3 py-2 text-xs font-medium text-muted-foreground w-16">Yr Adj</th>
                      {!adj.applyToAll && (
                        <th className="text-center px-3 py-2 text-xs font-medium text-muted-foreground w-14">Opt In</th>
                      )}
                      <th className="text-center px-3 py-2 text-xs font-medium text-muted-foreground w-32">Inc</th>
                      <th className="text-center px-3 py-2 text-xs font-medium text-muted-foreground w-32">Disc</th>
                      <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground w-24">Total</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => {
                      const applyAdj = shouldApplyYearAdj(item, adj);
                      const lineTotal = calculateLineTotal(item, adj, applyAdj, dealType);
                      const hasUnmetDeps = item.dependencies.filter(
                        (d) => !skuIdsInQuote.includes(d.depends_on_sku_id)
                      );
                      const showTierSelector = isTieredModel(item.pricingModel) && item.volumeTiers.length > 0;
                      const isVariable = item.pricingModel === 'variable';

                      return (
                        <tr key={`${item.id}-y${year}`} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                          <td className="px-3 py-2">
                            {item.skuId ? (
                              <div className="flex items-center flex-wrap">
                                <span className="font-medium text-foreground">{item.skuName}</span>
                                <ItemBadges item={item} />
                                <DealTypeLabel item={item} dealType={dealType} />
                              </div>
                            ) : (
                              <div className="space-y-1">
                                <Input
                                  value={item.skuName}
                                  onChange={(e) => onUpdateLineItem(item.id, { skuName: e.target.value })}
                                  placeholder="Line item name (e.g. Travel)"
                                  className="h-7 text-xs"
                                />
                                <Badge variant="outline" className="text-[9px] font-normal">Custom</Badge>
                              </div>
                            )}
                            {hasUnmetDeps.length > 0 && year === 1 && (
                              <div className="mt-1 flex items-start gap-1.5 text-xs text-warning-foreground bg-warning/10 rounded px-2 py-1">
                                <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0 text-warning" />
                                <span>{hasUnmetDeps[0].message}</span>
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <Select
                              value={item.skuGroup || '__none__'}
                              onValueChange={(v) => onUpdateLineItem(item.id, { skuGroup: v === '__none__' ? '' : (v as any) })}
                            >
                              <SelectTrigger className="h-7 text-xs w-28">
                                <SelectValue placeholder="—" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__" className="text-xs text-muted-foreground">—</SelectItem>
                                {SKU_GROUPS.map((g) => (
                                  <SelectItem key={g} value={g} className="text-xs">{g}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="px-3 py-2 align-top">
                            <Textarea
                              value={item.description ?? ''}
                              onChange={(e) => onUpdateLineItem(item.id, { description: e.target.value })}
                              placeholder="Description…"
                              rows={2}
                              className="text-xs leading-snug min-h-[44px] py-1.5 resize-y"
                            />
                          </td>
                          <td className="px-3 py-2">
                            {showTierSelector ? (
                              <div className="space-y-1">
                                <TierSelector item={item} onUpdateLineItem={onUpdateLineItem} />
                                <TierPerUnitRef item={item} />
                              </div>
                            ) : item.variants.length > 0 ? (
                              <Select
                                value={item.selectedVariantId || ''}
                                onValueChange={(v) => onUpdateLineItem(item.id, { selectedVariantId: v, unitPriceOverride: null })}
                              >
                                <SelectTrigger className="h-7 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {item.variants.map((v) => (
                                    <SelectItem key={v.id} value={v.id} className="text-xs">
                                      {v.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {(item.pricingModel === 'per_seat' || isVariable) ? (
                              <div className="flex items-center gap-1 justify-center">
                                <Input
                                  type="number"
                                  min={1}
                                  value={item.quantity}
                                  onChange={(e) =>
                                    onUpdateLineItem(item.id, { quantity: parseInt(e.target.value) || 1 })
                                  }
                                  className="h-7 w-14 text-xs text-center"
                                />
                                {isVariable && item.variableUnit && (
                                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                                    {item.variableUnit}
                                  </span>
                                )}
                              </div>
                            ) : !isTieredModel(item.pricingModel) && item.pricingModel !== 'deal_type_based' ? (
                              <Input
                                type="number"
                                min={1}
                                value={item.quantity}
                                onChange={(e) =>
                                  onUpdateLineItem(item.id, { quantity: parseInt(e.target.value) || 1 })
                                }
                                className="h-7 w-14 text-xs text-center mx-auto"
                              />
                            ) : (
                              <span className="text-xs tabular-nums">
                                {isTieredModel(item.pricingModel) ? '—' : item.quantity}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <UnitPriceCell item={item} year={year} onUpdateLineItem={onUpdateLineItem} dealType={dealType} />
                          </td>
                          <td className="px-3 py-2 text-center">
                            {(() => {
                              const incMode = adj.increaseMode ?? 'pct';
                              const discMode = adj.discountMode ?? 'pct';
                              const incActive = applyAdj && (incMode === 'pct' ? adj.increasePct > 0 : (adj.increaseAmt || 0) > 0);
                              const discActive = applyAdj && (discMode === 'pct' ? adj.discountPct > 0 : (adj.discountAmt || 0) > 0);
                              if (!incActive && !discActive) return <span className="text-xs text-muted-foreground">—</span>;
                              return (
                                <div className="flex flex-col items-center gap-0.5">
                                  {incActive && (
                                    <span className="text-[10px] text-success">
                                      +{incMode === 'pct' ? `${adj.increasePct}%` : formatCurrency(adj.increaseAmt || 0)}
                                    </span>
                                  )}
                                  {discActive && (
                                    <span className="text-[10px] text-destructive">
                                      -{discMode === 'pct' ? `${adj.discountPct}%` : formatCurrency(adj.discountAmt || 0)}
                                    </span>
                                  )}
                                </div>
                              );
                            })()}
                          </td>
                          {!adj.applyToAll && (
                            <td className="px-3 py-2 text-center">
                              <Checkbox
                                checked={!item.yearOverride}
                                onCheckedChange={(checked) =>
                                  onUpdateLineItem(item.id, { yearOverride: !checked })
                                }
                              />
                            </td>
                          )}
                          <td className="px-3 py-2">
                            {(() => {
                              const mode = item.manualIncreaseMode ?? 'pct';
                              const val = mode === 'pct' ? item.manualIncreasePct : item.manualIncreaseAmt;
                              return (
                                <div className="flex items-stretch gap-1 justify-center">
                                  <Input
                                    type="number"
                                    min={0}
                                    value={val || ''}
                                    onChange={(e) => {
                                      const v = parseFloat(e.target.value) || 0;
                                      onUpdateLineItem(item.id, mode === 'pct'
                                        ? { manualIncreasePct: v }
                                        : { manualIncreaseAmt: v });
                                    }}
                                    className="h-7 w-14 text-xs text-center"
                                    placeholder="0"
                                  />
                                  <Select
                                    value={mode}
                                    onValueChange={(v) =>
                                      onUpdateLineItem(item.id, { manualIncreaseMode: v as 'pct' | 'amount' })
                                    }
                                  >
                                    <SelectTrigger className="h-7 w-11 px-1.5 text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="pct" className="text-xs">%</SelectItem>
                                      <SelectItem value="amount" className="text-xs">$</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              );
                            })()}
                          </td>
                          <td className="px-3 py-2">
                            {(() => {
                              const mode = item.manualDiscountMode ?? 'pct';
                              const val = mode === 'pct' ? item.manualDiscountPct : item.manualDiscountAmt;
                              return (
                                <div className="flex items-stretch gap-1 justify-center">
                                  <Input
                                    type="number"
                                    min={0}
                                    max={mode === 'pct' ? 100 : undefined}
                                    value={val || ''}
                                    onChange={(e) => {
                                      const v = parseFloat(e.target.value) || 0;
                                      onUpdateLineItem(item.id, mode === 'pct'
                                        ? { manualDiscountPct: v }
                                        : { manualDiscountAmt: v });
                                    }}
                                    className="h-7 w-14 text-xs text-center"
                                    placeholder="0"
                                  />
                                  <Select
                                    value={mode}
                                    onValueChange={(v) =>
                                      onUpdateLineItem(item.id, { manualDiscountMode: v as 'pct' | 'amount' })
                                    }
                                  >
                                    <SelectTrigger className="h-7 w-11 px-1.5 text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="pct" className="text-xs">%</SelectItem>
                                      <SelectItem value="amount" className="text-xs">$</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              );
                            })()}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-sm font-medium">
                            {formatCurrency(lineTotal)}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <button
                              onClick={() => onRemoveLineItem(item.id)}
                              className="text-muted-foreground hover:text-destructive transition-colors p-1"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="border-t bg-muted/10 px-3 py-2">
                  <button
                    onClick={() => onAddBlankLineItem(year)}
                    className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add blank line item
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
        </>
      )}
    </div>
  );
}
