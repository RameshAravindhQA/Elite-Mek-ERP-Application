import PDFDocument from "pdfkit";

export interface PdfSettings {
  companyName?: string | null;
  companyAddress?: string | null;
  companyPhone?: string | null;
  companyPhone2?: string | null;
  companyEmail?: string | null;
  companyWebsite?: string | null;
  gstNumber?: string | null;
  panNumber?: string | null;
  pdfHeaderContent?: string | null;
  pdfFooterContent?: string | null;
  currency?: string | null;
}

function drawCompanyHeader(doc: PDFKit.PDFDocument, settings: PdfSettings) {
  doc.fillColor("#0F172A").fontSize(20).font("Helvetica-Bold").text(settings.companyName || "EliteMek ERP");
  const details = [
    settings.companyAddress,
    [settings.companyPhone, settings.companyPhone2].filter(Boolean).join(" | "),
    [settings.companyEmail, settings.companyWebsite].filter(Boolean).join(" | "),
    settings.gstNumber ? `GST: ${settings.gstNumber}` : "",
    settings.panNumber ? `PAN: ${settings.panNumber}` : "",
  ].filter(Boolean) as string[];
  if (details.length) {
    doc.moveDown(0.25).fontSize(10).font("Helvetica").fillColor("#475569").text(details.join("\n"), { lineGap: 2 });
  }
}

function formatCurrency(value: number | string, currency = "INR") {
  const amount = Number(value || 0);
  const formattedNumber = amount.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  if (currency?.toUpperCase() === "INR") {
    return `INR ${formattedNumber}`;
  }

  return `${currency?.toUpperCase() || ""} ${formattedNumber}`.trim();
}

function formatDate(value: string | Date | undefined) {
  if (!value) return "-";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "-";
  try {
    return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return `${date.getDate().toString().padStart(2, "0")}-${(date.getMonth() + 1).toString().padStart(2, "0")}-${date.getFullYear()}`;
  }
}

function addPageIfNeeded(doc: PDFKit.PDFDocument, requiredHeight: number, bottomY = 740) {
  if (doc.y + requiredHeight > bottomY) {
    doc.addPage();
    doc.y = 40;
  }
}

export function createPurchaseOrderPdfFilename(po: any) {
  return `${po.poNumber || `purchase-order-${po.id}`}.pdf`;
}

