import { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { Search, Plus, ChevronDown } from 'lucide-react';
import type { Product, SKU, ProductCatalog } from '@/types/quote';
import { formatCurrency } from '@/lib/pricing';

interface SkuBrowserProps {
  catalog: ProductCatalog;
  termYears: number;
  onAddSku: (sku: SKU, productName: string, options?: { category?: string; years?: number[]; skuGroup?: string }) => void;
}

function YearPickerPopover({
  termYears,
  onAdd,
}: {
  termYears: number;
  onAdd: (years: number[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const toggle = (y: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(y)) next.delete(y); else next.add(y);
      return next;
    });
  };

  const handleAdd = () => {
    if (selected.size === 0) return;
    onAdd(Array.from(selected).sort((a, b) => a - b));
    setSelected(new Set());
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
        <button
          className="p-1 rounded hover:bg-muted shrink-0"
          title="Add to specific years"
        >
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-48 p-3 space-y-2"
        align="end"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-xs font-semibold text-muted-foreground">Add to years</p>
        <div className="space-y-1.5 max-h-48 overflow-y-auto">
          {Array.from({ length: termYears }, (_, i) => i + 1).map((y) => (
            <label key={y} className="flex items-center gap-2 text-xs cursor-pointer">
              <Checkbox
                checked={selected.has(y)}
                onCheckedChange={() => toggle(y)}
              />
              Year {y}
            </label>
          ))}
        </div>
        <Button
          size="sm"
          className="w-full h-7 text-xs"
          disabled={selected.size === 0}
          onClick={handleAdd}
        >
          Add
        </Button>
      </PopoverContent>
    </Popover>
  );
}

export function SkuBrowser({ catalog, termYears, onAddSku }: SkuBrowserProps) {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  const activeSkus = useMemo(() => {
    const results: { sku: SKU; product: Product }[] = [];
    for (const product of catalog.products) {
      for (const sku of product.skus) {
        if (!sku.active) continue;
        if (categoryFilter && product.category !== categoryFilter) continue;
        if (
          search &&
          !sku.name.toLowerCase().includes(search.toLowerCase()) &&
          !product.name.toLowerCase().includes(search.toLowerCase())
        ) continue;
        results.push({ sku, product });
      }
    }
    return results;
  }, [catalog, search, categoryFilter]);

  return (
    <div className="bg-card rounded-lg border shadow-sm flex flex-col h-full">
      <div className="p-4 border-b space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          SKU Browser
        </h3>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search SKUs..."
            className="pl-8 h-8 text-sm"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setCategoryFilter(null)}
            className={`text-xs px-2.5 py-1 rounded-md transition-all ${
              !categoryFilter
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            All
          </button>
          {catalog.categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`text-xs px-2.5 py-1 rounded-md transition-all ${
                categoryFilter === cat
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {activeSkus.map(({ sku, product }) => (
          <div
            key={sku.id}
            className="w-full p-3 rounded-md hover:bg-accent/60 transition-colors group flex items-center justify-between gap-2"
          >
            <button
              type="button"
              onClick={() => onAddSku(sku, product.name, { category: product.category, skuGroup: (product as any).sku_group })}
              className="text-left min-w-0 flex-1"
              title="Add to all eligible years"
            >
              <p className="text-sm font-medium text-foreground truncate">
                {sku.name}
              </p>
              {(sku as any).description && (
                <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                  {(sku as any).description}
                </p>
              )}
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  {sku.pricing_model}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {sku.pricing_model === 'variable'
                    ? `${formatCurrency(sku.base_price ?? 0)} ${(sku as any).variable_unit ?? ''}`
                    : sku.pricing_model === 'deal_type_based'
                    ? `${formatCurrency((sku as any).price_new ?? 0)} (new) / ${formatCurrency((sku as any).price_repeat ?? 0)} (repeat)`
                    : sku.base_price != null
                    ? `${formatCurrency(sku.base_price)}${sku.pricing_model === 'per_seat' ? '/seat' : ''}`
                    : 'Tiered'}
                </span>
                {!sku.recurring && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    One-time
                  </Badge>
                )}
              </div>
            </button>
            <div className="flex items-center gap-0.5 shrink-0">
              <button
                type="button"
                onClick={() => onAddSku(sku, product.name, { category: product.category, skuGroup: (product as any).sku_group })}
                className="p-1 rounded hover:bg-muted"
                title="Add to all eligible years"
              >
                <Plus className="h-4 w-4 text-muted-foreground" />
              </button>
              {termYears > 1 && (
                <YearPickerPopover
                  termYears={termYears}
                  onAdd={(years) => onAddSku(sku, product.name, { category: product.category, skuGroup: (product as any).sku_group, years })}
                />
              )}
            </div>
          </div>
        ))}
        {activeSkus.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">No SKUs found</p>
        )}
      </div>
    </div>
  );
}
