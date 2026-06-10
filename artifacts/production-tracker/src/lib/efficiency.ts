export type ReportLike = {
  productId?: number;
  reportDate?: string | null;
  quantityCompleted?: number | null;
  timeWorkedMinutes?: number | string | null;
  operatorCount?: number | string | null;
  step?: { stepNumber?: number; standardTimeMinutes?: number | string } | null;
};

function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function currentWeekStart(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return localDateStr(monday);
}

export function calcStepExpected(
  stdSec: number,
  qty: number,
  stepNumber: number | undefined,
  operatorCount: number | string | null | undefined,
): number {
  const stdMin = stdSec / 60;
  const operators = operatorCount != null ? Number(operatorCount) : null;
  return stepNumber === 99 && operators && operators > 0
    ? (qty / operators) * stdMin
    : qty * stdMin;
}

export function calcProductEfficiency(
  reports: ReportLike[],
  lastStepNumber: number | null,
  fromDate?: string,
): number | null {
  let totalExpected = 0;
  let totalActual = 0;
  for (const r of reports) {
    if (lastStepNumber !== null && (r.step?.stepNumber ?? 0) === lastStepNumber) continue;
    if (fromDate && r.reportDate && r.reportDate < fromDate) continue;
    const stdSec = Number(r.step?.standardTimeMinutes ?? 0);
    if (stdSec === 0) continue;
    // standardTimeMinutes is stored in SECONDS — convert to minutes for ratio
    const stdMin = stdSec / 60;
    const qty = r.quantityCompleted ?? 0;
    const actual = Number(r.timeWorkedMinutes ?? 0);
    if (actual === 0) continue;
    const operators = r.operatorCount != null ? Number(r.operatorCount) : null;
    // Step-99 with operatorCount: expected = (qty / operators) × std_time_min
    // All other steps: expected = qty × std_time_min
    const expected =
      r.step?.stepNumber === 99 && operators && operators > 0
        ? (qty / operators) * stdMin
        : qty * stdMin;
    totalExpected += expected;
    totalActual += actual;
  }
  return totalActual > 0 && totalExpected > 0 ? (totalExpected / totalActual) * 100 : null;
}

export function buildMaxStepMap(reports: ReportLike[]): Map<number, number> {
  const map = new Map<number, number>();
  for (const r of reports) {
    if (r.productId == null) continue;
    const stepNum = r.step?.stepNumber ?? 0;
    const current = map.get(r.productId) ?? 0;
    if (stepNum > current) map.set(r.productId, stepNum);
  }
  return map;
}