export function generatePurchaseOrderPdf(po: any, customer: any, settings: PdfSettings) {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40, bufferPages: true });
    const chunks: Buffer[] = [];

    doc.on("data", chunk => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const currency = settings.currency || "INR";
    const items = Array.isArray(po.items) ? po.items : [];

    drawCompanyHeader(doc, settings);
    if (settings.pdfHeaderContent) {
      doc.moveDown(0.5).fontSize(10).fillColor("#475569").text(settings.pdfHeaderContent, { lineGap: 2 });
    }

    doc.moveDown(1);
    const headerTop = doc.y;
    doc.fontSize(16).fillColor("#0F172A").font("Helvetica-Bold").text("Purchase Order", { align: "right" });
    doc.moveDown(0.1);
    doc.fontSize(9).font("Helvetica").fillColor("#475569");
    doc.text(`PO No: ${po.poNumber || `PO-${po.id}`}`, { align: "right" });
    doc.text(`Order Date: ${formatDate(po.orderDate)}`, { align: "right" });
    doc.text(`Delivery Date: ${formatDate(po.deliveryDate)}`, { align: "right" });
    doc.strokeColor("#E2E8F0").lineWidth(0.5).moveTo(40, headerTop - 4).lineTo(555, headerTop - 4).stroke();
    doc.strokeColor("#E2E8F0").lineWidth(0.5).moveTo(40, doc.y + 4).lineTo(555, doc.y + 4).stroke();

    doc.moveDown(1.2);
    const detailsTop = doc.y;
    doc.fontSize(11).font("Helvetica-Bold").fillColor("#0F172A").text("Bill To", 40);
    doc.fontSize(10).font("Helvetica").fillColor("#1F2937");
    doc.text(customer?.name || "Unknown Customer", 40);
    if (customer?.email) doc.text(customer.email, 40);
    if (customer?.phone) doc.text(customer.phone, 40);
    if (customer?.address) doc.text(customer.address, 40);

    if (po.projectName || po.projectId) {
      doc.moveDown(0.3);
      doc.fontSize(11).font("Helvetica-Bold").fillColor("#0F172A").text("Project", 40);
      doc.moveDown(0.2);
      doc.fontSize(10).font("Helvetica").fillColor("#1F2937");
      doc.text(po.projectName || `Project #${po.projectId}`, 40);
    }

    doc.moveDown(1);
    doc.fontSize(11).font("Helvetica-Bold").fillColor("#0F172A").text("Project Scope");
    doc.moveDown(0.3);
    doc.fontSize(10).fillColor("#475569").text(po.scopeDefinition || "-", { width: 515, lineGap: 3 });

    doc.moveDown(0.9);
    doc.fontSize(11).font("Helvetica-Bold").fillColor("#0F172A").text("Notes");
    doc.moveDown(0.3);
    doc.fontSize(10).fillColor("#475569").text(po.notes || "-", { width: 515, lineGap: 3 });

    doc.moveDown(1.2);
    const tableTop = doc.y;
    const columns = [40, 280, 380, 475];
    doc.save().rect(40, tableTop - 6, 515, 22).fill("#EFF6FF").restore();
    doc.fillColor("#0F172A").font("Helvetica-Bold").fontSize(10);
    doc.text("Description", columns[0], tableTop, { width: 240 });
    doc.text("Qty", columns[1], tableTop, { width: 60, align: "right" });
    doc.text("Unit Price", columns[2], tableTop, { width: 85, align: "right" });
    doc.text("Amount", columns[3], tableTop, { width: 100, align: "right" });
    doc.moveTo(40, tableTop + 18).lineTo(555, tableTop + 18).lineWidth(0.5).strokeColor("#CBD5E1").stroke();
    doc.moveDown(1.2);
    doc.font("Helvetica").fontSize(10).fillColor("#1F2937");

    items.forEach((item: any, index: number) => {
      const amount = Number(item.quantity || 0) * Number(item.unitPrice || 0);
      const rowHeight = Math.max(
        18,
        doc.heightOfString(item.itemName || "-", { width: 240 }) + 8,
        doc.heightOfString(formatCurrency(item.unitPrice || 0, currency), { width: 85, align: "right" }) + 8,
        doc.heightOfString(formatCurrency(amount, currency), { width: 100, align: "right" }) + 8,
      );
      addPageIfNeeded(doc, rowHeight + 8);
      if (index % 2 === 0) {
        doc.save().rect(40, doc.y - 2, 515, rowHeight).fill("#F8FAFC").restore();
      }
      const y = doc.y;
      doc.text(item.itemName || "-", columns[0], y, { width: 240 });
      doc.text(String(item.quantity || 0), columns[1], y, { width: 60, align: "right" });
      doc.text(formatCurrency(item.unitPrice || 0, currency), columns[2], y, { width: 85, align: "right" });
      doc.text(formatCurrency(amount, currency), columns[3], y, { width: 100, align: "right" });
      doc.moveTo(40, y + rowHeight - 2).lineTo(555, y + rowHeight - 2).lineWidth(0.35).strokeColor("#E2E8F0").stroke();
      doc.y = y + rowHeight + 4;
    });

    const total = Number(po.totalAmount || items.reduce((sum: number, item: any) => sum + (Number(item.quantity) * Number(item.unitPrice)), 0));
    addPageIfNeeded(doc, 90);
    doc.moveDown(0.8);
    const totalY = doc.y;
    doc.font("Helvetica-Bold").fontSize(11).text("Grand Total", columns[2], totalY, { width: 85, align: "right" });
    doc.text(formatCurrency(total, currency), columns[3], totalY, { width: 100, align: "right" });

    doc.moveDown(2);
    doc.fontSize(10).fillColor("#475569").text(settings.pdfFooterContent || "Thank you for your business.", { width: 515, align: "center", lineGap: 2 });

    doc.end();
  });
}

export function createLedgerProjectPdfFilename(project: any) {
  const normalizedName = String(project.name || "project-ledger").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  return `ledger-${normalizedName}.pdf`;
}

