import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import ExcelJS from "exceljs";

export interface DashboardExportData {
  weekStart: string;
  totalOperators: number;
  totalProducts: number;
  totalQuantityCompleted: number;
  totalTimeMinutes: number;
  avgEfficiency: number | null;
  products: Array<{
    productName: string;
    totalQuantityCompleted: number;
    allTimeEfficiency: number | null;
    weekEfficiency: number | null;
  }>;
  operators: Array<{
    operatorName: string;
    employeeId: string;
    totalQuantityCompleted: number;
    totalReports: number;
    efficiency: number | null;
  }>;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function effLabel(pct: number | null): string {
  if (pct === null) return "—";
  return `${Math.round(pct)}%`;
}

function effColor(pct: number | null): [number, number, number] {
  if (pct === null) return [120, 120, 130];
  if (pct >= 100) return [22, 163, 74];
  if (pct >= 90) return [180, 120, 0];
  return [220, 38, 38];
}

async function loadFontBase64(url: string): Promise<string> {
  const res = await fetch(url);
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function isoToDisplay(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function isoWeekNumber(iso: string): number {
  const d = new Date(iso + "T00:00:00");
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const startOfWeek1 = new Date(jan4);
  startOfWeek1.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  return Math.floor((d.getTime() - startOfWeek1.getTime()) / (7 * 86400000)) + 1;
}

// ── PDF export ────────────────────────────────────────────────────────────────

export async function exportDashboardPdf(data: DashboardExportData): Promise<void> {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  const [regularB64, boldB64] = await Promise.all([
    loadFontBase64("/fonts/Roboto-Regular.ttf"),
    loadFontBase64("/fonts/Roboto-Bold.ttf"),
  ]);
  doc.addFileToVFS("Roboto-Regular.ttf", regularB64);
  doc.addFileToVFS("Roboto-Bold.ttf", boldB64);
  doc.addFont("Roboto-Regular.ttf", "Roboto", "normal");
  doc.addFont("Roboto-Bold.ttf", "Roboto", "bold");

  const pageW = doc.internal.pageSize.getWidth();
  const now = new Date().toLocaleString();
  const cw = isoWeekNumber(data.weekStart);
  const weekLabel = `CW${cw} — week of ${isoToDisplay(data.weekStart)}`;

  // ── header band ─────────────────────────────────────────────────────────────
  doc.setFillColor(20, 30, 48);
  doc.rect(0, 0, pageW, 22, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont("Roboto", "bold");
  doc.text("Production Tracker", 10, 10);
  doc.setFontSize(10);
  doc.setFont("Roboto", "normal");
  doc.text("Weekly Performance Summary", 10, 17);

  doc.setFontSize(8);
  doc.setTextColor(180, 190, 210);
  doc.text(`Generated: ${now}`, pageW - 10, 10, { align: "right" });
  doc.text(weekLabel, pageW - 10, 17, { align: "right" });

  // ── summary strip ────────────────────────────────────────────────────────────
  const summaryY = 27;
  const summaryItems = [
    { label: "Total Pieces", value: String(data.totalQuantityCompleted) },
    { label: "Time Logged", value: `${(data.totalTimeMinutes / 60).toFixed(1)} h` },
    { label: "Avg Efficiency", value: effLabel(data.avgEfficiency) },
    { label: "Operators", value: String(data.totalOperators) },
    { label: "Products", value: String(data.totalProducts) },
  ];

  const boxW = 44;
  const boxH = 13;
  const boxGap = 4;
  summaryItems.forEach((item, i) => {
    const x = 10 + i * (boxW + boxGap);
    doc.setFillColor(245, 247, 250);
    doc.roundedRect(x, summaryY, boxW, boxH, 1.5, 1.5, "F");
    doc.setTextColor(100, 110, 130);
    doc.setFontSize(6.5);
    doc.setFont("Roboto", "normal");
    doc.text(item.label.toUpperCase(), x + boxW / 2, summaryY + 4.5, { align: "center" });
    doc.setTextColor(20, 30, 48);
    doc.setFontSize(10);
    doc.setFont("Roboto", "bold");
    doc.text(item.value, x + boxW / 2, summaryY + 11, { align: "center" });
  });

  let cursor = summaryY + boxH + 6;

  // ── product performance table ─────────────────────────────────────────────
  doc.setFontSize(8);
  doc.setFont("Roboto", "bold");
  doc.setTextColor(20, 30, 48);
  doc.text("Product Performance", 10, cursor);
  cursor += 2;

  autoTable(doc, {
    startY: cursor,
    head: [["Product", "Pieces (all-time)", "Efficiency — all-time", "Efficiency — this week"]],
    body: data.products.map((p) => [
      p.productName,
      p.totalQuantityCompleted,
      effLabel(p.allTimeEfficiency),
      effLabel(p.weekEfficiency),
    ]),
    styles: { font: "Roboto", fontSize: 8, cellPadding: 2.5 },
    headStyles: { fillColor: [20, 30, 48], textColor: [255, 255, 255], font: "Roboto", fontStyle: "bold", fontSize: 7.5 },
    columnStyles: { 0: { cellWidth: 90 }, 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" } },
    alternateRowStyles: { fillColor: [248, 249, 252] },
    didParseCell(data) {
      if (data.section === "body" && (data.column.index === 2 || data.column.index === 3)) {
        const pct = data.column.index === 2
          ? (data.row.raw as (string | number)[])[2]
          : (data.row.raw as (string | number)[])[3];
        const num = typeof pct === "string" ? parseFloat(pct) : NaN;
        if (!isNaN(num)) data.cell.styles.textColor = effColor(num);
      }
    },
    margin: { left: 10, right: 10 },
  });

  cursor = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? cursor;
  cursor += 8;

  // new page if not enough space
  if (cursor > doc.internal.pageSize.getHeight() - 50) {
    doc.addPage();
    cursor = 15;
  }

  // ── operator productivity table ───────────────────────────────────────────
  doc.setFontSize(8);
  doc.setFont("Roboto", "bold");
  doc.setTextColor(20, 30, 48);
  doc.text("Operator Productivity", 10, cursor);
  cursor += 2;

  autoTable(doc, {
    startY: cursor,
    head: [["Operator", "Emp ID", "Pieces", "Reports", "Efficiency"]],
    body: data.operators
      .slice()
      .sort((a, b) => (b.efficiency ?? -1) - (a.efficiency ?? -1))
      .map((op) => [op.operatorName, op.employeeId, op.totalQuantityCompleted, op.totalReports, effLabel(op.efficiency)]),
    styles: { font: "Roboto", fontSize: 8, cellPadding: 2.5 },
    headStyles: { fillColor: [20, 30, 48], textColor: [255, 255, 255], font: "Roboto", fontStyle: "bold", fontSize: 7.5 },
    columnStyles: { 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" } },
    alternateRowStyles: { fillColor: [248, 249, 252] },
    didParseCell(data) {
      if (data.section === "body" && data.column.index === 4) {
        const pct = (data.row.raw as (string | number)[])[4];
        const num = typeof pct === "string" ? parseFloat(pct) : NaN;
        if (!isNaN(num)) data.cell.styles.textColor = effColor(num);
      }
    },
    margin: { left: 10, right: 10 },
  });

  // ── footer on every page ─────────────────────────────────────────────────
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    const pW = doc.internal.pageSize.getWidth();
    const pH = doc.internal.pageSize.getHeight();
    doc.setFontSize(7);
    doc.setFont("Roboto", "normal");
    doc.setTextColor(160, 165, 180);
    doc.text("Production Tracker — Weekly Summary", 10, pH - 5);
    doc.text(`Page ${i} of ${totalPages}`, pW - 10, pH - 5, { align: "right" });
  }

  const filename = `dashboard-summary-cw${cw}.pdf`;
  doc.save(filename);
}

// ── Excel export ──────────────────────────────────────────────────────────────

function xlsxEffFill(pct: number | null): ExcelJS.Fill {
  if (pct === null) return { type: "pattern", pattern: "none" };
  if (pct >= 100) return { type: "pattern", pattern: "solid", fgColor: { argb: "FFD1FAE5" } };
  if (pct >= 90) return { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } };
  return { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } };
}

function xlsxEffFont(pct: number | null): Partial<ExcelJS.Font> {
  if (pct === null) return { color: { argb: "FF888888" } };
  if (pct >= 100) return { bold: true, color: { argb: "FF15803D" } };
  if (pct >= 90) return { bold: true, color: { argb: "FFB45309" } };
  return { bold: true, color: { argb: "FFDC2626" } };
}

const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF14253F" } };
const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: "FFFFFFFF" }, name: "Calibri", size: 10 };

function styleHeader(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = { bottom: { style: "thin", color: { argb: "FF334155" } } };
  });
  row.height = 20;
}

