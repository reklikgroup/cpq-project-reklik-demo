import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { QuoteLineItem, DealSetup, YearAdjustment } from '@/types/quote';
import { calculateLineTotal, getUnitPrice, formatCurrency } from './pricing';

export function exportQuotePDF(
  deal: DealSetup,
  lineItems: QuoteLineItem[],
  notes: string,
  getYearItems: (year: number) => QuoteLineItem[],
  getYearSubtotal: (year: number) => number,
  totalContractValue: number
) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header
  doc.setFillColor(14, 116, 144); // teal
  doc.rect(0, 0, pageWidth, 35, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text('Quote', 14, 22);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('QuoteBuilder CPQ', pageWidth - 14, 22, { align: 'right' });

  // Meta
  let y = 45;
  doc.setTextColor(50, 50, 50);
  doc.setFontSize(10);
  doc.text(`Date: ${new Date().toLocaleDateString()}`, 14, y);
  doc.text(`Deal ID: ${deal.dealId || 'N/A'}`, 14, y + 6);
  doc.text(`Deal Type: ${deal.dealType.replace(/_/g, ' ')}`, 14, y + 12);
  doc.text(`Term Length: ${deal.termYears} Year${deal.termYears > 1 ? 's' : ''}`, 14, y + 18);
  y += 30;

  // Tables per year
  for (let yr = 1; yr <= deal.termYears; yr++) {
    const items = getYearItems(yr);
    if (items.length === 0) continue;

    const yearAdj = deal.yearAdjustments[yr] || { discountPct: 0, increasePct: 0, applyToAll: true };
    const applyAdj = yr > 1;

    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(14, 116, 144);
    doc.text(`Year ${yr}`, 14, y);
    y += 4;

    const tableData = items.map(item => {
      const unitPrice = getUnitPrice(item, deal.dealType);
      const total = calculateLineTotal(item, yearAdj, applyAdj, deal.dealType);
      const variant = item.selectedVariantId
        ? item.variants.find(v => v.id === item.selectedVariantId)?.name || '—'
        : '—';
      const oneTime = !item.recurring && yr === 1 ? ' (One-time)' : '';

      return [
        item.skuName + oneTime,
        variant,
        item.pricingModel === 'per_seat' || item.pricingModel === 'variable' ? item.quantity.toString() : '1',
        formatCurrency(unitPrice),
        applyAdj ? `+${yearAdj.increasePct}% / -${yearAdj.discountPct}%` : '—',
        item.manualIncreasePct ? `+${item.manualIncreasePct}%` : '—',
        item.manualDiscountPct ? `-${item.manualDiscountPct}%` : '—',
        formatCurrency(total),
      ];
    });

    autoTable(doc, {
      startY: y,
      head: [['SKU', 'Variant', 'Qty', 'Unit Price', 'Yr Adj', 'Inc %', 'Disc %', 'Total']],
      body: tableData,
      foot: [['', '', '', '', '', '', 'Subtotal:', formatCurrency(getYearSubtotal(yr))]],
      theme: 'grid',
      headStyles: { fillColor: [14, 116, 144], textColor: 255, fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      footStyles: { fillColor: [240, 240, 240], textColor: [30, 30, 30], fontStyle: 'bold', fontSize: 9 },
      margin: { left: 14, right: 14 },
    });

    y = (doc as any).lastAutoTable.finalY + 10;

    if (y > 250) {
      doc.addPage();
      y = 20;
    }
  }

  // TCV
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(14, 116, 144);
  doc.text(`Total Contract Value: ${formatCurrency(totalContractValue)}`, 14, y + 5);
  y += 15;

  // Notes
  if (notes) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80, 80, 80);
    doc.text('Notes:', 14, y);
    y += 6;
    const splitNotes = doc.splitTextToSize(notes, pageWidth - 28);
    doc.text(splitNotes, 14, y);
  }

  doc.save(`quote-${deal.dealId || 'draft'}-${Date.now()}.pdf`);
}
