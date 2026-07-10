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
    styles: { font: "Roboto", fontSize: 8, cellPadding: 2.5, lineWidth: 0.15, lineColor: [208, 216, 228] },
    headStyles: { fillColor: [20, 30, 48], textColor: [255, 255, 255], font: "Roboto", fontStyle: "bold", fontSize: 7.5, lineWidth: 0.15, lineColor: [26, 42, 58] },
    columnStyles: { 0: { cellWidth: 90 }, 1: { halign: "center" }, 2: { halign: "center" }, 3: { halign: "center" } },
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
    styles: { font: "Roboto", fontSize: 8, cellPadding: 2.5, lineWidth: 0.15, lineColor: [208, 216, 228] },
    headStyles: { fillColor: [20, 30, 48], textColor: [255, 255, 255], font: "Roboto", fontStyle: "bold", fontSize: 7.5, lineWidth: 0.15, lineColor: [26, 42, 58] },
    columnStyles: { 2: { halign: "center" }, 3: { halign: "center" }, 4: { halign: "center" } },
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

// ── Step 99 export ────────────────────────────────────────────────────────────

export interface Step99ExportRow {
  productName: string;
  entries: number;
  quantityProduced: number;
  avgTeamSize: number | null;
  efficiency: number | null;
}

export interface Step99DailyRow {
  date: string;
  productName: string;
  quantityProduced: number;
  operatorCount: number | null;
}

export interface Step99ExportData {
  from: string;
  to: string;
  rows: Step99ExportRow[];
  dailyRows: Step99DailyRow[];
}

