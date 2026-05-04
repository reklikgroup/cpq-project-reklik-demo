import { useEffect, useMemo, useRef, useState } from 'react';
import Papa from 'papaparse';
import {
  Upload,
  Plus,
  Download,
  RotateCcw,
  Trash2,
  Pencil,
  Check,
  X,
  Search,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import catalogData from '@/data/products.json';
import { SKU_GROUPS } from '@/types/quote';

type PricingModel =
  | 'per_seat'
  | 'fixed'
  | 'custom'
  | 'variable'
  | 'deal_type_based'
  | 'tiered_learners'
  | 'tiered_fixed'
  | 'tiered_sponsors'
  | 'tiered_products'
  | 'tiered_hours'
  | 'tiered_count'
  | 'tiered_storage';

const PRICING_MODELS: PricingModel[] = [
  'per_seat',
  'fixed',
  'custom',
  'variable',
  'deal_type_based',
  'tiered_learners',
  'tiered_fixed',
  'tiered_sponsors',
  'tiered_products',
  'tiered_hours',
  'tiered_count',
  'tiered_storage',
];

const TYPES = ['base', 'addon', 'bundle'] as const;

interface Variant {
  id: string;
  name: string;
  price: number;
}

interface VolumeTier {
  min_qty?: number;
  max_qty?: number;
  unit_price?: number;
  total_price?: number;
  variable_value?: number;
  tbd?: boolean;
}

interface Dependency {
  depends_on_sku_id: string;
  type: 'soft' | 'hard';
  message: string;
}

interface FlatSku {
  // row identity
  rowId: string;
  // category/product info
  category: string;
  sku_group: string;
  sku_number: string; // product.sku
  product_id: string;
  product_name: string;
  type: 'base' | 'addon' | 'bundle';
  // sku
  id: string;
  sku_code: string;
  name: string;
  pricing_model: PricingModel | string;
  base_price?: number | null;
  variable_unit?: string;
  price_new?: number | null;
  price_repeat?: number | null;
  recurring: boolean;
  active: boolean;
  variants: Variant[];
  volume_tiers: VolumeTier[];
  dependencies: Dependency[];
  description?: string;
  // state
  _isNew?: boolean;
  _isDirty?: boolean;
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim();
}

function normalizeSkuNumber(value: unknown) {
  return normalizeText(value).replace(/\.0+$/, '');
}

function parseNumberValue(value: unknown) {
  if (value === '' || value == null) return null;
  const n = Number(String(value).replace(/[$,]/g, '').trim());
  return Number.isNaN(n) ? null : n;
}

function parseBooleanValue(value: unknown) {
  const s = normalizeText(value).toLowerCase();
  return s === 'yes' || s === 'true' || s === '1' || s === 'y';
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function detectCsvFormat(row: Record<string, unknown> | undefined) {
  if (!row) return 'unknown' as const;
  const headers = new Set(Object.keys(row).map((key) => key.trim().toLowerCase()));
  if (headers.has('sku code') && headers.has('name')) return 'catalog' as const;
  if (headers.has('platform') && headers.has('sku') && headers.has('product')) return 'pricing' as const;
  return 'unknown' as const;
}

function inferPricingModel(variableUnit: string, pricingTiers: string): PricingModel | 'fixed' | 'variable' {
  const variable = variableUnit.toLowerCase();
  const hasTiers = Boolean(pricingTiers.trim());

  if (!hasTiers) {
    return !variable || variable === 'fixed' ? 'fixed' : 'variable';
  }

  if (variable.includes('learner')) return 'tiered_learners';
  if (variable.includes('sponsor')) return 'tiered_sponsors';
  if (variable.includes('product')) return 'tiered_products';
  if (variable.includes('storage')) return 'tiered_storage';
  if (variable.includes('hour')) return 'tiered_hours';
  return 'tiered_count';
}

function parsePricingTiers(raw: string): VolumeTier[] {
  const cleaned = raw
    .replace(/^.*?\|\s*price per:\s*/i, '')
    .replace(/^price per:\s*/i, '')
    .trim();

  if (!cleaned) return [];

  return cleaned
    .split(/\s*,\s*/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map<VolumeTier | null>((entry) => {
      const normalized = entry.replace(/\/order/gi, '').replace(/hrs?/gi, '').replace(/\s+/g, '');
      const match = normalized.match(/([>+]?\d+(?:\.\d+)?\+?)[^\d$]*=\$?([\d,.]+(?:\.\d+)?)/i);

      if (!match) return null;

      const threshold = Number(match[1].replace(/[^\d.]/g, ''));
      const price = Number(match[2].replace(/,/g, ''));

      if (Number.isNaN(threshold) || Number.isNaN(price)) return null;

      return {
        variable_value: threshold,
        min_qty: threshold,
        unit_price: price,
      };
    })
    .filter((tier): tier is VolumeTier => Boolean(tier));
}

function flatten(catalog: any): FlatSku[] {
  const out: FlatSku[] = [];
  for (const product of catalog.products || []) {
    for (const sku of product.skus || []) {
      out.push({
        rowId: `${product.id}::${sku.id}`,
        category: product.category || '',
        sku_group: product.sku_group || '',
        sku_number: product.sku || '',
        product_id: product.id || '',
        product_name: product.name || '',
        type: (product.type || 'addon') as any,
        id: sku.id || '',
        sku_code: sku.sku_code || '',
        name: sku.name || '',
        pricing_model: sku.pricing_model || 'fixed',
        base_price: sku.base_price ?? null,
        variable_unit: sku.variable_unit || '',
        price_new: sku.price_new ?? null,
        price_repeat: sku.price_repeat ?? null,
        recurring: !!sku.recurring,
        active: sku.active !== false,
        variants: sku.variants || [],
        volume_tiers: sku.volume_tiers || [],
        dependencies: sku.dependencies || [],
        description: sku.description || '',
      });
    }
  }
  return out;
}

function rebuildCatalog(rows: FlatSku[]): any {
  const categories = Array.from(new Set(rows.map((r) => r.category).filter(Boolean)));
  const productsMap = new Map<string, any>();
  for (const r of rows) {
    const key = r.product_id || `prod_${r.sku_number}_${r.product_name}`;
    if (!productsMap.has(key)) {
      productsMap.set(key, {
        id: key,
        name: r.product_name,
        category: r.category,
        sku: r.sku_number,
        sku_group: r.sku_group,
        type: r.type,
        recurring: r.recurring,
        skus: [],
      });
    }
    const product = productsMap.get(key);
    const sku: any = {
      id: r.id,
      sku_code: r.sku_code,
      product_id: r.product_id,
      name: r.name,
      pricing_model: r.pricing_model,
      currency: 'USD',
      active: r.active,
      recurring: r.recurring,
      variants: r.variants,
      volume_tiers: r.volume_tiers,
      dependencies: r.dependencies,
    };
    if (r.base_price != null) sku.base_price = Number(r.base_price);
    if (r.variable_unit) sku.variable_unit = r.variable_unit;
    if (r.price_new != null) sku.price_new = Number(r.price_new);
    if (r.price_repeat != null) sku.price_repeat = Number(r.price_repeat);
    if (r.description) sku.description = r.description;
    product.skus.push(sku);
  }
  return { categories, products: Array.from(productsMap.values()) };
}

function newRow(): FlatSku {
  const id = `sku_new_${Date.now()}`;
  return {
    rowId: `new::${id}`,
    category: '',
    sku_group: '',
    sku_number: '',
    product_id: '',
    product_name: '',
    type: 'addon',
    id,
    sku_code: '',
    name: '',
    pricing_model: 'fixed',
    base_price: null,
    variable_unit: '',
    price_new: null,
    price_repeat: null,
    recurring: false,
    active: true,
    variants: [],
    volume_tiers: [],
    dependencies: [],
    description: '',
    _isNew: true,
  };
}

const STORAGE_KEY = 'catalog_manager_state_v6';
const LEGACY_STORAGE_KEYS = ['catalog_manager_state_v1', 'catalog_manager_state_v2', 'catalog_manager_state_v3', 'catalog_manager_state_v4', 'catalog_manager_state_v5'];

export default function CatalogViewer() {
  const [rows, setRows] = useState<FlatSku[]>(() => {
    try {
      // Purge any stale legacy snapshots from previous catalog versions
      for (const key of LEGACY_STORAGE_KEYS) localStorage.removeItem(key);
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return flatten(catalogData);
  });
  const [search, setSearch] = useState('');
  const [tiersModalRowId, setTiersModalRowId] = useState<string | null>(null);
  const [depsModalRowId, setDepsModalRowId] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [confirmDeleteRowId, setConfirmDeleteRowId] = useState<string | null>(null);
  const [csvPreview, setCsvPreview] = useState<{ rows: any[]; all: any[] } | null>(null);
  const [importSummary, setImportSummary] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const dirty = rows.some((r) => r._isDirty || r._isNew);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
    } catch {}
  }, [rows]);

  useEffect(() => {
    if (rows.length > 0) return;
    const fallbackRows = flatten(catalogData);
    if (fallbackRows.length === 0) return;
    setRows(fallbackRows);
  }, [rows.length]);

  const categories = useMemo(
    () => Array.from(new Set(rows.map((r) => r.category).filter(Boolean))).sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.sku_code.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q) ||
        r.product_name.toLowerCase().includes(q) ||
        (r.description ?? '').toLowerCase().includes(q),
    );
  }, [rows, search]);

  function update(rowId: string, patch: Partial<FlatSku>) {
    setRows((prev) =>
      prev.map((r) => (r.rowId === rowId ? { ...r, ...patch, _isDirty: !r._isNew || r._isDirty } : r)),
    );
  }

  function addRow() {
    setRows((prev) => [...prev, newRow()]);
  }

  function confirmNewRow(rowId: string) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.rowId !== rowId) return r;
        if (!r.sku_code || !r.name) {
          toast.error('SKU Code and Name are required');
          return r;
        }
        return { ...r, _isNew: false, _isDirty: true };
      }),
    );
  }

  function cancelNewRow(rowId: string) {
    setRows((prev) => prev.filter((r) => r.rowId !== rowId));
  }

  function deleteRow(rowId: string) {
    setRows((prev) => prev.filter((r) => r.rowId !== rowId));
    setConfirmDeleteRowId(null);
    toast.success('SKU deleted');
  }

  function exportJson() {
    const catalog = rebuildCatalog(rows.filter((r) => !r._isNew));
    const blob = new Blob([JSON.stringify(catalog, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'products.json';
    a.click();
    URL.revokeObjectURL(url);
    setRows((prev) => prev.map((r) => ({ ...r, _isDirty: false, _isNew: false })));
    toast.success('Catalog exported. Upload this file to Loveable to update the live catalog.');
  }

  function exportCsv() {
    const exportRows = rows.filter((r) => !r._isNew).map((r) => ({
      'Category': r.category,
      'SKU Group': r.sku_group,
      'SKU Number': r.sku_number,
      'Product ID': r.product_id,
      'Type': r.type,
      'SKU Code': r.sku_code,
      'Name': r.name,
      'Description': r.description ?? '',
      'Pricing Model': r.pricing_model,
      'Base Price': r.base_price ?? '',
      'Variable Unit': r.variable_unit ?? '',
      'New Price': r.price_new ?? '',
      'Repeat Price': r.price_repeat ?? '',
      'Recurring': r.recurring ? 'Yes' : 'No',
      'Active': r.active ? 'Yes' : 'No',
    }));
    const csv = Papa.unparse(exportRows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'products.csv';
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Catalog exported as CSV. Note: tiers, variants, and dependencies are not included in CSV — use JSON for full export.');
  }

  function resetToDefault() {
    setRows(flatten(catalogData));
    setResetOpen(false);
    toast.success('Catalog reset to default');
  }

  function handleCsvFile(file: File) {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const all = res.data as any[];
        setCsvPreview({ rows: all.slice(0, 5), all });
      },
      error: (err) => toast.error(`CSV parse error: ${err.message}`),
    });
  }

  function csvRowToFlat(r: Record<string, unknown>, format: 'catalog' | 'pricing' | 'unknown', errors: string[]): FlatSku | null {
    if (format === 'catalog') {
      const sku_code = normalizeText(r['SKU Code']);
      const name = normalizeText(r['Name']);
      if (!sku_code || !name) {
        errors.push(`Row missing SKU Code or Name: ${JSON.stringify(r)}`);
        return null;
      }

      const sku_number = normalizeSkuNumber(r['SKU Number']);
      const product_id = normalizeText(r['Product ID']) || `prod_${sku_number || sku_code}`;

      return {
        rowId: `${product_id}::${sku_code}`,
        category: normalizeText(r['Category']),
        sku_group: normalizeText(r['SKU Group']),
        sku_number,
        product_id,
        product_name: normalizeText(r['Product Name']) || normalizeText(r['SKU Group']) || name,
        type: ((normalizeText(r['Type']) || 'addon').toLowerCase() as any) || 'addon',
        id: `sku_${sku_code.replace(/[^a-zA-Z0-9]/g, '_')}`,
        sku_code,
        name,
        pricing_model: (normalizeText(r['Pricing Model']) as any) || 'fixed',
        base_price: parseNumberValue(r['Base Price']),
        variable_unit: normalizeText(r['Variable Unit']),
        price_new: parseNumberValue(r['New Price']),
        price_repeat: parseNumberValue(r['Repeat Price']),
        recurring: parseBooleanValue(r['Recurring']),
        active: r['Active'] == null || r['Active'] === '' ? true : parseBooleanValue(r['Active']),
        variants: [],
        volume_tiers: [],
        dependencies: [],
        _isDirty: true,
      };
    }

    if (format === 'pricing') {
      const category = normalizeText(r['Platform']) || normalizeText(r['Product Type']);
      const sku_number = normalizeSkuNumber(r['SKU']);
      const product_name = normalizeText(r['Product']);

      if (!sku_number || !product_name) {
        const isSectionHeader = category && Object.values(r).filter((value) => normalizeText(value)).length <= 1;
        if (!isSectionHeader) {
          errors.push(`Row missing SKU or Product: ${JSON.stringify(r)}`);
        }
        return null;
      }

      const variable_unit = normalizeText(r['Variable']);
      const pricingTiers = normalizeText(r['Pricing Tiers / Annual Support']);
      const sku_code = `${sku_number}-${slugify(product_name)}`.toUpperCase();
      const product_id = `prod_${slugify(`${category}-${sku_number}-${product_name}`)}`;

      return {
        rowId: `${product_id}::${sku_code}`,
        category,
        sku_group: category,
        sku_number,
        product_id,
        product_name,
        type: 'addon',
        id: `sku_${slugify(`${sku_number}-${product_name}`)}`,
        sku_code,
        name: product_name,
        pricing_model: inferPricingModel(variable_unit, pricingTiers),
        base_price: parseNumberValue(r['Base Price / One Time']),
        variable_unit: variable_unit.toLowerCase() === 'fixed' ? '' : variable_unit,
        price_new: null,
        price_repeat: null,
        recurring: /annual/i.test(normalizeText(r['SKU Type'])),
        active: true,
        variants: [],
        volume_tiers: parsePricingTiers(pricingTiers),
        dependencies: [],
        _isDirty: true,
      };
    }

    errors.push('Unsupported CSV format. Expected either a catalog export CSV or the pricing CSV with Platform / SKU / Product columns.');
    return null;
  }

  function applyCsv(mode: 'replace' | 'merge') {
    if (!csvPreview) return;
    const errors: string[] = [];
    const sampleRow = csvPreview.all.find((row) => Object.values(row).some((value) => normalizeText(value)));
    const format = detectCsvFormat(sampleRow);
    const parsed = csvPreview.all
      .map((r) => csvRowToFlat(r as Record<string, unknown>, format, errors))
      .filter((x): x is FlatSku => !!x);

    if (parsed.length === 0) {
      toast.error('No valid SKU rows were found in that CSV.');
      setImportSummary(errors.slice(0, 10).join('\n') || 'No valid SKU rows were found in that CSV.');
      return;
    }

    let added = 0;
    let updated = 0;

    if (mode === 'replace') {
      setRows(parsed);
      added = parsed.length;
    } else {
      setRows((prev) => {
        const map = new Map(prev.map((r) => [r.sku_code, r]));
        for (const p of parsed) {
          if (map.has(p.sku_code)) {
            const existing = map.get(p.sku_code)!;
            map.set(p.sku_code, { ...existing, ...p, rowId: existing.rowId, _isDirty: true });
            updated++;
          } else {
            map.set(p.sku_code, p);
            added++;
          }
        }
        return Array.from(map.values());
      });
    }

    setImportSummary(
      `${added} SKUs added, ${updated} SKUs updated, ${errors.length} skipped` +
        (errors.length ? `\n\n${errors.slice(0, 10).join('\n')}` : ''),
    );
    setCsvPreview(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  const tiersRow = rows.find((r) => r.rowId === tiersModalRowId) || null;
  const depsRow = rows.find((r) => r.rowId === depsModalRowId) || null;
  const deleteRowData = rows.find((r) => r.rowId === confirmDeleteRowId) || null;

  return (
    <div className="p-4 space-y-4 max-w-[100vw]">
      <div>
        <h1 className="text-2xl font-bold">Catalog Manager</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Edit SKUs in-memory, then export <code className="bg-muted px-1 rounded">products.json</code> to update the live catalog.
        </p>
      </div>

      {dirty && (
        <div className="bg-warning/10 border border-warning/40 text-warning-foreground rounded-md px-4 py-2 flex items-center gap-2 text-sm">
          <AlertTriangle className="h-4 w-4 text-warning" />
          You have unsaved changes — Export JSON to save them to the codebase.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => fileRef.current?.click()} variant="outline" size="sm">
          <Upload className="h-4 w-4" /> Upload CSV
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleCsvFile(e.target.files[0])}
        />
        <Button onClick={addRow} variant="outline" size="sm">
          <Plus className="h-4 w-4" /> Add SKU
        </Button>
        <Button onClick={exportJson} size="sm">
          <Download className="h-4 w-4" /> Export JSON
        </Button>
        <Button onClick={exportCsv} variant="outline" size="sm">
          <Download className="h-4 w-4" /> Export CSV
        </Button>
        <Button onClick={() => setResetOpen(true)} variant="outline" size="sm">
          <RotateCcw className="h-4 w-4" /> Reset to Default
        </Button>
        <div className="relative ml-auto w-64">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search SKUs..."
            className="pl-8 h-9 text-sm"
          />
        </div>
      </div>

      <div className="border rounded-lg overflow-x-auto bg-card">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 sticky top-0">
            <tr className="text-left">
              {[
                'Category',
                'SKU Group',
                'SKU Number',
                'Product ID',
                'SKU Code',
                'Name',
                'Description',
                'Type',
                'Pricing Model',
                'Base Price',
                'Variable Unit',
                'New Price',
                'Repeat Price',
                'Recurring',
                'Active',
                'Tiers/Variants',
                'Dependencies',
                'Actions',
              ].map((h) => (
                <th key={h} className="px-2 py-2 font-medium text-muted-foreground whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const borderClass = r._isNew
                ? 'border-l-4 border-l-success'
                : r._isDirty
                ? 'border-l-4 border-l-primary'
                : 'border-l-4 border-l-transparent';
              return (
                <tr key={r.rowId} className={`border-b hover:bg-muted/20 ${borderClass}`}>
                  <td className="px-2 py-1">
                    <CategoryCell
                      value={r.category}
                      categories={categories}
                      onChange={(v) => update(r.rowId, { category: v })}
                    />
                  </td>
                  <td className="px-2 py-1">
                    <Select
                      value={r.sku_group || '__none__'}
                      onValueChange={(v) => update(r.rowId, { sku_group: v === '__none__' ? '' : v })}
                    >
                      <SelectTrigger className="h-7 text-xs w-[130px]">
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
                  <td className="px-2 py-1">
                    <CellInput value={r.sku_number} onChange={(v) => update(r.rowId, { sku_number: v })} />
                  </td>
                  <td className="px-2 py-1">
                    <CellInput value={r.product_id} onChange={(v) => update(r.rowId, { product_id: v })} />
                  </td>
                  <td className="px-2 py-1">
                    <CellInput value={r.sku_code} onChange={(v) => update(r.rowId, { sku_code: v })} />
                  </td>
                  <td className="px-2 py-1 min-w-[180px]">
                    <CellInput value={r.name} onChange={(v) => update(r.rowId, { name: v })} />
                  </td>
                  <td className="px-2 py-1 min-w-[260px]">
                    <CellInput value={r.description ?? ''} onChange={(v) => update(r.rowId, { description: v })} />
                  </td>
                  <td className="px-2 py-1">
                    <Select value={r.type} onValueChange={(v) => update(r.rowId, { type: v as any })}>
                      <SelectTrigger className="h-7 text-xs w-[90px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-2 py-1">
                    <Select value={r.pricing_model} onValueChange={(v) => update(r.rowId, { pricing_model: v })}>
                      <SelectTrigger className="h-7 text-xs w-[140px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PRICING_MODELS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-2 py-1">
                    <CellInput
                      type="number"
                      value={r.base_price ?? ''}
                      onChange={(v) => update(r.rowId, { base_price: v === '' ? null : Number(v) })}
                    />
                  </td>
                  <td className="px-2 py-1">
                    <CellInput value={r.variable_unit ?? ''} onChange={(v) => update(r.rowId, { variable_unit: v })} />
                  </td>
                  <td className="px-2 py-1">
                    <CellInput
                      type="number"
                      value={r.price_new ?? ''}
                      onChange={(v) => update(r.rowId, { price_new: v === '' ? null : Number(v) })}
                    />
                  </td>
                  <td className="px-2 py-1">
                    <CellInput
                      type="number"
                      value={r.price_repeat ?? ''}
                      onChange={(v) => update(r.rowId, { price_repeat: v === '' ? null : Number(v) })}
                    />
                  </td>
                  <td className="px-2 py-1 text-center">
                    <Switch checked={r.recurring} onCheckedChange={(v) => update(r.rowId, { recurring: v })} />
                  </td>
                  <td className="px-2 py-1 text-center">
                    <Switch checked={r.active} onCheckedChange={(v) => update(r.rowId, { active: v })} />
                  </td>
                  <td className="px-2 py-1">
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setTiersModalRowId(r.rowId)}>
                      <Pencil className="h-3 w-3" /> {(r.volume_tiers.length || r.variants.length) ? `${r.volume_tiers.length + r.variants.length}` : 'Edit'}
                    </Button>
                  </td>
                  <td className="px-2 py-1">
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setDepsModalRowId(r.rowId)}>
                      <Pencil className="h-3 w-3" /> {r.dependencies.length || 'Edit'}
                    </Button>
                  </td>
                  <td className="px-2 py-1 whitespace-nowrap">
                    {r._isNew ? (
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-success" onClick={() => confirmNewRow(r.rowId)}>
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => cancelNewRow(r.rowId)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : confirmDeleteRowId === r.rowId ? (
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-destructive">Delete?</span>
                        <Button size="sm" variant="destructive" className="h-6 text-xs" onClick={() => deleteRow(r.rowId)}>Confirm</Button>
                        <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setConfirmDeleteRowId(null)}>Cancel</Button>
                      </div>
                    ) : (
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setConfirmDeleteRowId(r.rowId)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={17} className="text-center py-8 text-muted-foreground">No SKUs found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Tiers / Variants Modal */}
      <Dialog open={!!tiersRow} onOpenChange={(o) => !o && setTiersModalRowId(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Tiers / Variants — {tiersRow?.name}</DialogTitle>
            <DialogDescription>Pricing model: {tiersRow?.pricing_model}</DialogDescription>
          </DialogHeader>
          {tiersRow && <TiersVariantsEditor row={tiersRow} onChange={(patch) => update(tiersRow.rowId, patch)} />}
          <DialogFooter>
            <Button onClick={() => setTiersModalRowId(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dependencies Modal */}
      <Dialog open={!!depsRow} onOpenChange={(o) => !o && setDepsModalRowId(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Dependencies — {depsRow?.name}</DialogTitle>
          </DialogHeader>
          {depsRow && (
            <DependenciesEditor
              row={depsRow}
              allRows={rows}
              onChange={(patch) => update(depsRow.rowId, patch)}
            />
          )}
          <DialogFooter>
            <Button onClick={() => setDepsModalRowId(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset confirmation */}
      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset to default?</AlertDialogTitle>
            <AlertDialogDescription>
              This will discard all changes and reload the original catalog. Are you sure?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={resetToDefault}>Reset</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* CSV preview */}
      <Dialog open={!!csvPreview} onOpenChange={(o) => !o && setCsvPreview(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>CSV Preview ({csvPreview?.all.length} rows)</DialogTitle>
            <DialogDescription>Showing first 5 rows. Choose how to import.</DialogDescription>
          </DialogHeader>
          {csvPreview && (
            <div className="overflow-x-auto border rounded-md">
              <table className="w-full text-xs">
                <thead className="bg-muted/40">
                  <tr>
                    {Object.keys(csvPreview.rows[0] || {}).map((k) => (
                      <th key={k} className="px-2 py-1 text-left font-medium">{k}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {csvPreview.rows.map((r, i) => (
                    <tr key={i} className="border-t">
                      {Object.values(r).map((v: any, j) => (
                        <td key={j} className="px-2 py-1">{String(v)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="bg-destructive/10 border border-destructive/30 text-sm text-destructive rounded-md px-3 py-2">
            <strong>Replace:</strong> deletes all existing SKUs and replaces them with the CSV. Cannot be undone without resetting to default.
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCsvPreview(null)}>Cancel</Button>
            <Button variant="outline" onClick={() => applyCsv('merge')}>Merge with existing</Button>
            <Button variant="destructive" onClick={() => applyCsv('replace')}>Replace entire catalog</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import summary */}
      <Dialog open={!!importSummary} onOpenChange={(o) => !o && setImportSummary(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import complete</DialogTitle>
          </DialogHeader>
          <pre className="text-xs whitespace-pre-wrap">{importSummary}</pre>
          <DialogFooter>
            <Button onClick={() => setImportSummary(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CellInput({
  value,
  onChange,
  type = 'text',
}: {
  value: string | number;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <Input
      value={value as any}
      type={type}
      onChange={(e) => onChange(e.target.value)}
      className="h-7 text-xs px-2 min-w-[80px]"
    />
  );
}

function CategoryCell({
  value,
  categories,
  onChange,
}: {
  value: string;
  categories: string[];
  onChange: (v: string) => void;
}) {
  const [custom, setCustom] = useState(false);
  if (custom || (value && !categories.includes(value))) {
    return (
      <Input
        autoFocus={custom}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => setCustom(false)}
        className="h-7 text-xs px-2 w-[120px]"
      />
    );
  }
  return (
    <Select
      value={value}
      onValueChange={(v) => {
        if (v === '__new__') setCustom(true);
        else onChange(v);
      }}
    >
      <SelectTrigger className="h-7 text-xs w-[120px]"><SelectValue placeholder="—" /></SelectTrigger>
      <SelectContent>
        {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
        <SelectItem value="__new__">+ New category</SelectItem>
      </SelectContent>
    </Select>
  );
}

function TiersVariantsEditor({
  row,
  onChange,
}: {
  row: FlatSku;
  onChange: (p: Partial<FlatSku>) => void;
}) {
  const isVariant = row.pricing_model === 'tiered_fixed' || row.variants.length > 0;
  const isTiered = row.pricing_model.startsWith('tiered_') && row.pricing_model !== 'tiered_fixed';

  if (isTiered || (!isVariant && row.volume_tiers.length > 0)) {
    return (
      <div className="space-y-2">
        <table className="w-full text-xs border">
          <thead className="bg-muted/40">
            <tr>
              <th className="px-2 py-1 text-left">Variable Value</th>
              <th className="px-2 py-1 text-left">Unit Price</th>
              <th className="px-2 py-1 text-left">Total Price</th>
              <th className="px-2 py-1 text-center">TBD</th>
              <th className="px-2 py-1"></th>
            </tr>
          </thead>
          <tbody>
            {row.volume_tiers.map((t, i) => (
              <tr key={i} className="border-t">
                <td className="px-2 py-1">
                  <Input
                    type="number"
                    className="h-7 text-xs"
                    value={t.variable_value ?? t.min_qty ?? ''}
                    onChange={(e) => {
                      const tiers = [...row.volume_tiers];
                      tiers[i] = { ...tiers[i], variable_value: Number(e.target.value) };
                      onChange({ volume_tiers: tiers });
                    }}
                  />
                </td>
                <td className="px-2 py-1">
                  <Input
                    type="number"
                    className="h-7 text-xs"
                    value={t.unit_price ?? ''}
                    onChange={(e) => {
                      const tiers = [...row.volume_tiers];
                      tiers[i] = { ...tiers[i], unit_price: Number(e.target.value) };
                      onChange({ volume_tiers: tiers });
                    }}
                  />
                </td>
                <td className="px-2 py-1">
                  <Input
                    type="number"
                    className="h-7 text-xs"
                    value={t.total_price ?? ''}
                    onChange={(e) => {
                      const tiers = [...row.volume_tiers];
                      tiers[i] = { ...tiers[i], total_price: Number(e.target.value) };
                      onChange({ volume_tiers: tiers });
                    }}
                  />
                </td>
                <td className="px-2 py-1 text-center">
                  <Switch
                    checked={!!t.tbd}
                    onCheckedChange={(v) => {
                      const tiers = [...row.volume_tiers];
                      tiers[i] = { ...tiers[i], tbd: v };
                      onChange({ volume_tiers: tiers });
                    }}
                  />
                </td>
                <td className="px-2 py-1">
                  <Button
                    size="icon" variant="ghost" className="h-7 w-7 text-destructive"
                    onClick={() => onChange({ volume_tiers: row.volume_tiers.filter((_, j) => j !== i) })}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Button size="sm" variant="outline" onClick={() => onChange({ volume_tiers: [...row.volume_tiers, { variable_value: 0, unit_price: 0, total_price: 0 }] })}>
          <Plus className="h-3 w-3" /> Add Tier
        </Button>
      </div>
    );
  }

  // Variants editor
  return (
    <div className="space-y-2">
      <table className="w-full text-xs border">
        <thead className="bg-muted/40">
          <tr>
            <th className="px-2 py-1 text-left">Name</th>
            <th className="px-2 py-1 text-left">Price</th>
            <th className="px-2 py-1"></th>
          </tr>
        </thead>
        <tbody>
          {row.variants.map((v, i) => (
            <tr key={v.id || i} className="border-t">
              <td className="px-2 py-1">
                <Input
                  className="h-7 text-xs"
                  value={v.name}
                  onChange={(e) => {
                    const variants = [...row.variants];
                    variants[i] = { ...variants[i], name: e.target.value };
                    onChange({ variants });
                  }}
                />
              </td>
              <td className="px-2 py-1">
                <Input
                  type="number"
                  className="h-7 text-xs"
                  value={v.price}
                  onChange={(e) => {
                    const variants = [...row.variants];
                    variants[i] = { ...variants[i], price: Number(e.target.value) };
                    onChange({ variants });
                  }}
                />
              </td>
              <td className="px-2 py-1">
                <Button
                  size="icon" variant="ghost" className="h-7 w-7 text-destructive"
                  onClick={() => onChange({ variants: row.variants.filter((_, j) => j !== i) })}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Button size="sm" variant="outline" onClick={() => onChange({ variants: [...row.variants, { id: `var_${Date.now()}`, name: '', price: 0 }] })}>
        <Plus className="h-3 w-3" /> Add Variant
      </Button>
    </div>
  );
}

function DependenciesEditor({
  row,
  allRows,
  onChange,
}: {
  row: FlatSku;
  allRows: FlatSku[];
  onChange: (p: Partial<FlatSku>) => void;
}) {
  const [skuId, setSkuId] = useState('');
  const [type, setType] = useState<'soft' | 'hard'>('soft');
  const [message, setMessage] = useState('');

  const otherSkus = allRows.filter((r) => r.id !== row.id);

  return (
    <div className="space-y-3">
      {row.dependencies.length > 0 && (
        <div className="space-y-1 border rounded-md p-2">
          {row.dependencies.map((d, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <Badge variant={d.type === 'hard' ? 'destructive' : 'secondary'}>{d.type}</Badge>
              <span className="font-mono">{d.depends_on_sku_id}</span>
              <span className="text-muted-foreground flex-1 truncate">{d.message}</span>
              <Button
                size="icon" variant="ghost" className="h-6 w-6 text-destructive"
                onClick={() => onChange({ dependencies: row.dependencies.filter((_, j) => j !== i) })}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
      <div className="space-y-2 border-t pt-3">
        <Select value={skuId} onValueChange={setSkuId}>
          <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select SKU..." /></SelectTrigger>
          <SelectContent>
            {otherSkus.map((s) => <SelectItem key={s.id} value={s.id}>{s.sku_code} — {s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={type} onValueChange={(v) => setType(v as any)}>
          <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="soft">Soft (warning)</SelectItem>
            <SelectItem value="hard">Hard (blocking)</SelectItem>
          </SelectContent>
        </Select>
        <Textarea
          placeholder="Warning message shown to the rep..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="text-xs min-h-[60px]"
        />
        <Button
          size="sm"
          onClick={() => {
            if (!skuId) return;
            onChange({ dependencies: [...row.dependencies, { depends_on_sku_id: skuId, type, message }] });
            setSkuId(''); setMessage('');
          }}
        >
          <Plus className="h-3 w-3" /> Add Dependency
        </Button>
      </div>
    </div>
  );
}