export function generateLedgerProjectPdf(project: any, customer: any, ledgerData: any, settings: PdfSettings) {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40, bufferPages: true });
    const chunks: Buffer[] = [];

    doc.on("data", chunk => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const currency = settings.currency || "INR";
    const summary = ledgerData?.summary || {};
    const invoices = Array.isArray(ledgerData?.invoices) ? ledgerData.invoices : [];

    drawCompanyHeader(doc, settings);
    if (settings.pdfHeaderContent) {
      doc.moveDown(0.5).fontSize(10).fillColor("#475569").text(settings.pdfHeaderContent, { lineGap: 2 });
    }

    doc.moveDown(1);
    const headerTop = doc.y;
    doc.fontSize(16).fillColor("#0F172A").font("Helvetica-Bold").text("Project Invoice Ledger", { align: "right" });
    doc.moveDown(0.1);
    doc.fontSize(9).font("Helvetica").fillColor("#475569");
    doc.text(`Project: ${project?.name || "N/A"}`, { align: "right" });
    doc.text(`Status: ${project?.status || "N/A"}`, { align: "right" });
    doc.text(`Generated: ${formatDate(new Date())}`, { align: "right" });
    doc.strokeColor("#E2E8F0").lineWidth(0.5).moveTo(40, headerTop - 4).lineTo(555, headerTop - 4).stroke();
    doc.strokeColor("#E2E8F0").lineWidth(0.5).moveTo(40, doc.y + 4).lineTo(555, doc.y + 4).stroke();

    doc.moveDown(1.2);
    doc.fontSize(11).font("Helvetica-Bold").fillColor("#0F172A").text("Customer Details");
    doc.moveDown(0.25);
    doc.fontSize(10).font("Helvetica").fillColor("#1F2937");
    doc.text(customer?.name || "Unknown Customer");
    if (customer?.email) doc.text(customer.email);
    if (customer?.phone) doc.text(customer.phone);
    if (customer?.address) doc.text(customer.address);

    doc.moveDown(0.8);
    doc.fontSize(11).font("Helvetica-Bold").fillColor("#0F172A").text("Project Scope");
    doc.moveDown(0.3);
    doc.fontSize(10).fillColor("#475569").text(project?.description || "-", { width: 515, lineGap: 3 });

    doc.moveDown(1);
    doc.fontSize(11).font("Helvetica-Bold").fillColor("#0F172A").text("Ledger Summary");
    doc.moveDown(0.3);
    doc.fontSize(10).fillColor("#1F2937");
    doc.text(`Committed Price: ${formatCurrency(summary.committedAmount || 0, currency)}`);
    doc.text(`Paid Amount: ${formatCurrency(summary.paidAmount || 0, currency)}`);
    doc.text(`Remaining Amount: ${formatCurrency(summary.remainingAmount || 0, currency)}`);

    doc.moveDown(1.2);
    const tableTop = doc.y;
    const columns = [40, 165, 270, 360, 450];
    doc.save().rect(40, tableTop - 6, 515, 22).fill("#EFF6FF").restore();
    doc.fillColor("#0F172A").font("Helvetica-Bold").fontSize(10);
    doc.text("Invoice #", columns[0], tableTop, { width: 120 });
    doc.text("Issue Date", columns[1], tableTop, { width: 95, align: "right" });
    doc.text("Due Date", columns[2], tableTop, { width: 80, align: "right" });
    doc.text("Total", columns[3], tableTop, { width: 80, align: "right" });
    doc.text("Paid", columns[4], tableTop, { width: 95, align: "right" });
    doc.moveTo(40, tableTop + 18).lineTo(555, tableTop + 18).lineWidth(0.5).strokeColor("#CBD5E1").stroke();
    doc.moveDown(1.2);
    doc.font("Helvetica").fontSize(10).fillColor("#1F2937");

    invoices.forEach((invoice: any, index: number) => {
      const rowHeight = Math.max(
        18,
        doc.heightOfString(invoice.invoiceNumber || "-", { width: 120 }) + 8,
        doc.heightOfString(formatCurrency(invoice.totalAmount || 0, currency), { width: 80, align: "right" }) + 8,
        doc.heightOfString(formatCurrency(invoice.paidAmount || 0, currency), { width: 95, align: "right" }) + 8,
      );
      addPageIfNeeded(doc, rowHeight + 8);
      if (index % 2 === 0) {
        doc.save().rect(40, doc.y - 2, 515, rowHeight).fill("#F8FAFC").restore();
      }
      const y = doc.y;
      doc.text(invoice.invoiceNumber || "-", columns[0], y, { width: 120 });
      doc.text(formatDate(invoice.issueDate), columns[1], y, { width: 95, align: "right" });
      doc.text(formatDate(invoice.dueDate), columns[2], y, { width: 80, align: "right" });
      doc.text(formatCurrency(invoice.totalAmount || 0, currency), columns[3], y, { width: 80, align: "right" });
      doc.text(formatCurrency(invoice.paidAmount || 0, currency), columns[4], y, { width: 95, align: "right" });
      doc.moveTo(40, y + rowHeight - 2).lineTo(555, y + rowHeight - 2).lineWidth(0.35).strokeColor("#E2E8F0").stroke();
      doc.y = y + rowHeight + 4;
    });

    addPageIfNeeded(doc, 90);
    doc.moveDown(0.8);
    const summaryY = doc.y;
    doc.font("Helvetica-Bold").fontSize(11).text("Totals", columns[0], summaryY, { width: 250 });
    doc.text(formatCurrency(summary.committedAmount || 0, currency), columns[3], summaryY, { width: 80, align: "right" });
    doc.text(formatCurrency(summary.paidAmount || 0, currency), columns[4], summaryY, { width: 95, align: "right" });

    doc.moveDown(2);
    doc.fontSize(10).fillColor("#475569").text(settings.pdfFooterContent || "Page generated by EliteMek ERP.", { width: 515, align: "center", lineGap: 2 });

    doc.end();
  });
}