export async function exportDashboardXlsx(data: DashboardExportData): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Production Tracker";
  wb.created = new Date();
  const cw = isoWeekNumber(data.weekStart);

  // ── Sheet 1: Summary ───────────────────────────────────────────────────────
  const wsSummary = wb.addWorksheet("Summary");
  wsSummary.columns = [
    { header: "Metric", key: "metric", width: 28 },
    { header: "Value", key: "value", width: 22 },
  ];
  styleHeader(wsSummary.getRow(1));

  const summaryRows = [
    { metric: "Week", value: `CW${cw} — ${isoToDisplay(data.weekStart)}` },
    { metric: "Generated", value: new Date().toLocaleString() },
    { metric: "", value: "" },
    { metric: "Total Pieces Completed", value: data.totalQuantityCompleted },
    { metric: "Total Time Logged (hours)", value: parseFloat((data.totalTimeMinutes / 60).toFixed(1)) },
    { metric: "Average Efficiency", value: data.avgEfficiency !== null ? data.avgEfficiency / 100 : null },
    { metric: "Total Operators", value: data.totalOperators },
    { metric: "Total Products", value: data.totalProducts },
  ];

  summaryRows.forEach((r) => {
    const row = wsSummary.addRow(r);
    if (r.metric === "Average Efficiency" && data.avgEfficiency !== null) {
      const cell = row.getCell("value");
      cell.numFmt = "0%";
      cell.fill = xlsxEffFill(data.avgEfficiency);
      cell.font = xlsxEffFont(data.avgEfficiency);
    }
    row.getCell("metric").font = { bold: r.metric !== "" && r.metric !== "Week" && r.metric !== "Generated", name: "Calibri", size: 10 };
  });

  // ── Sheet 2: Products ──────────────────────────────────────────────────────
  const wsProducts = wb.addWorksheet("Products");
  wsProducts.columns = [
    { header: "Product", key: "product", width: 36 },
    { header: "Pieces (all-time)", key: "pieces", width: 20 },
    { header: "Efficiency — all-time", key: "effAllTime", width: 22 },
    { header: "Efficiency — this week", key: "effWeek", width: 22 },
  ];
  styleHeader(wsProducts.getRow(1));

  data.products
    .slice()
    .sort((a, b) => (b.allTimeEfficiency ?? -1) - (a.allTimeEfficiency ?? -1))
    .forEach((p, i) => {
      const row = wsProducts.addRow({
        product: p.productName,
        pieces: p.totalQuantityCompleted,
        effAllTime: p.allTimeEfficiency !== null ? p.allTimeEfficiency / 100 : null,
        effWeek: p.weekEfficiency !== null ? p.weekEfficiency / 100 : null,
      });
      if (i % 2 === 1) {
        row.eachCell((cell) => {
          if (!cell.fill || (cell.fill as { pattern?: string }).pattern === "none") {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8F9FC" } };
          }
        });
      }
      const effAtCell = row.getCell("effAllTime");
      const effWkCell = row.getCell("effWeek");
      effAtCell.numFmt = "0%";
      effWkCell.numFmt = "0%";
      effAtCell.fill = xlsxEffFill(p.allTimeEfficiency);
      effAtCell.font = xlsxEffFont(p.allTimeEfficiency);
      effWkCell.fill = xlsxEffFill(p.weekEfficiency);
      effWkCell.font = xlsxEffFont(p.weekEfficiency);
      row.getCell("pieces").alignment = { horizontal: "right" };
    });

  // ── Sheet 3: Operators ────────────────────────────────────────────────────
  const wsOps = wb.addWorksheet("Operators");
  wsOps.columns = [
    { header: "Operator", key: "operator", width: 28 },
    { header: "Emp ID", key: "empId", width: 16 },
    { header: "Pieces", key: "pieces", width: 14 },
    { header: "Reports", key: "reports", width: 14 },
    { header: "Efficiency", key: "eff", width: 16 },
  ];
  styleHeader(wsOps.getRow(1));

  data.operators
    .slice()
    .sort((a, b) => (b.efficiency ?? -1) - (a.efficiency ?? -1))
    .forEach((op, i) => {
      const row = wsOps.addRow({
        operator: op.operatorName,
        empId: op.employeeId,
        pieces: op.totalQuantityCompleted,
        reports: op.totalReports,
        eff: op.efficiency !== null ? op.efficiency / 100 : null,
      });
      if (i % 2 === 1) {
        row.eachCell((cell) => {
          if (!cell.fill || (cell.fill as { pattern?: string }).pattern === "none") {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8F9FC" } };
          }
        });
      }
      const effCell = row.getCell("eff");
      effCell.numFmt = "0%";
      effCell.fill = xlsxEffFill(op.efficiency);
      effCell.font = xlsxEffFont(op.efficiency);
      row.getCell("pieces").alignment = { horizontal: "right" };
      row.getCell("reports").alignment = { horizontal: "right" };
    });

  // ── download ───────────────────────────────────────────────────────────────
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer as ArrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `dashboard-summary-cw${cw}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
