import { useMemo, useState } from "react";
import {
  useGetDashboardSummary,
  useGetOperatorStats,
  useGetProductStats,
  useListReports,
  useListOperators,
} from "@workspace/api-client-react";
import { calcProductEfficiency, currentWeekStart } from "@/lib/efficiency";
import { exportDashboardPdf, exportDashboardXlsx, exportStep99Pdf, exportStep99Xlsx } from "@/lib/dashboard-export";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  Package,
  FileText,
  Clock,
  TrendingUp,
  TrendingDown,
  BarChart2,
  Zap,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Search,
  X,
  Download,
  ChevronDown,
  ChevronUp,
  UserCheck,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";

// ── helpers ──────────────────────────────────────────────────────────────────

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function shiftIso(iso: string, days: number): string {
  const [y, mo, da] = iso.split("-").map(Number);
  const d = new Date(y, mo - 1, da);
  d.setDate(d.getDate() + days);
  const yr = d.getFullYear();
  const mn = String(d.getMonth() + 1).padStart(2, "0");
  const dy = String(d.getDate()).padStart(2, "0");
  return `${yr}-${mn}-${dy}`;
}

function thisMonthStart(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function lastMonthRange(): { from: string; to: string } {
  const d = new Date();
  const year = d.getMonth() === 0 ? d.getFullYear() - 1 : d.getFullYear();
  const month = d.getMonth() === 0 ? 12 : d.getMonth();
  const lastDay = new Date(year, month, 0).getDate();
  const mm = String(month).padStart(2, "0");
  return { from: `${year}-${mm}-01`, to: `${year}-${mm}-${String(lastDay).padStart(2, "0")}` };
}

function formatDateLabel(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// ── sub-components ───────────────────────────────────────────────────────────

function EfficiencyBadge({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-xs text-muted-foreground font-mono">—</span>;
  const label = `${Math.round(pct)}%`;
  if (pct >= 100)
    return (
      <span
        data-testid="badge-efficiency-high"
        className="inline-flex items-center gap-1 text-xs font-bold font-mono px-2 py-0.5 rounded-sm bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
      >
        <Zap className="w-3 h-3" />
        {label}
      </span>
    );
  if (pct >= 90)
    return (
      <span
        data-testid="badge-efficiency-mid"
        className="inline-flex items-center gap-1 text-xs font-bold font-mono px-2 py-0.5 rounded-sm bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
      >
        {label}
      </span>
    );
  return (
    <span
      data-testid="badge-efficiency-low"
      className="inline-flex items-center gap-1 text-xs font-bold font-mono px-2 py-0.5 rounded-sm bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400"
    >
      {label}
    </span>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  sub,
  trend,
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  sub?: string;
  trend?: { delta: number; label: string } | null;
}) {
  return (
    <Card>
      <CardContent className="pt-5 pb-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">
              {label}
            </p>
            <p className="text-2xl font-bold text-foreground font-mono">{value}</p>
            {trend != null ? (
              <div className="flex items-center gap-1 mt-1">
                {trend.delta > 0 ? (
                  <TrendingUp className="w-3 h-3 text-emerald-500" />
                ) : trend.delta < 0 ? (
                  <TrendingDown className="w-3 h-3 text-red-500" />
                ) : null}
                <span
                  className={cn(
                    "text-xs font-mono",
                    trend.delta > 0
                      ? "text-emerald-600"
                      : trend.delta < 0
                        ? "text-red-500"
                        : "text-muted-foreground",
                  )}
                >
                  {trend.delta > 0 ? "+" : ""}
                  {Math.round(trend.delta)}% {trend.label}
                </span>
              </div>
            ) : sub ? (
              <p className="text-xs text-muted-foreground mt-1">{sub}</p>
            ) : null}
          </div>
          <div className="w-9 h-9 bg-primary/10 rounded-sm flex items-center justify-center">
            <Icon className="w-4 h-4 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── inline bar ───────────────────────────────────────────────────────────────

function InlineBar({
  value,
  max,
  color,
  dimmed,
}: {
  value: number;
  max: number;
  color: string;
  dimmed?: boolean;
}) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="flex-1 relative h-4 bg-muted rounded-sm overflow-hidden">
      <div
        className={cn("absolute left-0 top-0 h-full rounded-sm transition-all duration-300", color, dimmed && "opacity-40")}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ── daily output chart ───────────────────────────────────────────────────────

interface ProductDayRow {
  productId: number;
  productName: string;
  lastStepNumber: number;
  produced: number;
  target: number;
  efficiency: number | null;
  hasActivity: boolean;
}

function DailyOutputChart({
  rows,
  isLoading,
  selectedDate,
  onPrev,
  onNext,
  onToday,
  onDateChange,
  isToday,
}: {
  rows: ProductDayRow[];
  isLoading: boolean;
  selectedDate: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onDateChange: (iso: string) => void;
  isToday: boolean;
}) {
  const [searchTerm, setSearchTerm] = useState("");

  const filteredRows = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.productName.toLowerCase().includes(q));
  }, [rows, searchTerm]);

  const activeRows = filteredRows.filter((r) => r.hasActivity);
  const inactiveRows = filteredRows.filter((r) => !r.hasActivity);

  const maxVal = useMemo(
    () => Math.max(...rows.map((r) => Math.max(r.produced, r.target, 1))),
    [rows],
  );

  return (
    <Card className="mb-5">
      <CardHeader className="pb-0">
        {/* Title row */}
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <BarChart2 className="w-4 h-4" />
            Daily Output — Ready Parts (Step 99)
          </CardTitle>
          {/* Date navigator */}
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onPrev}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <div className="flex items-center gap-1 px-1">
              {/* Calendar picker button — input overlaid so direct click opens picker without showPicker() */}
              <div className="relative h-7 w-7" title="Pick a date">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 pointer-events-none"
                  tabIndex={-1}
                >
                  <CalendarDays className="w-3.5 h-3.5 text-muted-foreground" />
                </Button>
                <input
                  type="date"
                  value={selectedDate}
                  max={todayIso()}
                  onChange={(e) => e.target.value && onDateChange(e.target.value)}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                />
              </div>
              <span className="text-xs font-medium text-foreground min-w-[160px] text-center">
                {formatDateLabel(selectedDate)}
              </span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onNext}
              disabled={isToday}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
            {!isToday && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs ml-1"
                onClick={onToday}
              >
                Today
              </Button>
            )}
          </div>
        </div>

        {/* Search + summary row */}
        <div className="flex items-center gap-3 mt-2 pb-3 border-b border-border">
          {/* Search box */}
          <div className="relative flex-1 max-w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search product…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-7 pl-8 pr-8 text-xs"
              data-testid="chart-search"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Match count */}
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {searchTerm
              ? `${filteredRows.length} of ${rows.length} shown`
              : `${activeRows.length} of ${rows.length} active today`}
          </span>

          {/* Column legend */}
          <div className="hidden md:flex items-center gap-3 ml-auto text-[10.5px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-primary inline-block" />
              Produced (step 99)
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-sky-400 inline-block" />
              Target (operators × time ÷ std time)
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0 pb-2">
        {isLoading ? (
          <div className="space-y-3 pt-4">
            {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : rows.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center text-muted-foreground">
            <BarChart2 className="w-8 h-8 mb-2 opacity-25" />
            <p className="text-sm font-medium">No products configured</p>
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="py-10 flex flex-col items-center justify-center text-muted-foreground">
            <Search className="w-7 h-7 mb-2 opacity-25" />
            <p className="text-sm font-medium">No products match "{searchTerm}"</p>
            <button
              onClick={() => setSearchTerm("")}
              className="text-xs text-primary mt-1.5 hover:underline"
            >
              Clear search
            </button>
          </div>
        ) : (
          <div className="max-h-[440px] overflow-y-auto">
            {/* Active products */}
            {activeRows.length > 0 && (
              <>
                {activeRows.map((row, idx) => (
                  <ProductRow
                    key={row.productId}
                    row={row}
                    maxVal={maxVal}
                    dimmed={false}
                    isFirst={idx === 0}
                  />
                ))}
              </>
            )}

            {/* Inactive products — shown dimmed below a separator */}
            {inactiveRows.length > 0 && (
              <>
                <div className="flex items-center gap-3 py-2 mt-1">
                  <div className="flex-1 border-t border-dashed border-border" />
                  <span className="text-[10.5px] text-muted-foreground flex-shrink-0">
                    {inactiveRows.length} product{inactiveRows.length !== 1 ? "s" : ""} — no activity today
                  </span>
                  <div className="flex-1 border-t border-dashed border-border" />
                </div>
                {inactiveRows.map((row, idx) => (
                  <ProductRow
                    key={row.productId}
                    row={row}
                    maxVal={maxVal}
                    dimmed={true}
                    isFirst={idx === 0}
                  />
                ))}
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ProductRow({
  row,
  maxVal,
  dimmed,
  isFirst,
}: {
  row: ProductDayRow;
  maxVal: number;
  dimmed: boolean;
  isFirst: boolean;
}) {
  return (
    <div
      className={cn(
        "grid gap-x-3 py-2.5 border-b border-border last:border-0",
        isFirst && "border-t border-border",
        dimmed && "opacity-45",
      )}
      style={{ gridTemplateColumns: "minmax(140px,220px) 1fr 1fr 60px" }}
    >
      {/* Product name */}
      <div className="flex items-center gap-2 min-w-0 pr-2 border-r border-border">
        <div className="min-w-0">
          <p className={cn("text-xs font-semibold text-foreground truncate leading-tight", dimmed && "text-muted-foreground")}>
            {row.productName}
          </p>
          <p className="text-[10px] text-muted-foreground leading-tight">
            Step 99 — Ready parts
          </p>
        </div>
      </div>

      {/* Produced bar */}
      <div className="flex items-center gap-2 pr-2 border-r border-border">
        <span className="w-[52px] text-[10.5px] text-muted-foreground text-right flex-shrink-0">
          Produced
        </span>
        <InlineBar value={row.produced} max={maxVal} color="bg-primary" dimmed={dimmed} />
        <span className="w-8 text-xs font-mono font-semibold text-right flex-shrink-0 text-foreground">
          {row.produced}
        </span>
      </div>

      {/* Target bar */}
      <div className="flex items-center gap-2">
        <span className="w-[52px] text-[10.5px] text-muted-foreground text-right flex-shrink-0">
          Target
        </span>
        <InlineBar value={row.target} max={maxVal} color="bg-sky-400" dimmed={dimmed} />
        <span className="w-8 text-xs font-mono text-right flex-shrink-0 text-muted-foreground">
          {row.target}
        </span>
      </div>

      {/* Efficiency */}
      <div className="flex items-center justify-end flex-shrink-0">
        <EfficiencyBadge pct={row.efficiency} />
      </div>
    </div>
  );
}

// ── dashboard ────────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const summary = useGetDashboardSummary();
  const operatorStats = useGetOperatorStats();
  const productStats = useGetProductStats();
  const allReports = useListReports();
  const allOperators = useListOperators();

  const today = useMemo(() => todayIso(), []);
  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [operatorSearch, setOperatorSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [exporting, setExporting] = useState<"pdf" | "xlsx" | null>(null);
  const [step99PanelOpen, setStep99PanelOpen] = useState(false);
  const [step99From, setStep99From] = useState<string>(today);
  const [step99To, setStep99To] = useState<string>(today);
  const [step99Exporting, setStep99Exporting] = useState<"pdf" | "xlsx" | null>(null);

  const isToday = selectedDate === today;

  function handlePrev() {
    setSelectedDate((d) => shiftIso(d, -1));
  }
  function handleNext() {
    if (!isToday) setSelectedDate((d) => shiftIso(d, 1));
  }
  function handleToday() {
    setSelectedDate(today);
  }

  // Step 99 reports only — used for daily output chart and product stats
  const step99Reports = useMemo(
    () => (allReports.data ?? []).filter((r) => (r.step?.stepNumber ?? 0) === 99),
    [allReports.data],
  );

  // Set of operator IDs marked as lineleader — excluded from productivity chart
  const lineleaderIds = useMemo(
    () => new Set((allOperators.data ?? []).filter((o) => o.isLineleader).map((o) => o.id)),
    [allOperators.data],
  );

  // All reports excluding step 99 — used for operator productivity (matches API)
  const nonStep99Reports = useMemo(
    () => (allReports.data ?? []).filter((r) => (r.step?.stepNumber ?? 0) !== 99),
    [allReports.data],
  );

  // Per-operator efficiency map — all steps except step 99, lineleaders excluded
  const operatorEfficiency = useMemo(() => {
    const map = new Map<number, { expected: number; actual: number }>();
    for (const r of nonStep99Reports) {
      if (lineleaderIds.has(r.operatorId)) continue;
      const stdSec = Number(r.step?.standardTimeMinutes ?? 0);
      const expected = (stdSec / 60) * (r.quantityCompleted ?? 0);
      const actual = Number(r.timeWorkedMinutes ?? 0);
      if (!expected || !actual) continue;
      const prev = map.get(r.operatorId) ?? { expected: 0, actual: 0 };
      map.set(r.operatorId, { expected: prev.expected + expected, actual: prev.actual + actual });
    }
    const result = new Map<number, number | null>();
    for (const [id, { expected, actual }] of map.entries()) {
      result.set(id, actual > 0 ? (expected / actual) * 100 : null);
    }
    return result;
  }, [nonStep99Reports]);

  // All-time efficiency per product — step 99 reports only, no exclusions
  const productAllTimeEfficiency = useMemo(() => {
    const map = new Map<number, number | null>();
    for (const p of productStats.data ?? []) {
      const productReports = step99Reports.filter((r) => r.productId === p.productId);
      map.set(p.productId, calcProductEfficiency(productReports, null));
    }
    return map;
  }, [step99Reports, productStats.data]);

  // Overall average efficiency — arithmetic mean of all-time product efficiencies
  const avgEfficiency = useMemo(() => {
    const vals = Array.from(productAllTimeEfficiency.values()).filter((v): v is number => v !== null);
    if (vals.length === 0) return null;
    return vals.reduce((s, v) => s + v, 0) / vals.length;
  }, [productAllTimeEfficiency]);

  // Last-week average efficiency — mean of per-product efficiency for reports within last week only
  const lastWeekAvgEfficiency = useMemo(() => {
    const thisWeek = currentWeekStart();
    const [ty, tm, td] = thisWeek.split("-").map(Number);
    const lastWeekDate = new Date(ty, tm - 1, td - 7);
    const lastWeek = `${lastWeekDate.getFullYear()}-${String(lastWeekDate.getMonth() + 1).padStart(2, "0")}-${String(lastWeekDate.getDate()).padStart(2, "0")}`;
    const vals: number[] = [];
    for (const p of productStats.data ?? []) {
      const productReports = step99Reports.filter(
        (r) => r.productId === p.productId && r.reportDate != null && r.reportDate >= lastWeek && r.reportDate < thisWeek,
      );
      const eff = calcProductEfficiency(productReports, null);
      if (eff !== null) vals.push(eff);
    }
    if (vals.length === 0) return null;
    return vals.reduce((s, v) => s + v, 0) / vals.length;
  }, [step99Reports, productStats.data]);

  const effTrend =
    avgEfficiency !== null && lastWeekAvgEfficiency !== null
      ? { delta: avgEfficiency - lastWeekAvgEfficiency, label: "vs last week" }
      : null;

  // This-week efficiency per product — step 99 reports only
  const productWeekEfficiency = useMemo(() => {
    const weekStart = currentWeekStart();
    const map = new Map<number, number | null>();
    for (const p of productStats.data ?? []) {
      const productReports = step99Reports.filter((r) => r.productId === p.productId);
      map.set(p.productId, calcProductEfficiency(productReports, null, weekStart));
    }
    return map;
  }, [step99Reports, productStats.data]);

  // Daily product rows for selected date — based on step 99 reports
  const dailyRows = useMemo((): ProductDayRow[] => {
    const dayReports = step99Reports.filter((r) => r.reportDate === selectedDate);

    return (productStats.data ?? []).map((p) => {
      const step99Day = dayReports.filter((r) => r.productId === p.productId);

      const produced = step99Day.reduce((s, r) => s + (r.quantityCompleted ?? 0), 0);

      // Target = sum per report of (operators × timeWorked / stdTimeMin)
      // standardTimeMinutes is stored in SECONDS — divide by 60 for minutes
      // operatorCount defaults to 1 when absent (plain step-99 report)
      const target = step99Day.reduce((s, r) => {
        const stdSec = Number(r.step?.standardTimeMinutes ?? 0);
        if (stdSec === 0) return s;
        const stdMin = stdSec / 60;
        const mins = Number(r.timeWorkedMinutes ?? 0);
        const ops = r.operatorCount != null ? Number(r.operatorCount) : 1;
        return s + (ops * mins) / stdMin;
      }, 0);
      const targetRounded = Math.round(target);
      const efficiency = target > 0 ? Math.round((produced / target) * 100) : null;

      return {
        productId: p.productId,
        productName: p.productName,
        lastStepNumber: 99,
        produced,
        target: targetRounded,
        efficiency,
        hasActivity: produced > 0 || targetRounded > 0,
      };
    }).sort((a, b) => {
      if (a.hasActivity && !b.hasActivity) return -1;
      if (!a.hasActivity && b.hasActivity) return 1;
      const ea = a.efficiency ?? -1;
      const eb = b.efficiency ?? -1;
      return eb - ea;
    });
  }, [step99Reports, selectedDate, productStats.data]);

  // Step 99 daily rows — one entry per raw report in the date range
  const step99DailyRows = useMemo(() => {
    const inRange = step99Reports.filter(
      (r) => r.reportDate != null && r.reportDate >= step99From && r.reportDate <= step99To,
    );
    return inRange.map((r) => ({
      date: r.reportDate ?? "",
      productName: r.product?.name ?? `Product ${r.productId}`,
      quantityProduced: r.quantityCompleted ?? 0,
      operatorCount: r.operatorCount != null ? Number(r.operatorCount) : null,
    }));
  }, [step99Reports, step99From, step99To]);

  // Step 99 export rows — filtered by the chosen date range
  const step99ExportRows = useMemo(() => {
    return (productStats.data ?? []).map((p) => {
      const reports = step99Reports.filter(
        (r) =>
          r.productId === p.productId &&
          r.reportDate != null &&
          r.reportDate >= step99From &&
          r.reportDate <= step99To,
      );
      const quantityProduced = reports.reduce((s, r) => s + (r.quantityCompleted ?? 0), 0);
      const teamSizes = reports
        .map((r) => (r.operatorCount != null ? Number(r.operatorCount) : null))
        .filter((v): v is number => v !== null);
      const avgTeamSize =
        teamSizes.length > 0 ? teamSizes.reduce((s, v) => s + v, 0) / teamSizes.length : null;
      const efficiency = calcProductEfficiency(reports, null);
      return {
        productName: p.productName,
        entries: reports.length,
        quantityProduced,
        avgTeamSize,
        efficiency,
      };
    });
  }, [step99Reports, productStats.data, step99From, step99To]);

  // Per-date headcount map — non-lineleader, non-step-99 reporters vs step-99 declared counts
  const headcountByDate = useMemo(() => {
    const byDate = new Map<string, { regularOpIds: Set<number>; declaredTotal: number; hasStep99: boolean }>();
    for (const r of allReports.data ?? []) {
      const date = r.reportDate ?? "";
      if (!date) continue;
      if (!byDate.has(date)) byDate.set(date, { regularOpIds: new Set(), declaredTotal: 0, hasStep99: false });
      const entry = byDate.get(date)!;
      const isLineleader = lineleaderIds.has(r.operatorId);
      const isStep99 = (r.step?.stepNumber ?? 0) === 99;
      if (!isLineleader && !isStep99) entry.regularOpIds.add(r.operatorId);
      if (isStep99) {
        entry.declaredTotal += r.operatorCount != null ? Number(r.operatorCount) : 0;
        entry.hasStep99 = true;
      }
    }
    const result = new Map<string, { actual: number; declared: number; hasStep99: boolean }>();
    for (const [date, e] of byDate.entries()) {
      result.set(date, { actual: e.regularOpIds.size, declared: e.declaredTotal, hasStep99: e.hasStep99 });
    }
    return result;
  }, [allReports.data, lineleaderIds]);

  const todayHeadcount = useMemo(() => {
    const e = headcountByDate.get(today) ?? { actual: 0, declared: 0, hasStep99: false };
    return { actualCount: e.actual, declaredCount: e.declared, hasStep99: e.hasStep99, delta: e.actual - e.declared };
  }, [headcountByDate, today]);

  // 28-day heatmap grid aligned to calendar weeks (Mon–Sun)
  const headcountWeekDays = useMemo(() => {
    const d = new Date(today + "T00:00:00");
    const dow = d.getDay(); // 0=Sun
    const daysToMonday = dow === 0 ? 6 : dow - 1;
    const thisMonday = shiftIso(today, -daysToMonday);
    const gridStart = shiftIso(thisMonday, -21); // 3 full weeks before this week's Monday

    return Array.from({ length: 28 }, (_, i) => {
      const date = shiftIso(gridStart, i);
      const isFuture = date > today;
      const e = isFuture ? undefined : headcountByDate.get(date);
      const status: "match" | "mismatch" | "none" | "future" =
        isFuture ? "future" : !e?.hasStep99 ? "none" : e.actual === e.declared ? "match" : "mismatch";
      return { date, status, actual: e?.actual ?? 0, declared: e?.declared ?? 0 };
    });
  }, [headcountByDate, today]);

  async function handleStep99Export(format: "pdf" | "xlsx") {
    if (step99Exporting) return;
    setStep99Exporting(format);
    try {
      const exportData = { from: step99From, to: step99To, rows: step99ExportRows, dailyRows: step99DailyRows };
      if (format === "pdf") await exportStep99Pdf(exportData);
      else await exportStep99Xlsx(exportData);
    } finally {
      setStep99Exporting(null);
    }
  }

  async function handleExport(format: "pdf" | "xlsx") {
    if (exporting) return;
    setExporting(format);
    try {
      const weekStart = currentWeekStart();
      const exportData = {
        weekStart,
        totalOperators: summary.data?.totalOperators ?? 0,
        totalProducts: summary.data?.totalProducts ?? 0,
        totalQuantityCompleted: summary.data?.totalQuantityCompleted ?? 0,
        totalTimeMinutes: summary.data?.totalTimeMinutes ?? 0,
        avgEfficiency,
        products: (productStats.data ?? []).map((p) => ({
          productName: p.productName,
          totalQuantityCompleted: p.totalQuantityCompleted,
          allTimeEfficiency: productAllTimeEfficiency.get(p.productId) ?? null,
          weekEfficiency: productWeekEfficiency.get(p.productId) ?? null,
        })),
        operators: (operatorStats.data ?? []).map((op) => ({
          operatorName: op.operatorName,
          employeeId: op.employeeId,
          totalQuantityCompleted: op.totalQuantityCompleted,
          totalReports: op.totalReports,
          efficiency: operatorEfficiency.get(op.operatorId) ?? null,
        })),
      };
      if (format === "pdf") await exportDashboardPdf(exportData);
      else await exportDashboardXlsx(exportData);
    } finally {
      setExporting(null);
    }
  }

  const totalHours = summary.data ? (summary.data.totalTimeMinutes / 60).toFixed(1) : "—";
  const effLabel = avgEfficiency !== null ? `${Math.round(avgEfficiency)}%` : "—";
  const effSub =
    avgEfficiency !== null
      ? avgEfficiency >= 100
        ? "on or ahead of target"
        : avgEfficiency >= 90
          ? "near target"
          : "below target"
      : "no data yet";

  return (
    <div className="p-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <LayoutDashboard className="w-5 h-5 text-primary" />
            Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Production overview and activity</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            variant={step99PanelOpen ? "secondary" : "outline"}
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={() => setStep99PanelOpen((v) => !v)}
          >
            <BarChart2 className="w-3.5 h-3.5" />
            Step 99 Report
            {step99PanelOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={() => handleExport("xlsx")}
            disabled={!!exporting || summary.isLoading || operatorStats.isLoading || productStats.isLoading}
          >
            <Download className="w-3.5 h-3.5" />
            {exporting === "xlsx" ? "Exporting…" : "Export Excel"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={() => handleExport("pdf")}
            disabled={!!exporting || summary.isLoading || operatorStats.isLoading || productStats.isLoading}
          >
            <Download className="w-3.5 h-3.5" />
            {exporting === "pdf" ? "Exporting…" : "Export PDF"}
          </Button>
        </div>
      </div>

      {/* Step 99 export panel */}
      {step99PanelOpen && (
        <div className="mb-5 rounded-md border border-border bg-muted/30 p-4">
          {/* Quick range presets */}
          <div className="flex flex-wrap items-center gap-1.5 mb-3">
            <span className="text-xs text-muted-foreground font-medium mr-1">Quick:</span>
            {[
              {
                label: "Today",
                apply: () => { setStep99From(today); setStep99To(today); },
                active: step99From === today && step99To === today,
              },
              {
                label: "This week",
                apply: () => { const w = currentWeekStart(); setStep99From(w); setStep99To(today); },
                active: step99From === currentWeekStart() && step99To === today,
              },
              {
                label: "This month",
                apply: () => { setStep99From(thisMonthStart()); setStep99To(today); },
                active: step99From === thisMonthStart() && step99To === today,
              },
              {
                label: "Last month",
                apply: () => { const r = lastMonthRange(); setStep99From(r.from); setStep99To(r.to); },
                active: (() => { const r = lastMonthRange(); return step99From === r.from && step99To === r.to; })(),
              },
            ].map(({ label, apply, active }) => (
              <button
                key={label}
                onClick={apply}
                className={cn(
                  "h-6 px-2.5 rounded-sm border text-xs transition-colors",
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-input text-muted-foreground hover:text-foreground hover:border-foreground/30",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">From</label>
              <div className="relative">
                <input
                  type="date"
                  value={step99From}
                  max={step99To}
                  onChange={(e) => e.target.value && setStep99From(e.target.value)}
                  className="h-8 rounded-md border border-input bg-background px-3 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">To</label>
              <input
                type="date"
                value={step99To}
                min={step99From}
                max={today}
                onChange={(e) => e.target.value && setStep99To(e.target.value)}
                className="h-8 rounded-md border border-input bg-background px-3 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="flex items-center gap-2 pb-0.5">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={() => handleStep99Export("xlsx")}
                disabled={!!step99Exporting || allReports.isLoading || productStats.isLoading}
              >
                <Download className="w-3.5 h-3.5" />
                {step99Exporting === "xlsx" ? "Exporting…" : "Excel"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={() => handleStep99Export("pdf")}
                disabled={!!step99Exporting || allReports.isLoading || productStats.isLoading}
              >
                <Download className="w-3.5 h-3.5" />
                {step99Exporting === "pdf" ? "Exporting…" : "PDF"}
              </Button>
            </div>
            <div className="flex-1 min-w-[200px] pb-0.5">
              <p className="text-xs text-muted-foreground">
                {(() => {
                  const active = step99ExportRows.filter((r) => r.entries > 0);
                  const total = step99ExportRows.reduce((s, r) => s + r.quantityProduced, 0);
                  if (allReports.isLoading || productStats.isLoading) return "Loading data…";
                  if (active.length === 0) return "No step 99 entries in this period.";
                  return `${active.length} product${active.length !== 1 ? "s" : ""} · ${total} pieces total`;
                })()}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Stat cards */}
      {summary.isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          <StatCard label="Operators" value={summary.data?.totalOperators ?? 0} icon={Users} />
          <StatCard label="Products" value={summary.data?.totalProducts ?? 0} icon={Package} />
          <StatCard
            label="Reports"
            value={summary.data?.totalReports ?? 0}
            icon={FileText}
            sub="total entries"
          />
          <StatCard
            label="Time Logged"
            value={`${totalHours}h`}
            icon={Clock}
            sub={`${summary.data?.totalQuantityCompleted ?? 0} pieces produced`}
          />
          <StatCard label="Avg Efficiency" value={effLabel} icon={Zap} sub={effSub} trend={effTrend} />
        </div>
      )}

      {/* Headcount / Attendance card */}
      {!allReports.isLoading && (
        <Card className="mb-5">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <UserCheck className="w-4 h-4" />
                Attendance / Headcount Check
              </CardTitle>
              <a href="/admin/reports" className="text-xs text-primary hover:underline">
                View in Reports →
              </a>
            </div>
          </CardHeader>
          <CardContent className="pt-0 pb-4 space-y-4">

            {/* ── Today row ── */}
            <div className="flex flex-wrap items-center gap-3 py-2.5 px-3 rounded-sm bg-muted/30 border border-border">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider w-10 flex-shrink-0">Today</span>

              {todayHeadcount.actualCount === 0 && !todayHeadcount.hasStep99 ? (
                <span className="text-sm text-muted-foreground">No reports submitted yet.</span>
              ) : (
                <>
                  <div className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Reported:</span>
                    <span className="font-bold font-mono text-foreground">{todayHeadcount.actualCount}</span>
                  </div>
                  <span className="text-muted-foreground/40 hidden sm:inline">vs.</span>
                  <div className="flex items-center gap-1.5">
                    <UserCheck className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Declared (Step 99):</span>
                    {todayHeadcount.hasStep99
                      ? <span className="font-bold font-mono text-foreground">{todayHeadcount.declaredCount}</span>
                      : <span className="text-xs text-muted-foreground italic">not submitted yet</span>}
                  </div>
                  {todayHeadcount.hasStep99 && (
                    todayHeadcount.delta === 0 ? (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm border text-xs font-medium bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-700">
                        <CheckCircle2 className="w-3 h-3" />Headcount match
                      </span>
                    ) : (
                      <span className={cn(
                        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm border text-xs font-medium",
                        todayHeadcount.delta > 0
                          ? "bg-orange-50 text-orange-700 border-orange-300 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-700"
                          : "bg-red-50 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700"
                      )}>
                        <AlertTriangle className="w-3 h-3" />
                        {todayHeadcount.delta > 0
                          ? `${todayHeadcount.delta} more reported than declared`
                          : `${Math.abs(todayHeadcount.delta)} fewer reported than declared`}
                      </span>
                    )
                  )}
                </>
              )}
            </div>

            {/* ── 4-week heatmap ── */}
            <div>
              <p className="text-xs text-muted-foreground font-medium mb-2 uppercase tracking-wider">Past 4 weeks</p>
              <div className="flex items-start gap-4">
                <div>
                  {/* Day-of-week column headers */}
                  <div className="grid grid-cols-7 gap-1.5 mb-1">
                    {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((d) => (
                      <span key={d} className="w-6 text-[9px] text-muted-foreground text-center leading-none">{d}</span>
                    ))}
                  </div>
                  {/* 4 week rows */}
                  {[0,1,2,3].map((week) => {
                    const weekSlice = headcountWeekDays.slice(week * 7, week * 7 + 7);
                    return (
                      <div key={week} className="grid grid-cols-7 gap-1.5 mb-1.5">
                        {weekSlice.map((day) => (
                          <div
                            key={day.date}
                            title={
                              day.status === "future" ? day.date :
                              day.status === "none" ? `${day.date} — no Step 99` :
                              `${day.date} — reported: ${day.actual}, declared: ${day.declared}`
                            }
                            className={cn(
                              "w-6 h-6 rounded-sm cursor-default",
                              day.status === "match"    && "bg-emerald-400 dark:bg-emerald-600",
                              day.status === "mismatch" && "bg-red-400 dark:bg-red-500",
                              day.status === "none"     && "bg-muted",
                              day.status === "future"   && "bg-muted/40 border border-dashed border-border",
                            )}
                          />
                        ))}
                      </div>
                    );
                  })}
                </div>

                {/* Legend */}
                <div className="flex flex-col gap-2 pt-6 text-[10.5px] text-muted-foreground flex-shrink-0">
                  <span className="flex items-center gap-1.5">
                    <span className="w-3.5 h-3.5 rounded-sm bg-emerald-400 dark:bg-emerald-600 inline-block flex-shrink-0" />
                    Match
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3.5 h-3.5 rounded-sm bg-red-400 dark:bg-red-500 inline-block flex-shrink-0" />
                    Mismatch
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3.5 h-3.5 rounded-sm bg-muted inline-block flex-shrink-0" />
                    No Step 99
                  </span>
                </div>

                {/* Weekly mismatch count summary */}
                <div className="ml-4 flex flex-col gap-1 pt-6 text-xs text-muted-foreground flex-shrink-0">
                  {[0,1,2,3].map((week) => {
                    const weekSlice = headcountWeekDays.slice(week * 7, week * 7 + 7);
                    const mismatches = weekSlice.filter(d => d.status === "mismatch").length;
                    const matches = weekSlice.filter(d => d.status === "match").length;
                    const label = week === 3 ? "This week" : week === 2 ? "Last week" : `${4 - week}w ago`;
                    return (
                      <div key={week} className="flex items-center gap-2 h-6">
                        <span className="w-16 text-right text-[10.5px]">{label}</span>
                        {mismatches > 0 ? (
                          <span className="text-red-500 font-medium text-[10.5px]">{mismatches} mismatch{mismatches !== 1 ? "es" : ""}</span>
                        ) : matches > 0 ? (
                          <span className="text-emerald-600 dark:text-emerald-400 text-[10.5px]">✓ all match</span>
                        ) : (
                          <span className="text-[10.5px] text-muted-foreground/60">no data</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

          </CardContent>
        </Card>
      )}

      {/* Daily output chart */}
      <DailyOutputChart
        rows={dailyRows}
        isLoading={allReports.isLoading || productStats.isLoading}
        selectedDate={selectedDate}
        onPrev={handlePrev}
        onNext={handleNext}
        onToday={handleToday}
        onDateChange={setSelectedDate}
        isToday={isToday}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Operator Productivity */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Users className="w-4 h-4" />
                Operator Productivity
              </CardTitle>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Zap className="w-3 h-3" />
                <span>Efficiency vs standard</span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {operatorStats.isLoading || allReports.isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}
              </div>
            ) : operatorStats.data?.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No operators yet</p>
            ) : (
              <>
                {/* Search */}
                <div className="relative mb-2">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                  <Input
                    placeholder="Search operator…"
                    value={operatorSearch}
                    onChange={(e) => setOperatorSearch(e.target.value)}
                    className="h-7 pl-8 pr-8 text-xs"
                  />
                  {operatorSearch && (
                    <button
                      onClick={() => setOperatorSearch("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <div className="flex items-center justify-between pb-1.5 mb-1 border-b border-border">
                  <span className="text-xs text-muted-foreground font-medium">Operator</span>
                  <div className="flex items-center gap-6 text-xs text-muted-foreground font-medium">
                    <span className="w-16 text-right">Pieces</span>
                    <span className="w-16 text-right">Reports</span>
                    <span className="w-14 text-right">Efficiency</span>
                  </div>
                </div>
                <div className="max-h-[400px] overflow-y-auto space-y-0">
                  {operatorStats.data
                    ?.slice()
                    .filter((op) => {
                      const q = operatorSearch.trim().toLowerCase();
                      if (!q) return true;
                      return op.operatorName.toLowerCase().includes(q) || op.employeeId.toLowerCase().includes(q);
                    })
                    .sort((a, b) => {
                      const ea = operatorEfficiency.get(a.operatorId) ?? -1;
                      const eb = operatorEfficiency.get(b.operatorId) ?? -1;
                      return eb - ea;
                    })
                    .map((op) => {
                      const eff = operatorEfficiency.get(op.operatorId) ?? null;
                      return (
                        <div
                          key={op.operatorId}
                          data-testid={`stat-operator-${op.operatorId}`}
                          className="flex items-center justify-between py-2.5 border-b border-border last:border-0"
                        >
                          <div className="min-w-0">
                            <span className="text-sm font-medium text-foreground">
                              {op.operatorName}
                            </span>
                            <span className="text-xs text-muted-foreground ml-2 font-mono">
                              {op.employeeId}
                            </span>
                          </div>
                          <div className="flex items-center gap-6 flex-shrink-0 text-sm text-muted-foreground">
                            <span className="w-16 text-right font-mono">
                              {op.totalQuantityCompleted}
                            </span>
                            <span className="w-16 text-right">
                              <Badge variant="secondary" className="font-mono text-xs">
                                {op.totalReports}
                              </Badge>
                            </span>
                            <span className="w-14 text-right">
                              <EfficiencyBadge pct={eff} />
                            </span>
                          </div>
                        </div>
                      );
                    })}
                </div>
                <div className="flex items-center gap-4 mt-3 pt-2 border-t border-border text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />≥ 100%
                    on or ahead
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                    90–99% near target
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
                    &lt; 90% below
                  </span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Product Output */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Product Output
            </CardTitle>
          </CardHeader>
          <CardContent>
            {productStats.isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}
              </div>
            ) : productStats.data?.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No products yet</p>
            ) : (
              <>
              <div className="relative mb-2">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Search product…"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  className="h-7 pl-8 pr-8 text-xs"
                />
                {productSearch && (
                  <button
                    onClick={() => setProductSearch("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <div className="max-h-[400px] overflow-y-auto space-y-0">
                {productStats.data
                  ?.slice()
                  .filter((p) => {
                    const q = productSearch.trim().toLowerCase();
                    if (!q) return true;
                    return p.productName.toLowerCase().includes(q);
                  })
                  .sort((a, b) => {
                    const ea = productAllTimeEfficiency.get(a.productId) ?? -1;
                    const eb = productAllTimeEfficiency.get(b.productId) ?? -1;
                    return eb - ea;
                  })
                  .map((p) => (
                    <div
                      key={p.productId}
                      data-testid={`stat-product-${p.productId}`}
                      className="flex flex-wrap items-center justify-between gap-y-1 py-2 border-b border-border last:border-0"
                    >
                      <div>
                        <span className="text-sm font-medium text-foreground">
                          {p.productName}
                        </span>
                        <span className="text-xs text-muted-foreground ml-2">
                          {p.stepCount} steps
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                        <span className="font-mono text-xs">{p.totalQuantityCompleted} pieces</span>
                        <span className="text-muted-foreground/40">·</span>
                        <span className="text-xs">
                          All-time: <EfficiencyBadge pct={productAllTimeEfficiency.get(p.productId) ?? null} />
                        </span>
                        <span className="text-muted-foreground/40">·</span>
                        <span className="text-xs">
                          This week: <EfficiencyBadge pct={productWeekEfficiency.get(p.productId) ?? null} />
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            {summary.isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}
              </div>
            ) : summary.data?.recentReports.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                No reports submitted yet
              </p>
            ) : (
              <div className="max-h-[640px] overflow-y-auto space-y-0">
                {summary.data?.recentReports
                  .slice(0, 20)
                  .map((r) => (
                    <div
                      key={r.id}
                      data-testid={`recent-report-${r.id}`}
                      className="flex items-center justify-between py-2.5 border-b border-border last:border-0"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Badge variant="outline" className="font-mono text-xs flex-shrink-0">
                          #{r.id}
                        </Badge>
                        <span className="text-sm font-medium text-foreground truncate">
                          {r.product?.name}
                        </span>
                        <span className="text-xs text-muted-foreground hidden sm:inline truncate">
                          Step {r.step?.stepNumber}: {r.step?.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 flex-shrink-0 text-sm text-muted-foreground">
                        <span>{r.operator?.name}</span>
                        <span className="font-mono">{r.quantityCompleted} pieces</span>
                        <span className="font-mono text-xs">{r.reportDate}</span>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