export function createPayslipPdfFilename(payroll: any, employee: any) {
  const employeeCode = String(employee?.employeeId || payroll.employeeId || "employee").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  return `payslip-${employeeCode}-${payroll.month || "month"}.pdf`;
}

export function createTaxInvoicePdfFilename(invoice: any) {
  const normalized = String(invoice?.invoiceNumber || `invoice-${invoice?.id || "new"}`).replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  return `${normalized}.pdf`;
}

export function generateTaxInvoicePdf(invoice: any, customer: any, project: any, settings: PdfSettings) {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 32, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", chunk => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const currency = settings.currency || "INR";
    const items = Array.isArray(invoice.items) ? invoice.items : [];
    const sellerName = settings.companyName || "M/s ELITEMEK";
    const sellerAddress = settings.companyAddress || "SF No.429/5, No.4, Veerapandi, Periyamathampalayam, Shantimedu, Coimbatore - 641019";
    const gstNumber = settings.gstNumber || "33INKPS5382C1ZO";
    const bankDetails = [
      "Bank name: Tamil Nadu Mercantile Bank",
      "A/C No: 459150050800306",
      "Holder name: ELITEMEK",
      "IFSC CODE: TMBL0000459",
      "BRANCH: PERIYANAICKENPALAYAM BRANCH",
    ];

    const pageLeft = 32;
    const pageTop = 32;
    const width = 531;
    doc.rect(pageLeft, pageTop, width, 720).stroke("#111827");
    doc.font("Helvetica-Bold").fontSize(10).text("TAX INVOICE", pageLeft, pageTop + 6, { width, align: "center" });
    doc.font("Helvetica").fontSize(7).text("Original", pageLeft + width - 60, pageTop + 8, { width: 48, align: "right" });

    const topY = pageTop + 24;
    const leftW = 260;
    const rightX = pageLeft + leftW;
    const rightW = width - leftW;
    doc.moveTo(rightX, topY).lineTo(rightX, topY + 154).stroke();
    doc.moveTo(pageLeft, topY + 78).lineTo(rightX, topY + 78).stroke();
    doc.moveTo(pageLeft, topY).lineTo(pageLeft + width, topY).stroke();

    doc.font("Helvetica-Bold").fontSize(7).text("SELLER", pageLeft + 4, topY + 4);
    doc.font("Helvetica-Bold").fontSize(8).text(sellerName, pageLeft + 4, topY + 15, { width: leftW - 8 });
    doc.font("Helvetica").fontSize(7).text(sellerAddress, pageLeft + 4, topY + 27, { width: leftW - 8 });
    doc.font("Helvetica-Bold").text(`GSTIN/UIN : ${gstNumber}`, pageLeft + 4, topY + 58);
    doc.text("STATE NAME: TAMIL NADU, CODE: 33", pageLeft + 4, topY + 68);

    doc.font("Helvetica-Bold").fontSize(7).text("BUYER", pageLeft + 4, topY + 84);
    doc.font("Helvetica-Bold").fontSize(8).text(customer?.name || "Buyer", pageLeft + 4, topY + 95, { width: leftW - 8 });
    doc.font("Helvetica").fontSize(7).text(customer?.address || "-", pageLeft + 4, topY + 107, { width: leftW - 8 });
    if (customer?.gstNumber) doc.font("Helvetica-Bold").text(`GST NO: ${customer.gstNumber}`, pageLeft + 4, topY + 138);
    doc.font("Helvetica-Bold").text("STATE NAME: TAMIL NADU, CODE: 33", pageLeft + 4, topY + 148);

    const detailRows = [
      ["Invoice no.", invoice.invoiceNumber || "-", "Dated", formatDate(invoice.issueDate)],
      ["Delivery Note", invoice.deliveryNote || "-", "Mode/Terms of Payment", invoice.modeTermsOfPayment || "100% payment"],
      ["Supplier's Ref.", invoice.supplierRef || "-", "Other Reference(s)", invoice.otherReferences || "-"],
      ["Buyer's order No", invoice.poNumber || "-", "Dated", invoice.poDate ? formatDate(invoice.poDate) : "-"],
      ["Vendor code", invoice.vendorCode || "-", "Delivery Note Date", formatDate(invoice.deliveryNoteDate)],
      ["Qtn No / Date", invoice.quotationNumber || "-", "Destination", invoice.destination || "-"],
      ["Terms of Delivery", invoice.termsOfDelivery || "IMMEDIATE", "", ""],
    ];
    let dy = topY + 4;
    detailRows.forEach(row => {
      doc.rect(rightX, dy - 1, rightW / 2, 21).stroke("#111827");
      doc.rect(rightX + rightW / 2, dy - 1, rightW / 2, 21).stroke("#111827");
      doc.font("Helvetica").fontSize(6.5).text(row[0], rightX + 4, dy + 1, { width: rightW / 2 - 8 });
      doc.font("Helvetica-Bold").fontSize(6.5).text(String(row[1] || "-"), rightX + 4, dy + 9, { width: rightW / 2 - 8 });
      if (row[2]) {
        doc.font("Helvetica").fontSize(6.5).text(row[2], rightX + rightW / 2 + 4, dy + 1, { width: rightW / 2 - 8 });
        doc.font("Helvetica-Bold").fontSize(6.5).text(String(row[3] || "-"), rightX + rightW / 2 + 4, dy + 9, { width: rightW / 2 - 8 });
      }
      dy += 21;
    });

    const tableY = topY + 164;
    const cols = [pageLeft, pageLeft + 24, pageLeft + 245, pageLeft + 300, pageLeft + 344, pageLeft + 402, pageLeft + 442, pageLeft + width];
    doc.moveTo(pageLeft, tableY).lineTo(pageLeft + width, tableY).stroke();
    doc.font("Helvetica-Bold").fontSize(6.5);
    ["Sl No.", "Description of Goods", "SAC/HSN", "Quantity", "Rate", "Per", "Amount"].forEach((head, i) => {
      doc.text(head, cols[i] + 3, tableY + 6, { width: cols[i + 1] - cols[i] - 6, align: i >= 2 ? "center" : "left" });
      doc.moveTo(cols[i + 1], tableY).lineTo(cols[i + 1], tableY + 260).stroke();
    });
    doc.moveTo(pageLeft, tableY + 24).lineTo(pageLeft + width, tableY + 24).stroke();

    let rowY = tableY + 32;
    const visibleInvoiceItems = items.slice(0, 7);
    visibleInvoiceItems.forEach((item: any, index: number) => {
      const taxable = Number(item.quantity || 0) * Number(item.unitPrice || 0);
      doc.font("Helvetica").fontSize(7);
      doc.text(String(index + 1), cols[0] + 3, rowY, { width: cols[1] - cols[0] - 6, align: "center" });
      doc.font("Helvetica-Bold").text(item.description || "-", cols[1] + 3, rowY, { width: cols[2] - cols[1] - 6 });
      doc.font("Helvetica").text(item.hsn || item.sac || "-", cols[2] + 3, rowY, { width: cols[3] - cols[2] - 6, align: "center" });
      doc.text(`${item.quantity || 0} ${item.unit || "Lot"}`, cols[3] + 3, rowY, { width: cols[4] - cols[3] - 6, align: "center" });
      doc.text(formatCurrency(item.unitPrice || 0, currency), cols[4] + 3, rowY, { width: cols[5] - cols[4] - 6, align: "right" });
      doc.text(item.per || "Lot", cols[5] + 3, rowY, { width: cols[6] - cols[5] - 6, align: "center" });
      doc.font("Helvetica-Bold").text(formatCurrency(taxable, currency), cols[6] + 3, rowY, { width: cols[7] - cols[6] - 6, align: "right" });
      rowY += 22;
    });
    if (items.length > visibleInvoiceItems.length) {
      doc.font("Helvetica").fontSize(7).fillColor("#475569");
      doc.text(`+ ${items.length - visibleInvoiceItems.length} additional line item(s) included in totals`, cols[1] + 3, rowY, { width: cols[6] - cols[1] - 6 });
      doc.fillColor("#111827");
    }

    const subtotal = Number(invoice.subtotal || 0);
    const cgst = Number(invoice.taxAmount || 0) / 2;
    const sgst = Number(invoice.taxAmount || 0) / 2;
    const total = Number(invoice.totalAmount || 0);
    const summaryY = tableY + 206;
    doc.font("Helvetica-Bold").fontSize(7);
    [
      ["Amount", subtotal],
      ["Output tax CGST @ 9%", cgst],
      ["Output tax SGST @ 9%", sgst],
      ["Total", total],
    ].forEach((line, index) => {
      const y = summaryY + index * 15;
      doc.text(String(line[0]), cols[1] + 3, y, { width: cols[6] - cols[1] - 6, align: index === 3 ? "center" : "right" });
      doc.text(formatCurrency(Number(line[1]), currency), cols[6] + 3, y, { width: cols[7] - cols[6] - 6, align: "right" });
    });
    doc.moveTo(pageLeft, tableY + 260).lineTo(pageLeft + width, tableY + 260).stroke();

    const wordsY = tableY + 267;
    doc.font("Helvetica-Bold").fontSize(7).text(`Amount Chargeable (in words): Indian Rupees ${total.toLocaleString("en-IN")} only.`, pageLeft + 4, wordsY, { width: width - 8 });
    doc.text("E. & O.E", pageLeft + width - 60, wordsY + 12, { width: 52, align: "right" });

    const taxY = wordsY + 28;
    doc.rect(pageLeft, taxY, width, 60).stroke("#111827");
    doc.font("Helvetica-Bold").fontSize(6.5);
    doc.text("HSN CODE", pageLeft + 40, taxY + 7);
    doc.text("TAXABLE VALUE", pageLeft + 260, taxY + 7);
    doc.text("CGST", pageLeft + 340, taxY + 7);
    doc.text("SGST", pageLeft + 410, taxY + 7);
    doc.text("TOTAL TAX AMOUNT", pageLeft + 476, taxY + 7, { width: 70, align: "center" });
    doc.font("Helvetica").text(formatCurrency(subtotal, currency), pageLeft + 250, taxY + 28);
    doc.text("18%", pageLeft + 340, taxY + 28);
    doc.text(formatCurrency(cgst, currency), pageLeft + 370, taxY + 28);
    doc.text(formatCurrency(sgst, currency), pageLeft + 440, taxY + 28);
    doc.text(formatCurrency(cgst + sgst, currency), pageLeft + 500, taxY + 28, { width: 54, align: "right" });

    const bottomY = taxY + 75;
    doc.font("Helvetica-Bold").fontSize(7).text(`Tax Amount (in words): Indian Rupees ${(cgst + sgst).toLocaleString("en-IN")} only.`, pageLeft + 4, bottomY);
    doc.moveTo(pageLeft + 260, bottomY + 18).lineTo(pageLeft + 260, pageTop + 720).stroke();
    doc.font("Helvetica-Bold").text("Declaration", pageLeft + 4, bottomY + 24);
    doc.font("Helvetica").text("We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.", pageLeft + 4, bottomY + 36, { width: 240 });
    doc.font("Helvetica-Bold").text("Bank Details:", pageLeft + 274, bottomY + 24);
    doc.font("Helvetica").text(bankDetails.join("\n"), pageLeft + 274, bottomY + 36, { width: 245 });
    doc.font("Helvetica-Bold").text("Terms & Conditions", pageLeft + 4, pageTop + 690);
    doc.font("Helvetica").text(invoice.termsConditions || "Kindly pay the Due Amount Immediate", pageLeft + 4, pageTop + 702, { width: 250 });
    doc.font("Helvetica-Bold").text("For ELITEMEK", pageLeft + 400, pageTop + 675, { width: 140, align: "center" });
    doc.circle(pageLeft + 486, pageTop + 704, 22).stroke("#2563EB");
    doc.fontSize(8).fillColor("#2563EB").text("EM", pageLeft + 477, pageTop + 697, { width: 20, align: "center" });
    doc.fillColor("#111827").fontSize(7).text("Authorised Signatory", pageLeft + 398, pageTop + 728, { width: 140, align: "center" });

    doc.end();
  });
}

