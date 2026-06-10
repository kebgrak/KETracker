import { useState, useMemo } from "react";
import { exportToXlsx } from "@/lib/xlsx-utils";
import {
  useListReports,
  useListOperators,
  useListProducts,
  useListSteps,
  getListReportsQueryKey,
  useDeleteReport,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  FileText,
  Trash2,
  Clock,
  Package,
  User,
  Users,
  Filter,
  X,
  Download,
  CalendarRange,
  Zap,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { WorkReport } from "@workspace/api-client-react";

type ReportItem = WorkReport & { operator?: { name: string; employeeId: string }; product?: { name: string }; step?: { stepNumber: number; subStepLabel?: string | null; name: string; standardTimeMinutes: number | string } };

const EXPECTED_DAILY_MINUTES = 450;

// ── efficiency helpers ────────────────────────────────────────────────────────

function calcReportEfficiency(report: ReportItem): number | null {
  const stdSec = Number(report.step?.standardTimeMinutes ?? 0);
  if (stdSec === 0) return null;
  const stdMin = stdSec / 60;
  const qty = report.quantityCompleted ?? 0;
  const actual = Number(report.timeWorkedMinutes ?? 0);
  if (actual === 0 || qty === 0) return null;
  const ops = report.operatorCount != null ? Number(report.operatorCount) : null;
  const expected =
    report.step?.stepNumber === 99 && ops && ops > 0
      ? (qty / ops) * stdMin
      : qty * stdMin;
  return (expected / actual) * 100;
}

function EfficiencyBadge({ pct }: { pct: number | null }) {
  if (pct === null) return null;
  const label = `${pct.toFixed(1)}%`;
  if (pct >= 100)
    return (
      <span className="inline-flex items-center gap-1 text-xs font-bold font-mono px-2 py-0.5 rounded-sm bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
        <Zap className="w-3 h-3" />
        {label}
      </span>
    );
  if (pct >= 80)
    return (
      <span className="inline-flex items-center gap-1 text-xs font-bold font-mono px-2 py-0.5 rounded-sm bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
        {label}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-xs font-bold font-mono px-2 py-0.5 rounded-sm bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400">
      {label}
    </span>
  );
}

// ── PDF export ────────────────────────────────────────────────────────────────

async function loadFontBase64(url: string): Promise<string> {
  const res = await fetch(url);
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function exportToPdf(
  data: ReportItem[],
  filters: {
    operatorName?: string;
    productName?: string;
    dateFrom?: string;
    dateTo?: string;
  },
  filename: string,
) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  // ── embed Roboto (Cyrillic-capable) ─────────────────────────────────────────
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

  // ── header band ─────────────────────────────────────────────────────────────
  doc.setFillColor(20, 30, 48);
  doc.rect(0, 0, pageW, 22, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont("Roboto", "bold");
  doc.text("Production Tracker", 10, 10);
  doc.setFontSize(10);
  doc.setFont("Roboto", "normal");
  doc.text("Work Reports", 10, 17);

  doc.setFontSize(8);
  doc.setTextColor(180, 190, 210);
  doc.text(`Generated: ${now}`, pageW - 10, 10, { align: "right" });
  doc.text(`${data.length} record${data.length !== 1 ? "s" : ""}`, pageW - 10, 17, { align: "right" });

  // ── applied filters ──────────────────────────────────────────────────────────
  doc.setTextColor(60, 60, 80);
  doc.setFontSize(8);
  doc.setFont("Roboto", "normal");

  const filterParts: string[] = [];
  if (filters.operatorName) filterParts.push(`Operator: ${filters.operatorName}`);
  if (filters.productName) filterParts.push(`Product: ${filters.productName}`);
  if (filters.dateFrom && filters.dateTo) filterParts.push(`Date: ${filters.dateFrom} → ${filters.dateTo}`);
  else if (filters.dateFrom) filterParts.push(`From: ${filters.dateFrom}`);
  else if (filters.dateTo) filterParts.push(`Until: ${filters.dateTo}`);

  if (filterParts.length > 0) {
    doc.text(`Filters applied: ${filterParts.join("   |   ")}`, 10, 28);
  }

  // ── summary strip ────────────────────────────────────────────────────────────
  const totalUnits = data.reduce((s, r) => s + (r.quantityCompleted ?? 0), 0);
  const totalMins = data.reduce((s, r) => s + Number(r.timeWorkedMinutes ?? 0), 0);
  const totalHours = (totalMins / 60).toFixed(1);
  const uniqueOperators = new Set(data.map((r) => r.operatorId)).size;
  const uniqueProducts = new Set(data.map((r) => r.productId)).size;

  const summaryY = filterParts.length > 0 ? 33 : 28;

  const summaryItems = [
    { label: "Total Pieces", value: String(totalUnits) },
    { label: "Time Logged", value: `${totalHours} h` },
    { label: "Operators", value: String(uniqueOperators) },
    { label: "Products", value: String(uniqueProducts) },
  ];

  const boxW = 44;
  const boxH = 12;
  const boxGap = 4;
  summaryItems.forEach((item, i) => {
    const x = 10 + i * (boxW + boxGap);
    doc.setFillColor(245, 247, 250);
    doc.roundedRect(x, summaryY, boxW, boxH, 1.5, 1.5, "F");
    doc.setTextColor(100, 110, 130);
    doc.setFontSize(6.5);
    doc.setFont("Roboto", "normal");
    doc.text(item.label.toUpperCase(), x + boxW / 2, summaryY + 4, { align: "center" });
    doc.setTextColor(20, 30, 48);
    doc.setFontSize(10);
    doc.setFont("Roboto", "bold");
    doc.text(item.value, x + boxW / 2, summaryY + 10, { align: "center" });
  });

  // ── operator efficiency summary ───────────────────────────────────────────────
  type OpStat = {
    name: string;
    empId: string;
    reports: number;
    units: number;
    actualMins: number;
    expectedMins: number;
  };

  const opMap = new Map<number, OpStat>();
  for (const r of data) {
    const id = r.operatorId;
    if (!opMap.has(id)) {
      opMap.set(id, {
        name: r.operator?.name ?? "Unknown",
        empId: r.operator?.employeeId ?? "—",
        reports: 0,
        units: 0,
        actualMins: 0,
        expectedMins: 0,
      });
    }
    const stat = opMap.get(id)!;
    const qty = r.quantityCompleted ?? 0;
    const actual = Number(r.timeWorkedMinutes ?? 0);
    const stdSec = Number(r.step?.standardTimeMinutes ?? 0);
    const stdMin = stdSec / 60;
    const ops = r.operatorCount != null ? Number(r.operatorCount) : null;
    const expectedMins =
      r.step?.stepNumber === 99 && ops && ops > 0
        ? (qty / ops) * stdMin
        : qty * stdMin;
    stat.reports += 1;
    stat.units += qty;
    stat.actualMins += actual;
    stat.expectedMins += expectedMins;
  }

  const opStats = Array.from(opMap.values()).sort((a, b) => a.name.localeCompare(b.name));

  const effSectionY = summaryY + boxH + 6;

  // Section label
  doc.setFontSize(8.5);
  doc.setFont("Roboto", "bold");
  doc.setTextColor(20, 30, 48);
  doc.text("Operator Efficiency Summary", 10, effSectionY + 4);

  autoTable(doc, {
    startY: effSectionY + 7,
    head: [["Operator", "Emp ID", "Reports", "Pieces", "Time Worked", "Avg Efficiency"]],
    body: opStats.map((op) => {
      const eff =
        op.actualMins > 0 && op.expectedMins > 0
          ? Math.round((op.expectedMins / op.actualMins) * 100)
          : null;
      const effLabel = eff !== null ? `${eff}%` : "—";
      const hours = (op.actualMins / 60).toFixed(1);
      return [op.name, op.empId, String(op.reports), String(op.units), `${hours} h`, effLabel];
    }),
    columnStyles: {
      0: { cellWidth: 50 },
      1: { cellWidth: 22, halign: "center" },
      2: { cellWidth: 20, halign: "center" },
      3: { cellWidth: 20, halign: "center" },
      4: { cellWidth: 28, halign: "center" },
      5: { cellWidth: 30, halign: "center", fontStyle: "bold" },
    },
    headStyles: {
      fillColor: [50, 65, 92],
      textColor: [255, 255, 255],
      fontSize: 7.5,
      fontStyle: "bold",
      font: "Roboto",
      cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 },
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [40, 50, 65],
      font: "Roboto",
      cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 },
    },
    alternateRowStyles: { fillColor: [250, 251, 254] },
    margin: { left: 10, right: 10 },
    tableLineColor: [220, 225, 235],
    tableLineWidth: 0.2,
    didParseCell(hookData) {
      // Colour the efficiency column
      if (hookData.section === "body" && hookData.column.index === 5) {
        const op = opStats[hookData.row.index];
        if (op && op.actualMins > 0 && op.expectedMins > 0) {
          const eff = (op.expectedMins / op.actualMins) * 100;
          if (eff >= 100) hookData.cell.styles.textColor = [22, 163, 74];
          else if (eff >= 80) hookData.cell.styles.textColor = [180, 120, 0];
          else hookData.cell.styles.textColor = [220, 38, 38];
        }
      }
    },
  });

  let currentY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  // ── daily time summary (only for single-operator exports) ────────────────────
  if (filters.operatorName) {
    const dtMap = new Map<string, { total: number; count: number }>();
    for (const r of data) {
      const date = r.reportDate ?? "Unknown";
      const prev = dtMap.get(date) ?? { total: 0, count: 0 };
      dtMap.set(date, { total: prev.total + Number(r.timeWorkedMinutes ?? 0), count: prev.count + 1 });
    }
    const dailySummaryRows = Array.from(dtMap.entries())
      .map(([date, { total, count }]) => ({
        date,
        total,
        delta: total - EXPECTED_DAILY_MINUTES,
        count,
        dateLabel: (() => { try { return new Date(date + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" }); } catch { return date; } })(),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    doc.setFontSize(8.5);
    doc.setFont("Roboto", "bold");
    doc.setTextColor(20, 30, 48);
    doc.text("Daily Time Summary", 10, currentY + 1);

    autoTable(doc, {
      startY: currentY + 5,
      head: [["Date", "Total (min)", "Expected (min)", "Δ from 450", "Reports", "Status"]],
      body: dailySummaryRows.map(row => [
        row.dateLabel,
        String(row.total),
        String(EXPECTED_DAILY_MINUTES),
        row.delta > 0 ? `+${row.delta}` : String(row.delta),
        String(row.count),
        row.delta === 0 ? "OK" : row.delta > 0 ? `Over by ${row.delta} min` : `Under by ${Math.abs(row.delta)} min`,
      ]),
      columnStyles: {
        0: { cellWidth: 55 },
        1: { cellWidth: 25, halign: "center" as const },
        2: { cellWidth: 28, halign: "center" as const },
        3: { cellWidth: 22, halign: "center" as const },
        4: { cellWidth: 20, halign: "center" as const },
        5: { cellWidth: 58 },
      },
      headStyles: { fillColor: [50, 65, 92], textColor: [255, 255, 255], fontSize: 7.5, fontStyle: "bold", font: "Roboto", cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 } },
      bodyStyles: { fontSize: 8, textColor: [40, 50, 65], font: "Roboto", cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 } },
      alternateRowStyles: { fillColor: [250, 251, 254] },
      margin: { left: 10, right: 10 },
      tableLineColor: [220, 225, 235],
      tableLineWidth: 0.2,
      didParseCell(hookData) {
        if (hookData.section === "body") {
          const row = dailySummaryRows[hookData.row.index];
          if (row && row.delta !== 0) {
            const col = hookData.column.index;
            if (col === 3 || col === 5) {
              hookData.cell.styles.textColor = row.delta > 0 ? [180, 90, 0] as [number,number,number] : [200, 30, 30] as [number,number,number];
              hookData.cell.styles.fontStyle = "bold";
            }
            if (col === 0 || col === 1) {
              hookData.cell.styles.fillColor = row.delta > 0 ? [255, 248, 230] as [number,number,number] : [255, 238, 238] as [number,number,number];
            }
          }
        }
      },
    });
    currentY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  }

  // Divider line before daily detail
  doc.setDrawColor(200, 210, 225);
  doc.setLineWidth(0.4);
  doc.line(10, currentY - 3, pageW - 10, currentY - 3);

  doc.setFontSize(8.5);
  doc.setFont("Roboto", "bold");
  doc.setTextColor(20, 30, 48);
  doc.text("Daily Detail", 10, currentY + 1);

  // ── group by date ────────────────────────────────────────────────────────────
  const byDate = new Map<string, ReportItem[]>();
  for (const r of data) {
    const d = r.reportDate ?? "Unknown";
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d)!.push(r);
  }
  const sortedDates = Array.from(byDate.keys()).sort();

  let tableStartY = currentY + 5;

  for (const date of sortedDates) {
    const dayReports = byDate.get(date)!;
    const dayUnits = dayReports.reduce((s, r) => s + (r.quantityCompleted ?? 0), 0);
    const dayMins = dayReports.reduce((s, r) => s + Number(r.timeWorkedMinutes ?? 0), 0);

    // Format date nicely
    const dateObj = new Date(date + "T00:00:00");
    const dateLabel = dateObj.toLocaleDateString("en-GB", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
    });

    autoTable(doc, {
      startY: tableStartY,
      head: [
        [
          {
            content: `${dateLabel}   —   ${dayReports.length} report${dayReports.length !== 1 ? "s" : ""}   ·   ${dayUnits} pieces   ·   ${(dayMins / 60).toFixed(1)} h`,
            colSpan: 11,
            styles: {
              fillColor: [235, 240, 248],
              textColor: [20, 30, 48],
              fontStyle: "bold",
              fontSize: 8.5,
              cellPadding: { top: 3, bottom: 3, left: 4, right: 4 },
            },
          },
        ],
        [
          "Date", "Operator", "Emp ID", "Product", "Step", "Std (sec)",
          "Time (min)", "Operators", "Units", "Eff %", "Notes",
        ],
      ],
      body: dayReports.map((r) => {
        const stdSec = Number(r.step?.standardTimeMinutes ?? 0);
        const actual = Number(r.timeWorkedMinutes ?? 0);
        const qty = r.quantityCompleted ?? 0;
        const opCount = r.operatorCount != null ? Number(r.operatorCount) : null;
        const effRaw = calcReportEfficiency(r);
        const effLabel = effRaw !== null ? `${Math.round(effRaw)}%` : "—";
        const rowDate = r.reportDate
          ? new Date(r.reportDate + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short" })
          : "—";

        return [
          rowDate,
          r.operator?.name ?? "—",
          r.operator?.employeeId ?? "—",
          r.product?.name ?? "—",
          `${r.step?.stepNumber ?? ""}${r.step?.subStepLabel ?? ""}. ${r.step?.name ?? ""}`,
          stdSec > 0 ? String(stdSec) : "—",
          String(actual),
          opCount !== null ? String(opCount) : "—",
          String(qty),
          effLabel,
          r.notes ?? "",
        ];
      }),
      columnStyles: {
        0: { cellWidth: 18, halign: "center" },
        1: { cellWidth: 28 },
        2: { cellWidth: 14, halign: "center" },
        3: { cellWidth: 26 },
        4: { cellWidth: 38 },
        5: { cellWidth: 17, halign: "center" },
        6: { cellWidth: 16, halign: "center" },
        7: { cellWidth: 15, halign: "center" },
        8: { cellWidth: 12, halign: "center" },
        9: { cellWidth: 15, halign: "center" },
        10: { cellWidth: "auto" as unknown as number },
      },
      headStyles: {
        fillColor: [50, 65, 92],
        textColor: [255, 255, 255],
        fontSize: 7.5,
        fontStyle: "bold",
        font: "Roboto",
        cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 },
      },
      bodyStyles: {
        fontSize: 8,
        textColor: [40, 50, 65],
        font: "Roboto",
        cellPadding: { top: 3, bottom: 3, left: 3, right: 3 },
      },
      alternateRowStyles: { fillColor: [250, 251, 254] },
      margin: { left: 10, right: 10 },
      tableLineColor: [220, 225, 235],
      tableLineWidth: 0.2,
      didParseCell(data) {
        if (data.section === "body" && (data.column.index === 6 || data.column.index === 9)) {
          const r = dayReports[data.row.index];
          const eff = r ? calcReportEfficiency(r) : null;
          if (eff !== null) {
            if (eff >= 100) data.cell.styles.textColor = [22, 163, 74];
            else if (eff >= 80) data.cell.styles.textColor = [180, 120, 0];
            else data.cell.styles.textColor = [220, 38, 38];
          }
        }
      },
      didDrawPage(hookData) {
        // Footer on every page
        const pageCount = doc.getNumberOfPages();
        doc.setFontSize(7);
        doc.setTextColor(150, 160, 175);
        doc.setFont("Roboto", "normal");
        doc.text(
          `Production Tracker — Work Reports   |   Page ${hookData.pageNumber} of ${pageCount}`,
          pageW / 2,
          doc.internal.pageSize.getHeight() - 6,
          { align: "center" },
        );
      },
    });

    tableStartY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  }

  doc.save(filename);
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function Reports() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filterOperatorId, setFilterOperatorId] = useState<string>("");
  const [filterProductId, setFilterProductId] = useState<string>("");
  const [filterStepId, setFilterStepId] = useState<string>("");
  const [filterDateFrom, setFilterDateFrom] = useState<string>("");
  const [filterDateTo, setFilterDateTo] = useState<string>("");

  // anomaly finder state
  const [anomalyOpen, setAnomalyOpen] = useState(false);
  const [anomalyOpId, setAnomalyOpId] = useState("");
  const [anomalyFrom, setAnomalyFrom] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  });
  const [anomalyTo, setAnomalyTo] = useState(() => {
    const d = new Date();
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`;
  });

  const serverParams: Record<string, string | number> = {};
  if (filterOperatorId) serverParams.operatorId = Number(filterOperatorId);
  if (filterProductId) serverParams.productId = Number(filterProductId);

  const reports = useListReports(Object.keys(serverParams).length ? serverParams : undefined);
  const operators = useListOperators();
  const products = useListProducts();

  const anomalyReports = useListReports(
    anomalyOpId ? { operatorId: Number(anomalyOpId) } : undefined,
    { query: { enabled: anomalyOpen && !!anomalyOpId } } as Parameters<typeof useListReports>[1],
  );
  const productSteps = useListSteps(
    Number(filterProductId),
    { query: { enabled: !!filterProductId, queryKey: ["steps", Number(filterProductId)] } },
  );
  const deleteReport = useDeleteReport();

  const sortedSteps = useMemo(() => {
    if (!productSteps.data) return [];
    return productSteps.data.slice().sort((a, b) => {
      if (a.stepNumber !== b.stepNumber) return a.stepNumber - b.stepNumber;
      return (a.subStepLabel ?? "").localeCompare(b.subStepLabel ?? "");
    });
  }, [productSteps.data]);

  const filteredReports = useMemo(() => {
    if (!reports.data) return [];
    return reports.data.filter((r) => {
      if (filterDateFrom && r.reportDate < filterDateFrom) return false;
      if (filterDateTo && r.reportDate > filterDateTo) return false;
      if (filterStepId && String(r.stepId) !== filterStepId) return false;
      return true;
    });
  }, [reports.data, filterDateFrom, filterDateTo, filterStepId]);

  const displayReports = filteredReports.slice().reverse();

  // ── daily-total anomaly detection ────────────────────────────────────────────
  // key: `${operatorId}_${reportDate}` → sum of timeWorkedMinutes
  const dailyTotals = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of reports.data ?? []) {
      const key = `${r.operatorId}_${r.reportDate}`;
      map.set(key, (map.get(key) ?? 0) + Number(r.timeWorkedMinutes ?? 0));
    }
    return map;
  }, [reports.data]);

  // anomalous days: total ≠ 450 min (lineleaders excluded — they routinely exceed 450)
  const lineleaderIds = useMemo(() => {
    const s = new Set<number>();
    for (const op of operators.data ?? []) {
      if (op.isLineleader) s.add(op.id);
    }
    return s;
  }, [operators.data]);

  const dailyAnomalies = useMemo(() => {
    const map = new Map<string, { total: number; delta: number }>();
    for (const [key, total] of dailyTotals) {
      const operatorId = Number(key.split("_")[0]);
      if (lineleaderIds.has(operatorId)) continue;
      const delta = total - EXPECTED_DAILY_MINUTES;
      if (delta !== 0) map.set(key, { total, delta });
    }
    return map;
  }, [dailyTotals, lineleaderIds]);

  // anomaly finder derived rows (for the collapsible panel)
  const anomalyFinderRows = useMemo(() => {
    const anomalyData = anomalyReports.data as WorkReport[] | undefined;
    if (!anomalyData) return [];
    const byDate = new Map<string, { total: number; count: number }>();
    for (const r of anomalyData) {
      const date = r.reportDate ?? "";
      if (anomalyFrom && date < anomalyFrom) continue;
      if (anomalyTo && date > anomalyTo) continue;
      const prev = byDate.get(date) ?? { total: 0, count: 0 };
      byDate.set(date, { total: prev.total + Number(r.timeWorkedMinutes ?? 0), count: prev.count + 1 });
    }
    return Array.from(byDate.entries())
      .map(([date, { total, count }]) => ({ date, total, delta: total - EXPECTED_DAILY_MINUTES, count }))
      .filter(row => row.delta !== 0)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [anomalyReports.data, anomalyFrom, anomalyTo]);

  function handleDelete(id: number) {
    deleteReport.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Report deleted" });
          queryClient.invalidateQueries({ queryKey: getListReportsQueryKey() });
        },
        onError: () => toast({ title: "Delete failed", variant: "destructive" }),
      },
    );
  }

  function clearFilters() {
    setFilterOperatorId("");
    setFilterProductId("");
    setFilterStepId("");
    setFilterDateFrom("");
    setFilterDateTo("");
  }

  async function handleExportExcel() {
    if (displayReports.length === 0) {
      toast({ title: "Nothing to export", description: "No reports match the current filters.", variant: "destructive" });
      return;
    }
    const rows = displayReports.slice().reverse().map((r) => {
      const stdSec = Number(r.step?.standardTimeMinutes ?? 0);
      const actual = Number(r.timeWorkedMinutes ?? 0);
      const qty = r.quantityCompleted ?? 0;
      const opCount = r.operatorCount != null ? Number(r.operatorCount) : null;
      const expected = r.step?.stepNumber === 99 && opCount && opCount > 0
        ? (qty / opCount) * (stdSec / 60)
        : qty * (stdSec / 60);
      const eff = actual > 0 && expected > 0 ? Math.round((expected / actual) * 100) : null;
      return {
        "Date": r.reportDate,
        "Operator": r.operator?.name ?? "",
        "Employee ID": r.operator?.employeeId ?? "",
        "Product": r.product?.name ?? "",
        "Step": r.step ? `${r.step.stepNumber}${r.step.subStepLabel ?? ""}` : "",
        "Step Name": r.step?.name ?? "",
        "Std Time (sec)": stdSec > 0 ? stdSec : "",
        "Time Worked (min)": actual,
        "Operators": opCount ?? "",
        "Pieces": qty,
        "Notes": r.notes ?? "",
        "Efficiency %": eff ?? "",
      };
    });
    const sheets: Array<{ name: string; rows: Record<string, unknown>[]; colWidths?: number[] }> = [
      {
        name: "Work Reports",
        rows,
        colWidths: [12, 22, 14, 24, 8, 28, 16, 18, 12, 10, 28, 14],
      },
    ];

    // Daily Summary sheet — only when a single operator is selected
    if (filterOperatorId) {
      const dtMap = new Map<string, { total: number; count: number }>();
      for (const r of filteredReports) {
        const date = r.reportDate ?? "";
        const prev = dtMap.get(date) ?? { total: 0, count: 0 };
        dtMap.set(date, { total: prev.total + Number(r.timeWorkedMinutes ?? 0), count: prev.count + 1 });
      }
      const summaryRows = Array.from(dtMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, { total, count }]) => {
          const delta = total - EXPECTED_DAILY_MINUTES;
          return {
            "Date": date,
            "Total Minutes": total,
            "Expected (min)": EXPECTED_DAILY_MINUTES,
            "Delta (min)": delta > 0 ? `+${delta}` : String(delta),
            "Reports": count,
            "Status": delta === 0 ? "OK" : delta > 0 ? `Over by ${delta} min` : `Under by ${Math.abs(delta)} min`,
          };
        });
      sheets.push({ name: "Daily Summary", rows: summaryRows, colWidths: [12, 16, 16, 14, 10, 24] });
    }

    const parts: string[] = ["work-reports"];
    const opName = operators.data?.find((o) => String(o.id) === filterOperatorId)?.name;
    const prodName = products.data?.find((p) => String(p.id) === filterProductId)?.name;
    if (filterDateFrom && filterDateTo) parts.push(`${filterDateFrom}_to_${filterDateTo}`);
    else if (filterDateFrom) parts.push(`from_${filterDateFrom}`);
    else if (filterDateTo) parts.push(`until_${filterDateTo}`);
    if (opName) parts.push(opName.toLowerCase().replace(/\s+/g, "-"));
    if (prodName) parts.push(prodName.toLowerCase().replace(/\s+/g, "-"));
    await exportToXlsx(sheets, `${parts.join("_")}.xlsx`);
    toast({ title: "Excel downloaded", description: `${displayReports.length} report${displayReports.length !== 1 ? "s" : ""} exported.` });
  }

  async function handleExport() {
    if (displayReports.length === 0) {
      toast({
        title: "Nothing to export",
        description: "No reports match the current filters.",
        variant: "destructive",
      });
      return;
    }

    const operatorName = operators.data?.find((o) => String(o.id) === filterOperatorId)?.name;
    const productName = products.data?.find((p) => String(p.id) === filterProductId)?.name;

    const parts: string[] = ["work-reports"];
    if (filterDateFrom && filterDateTo) parts.push(`${filterDateFrom}_to_${filterDateTo}`);
    else if (filterDateFrom) parts.push(`from_${filterDateFrom}`);
    else if (filterDateTo) parts.push(`until_${filterDateTo}`);
    if (operatorName) parts.push(operatorName.toLowerCase().replace(/\s+/g, "-"));
    if (productName) parts.push(productName.toLowerCase().replace(/\s+/g, "-"));

    await exportToPdf(
      displayReports.slice().reverse(),
      { operatorName, productName, dateFrom: filterDateFrom, dateTo: filterDateTo },
      `${parts.join("_")}.pdf`,
    );

    toast({
      title: "PDF downloaded",
      description: `${displayReports.length} report${displayReports.length !== 1 ? "s" : ""} exported.`,
    });
  }

  const hasFilters = filterOperatorId || filterProductId || filterStepId || filterDateFrom || filterDateTo;

  return (
    <div className="p-6">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            Work Reports
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            All submitted production records
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleExportExcel}
            disabled={reports.isLoading || displayReports.length === 0}
            data-testid="button-export-excel"
            className="flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            Export Excel
            {displayReports.length > 0 && (
              <Badge variant="secondary" className="ml-1 font-mono text-xs">
                {displayReports.length}
              </Badge>
            )}
          </Button>
          <Button
            variant="outline"
            onClick={handleExport}
            disabled={reports.isLoading || displayReports.length === 0}
            data-testid="button-export-pdf"
            className="flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            Export PDF
            {displayReports.length > 0 && (
              <Badge variant="secondary" className="ml-1 font-mono text-xs">
                {displayReports.length}
              </Badge>
            )}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-5 p-4 bg-card border border-border rounded-sm space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Filter className="w-4 h-4" />
            <span className="font-medium">Filters</span>
          </div>

          <Select onValueChange={setFilterOperatorId} value={filterOperatorId}>
            <SelectTrigger className="w-44" data-testid="filter-operator">
              <SelectValue placeholder="All operators" />
            </SelectTrigger>
            <SelectContent>
              {operators.data?.map((op) => (
                <SelectItem key={op.id} value={String(op.id)}>
                  {op.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            onValueChange={(val) => {
              setFilterProductId(val);
              setFilterStepId("");
            }}
            value={filterProductId}
          >
            <SelectTrigger className="w-44" data-testid="filter-product">
              <SelectValue placeholder="All products" />
            </SelectTrigger>
            <SelectContent>
              {products.data?.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {filterProductId && (
            <Select onValueChange={setFilterStepId} value={filterStepId}>
              <SelectTrigger className="w-52" data-testid="filter-step">
                <SelectValue placeholder="All steps" />
              </SelectTrigger>
              <SelectContent>
                {sortedSteps.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.stepNumber}{s.subStepLabel ?? ""}. {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              data-testid="button-clear-filters"
            >
              <X className="w-3.5 h-3.5 mr-1" /> Clear all
            </Button>
          )}
        </div>

        {/* Date range */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarRange className="w-4 h-4" />
            <span className="font-medium">Date range</span>
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="date"
              className="w-40"
              value={filterDateFrom}
              onChange={(e) => {
                setFilterDateFrom(e.target.value);
                if (filterDateTo && e.target.value && e.target.value > filterDateTo)
                  setFilterDateTo(e.target.value);
              }}
              data-testid="filter-date-from"
            />
            <span className="text-sm text-muted-foreground">to</span>
            <Input
              type="date"
              className="w-40"
              value={filterDateTo}
              min={filterDateFrom || undefined}
              onChange={(e) => setFilterDateTo(e.target.value)}
              data-testid="filter-date-to"
            />
          </div>
          {(filterDateFrom || filterDateTo) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFilterDateFrom("");
                setFilterDateTo("");
              }}
              data-testid="button-clear-dates"
            >
              <X className="w-3.5 h-3.5 mr-1" /> Clear dates
            </Button>
          )}
        </div>

        {/* Active filter badges */}
        {hasFilters && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {filterOperatorId && (
              <Badge variant="secondary" className="text-xs gap-1">
                Operator: {operators.data?.find((o) => String(o.id) === filterOperatorId)?.name}
                <button onClick={() => setFilterOperatorId("")} className="ml-1 hover:text-destructive">×</button>
              </Badge>
            )}
            {filterProductId && (
              <Badge variant="secondary" className="text-xs gap-1">
                Product: {products.data?.find((p) => String(p.id) === filterProductId)?.name}
                <button onClick={() => { setFilterProductId(""); setFilterStepId(""); }} className="ml-1 hover:text-destructive">×</button>
              </Badge>
            )}
            {filterStepId && (() => {
              const s = sortedSteps.find((s) => String(s.id) === filterStepId);
              return s ? (
                <Badge variant="secondary" className="text-xs gap-1">
                  Step: {s.stepNumber}{s.subStepLabel ?? ""}. {s.name}
                  <button onClick={() => setFilterStepId("")} className="ml-1 hover:text-destructive">×</button>
                </Badge>
              ) : null;
            })()}
            {filterDateFrom && (
              <Badge variant="secondary" className="text-xs gap-1">
                From: {filterDateFrom}
                <button onClick={() => setFilterDateFrom("")} className="ml-1 hover:text-destructive">×</button>
              </Badge>
            )}
            {filterDateTo && (
              <Badge variant="secondary" className="text-xs gap-1">
                To: {filterDateTo}
                <button onClick={() => setFilterDateTo("")} className="ml-1 hover:text-destructive">×</button>
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* ── Anomaly Finder ──────────────────────────────────────────────────── */}
      <div className="mb-5 border border-border rounded-sm bg-card">
        <button
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-foreground hover:bg-muted/40 transition-colors"
          onClick={() => setAnomalyOpen((v) => !v)}
        >
          <span className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-orange-500" />
            Time Anomaly Finder
            <span className="text-xs text-muted-foreground font-normal">
              — find operators whose daily time total deviates from {EXPECTED_DAILY_MINUTES} min
            </span>
          </span>
          {anomalyOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </button>

        {anomalyOpen && (
          <div className="border-t border-border px-4 py-4 space-y-4">
            {/* Controls */}
            <div className="flex flex-wrap items-center gap-3">
              <Select onValueChange={setAnomalyOpId} value={anomalyOpId}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Select operator…" />
                </SelectTrigger>
                <SelectContent>
                  {operators.data?.filter((op) => !op.isLineleader).map((op) => (
                    <SelectItem key={op.id} value={String(op.id)}>
                      {op.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="flex items-center gap-2">
                <Input type="date" className="w-36" value={anomalyFrom} onChange={(e) => setAnomalyFrom(e.target.value)} />
                <span className="text-sm text-muted-foreground">to</span>
                <Input type="date" className="w-36" value={anomalyTo} min={anomalyFrom || undefined} onChange={(e) => setAnomalyTo(e.target.value)} />
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const d = new Date();
                  setAnomalyFrom(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`);
                  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
                  setAnomalyTo(`${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`);
                }}
              >
                This month
              </Button>
            </div>

            {/* Results */}
            {!anomalyOpId ? (
              <p className="text-sm text-muted-foreground">Select an operator to check their daily totals.</p>
            ) : anomalyReports.isLoading ? (
              <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
            ) : anomalyFinderRows.length === 0 ? (
              <p className="text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                <span>✓</span>
                No anomalies — all days in this period sum to exactly {EXPECTED_DAILY_MINUTES} min.
              </p>
            ) : (
              <div>
                <p className="text-xs text-muted-foreground mb-2">
                  {anomalyFinderRows.length} day{anomalyFinderRows.length !== 1 ? "s" : ""} with inconsistent totals:
                </p>
                <div className="overflow-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-muted/50 text-muted-foreground text-xs">
                        <th className="text-left px-3 py-2 font-medium">Date</th>
                        <th className="text-right px-3 py-2 font-medium">Total (min)</th>
                        <th className="text-right px-3 py-2 font-medium">Expected</th>
                        <th className="text-right px-3 py-2 font-medium">Δ</th>
                        <th className="text-center px-3 py-2 font-medium">Reports</th>
                        <th className="text-left px-3 py-2 font-medium">Status</th>
                        <th className="px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {anomalyFinderRows.map((row) => {
                        const sign = row.delta > 0 ? "+" : "";
                        const over = row.delta > 0;
                        return (
                          <tr key={row.date} className="border-t border-border hover:bg-muted/30">
                            <td className="px-3 py-2 font-mono text-xs">{row.date}</td>
                            <td className="px-3 py-2 text-right font-mono text-xs">{row.total}</td>
                            <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground">{EXPECTED_DAILY_MINUTES}</td>
                            <td className={`px-3 py-2 text-right font-mono text-xs font-bold ${over ? "text-orange-600 dark:text-orange-400" : "text-red-600 dark:text-red-400"}`}>
                              {sign}{row.delta}
                            </td>
                            <td className="px-3 py-2 text-center text-xs text-muted-foreground">{row.count}</td>
                            <td className="px-3 py-2 text-xs">
                              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm border text-xs ${over ? "bg-orange-50 text-orange-700 border-orange-300 dark:bg-orange-900/30 dark:text-orange-400" : "bg-red-50 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400"}`}>
                                <AlertTriangle className="w-2.5 h-2.5" />
                                {over ? `Over by ${row.delta}` : `Under by ${Math.abs(row.delta)}`} min
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-xs h-6 px-2"
                                onClick={() => {
                                  setFilterOperatorId(anomalyOpId);
                                  setFilterDateFrom(row.date);
                                  setFilterDateTo(row.date);
                                  setAnomalyOpen(false);
                                }}
                              >
                                View
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Report list */}
      {reports.isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : displayReports.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No reports found</p>
          <p className="text-sm mt-1">
            {hasFilters
              ? "Try adjusting your filters."
              : "Submit the first work report from the Work Entry page."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {displayReports.map((report) => (
            <div
              key={report.id}
              data-testid={`row-report-${report.id}`}
              className="bg-card border border-border rounded-sm p-4 flex items-start justify-between gap-4 hover:border-primary/30 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <Badge variant="outline" className="font-mono text-xs">
                    #{report.id}
                  </Badge>
                  <span className="text-sm font-semibold text-foreground">
                    {report.product?.name}
                  </span>
                  <span className="text-muted-foreground text-xs">—</span>
                  <Badge variant="secondary" className="font-mono text-xs font-bold">
                    {report.step?.stepNumber}{report.step?.subStepLabel ?? ""}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {report.step?.name}
                  </span>
                  <EfficiencyBadge pct={calcReportEfficiency(report)} />
                  {(() => {
                    const key = `${report.operatorId}_${report.reportDate}`;
                    const anomaly = dailyAnomalies.get(key);
                    if (!anomaly) return null;
                    const sign = anomaly.delta > 0 ? "+" : "";
                    return (
                      <span
                        title={`Day total: ${anomaly.total} min (${sign}${anomaly.delta} vs. expected ${EXPECTED_DAILY_MINUTES})`}
                        className={`inline-flex items-center gap-1 text-xs font-mono px-1.5 py-0.5 rounded-sm border ${
                          anomaly.delta > 0
                            ? "bg-orange-50 text-orange-700 border-orange-300 dark:bg-orange-900/30 dark:text-orange-400"
                            : "bg-red-50 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400"
                        }`}
                      >
                        <AlertTriangle className="w-2.5 h-2.5" />
                        {sign}{anomaly.delta} min/day
                      </span>
                    );
                  })()}
                </div>

                <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5" />
                    {report.operator?.name} ({report.operator?.employeeId})
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    {report.timeWorkedMinutes} min
                  </span>
                  {report.operatorCount != null && (
                    <span className="flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5" />
                      {Number(report.operatorCount)} operators
                    </span>
                  )}
                  <span className="flex items-center gap-1.5">
                    <Package className="w-3.5 h-3.5" />
                    {report.quantityCompleted} pieces
                  </span>
                  <span className="font-mono text-xs">{report.reportDate}</span>
                </div>

                {report.notes && (
                  <p className="text-xs text-muted-foreground mt-2 italic border-l-2 border-border pl-2">
                    {report.notes}
                  </p>
                )}
              </div>

              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-destructive flex-shrink-0"
                onClick={() => handleDelete(report.id)}
                disabled={deleteReport.isPending}
                data-testid={`button-delete-report-${report.id}`}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
