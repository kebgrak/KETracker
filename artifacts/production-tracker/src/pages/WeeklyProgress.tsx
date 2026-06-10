import { useState, useMemo } from "react";
import {
  useGetWeeklyProgress,
  type WeeklyProgress,
} from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ChevronLeft,
  ChevronRight,
  Target,
  CheckCircle2,
  PackageOpen,
  CalendarIcon,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";

// ── week helpers ──────────────────────────────────────────────────────────────

function getMondayOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDateLabel(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function getWeekRange(monday: Date) {
  const start = new Date(monday);
  const end = new Date(monday);
  end.setDate(end.getDate() + 6);
  return { start: formatDate(start), end: formatDate(end) };
}

function addWeeks(d: Date, weeks: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + weeks * 7);
  return result;
}

// ── component ─────────────────────────────────────────────────────────────────

export default function WeeklyProgress() {
  const today = useMemo(() => new Date(), []);
  const [currentWeekMonday, setCurrentWeekMonday] = useState<Date>(getMondayOfWeek(today));
  const [calendarOpen, setCalendarOpen] = useState(false);

  const weekKey = formatDate(currentWeekMonday);
  const { start, end } = getWeekRange(currentWeekMonday);

  const prevWeekMonday = useMemo(() => addWeeks(currentWeekMonday, -1), [currentWeekMonday]);
  const prevWeekKey = formatDate(prevWeekMonday);
  const prevWeekRange = getWeekRange(prevWeekMonday);

  const progress = useGetWeeklyProgress({ weekStart: weekKey });
  const prevProgress = useGetWeeklyProgress({ weekStart: prevWeekKey });

  const chartData = useMemo(() => {
    if (!progress.data) return [];
    return progress.data
      .filter((p) => p.plannedQuantity > 0)
      .map((p) => ({
        name: p.productName,
        Planned: p.plannedQuantity,
        Completed: p.completedQuantity,
        Remaining: p.remainingQuantity,
        pct: p.percentageComplete,
      }))
      .sort((a, b) => b.pct - a.pct);
  }, [progress.data]);

  const comparisonData = useMemo(() => {
    const prevMap = new Map<number, number>();
    for (const p of prevProgress.data ?? []) {
      prevMap.set(p.productId, p.completedQuantity);
    }
    const currMap = new Map<number, { name: string; completed: number }>();
    for (const p of progress.data ?? []) {
      currMap.set(p.productId, { name: p.productName, completed: p.completedQuantity });
    }
    const allIds = new Set([...prevMap.keys(), ...currMap.keys()]);
    return Array.from(allIds)
      .map((id) => {
        const prev = prevMap.get(id) ?? 0;
        const curr = currMap.get(id)?.completed ?? 0;
        const name = currMap.get(id)?.name ?? (prevProgress.data?.find((p: WeeklyProgress) => p.productId === id)?.productName ?? "");
        const delta = curr - prev;
        const deltaPct = prev > 0 ? Math.round((delta / prev) * 100) : null;
        return { id, name, prev, curr, delta, deltaPct };
      })
      .filter((r) => r.prev > 0 || r.curr > 0)
      .sort((a, b) => b.curr - a.curr);
  }, [progress.data, prevProgress.data]);

  const totalPlanned = progress.data?.reduce((s, p) => s + p.plannedQuantity, 0) ?? 0;
  const totalCompleted = progress.data?.reduce((s, p) => s + p.completedQuantity, 0) ?? 0;
  const totalRemaining = progress.data?.reduce((s, p) => s + p.remainingQuantity, 0) ?? 0;

  const hasData = (progress.data?.length ?? 0) > 0;
  const hasPlanned = (progress.data?.some((p) => p.plannedQuantity > 0)) ?? false;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Weekly Progress</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Production progress against weekly targets — step 99 reports.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentWeekMonday((d) => addWeeks(d, -1))}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>

          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="min-w-44 h-auto py-1.5 px-3 flex flex-col items-center gap-0"
              >
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  <CalendarIcon className="w-3.5 h-3.5 text-muted-foreground" />
                  {formatDateLabel(currentWeekMonday)}
                </span>
                <span className="text-xs text-muted-foreground font-normal">
                  {start} → {end}
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="center">
              <Calendar
                mode="single"
                selected={currentWeekMonday}
                onSelect={(date) => {
                  if (date) {
                    setCurrentWeekMonday(getMondayOfWeek(date));
                    setCalendarOpen(false);
                  }
                }}
                captionLayout="dropdown"
                initialFocus
              />
            </PopoverContent>
          </Popover>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentWeekMonday((d) => addWeeks(d, 1))}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentWeekMonday(getMondayOfWeek(new Date()))}
          >
            This Week
          </Button>
        </div>
      </div>

      {/* Summary totals */}
      <div className="flex items-center gap-6 mb-5 text-sm">
        <div className="flex items-center gap-1.5">
          <Target className="w-4 h-4 text-muted-foreground" />
          <span className="text-muted-foreground">Planned:</span>
          <span className="font-bold">{totalPlanned}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          <span className="text-muted-foreground">Completed:</span>
          <span className="font-bold">{totalCompleted}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <PackageOpen className="w-4 h-4 text-amber-500" />
          <span className="text-muted-foreground">Remaining:</span>
          <span className="font-bold">{totalRemaining}</span>
        </div>
      </div>

      {/* Progress bar chart */}
      {progress.isLoading ? (
        <div className="space-y-2 mb-6">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-7 w-full" />
          ))}
        </div>
      ) : chartData.length > 0 ? (
        <div className="bg-card border border-border rounded-sm p-4 mb-6">
          <div className="text-sm font-semibold mb-3">Weekly Progress</div>
          <div className="space-y-1.5 max-h-[340px] overflow-y-auto pr-1">
            {chartData.map((entry) => {
              const pct = Math.min(100, entry.pct);
              const overPct = entry.pct > 100 ? entry.pct - 100 : 0;
              return (
                <div key={entry.name} className="flex items-center gap-3">
                  <div className="w-32 text-xs truncate text-right shrink-0" title={entry.name}>
                    {entry.name}
                  </div>
                  <div className="flex-1 h-6 bg-muted rounded-sm relative overflow-hidden">
                    <div
                      className="absolute top-0 left-0 h-full rounded-sm transition-all"
                      style={{
                        width: `${pct}%`,
                        backgroundColor:
                          entry.pct >= 100
                            ? "hsl(142, 71%, 45%)"
                            : "hsl(var(--primary))",
                      }}
                    />
                    {overPct > 0 && (
                      <div
                        className="absolute top-0 h-full rounded-sm transition-all opacity-60"
                        style={{
                          left: `${100 - overPct}%`,
                          width: `${overPct}%`,
                          backgroundColor: "hsl(142, 71%, 35%)",
                        }}
                      />
                    )}
                    <span className="absolute inset-0 flex items-center justify-center text-[10px] font-medium text-white mix-blend-difference">
                      {entry.pct}%
                    </span>
                  </div>
                  <div className="w-24 text-xs text-muted-foreground tabular-nums shrink-0">
                    {entry.Completed} / {entry.Planned}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : hasData ? (
        <div className="bg-card border border-border rounded-sm p-6 mb-6 text-center text-sm text-muted-foreground">
          No planned quantities set for this week.
        </div>
      ) : null}

      {/* Read-only table */}
      {progress.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-10 bg-muted rounded-sm animate-pulse" />
          ))}
        </div>
      ) : hasPlanned ? (
        <div className="bg-card border border-border rounded-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="w-28 text-right">Planned</TableHead>
                <TableHead className="w-28 text-right">Completed</TableHead>
                <TableHead className="w-28 text-right">Remaining</TableHead>
                <TableHead className="w-52">Progress</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(progress.data ?? [])
                .filter((p) => p.plannedQuantity > 0)
                .sort((a, b) => b.percentageComplete - a.percentageComplete)
                .map((p) => {
                  const pct = p.percentageComplete;
                  return (
                    <TableRow key={p.productId}>
                      <TableCell className="font-medium">{p.productName}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{p.plannedQuantity}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{p.completedQuantity}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{p.remainingQuantity}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={pct >= 100 ? "default" : "secondary"}
                            className="text-xs font-mono w-12 justify-center"
                          >
                            {pct}%
                          </Badge>
                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${Math.min(100, pct)}%`,
                                backgroundColor:
                                  pct >= 100
                                    ? "hsl(142, 71%, 45%)"
                                    : pct >= 50
                                    ? "hsl(var(--primary))"
                                    : "hsl(38, 92%, 50%)",
                              }}
                            />
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        </div>
      ) : !progress.isLoading && !hasData ? (
        <div className="text-center py-16 text-muted-foreground">
          <Target className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No data for this week</p>
          <p className="text-sm mt-1">No work reports have been submitted yet.</p>
        </div>
      ) : null}

      {/* Week-over-week comparison */}
      {comparisonData.length > 0 && (
        <div className="bg-card border border-border rounded-sm p-4 mt-6">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-semibold">Week-over-Week Comparison</div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="inline-block w-2.5 h-2.5 rounded-sm bg-muted-foreground/30" />
                {prevWeekRange.start} (prev)
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-2.5 h-2.5 rounded-sm bg-primary/70" />
                {start} (this week)
              </span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left font-medium text-muted-foreground pb-2 pr-4">Product</th>
                  <th className="text-right font-medium text-muted-foreground pb-2 px-4 w-32">Prev Week</th>
                  <th className="text-right font-medium text-muted-foreground pb-2 px-4 w-32">This Week</th>
                  <th className="text-right font-medium text-muted-foreground pb-2 pl-4 w-32">Change</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {comparisonData.map((row) => (
                  <tr key={row.id}>
                    <td className="py-2 pr-4 font-medium truncate max-w-[200px]">{row.name}</td>
                    <td className="py-2 px-4 text-right font-mono text-muted-foreground">{row.prev}</td>
                    <td className="py-2 px-4 text-right font-mono font-medium">{row.curr}</td>
                    <td className="py-2 pl-4 text-right">
                      {row.delta === 0 ? (
                        <span className="inline-flex items-center gap-1 text-muted-foreground font-mono">
                          <Minus className="w-3.5 h-3.5" />0
                        </span>
                      ) : row.delta > 0 ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600 font-mono font-medium">
                          <TrendingUp className="w-3.5 h-3.5" />
                          +{row.delta}
                          {row.deltaPct !== null && (
                            <span className="text-xs text-emerald-500">({row.deltaPct}%)</span>
                          )}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-red-500 font-mono font-medium">
                          <TrendingDown className="w-3.5 h-3.5" />
                          {row.delta}
                          {row.deltaPct !== null && (
                            <span className="text-xs text-red-400">({row.deltaPct}%)</span>
                          )}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
