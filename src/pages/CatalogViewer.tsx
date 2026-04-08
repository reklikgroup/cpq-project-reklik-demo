import catalogData from '@/data/products.json';
import type { ProductCatalog } from '@/types/quote';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/pricing';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const catalog = catalogData as ProductCatalog;

const CatalogViewer = () => {
  return (
    <div className="p-4 lg:p-6 space-y-4">
      <h1 className="text-xl font-bold">Product Catalog</h1>
      <p className="text-sm text-muted-foreground">Read-only view of all products and SKUs</p>

      <div className="bg-card border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>SKU Code</TableHead>
              <TableHead>SKU Name</TableHead>
              <TableHead>Model</TableHead>
              <TableHead>Base Price</TableHead>
              <TableHead>Recurring</TableHead>
              <TableHead>Variants</TableHead>
              <TableHead>Tiers</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {catalog.products.flatMap(product =>
              product.skus.map(sku => (
                <TableRow key={sku.id}>
                  <TableCell className="font-medium">{product.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px]">{product.category}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{sku.sku_code}</TableCell>
                  <TableCell>{sku.name}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-[10px]">{sku.pricing_model}</Badge>
                  </TableCell>
                  <TableCell>{sku.base_price ? formatCurrency(sku.base_price) : '—'}</TableCell>
                  <TableCell>{sku.recurring ? 'Yes' : 'No'}</TableCell>
                  <TableCell className="text-xs">
                    {sku.variants.length > 0
                      ? sku.variants.map(v => v.name).join(', ')
                      : '—'}
                  </TableCell>
                  <TableCell className="text-xs">{sku.volume_tiers.length || '—'}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default CatalogViewer;