export async function exportStep99Pdf(data: Step99ExportData): Promise<void> {
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

  const fromLabel = isoToDisplay(data.from);
  const toLabel = data.to === data.from ? fromLabel : isoToDisplay(data.to);
  const periodLabel = data.from === data.to ? fromLabel : `${fromLabel} — ${toLabel}`;

  // ── header band ─────────────────────────────────────────────────────────────
  doc.setFillColor(20, 30, 48);
  doc.rect(0, 0, pageW, 22, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont("Roboto", "bold");
  doc.text("Production Tracker", 10, 10);
  doc.setFontSize(10);
  doc.setFont("Roboto", "normal");
  doc.text("Step 99 — Ready Parts Report", 10, 17);

  doc.setFontSize(8);
  doc.setTextColor(180, 190, 210);
  doc.text(`Generated: ${now}`, pageW - 10, 14, { align: "right" });

  // ── summary strip ────────────────────────────────────────────────────────────
  const summaryY = 27;
  const totalPieces = data.rows.reduce((s, r) => s + r.quantityProduced, 0);
  const totalEntries = data.rows.reduce((s, r) => s + r.entries, 0);
  const activeRows = data.rows.filter((r) => r.entries > 0);
  const effVals = activeRows.map((r) => r.efficiency).filter((v): v is number => v !== null);
  const avgEff = effVals.length > 0 ? effVals.reduce((s, v) => s + v, 0) / effVals.length : null;

  const summaryItems = [
    { label: "Total Pieces", value: String(totalPieces) },
    { label: "Total Entries", value: String(totalEntries) },
    { label: "Products Active", value: String(activeRows.length) },
    { label: "Avg Efficiency", value: effLabel(avgEff) },
  ];

  const boxW = 52;
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

  let cursor = summaryY + boxH + 8;

  doc.setFontSize(9);
  doc.setFont("Roboto", "bold");
  doc.setTextColor(20, 30, 48);
  doc.text("Product Breakdown — Step 99", 10, cursor);
  cursor += 5;
  doc.setFontSize(8);
  doc.setFont("Roboto", "normal");
  doc.setTextColor(60, 80, 110);
  doc.text(`Period: ${periodLabel}`, 10, cursor);
  cursor += 3;

  const tableRows = data.rows
    .slice()
    .sort((a, b) => b.entries - a.entries || b.quantityProduced - a.quantityProduced)
    .map((r) => [
      r.productName,
      r.entries,
      r.quantityProduced,
      r.avgTeamSize !== null ? r.avgTeamSize.toFixed(1) : "—",
      effLabel(r.efficiency),
    ]);

  autoTable(doc, {
    startY: cursor,
    head: [["Product", "Entries", "Qty Produced", "Avg Team Size", "Efficiency"]],
    body: tableRows,
    styles: { font: "Roboto", fontSize: 8, cellPadding: 2.5, lineWidth: 0.15, lineColor: [208, 216, 228] },
    headStyles: { fillColor: [20, 30, 48], textColor: [255, 255, 255], font: "Roboto", fontStyle: "bold", fontSize: 7.5, lineWidth: 0.15, lineColor: [26, 42, 58] },
    columnStyles: {
      0: { cellWidth: 90 },
      1: { halign: "center" },
      2: { halign: "center" },
      3: { halign: "center" },
      4: { halign: "center" },
    },
    alternateRowStyles: { fillColor: [248, 249, 252] },
    didParseCell(hookData) {
      if (hookData.section === "body" && hookData.column.index === 4) {
        const val = (hookData.row.raw as (string | number)[])[4];
        const num = typeof val === "string" ? parseFloat(val) : NaN;
        if (!isNaN(num)) hookData.cell.styles.textColor = effColor(num);
      }
    },
    margin: { left: 10, right: 10 },
  });

  // ── daily breakdown — one table per product ───────────────────────────────
  if (data.dailyRows.length > 0) {
    // Group rows by product name, preserving the order from the summary table
    const productOrder = data.rows
      .slice()
      .sort((a, b) => b.entries - a.entries || b.quantityProduced - a.quantityProduced)
      .map((r) => r.productName);

    const byProduct = new Map<string, typeof data.dailyRows>();
    for (const r of data.dailyRows) {
      if (!byProduct.has(r.productName)) byProduct.set(r.productName, []);
      byProduct.get(r.productName)!.push(r);
    }
    // Include any product not in summary order at the end
    const allProducts = [
      ...productOrder.filter((n) => byProduct.has(n)),
      ...[...byProduct.keys()].filter((n) => !productOrder.includes(n)),
    ];

    let dc = ((doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? cursor) + 10;

    // Accumulators for grand-total row
    let grandTotalQty = 0;
    const grandOpVals: number[] = [];

    for (const productName of allProducts) {
      const rows = byProduct.get(productName);
      if (!rows || rows.length === 0) continue;

      const sorted = rows.slice().sort((a, b) => a.date.localeCompare(b.date));

      if (dc > doc.internal.pageSize.getHeight() - 50) {
        doc.addPage();
        dc = 15;
      }

      // Product name as section header
      doc.setFontSize(8.5);
      doc.setFont("Roboto", "bold");
      doc.setTextColor(20, 30, 48);
      doc.text(productName, 10, dc);
      dc += 3;

      const totalQty = sorted.reduce((s, r) => s + r.quantityProduced, 0);
      const opVals = sorted.map((r) => r.operatorCount).filter((v): v is number => v !== null);
      const avgOps = opVals.length > 0 ? (opVals.reduce((s, v) => s + v, 0) / opVals.length).toFixed(1) : "—";

      grandTotalQty += totalQty;
      opVals.forEach((v) => grandOpVals.push(v));

      autoTable(doc, {
        startY: dc,
        head: [["Date", "Qty Produced", "Operators"]],
        body: sorted.map((r) => [isoToDisplay(r.date), r.quantityProduced, r.operatorCount ?? "—"]),
        foot: [[`Total (${sorted.length} entr${sorted.length === 1 ? "y" : "ies"})`, totalQty, avgOps === "—" ? "—" : `avg ${avgOps}`]],
        styles: { font: "Roboto", fontSize: 8, cellPadding: 2.5, lineWidth: 0.15, lineColor: [208, 216, 228] },
        headStyles: { fillColor: [40, 60, 90], textColor: [255, 255, 255], font: "Roboto", fontStyle: "bold", fontSize: 7.5, lineWidth: 0.15, lineColor: [26, 42, 58] },
        footStyles: { fillColor: [235, 240, 248], textColor: [20, 30, 48], font: "Roboto", fontStyle: "bold", fontSize: 8, lineWidth: 0.15, lineColor: [180, 162, 186] },
        columnStyles: {
          0: { cellWidth: 60 },
          1: { halign: "center", cellWidth: 32 },
          2: { halign: "center", cellWidth: 28 },
        },
        alternateRowStyles: { fillColor: [248, 249, 252] },
        showFoot: "lastPage",
        margin: { left: 10, right: 10 },
        tableWidth: 130,
      });

      dc = ((doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? dc) + 8;
    }

    // ── Grand-total row across all products ──────────────────────────────────
    if (allProducts.length > 1) {
      if (dc > doc.internal.pageSize.getHeight() - 30) {
        doc.addPage();
        dc = 15;
      }

      const grandAvgOps = grandOpVals.length > 0
        ? `avg ${(grandOpVals.reduce((s, v) => s + v, 0) / grandOpVals.length).toFixed(1)}`
        : "—";

      autoTable(doc, {
        startY: dc,
        body: [["GRAND TOTAL", grandTotalQty, grandAvgOps]],
        styles: {
          font: "Roboto", fontSize: 9, cellPadding: 3,
          fillColor: [20, 37, 63], textColor: [255, 255, 255],
          fontStyle: "bold", lineWidth: 0.2, lineColor: [26, 42, 58],
        },
        columnStyles: {
          0: { cellWidth: 60, halign: "left" },
          1: { halign: "center", cellWidth: 32 },
          2: { halign: "center", cellWidth: 28 },
        },
        margin: { left: 10, right: 10 },
        tableWidth: 130,
      });
    }
  }

  // ── footer ───────────────────────────────────────────────────────────────────
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    const pW = doc.internal.pageSize.getWidth();
    const pH = doc.internal.pageSize.getHeight();
    doc.setFontSize(7);
    doc.setFont("Roboto", "normal");
    doc.setTextColor(160, 165, 180);
    doc.text("Production Tracker — Step 99 Ready Parts Report", 10, pH - 5);
    doc.text(`Page ${i} of ${totalPages}`, pW - 10, pH - 5, { align: "right" });
  }

  const safeFrom = data.from.replace(/-/g, "");
  const safeTo = data.to.replace(/-/g, "");
  const filename = data.from === data.to ? `step99-${safeFrom}.pdf` : `step99-${safeFrom}-${safeTo}.pdf`;
  doc.save(filename);
}

export async function exportStep99Xlsx(data: Step99ExportData): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Production Tracker";
  wb.created = new Date();

  const fromLabel = isoToDisplay(data.from);
  const toLabel = data.to === data.from ? fromLabel : isoToDisplay(data.to);
  const periodLabel = data.from === data.to ? fromLabel : `${fromLabel} – ${toLabel}`;

  const ws = wb.addWorksheet("Step 99 Report");
  ws.columns = [
    { header: "Product", key: "product", width: 36 },
    { header: "Entries", key: "entries", width: 12 },
    { header: "Qty Produced", key: "qty", width: 16 },
    { header: "Avg Team Size", key: "team", width: 16 },
    { header: "Efficiency", key: "eff", width: 14 },
  ];
  styleHeader(ws.getRow(1));

  // Period info rows above the table
  const infoRows = [
    ["Period", periodLabel],
    ["Generated", new Date().toLocaleString()],
    ["", ""],
  ];
  // Insert 3 rows before the header
  ws.spliceRows(1, 0, ...infoRows);
  // Rewrite columns header now at row 4
  const headerRow = ws.getRow(4);
  headerRow.values = ["Product", "Entries", "Qty Produced", "Avg Team Size", "Efficiency"];
  styleHeader(headerRow);

  // Style info rows
  ws.getRow(1).getCell(1).font = { bold: true, name: "Calibri", size: 10 };
  ws.getRow(2).getCell(1).font = { bold: true, name: "Calibri", size: 10 };

  data.rows
    .slice()
    .sort((a, b) => b.entries - a.entries || b.quantityProduced - a.quantityProduced)
    .forEach((r, i) => {
      const row = ws.addRow({
        product: r.productName,
        entries: r.entries,
        qty: r.quantityProduced,
        team: r.avgTeamSize !== null ? parseFloat(r.avgTeamSize.toFixed(1)) : null,
        eff: r.efficiency !== null ? r.efficiency / 100 : null,
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
      effCell.fill = xlsxEffFill(r.efficiency);
      effCell.font = xlsxEffFont(r.efficiency);
      row.getCell("entries").alignment = { horizontal: "right" };
      row.getCell("qty").alignment = { horizontal: "right" };
      row.getCell("team").alignment = { horizontal: "right" };
    });

  // ── Sheet 2: Daily Breakdown — one block per product ───────────────────────
  if (data.dailyRows.length > 0) {
    const wsDaily = wb.addWorksheet("Daily Breakdown");
    wsDaily.columns = [
      { key: "date", width: 26 },
      { key: "qty", width: 16 },
      { key: "operators", width: 14 },
    ];

    // Thin grid border applied to every data cell
    const CELL_BORDER: Partial<ExcelJS.Borders> = {
      top:    { style: "thin", color: { argb: "FFD0D8E4" } },
      bottom: { style: "thin", color: { argb: "FFD0D8E4" } },
      left:   { style: "thin", color: { argb: "FFD0D8E4" } },
      right:  { style: "thin", color: { argb: "FFD0D8E4" } },
    };
    const TOTALS_BORDER: Partial<ExcelJS.Borders> = {
      top:    { style: "medium", color: { argb: "FF8FA3BA" } },
      bottom: { style: "thin",   color: { argb: "FFD0D8E4" } },
      left:   { style: "thin",   color: { argb: "FFD0D8E4" } },
      right:  { style: "thin",   color: { argb: "FFD0D8E4" } },
    };

    function applyDataCell(cell: ExcelJS.Cell, bold = false) {
      cell.border = CELL_BORDER;
      cell.alignment = { vertical: "middle", horizontal: "center" };
      cell.font = { name: "Calibri", size: 10, bold };
    }

    // Group daily rows by product, same order as summary sheet
    const productOrder = data.rows
      .slice()
      .sort((a, b) => b.entries - a.entries || b.quantityProduced - a.quantityProduced)
      .map((r) => r.productName);

    const byProduct = new Map<string, typeof data.dailyRows>();
    for (const r of data.dailyRows) {
      if (!byProduct.has(r.productName)) byProduct.set(r.productName, []);
      byProduct.get(r.productName)!.push(r);
    }
    const allProducts = [
      ...productOrder.filter((n) => byProduct.has(n)),
      ...[...byProduct.keys()].filter((n) => !productOrder.includes(n)),
    ];

    let rowIdx = 1;
    const PRODUCT_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF28405A" } };
    const PRODUCT_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: "FFFFFFFF" }, name: "Calibri", size: 10 };

    // Accumulators for the grand-total row
    let grandTotalQty = 0;
    const grandOpVals: number[] = [];

    for (const productName of allProducts) {
      const rows = byProduct.get(productName);
      if (!rows || rows.length === 0) continue;

      // Product header row
      const productRow = wsDaily.getRow(rowIdx++);
      productRow.values = [productName, "Qty Produced", "Operators"];
      productRow.eachCell((cell) => {
        cell.fill = PRODUCT_FILL;
        cell.font = PRODUCT_FONT;
        cell.alignment = { vertical: "middle", horizontal: "center" };
        cell.border = {
          top:    { style: "medium", color: { argb: "FF1A2A3A" } },
          bottom: { style: "medium", color: { argb: "FF1A2A3A" } },
          left:   { style: "medium", color: { argb: "FF1A2A3A" } },
          right:  { style: "medium", color: { argb: "FF1A2A3A" } },
        };
      });
      productRow.getCell(1).alignment = { vertical: "middle", horizontal: "left" };
      productRow.height = 20;

      // Data rows sorted by date
      const sorted = rows.slice().sort((a, b) => a.date.localeCompare(b.date));
      sorted.forEach((r, i) => {
        const dataRow = wsDaily.getRow(rowIdx++);
        dataRow.values = [isoToDisplay(r.date), r.quantityProduced, r.operatorCount ?? "—"];
        const fill: ExcelJS.Fill = i % 2 === 0
          ? { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8F9FC" } }
          : { type: "pattern", pattern: "none" };
        for (let c = 1; c <= 3; c++) {
          const cell = dataRow.getCell(c);
          applyDataCell(cell);
          cell.fill = fill;
        }
        dataRow.getCell(1).alignment = { vertical: "middle", horizontal: "left" };
      });

      // Per-product totals row
      const totalQty = sorted.reduce((s, r) => s + r.quantityProduced, 0);
      const opVals = sorted.map((r) => r.operatorCount).filter((v): v is number => v !== null);
      const avgOps = opVals.length > 0
        ? (opVals.reduce((s, v) => s + v, 0) / opVals.length).toFixed(1)
        : "—";

      grandTotalQty += totalQty;
      opVals.forEach((v) => grandOpVals.push(v));

      const totalsRow = wsDaily.getRow(rowIdx++);
      totalsRow.values = [
        `Total (${sorted.length} entr${sorted.length === 1 ? "y" : "ies"})`,
        totalQty,
        avgOps === "—" ? "—" : `avg ${avgOps}`,
      ];
      for (let c = 1; c <= 3; c++) {
        const cell = totalsRow.getCell(c);
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEBF0F8" } };
        cell.font = { bold: true, name: "Calibri", size: 10, color: { argb: "FF14253F" } };
        cell.border = TOTALS_BORDER;
        cell.alignment = { vertical: "middle", horizontal: "center" };
      }
      totalsRow.getCell(1).alignment = { vertical: "middle", horizontal: "left" };

      // Blank spacer row between products
      rowIdx++;
    }

    // ── Grand-total row ──────────────────────────────────────────────────────
    if (allProducts.length > 1) {
      const grandAvgOps = grandOpVals.length > 0
        ? `avg ${(grandOpVals.reduce((s, v) => s + v, 0) / grandOpVals.length).toFixed(1)}`
        : "—";

      const grandRow = wsDaily.getRow(rowIdx++);
      grandRow.values = ["GRAND TOTAL", grandTotalQty, grandAvgOps];
      grandRow.height = 20;
      for (let c = 1; c <= 3; c++) {
        const cell = grandRow.getCell(c);
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF14253F" } };
        cell.font = { bold: true, name: "Calibri", size: 11, color: { argb: "FFFFFFFF" } };
        cell.alignment = { vertical: "middle", horizontal: "center" };
        cell.border = {
          top:    { style: "medium", color: { argb: "FF1A2A3A" } },
          bottom: { style: "medium", color: { argb: "FF1A2A3A" } },
          left:   { style: "medium", color: { argb: "FF1A2A3A" } },
          right:  { style: "medium", color: { argb: "FF1A2A3A" } },
        };
      }
      grandRow.getCell(1).alignment = { vertical: "middle", horizontal: "left" };
    }
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer as ArrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const safeFrom = data.from.replace(/-/g, "");
  const safeTo = data.to.replace(/-/g, "");
  a.download = data.from === data.to ? `step99-${safeFrom}.xlsx` : `step99-${safeFrom}-${safeTo}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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