export function generatePayslipPdf(payroll: any, employee: any, leaveSummary: any, settings: PdfSettings) {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40, bufferPages: true });
    const chunks: Buffer[] = [];

    doc.on("data", chunk => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const currency = settings.currency || "INR";
    const employeeName = [employee?.firstName, employee?.lastName].filter(Boolean).join(" ") || "Unknown Employee";
    const grossPay = Number(payroll.basicSalary || 0) + Number(payroll.hra || 0) + Number(payroll.allowances || 0) + Number(payroll.overtimeAmount || 0) + Number(payroll.bonusAmount || 0) + Number(payroll.otherPayments || 0);
    const statutoryDeductions = Number(payroll.pf || 0) + Number(payroll.esic || 0);
    const otherDeductions = Number(payroll.deductions || 0);
    const adjustmentSummary = Array.isArray(payroll.adjustmentSummary) ? payroll.adjustmentSummary : [];

    drawCompanyHeader(doc, settings);
    doc.moveDown(1);
    doc.fontSize(17).fillColor("#0F172A").font("Helvetica-Bold").text("Employee Payslip", { align: "right" });
    doc.fontSize(10).font("Helvetica").fillColor("#475569").text(`Month: ${payroll.month || "-"}`, { align: "right" });
    doc.text(`Generated: ${formatDate(new Date())}`, { align: "right" });
    doc.moveDown(1);

    const boxTop = doc.y;
    doc.save().roundedRect(40, boxTop, 515, 92, 6).fill("#F8FAFC").restore();
    doc.font("Helvetica-Bold").fontSize(11).fillColor("#0F172A").text("Employee Details", 56, boxTop + 14);
    doc.font("Helvetica").fontSize(10).fillColor("#334155");
    doc.text(`Name: ${employeeName}`, 56, boxTop + 34);
    doc.text(`Employee ID: ${employee?.employeeId || payroll.employeeId || "-"}`, 56, boxTop + 50);
    doc.text(`Department: ${employee?.department || "-"}`, 56, boxTop + 66);
    doc.text(`Designation: ${employee?.designation || "-"}`, 300, boxTop + 34);
    doc.text(`PAN: ${employee?.panNumber || "-"}`, 300, boxTop + 50);
    doc.text(`Bank: ${employee?.bankName || "-"} ${employee?.bankAccount ? `(${employee.bankAccount})` : ""}`, 300, boxTop + 66);
    doc.y = boxTop + 112;

    doc.font("Helvetica-Bold").fontSize(11).fillColor("#0F172A").text("Attendance & Leave");
    doc.moveDown(0.35);
    doc.font("Helvetica").fontSize(10).fillColor("#334155");
    doc.text(`Working Days: ${payroll.totalWorkingDays ?? 0}`);
    doc.text(`Present / Paid Days: ${payroll.presentDays ?? 0}`);
    doc.text(`Absent / LOP Days: ${payroll.absentDays ?? 0}`);
    doc.text(`Leave Records: ${leaveSummary?.totalLeaves || 0} (${leaveSummary?.approvedLeaves || 0} approved, ${leaveSummary?.pendingLeaves || 0} pending)`);

    const leaveRecords = Array.isArray(leaveSummary?.leaveRecords) ? leaveSummary.leaveRecords : [];
    if (leaveRecords.length > 0) {
      doc.moveDown(0.35);
      const tableTop = doc.y;
      const cols = [50, 190, 340, 420, 515];
      const visibleLeaveRecords = leaveRecords.slice(0, 5);
      doc.save().rect(45, tableTop - 6, 505, 22 + visibleLeaveRecords.length * 18 + (leaveRecords.length > visibleLeaveRecords.length ? 16 : 0)).fill("#F8FAFC").restore();
      doc.font("Helvetica-Bold").fontSize(10).fillColor("#0F172A");
      doc.text("Type", cols[0], tableTop, { width: 130 });
      doc.text("Dates", cols[1], tableTop, { width: 140 });
      doc.text("Days", cols[2], tableTop, { width: 50, align: "right" });
      doc.text("Status", cols[3], tableTop, { width: 95 });
      doc.text("Reason", cols[4], tableTop, { width: 80, align: "right" });
      doc.moveDown(1.2);
      doc.font("Helvetica").fontSize(9).fillColor("#1F2937");

      visibleLeaveRecords.forEach((record: any) => {
        const y = doc.y;
        doc.text(record.leaveType || "Leave", cols[0], y, { width: 130 });
        doc.text(`${formatDate(record.startDate)} – ${formatDate(record.endDate)}`, cols[1], y, { width: 140 });
        doc.text(`${record.days || 0}d`, cols[2], y, { width: 50, align: "right" });
        doc.text(record.status || "pending", cols[3], y, { width: 95 });
        doc.text(record.reason || "-", cols[4], y, { width: 80, align: "right" });
        doc.moveDown(0.85);
      });
      if (leaveRecords.length > visibleLeaveRecords.length) {
        doc.font("Helvetica").fontSize(8).fillColor("#64748B").text(`${leaveRecords.length - visibleLeaveRecords.length} more leave record(s) included in leave totals.`, 50, doc.y + 2, { width: 490 });
        doc.moveDown(0.85);
      }
    }

    if (payroll.excuseNotes) {
      doc.moveDown(0.35);
      doc.text(`Notes: ${payroll.excuseNotes}`, { width: 515, align: "center" });
    }

    addPageIfNeeded(doc, 245);
    doc.moveDown(1);
    const tableTop = doc.y;
    doc.save().rect(40, tableTop - 6, 515, 22).fill("#EFF6FF").restore();
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#0F172A");
    doc.text("Earnings", 50, tableTop, { width: 210 });
    doc.text("Amount", 260, tableTop, { width: 90, align: "right" });
    doc.text("Deductions", 370, tableTop, { width: 95 });
    doc.text("Amount", 465, tableTop, { width: 80, align: "right" });
    doc.moveDown(1.2);

    const rows = [
      ["Basic Salary", payroll.basicSalary, "PF", payroll.pf],
      ["HRA", payroll.hra, "ESIC", payroll.esic],
      ["Allowances", payroll.allowances, "Advance", payroll.advanceDeduction],
      [`Overtime (${Number(payroll.overtimeHours || 0)} hrs)`, payroll.overtimeAmount, "Other Deductions", Math.max(0, otherDeductions - Number(payroll.advanceDeduction || 0) - statutoryDeductions)],
      ["Bonus", payroll.bonusAmount, "", ""],
      ["Other Payments", payroll.otherPayments, "", ""],
    ];

    doc.font("Helvetica").fontSize(10).fillColor("#1F2937");
    rows.forEach((row, index) => {
      const y = doc.y;
      if (index % 2 === 0) doc.save().rect(40, y - 2, 515, 18).fill("#F8FAFC").restore();
      doc.text(String(row[0]), 50, y, { width: 210 });
      doc.text(formatCurrency(row[1] || 0, currency), 260, y, { width: 90, align: "right" });
      doc.text(String(row[2]), 370, y, { width: 95 });
      doc.text(row[2] ? formatCurrency(row[3] || 0, currency) : "", 465, y, { width: 80, align: "right" });
      doc.moveDown(0.85);
    });

    if (adjustmentSummary.length > 0) {
      doc.moveDown(0.6);
      doc.font("Helvetica-Bold").fontSize(10).fillColor("#0F172A").text("Payroll Inputs");
      doc.moveDown(0.25);
      doc.font("Helvetica").fontSize(9).fillColor("#334155");
      adjustmentSummary.slice(0, 4).forEach((item: any) => {
        doc.text(`${item.label || item.type}: ${item.hours ? `${item.hours} hrs, ` : ""}${formatCurrency(item.amount || 0, currency)}`, { width: 515 });
      });
      if (adjustmentSummary.length > 4) {
        doc.text(`${adjustmentSummary.length - 4} more payroll input(s) included in totals.`, { width: 515 });
      }
    }

    addPageIfNeeded(doc, 90);
    doc.moveDown(0.5);
    const totalTop = doc.y;
    doc.save().roundedRect(40, totalTop - 4, 515, 54, 6).fill("#F1F5F9").restore();
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#0F172A");
    doc.text("Gross Earnings", 50, totalTop + 8);
    doc.text(formatCurrency(grossPay, currency), 260, totalTop + 8, { width: 90, align: "right" });
    doc.text("Total Deductions", 370, totalTop + 8);
    doc.text(formatCurrency(statutoryDeductions + otherDeductions, currency), 465, totalTop + 8, { width: 80, align: "right" });
    doc.fontSize(12).text("Net Salary", 370, totalTop + 30);
    doc.text(formatCurrency(payroll.netSalary || 0, currency), 465, totalTop + 30, { width: 80, align: "right" });

    doc.moveDown(4);
    doc.font("Helvetica").fontSize(9).fillColor("#64748B").text(
      settings.pdfFooterContent || "This is a system generated payslip.",
      { width: 515, align: "center", lineGap: 2 },
    );

    doc.end();
  });
}
