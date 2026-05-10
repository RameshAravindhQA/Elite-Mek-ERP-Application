type ExportColumn<T> = {
  header: string;
  value: (row: T) => string | number | null | undefined;
};

const buildExportHeader = () => {
  const companyLines = [
    localStorage.getItem("company-name"),
    localStorage.getItem("company-email"),
    localStorage.getItem("company-phone"),
    localStorage.getItem("company-phone2"),
    localStorage.getItem("company-website"),
    localStorage.getItem("company-address"),
  ].filter(Boolean) as string[];
  const pdfHeaderContent = localStorage.getItem("pdf-header-content") || "";
  const extraLines = pdfHeaderContent
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !companyLines.includes(line));
  return [...companyLines, ...extraLines].join("\n");
};

const buildExportFooter = () => {
  return localStorage.getItem("pdf-footer-content") || "";
};

const escapeCsv = (value: unknown) => {
  const text = value == null ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export function downloadRowsAsCsv<T>(fileName: string, rows: T[], columns: ExportColumn<T>[]) {
  if (!rows.length) return false;
  const exportHeader = buildExportHeader();
  const exportFooter = localStorage.getItem("excel-footer-content") || buildExportFooter();
  const headerRows = exportHeader
    ? [
        ...exportHeader.split(/\r?\n/).map((line) => [escapeCsv(line), ...Array(Math.max(0, columns.length - 1)).fill("")].join(",")),
        Array(columns.length).fill("").join(","),
      ]
    : [];
  const footerRows = exportFooter
    ? [
        Array(columns.length).fill("").join(","),
        ...exportFooter.split(/\r?\n/).map((line) => [escapeCsv(line), ...Array(Math.max(0, columns.length - 1)).fill("")].join(",")),
      ]
    : [];
  const csv = [
    ...headerRows,
    columns.map((column) => escapeCsv(column.header)).join(","),
    ...rows.map((row) => columns.map((column) => escapeCsv(column.value(row))).join(",")),
    ...footerRows,
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  return true;
}

export function openRowsCsv<T>(fileName: string, rows: T[], columns: ExportColumn<T>[]) {
  if (!rows.length) return false;
  const exportHeader = buildExportHeader();
  const exportFooter = localStorage.getItem("excel-footer-content") || buildExportFooter();
  const headerRows = exportHeader
    ? [
        ...exportHeader.split(/\r?\n/).map((line) => [escapeCsv(line), ...Array(Math.max(0, columns.length - 1)).fill("")].join(",")),
        Array(columns.length).fill("").join(","),
      ]
    : [];
  const footerRows = exportFooter
    ? [
        Array(columns.length).fill("").join(","),
        ...exportFooter.split(/\r?\n/).map((line) => [escapeCsv(line), ...Array(Math.max(0, columns.length - 1)).fill("")].join(",")),
      ]
    : [];
  const csv = [
    ...headerRows,
    columns.map((column) => escapeCsv(column.header)).join(","),
    ...rows.map((row) => columns.map((column) => escapeCsv(column.value(row))).join(",")),
    ...footerRows,
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

export function openRowsPdfPrint<T>(title: string, rows: T[], columns: ExportColumn<T>[]) {
  if (!rows.length) return false;
  const popup = window.open("", "_blank");
  if (!popup) return false;
  const headerCells = columns.map((column) => `<th>${escapeHtml(column.header)}</th>`).join("");
  const bodyRows = rows.map((row) => (
    `<tr>${columns.map((column) => `<td>${escapeHtml(column.value(row) ?? "")}</td>`).join("")}</tr>`
  )).join("");
  const exportHeader = buildExportHeader();
  const exportFooter = buildExportFooter();
  const tableHeaderColor = localStorage.getItem("table-header-color") || "#1D4ED8";
  const headerLines = exportHeader.split(/\r?\n/).filter(Boolean);
  const companyName = headerLines[0] || "Elite Mek";
  const companyDetails = headerLines.slice(1).map(line => escapeHtml(line)).join("<br/>");
  const generatedAt = new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  const footerHtml = exportFooter ? `<div class="footer-note">${escapeHtml(exportFooter).replace(/\n/g, '<br/>')}</div>` : "";

  popup.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Inter, Arial, sans-serif; color: #0f172a; margin: 0; background: #f8fafc; }
    .page { max-width: 1120px; margin: 28px auto; background: #ffffff; border: 1px solid #e2e8f0; box-shadow: 0 20px 60px rgba(15, 23, 42, 0.10); }
    .brand-bar { height: 7px; background: linear-gradient(90deg, ${escapeHtml(tableHeaderColor)}, #0f766e); }
    .header { display: flex; justify-content: space-between; gap: 28px; padding: 28px 32px 22px; border-bottom: 1px solid #e2e8f0; }
    .company { max-width: 58%; }
    .company-name { margin: 0; font-size: 22px; line-height: 1.1; font-weight: 800; color: #0f172a; }
    .company-details { margin-top: 9px; font-size: 12px; line-height: 1.55; color: #475569; }
    .report-meta { text-align: right; min-width: 260px; }
    .report-title { margin: 0; font-size: 24px; line-height: 1.1; font-weight: 800; color: ${escapeHtml(tableHeaderColor)}; }
    .meta-row { margin-top: 10px; font-size: 12px; color: #64748b; }
    .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; padding: 18px 32px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; }
    .summary-card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; background: #ffffff; }
    .summary-label { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; }
    .summary-value { margin-top: 4px; font-size: 15px; font-weight: 800; color: #0f172a; }
    .table-wrap { padding: 24px 32px 30px; }
    table { width: 100%; table-layout: fixed; border-collapse: separate; border-spacing: 0; font-size: 11px; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; }
    th, td { border-right: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; padding: 9px 10px; text-align: left; vertical-align: top; overflow-wrap: anywhere; word-break: break-word; }
    th:last-child, td:last-child { border-right: 0; }
    tr:last-child td { border-bottom: 0; }
    th { background: ${escapeHtml(tableHeaderColor)}; color: #ffffff; font-weight: 800; }
    tr:nth-child(even) td { background: #f8fafc; }
    td { color: #1f2937; }
    thead { display: table-header-group; }
    tfoot { display: table-footer-group; }
    tr, .summary-card { break-inside: avoid; page-break-inside: avoid; }
    .footer-note { margin-top: 18px; border-top: 1px solid #e2e8f0; padding-top: 14px; font-size: 11px; color: #64748b; line-height: 1.6; text-align: center; }
    @media print {
      @page { size: landscape; margin: 12mm; }
      body { background: #ffffff; }
      .page { margin: 0; max-width: none; border: 0; box-shadow: none; }
      .header { padding: 18px 0 14px; }
      .summary, .table-wrap { padding-left: 0; padding-right: 0; }
      .summary { grid-template-columns: repeat(3, 1fr); }
      table { font-size: 8.5px; border-radius: 0; }
      th, td { padding: 5px 6px; }
    }
  </style>
</head>
<body>
  <main class="page">
    <div class="brand-bar"></div>
    <section class="header">
      <div class="company">
        <h1 class="company-name">${escapeHtml(companyName)}</h1>
        <div class="company-details">${companyDetails}</div>
      </div>
      <div class="report-meta">
        <h2 class="report-title">${escapeHtml(title)}</h2>
        <div class="meta-row">Generated: ${escapeHtml(generatedAt)}</div>
      </div>
    </section>
    <section class="summary">
      <div class="summary-card"><div class="summary-label">Records</div><div class="summary-value">${rows.length}</div></div>
      <div class="summary-card"><div class="summary-label">Columns</div><div class="summary-value">${columns.length}</div></div>
      <div class="summary-card"><div class="summary-label">Format</div><div class="summary-value">PDF Print</div></div>
    </section>
    <section class="table-wrap">
      <table>
        <thead><tr>${headerCells}</tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>
      ${footerHtml}
    </section>
  </main>
  <script>window.onload = () => setTimeout(() => window.print(), 150);</script>
</body>
</html>`);
  popup.document.close();
  popup.focus();
  return true;
}

function escapeHtml(value: unknown) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
