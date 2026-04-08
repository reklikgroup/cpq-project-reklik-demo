import { useState, useMemo } from 'react';
import type { Product, SKU, ProductCatalog } from '@/types/quote';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Search, Plus } from 'lucide-react';
import { formatCurrency } from '@/lib/pricing';

interface SkuBrowserProps {
  catalog: ProductCatalog;
  onAddSku: (sku: SKU, productName: string) => void;
}

export function SkuBrowser({ catalog, onAddSku }: SkuBrowserProps) {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const filteredProducts = useMemo(() => {
    return catalog.products
      .filter(p => !selectedCategory || p.category === selectedCategory)
      .map(p => ({
        ...p,
        skus: p.skus.filter(
          s =>
            s.active &&
            (s.name.toLowerCase().includes(search.toLowerCase()) ||
              s.sku_code.toLowerCase().includes(search.toLowerCase()) ||
              p.name.toLowerCase().includes(search.toLowerCase()))
        ),
      }))
      .filter(p => p.skus.length > 0);
  }, [catalog, search, selectedCategory]);

  return (
    <div className="flex flex-col h-full bg-card border rounded-lg">
      <div className="p-3 border-b space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide">Step 2 — Add Products</h2>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search SKUs..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          <button
            onClick={() => setSelectedCategory(null)}
            className={cn(
              'text-[10px] px-2 py-0.5 rounded-full font-medium transition-colors',
              !selectedCategory ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
            )}
          >
            All
          </button>
          {catalog.categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat === selectedCategory ? null : cat)}
              className={cn(
                'text-[10px] px-2 py-0.5 rounded-full font-medium transition-colors',
                selectedCategory === cat
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {filteredProducts.map(product =>
          product.skus.map(sku => (
            <button
              key={sku.id}
              onClick={() => onAddSku(sku, product.name)}
              className="w-full text-left p-2.5 rounded-md hover:bg-accent/50 transition-colors group flex items-start gap-2"
            >
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{sku.name}</p>
                <p className="text-[10px] text-muted-foreground truncate">{product.name}</p>
                <div className="flex items-center gap-1 mt-1">
                  <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4">{sku.pricing_model}</Badge>
                  {!sku.recurring && (
                    <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4">One-time</Badge>
                  )}
                  {sku.base_price ? (
                    <span className="text-[10px] text-muted-foreground">{formatCurrency(sku.base_price)}</span>
                  ) : null}
                </div>
              </div>
              <Plus className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity mt-0.5" />
            </button>
          ))
        )}
        {filteredProducts.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-8">No SKUs found</p>
        )}
      </div>
    </div>
  );
}
