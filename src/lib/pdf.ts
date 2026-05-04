import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { QuoteState, QuoteLineItem, YearAdjustment } from '@/types/quote';
import { getUnitPrice, calculateLineTotal, shouldApplyYearAdj, formatCurrency } from '@/lib/pricing';

export function exportQuotePdf(
  state: QuoteState,
  getYearItems: (year: number) => QuoteLineItem[],
  getYearSubtotal: (year: number) => number,
  totalContractValue: number
) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 20;

  // Header
  doc.setFontSize(10);
  doc.setTextColor(120);
  doc.text('COMPANY LOGO', 14, y);

  doc.setFontSize(18);
  doc.setTextColor(30);
  doc.text('Quote', pageWidth - 14, y, { align: 'right' });
  y += 12;

  // Meta
  doc.setFontSize(9);
  doc.setTextColor(100);
  const dealTypeLabel =
    state.deal.dealType === 'new_business' ? 'New Business' :
    state.deal.dealType === 'renewal' ? 'Renewal' : 'Mid-Term Upgrade';

  doc.text(`Date: ${new Date().toLocaleDateString()}`, 14, y);
  doc.text(`Deal ID: ${state.deal.dealId}`, 14, y + 5);
  doc.text(`Deal Type: ${dealTypeLabel}`, 14, y + 10);
  doc.text(`Term: ${state.deal.termYears} Year${state.deal.termYears > 1 ? 's' : ''}`, 14, y + 15);
  y += 28;

  const years = Array.from({ length: state.deal.termYears }, (_, i) => i + 1);

  for (const year of years) {
    const items = getYearItems(year);
    const adj = state.deal.yearAdjustments[year];

    doc.setFontSize(12);
    doc.setTextColor(30);
    doc.text(`Year ${year}`, 14, y);
    y += 4;

    const rows = items.map((item) => {
      const applyAdj = shouldApplyYearAdj(item, adj);
      const unitPrice = getUnitPrice(item, state.deal.dealType);
      const total = calculateLineTotal(item, adj, applyAdj, state.deal.dealType);
      const variantName = item.selectedVariantId
        ? item.variants.find(v => v.id === item.selectedVariantId)?.name || '—'
        : '—';

      let adjText = '—';
      if (applyAdj) {
        const parts: string[] = [];
        const incMode = adj.increaseMode ?? 'pct';
        const discMode = adj.discountMode ?? 'pct';
        if (incMode === 'pct' && adj.increasePct > 0) parts.push(`+${adj.increasePct}%`);
        if (incMode === 'amount' && (adj.increaseAmt || 0) > 0) parts.push(`+${formatCurrency(adj.increaseAmt || 0)}`);
        if (discMode === 'pct' && adj.discountPct > 0) parts.push(`-${adj.discountPct}%`);
        if (discMode === 'amount' && (adj.discountAmt || 0) > 0) parts.push(`-${formatCurrency(adj.discountAmt || 0)}`);
        if (parts.length) adjText = parts.join(', ');
      }

      const skuLabel = !item.recurring && year === 1
        ? `${item.skuName} (One-time fee)`
        : item.skuName;

      return [
        skuLabel,
        variantName,
        item.quantity.toString(),
        formatCurrency(unitPrice),
        adjText,
        (item.manualIncreasePct || 0) > 0 ? `+${item.manualIncreasePct}%` : '—',
        item.manualDiscountPct > 0 ? `${item.manualDiscountPct}%` : '—',
        formatCurrency(total),
      ];
    });

    autoTable(doc, {
      startY: y,
      head: [['SKU', 'Variant', 'Qty', 'Unit Price', 'Yr Adj', 'Inc %', 'Disc %', 'Total']],
      body: rows,
      theme: 'striped',
      headStyles: { fillColor: [14, 116, 144], fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      margin: { left: 14, right: 14 },
      foot: [[
        { content: `Year ${year} Subtotal`, colSpan: 7, styles: { halign: 'right', fontStyle: 'bold' } },
        { content: formatCurrency(getYearSubtotal(year)), styles: { fontStyle: 'bold' } },
      ]],
    });

    y = (doc as any).lastAutoTable.finalY + 10;

    if (y > 260) {
      doc.addPage();
      y = 20;
    }
  }

  // Total
  doc.setFontSize(12);
  doc.setTextColor(30);
  doc.text(`Total Contract Value: ${formatCurrency(totalContractValue)}`, 14, y);
  y += 10;

  // Notes
  if (state.notes) {
    doc.setFontSize(9);
    doc.setTextColor(80);
    doc.text('Notes:', 14, y);
    y += 5;
    const lines = doc.splitTextToSize(state.notes, pageWidth - 28);
    doc.text(lines, 14, y);
  }

  doc.save(`quote-${state.deal.dealId || 'draft'}.pdf`);
}
