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

export async function downloadRowsPdfPrint<T>(title: string, rows: T[], columns: ExportColumn<T>[], fileName?: string) {
  if (!rows.length) return false;
  
  try {
    const exportHeader = buildExportHeader();
    const headerLines = exportHeader.split(/\r?\n/).filter(Boolean);
    const companyName = headerLines[0] || "Elite Mek";
    const companyDetails = headerLines.slice(1).join("\n");
    const companyLogo = localStorage.getItem("company-logo") || "";
    const tableHeaderColor = localStorage.getItem("table-header-color") || undefined;

    // Format rows as plain objects for API
    const formattedRows = rows.map((row) => {
      const obj: Record<string, string | number> = {};
      columns.forEach((column) => {
        obj[column.header] = String(column.value(row) ?? "");
      });
      return obj;
    });

    // Call PDF generation endpoint
    const response = await fetch("/api/reports/generate-pdf", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
      body: JSON.stringify({
        title,
        headers: columns.map((col) => col.header),
        rows: formattedRows,
        companyName,
        companyDetails,
        companyLogo,
        tableHeaderColor,
      }),
    });

    if (!response.ok) {
      console.error("PDF generation failed");
      return false;
    }

    // Download the PDF
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName || `${title.replace(/\s+/g, "-").toLowerCase()}-${Date.now()}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    setTimeout(() => URL.revokeObjectURL(url), 100);
    return true;
  } catch (error) {
    console.error("PDF download error:", error);
    return false;
  }
}

export function openRowsPdfPrint<T>(title: string, rows: T[], columns: ExportColumn<T>[]) {
  return downloadRowsPdfPrint(title, rows, columns);
}

function escapeHtml(value: unknown) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
