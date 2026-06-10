import { useState, useMemo } from "react";
import { currentWeekStart, calcProductEfficiency, calcStepExpected } from "@/lib/efficiency";
import { useRole } from "@/context/RoleContext";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useParams, Link } from "wouter";
import {
  useGetProduct,
  useListSteps,
  useCreateStep,
  useUpdateStep,
  useDeleteStep,
  useListReports,
  getGetProductQueryKey,
  getListStepsQueryKey,
  getListReportsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Package,
  Plus,
  Pencil,
  Trash2,
  ChevronLeft,
  Timer,
  ListOrdered,
  Zap,
  ClipboardList,
  TrendingUp,
  CheckCircle2,
  AlertTriangle,
  Cog,
} from "lucide-react";

// ── efficiency helpers ────────────────────────────────────────────────────────

interface StepStats {
  totalReports: number;
  totalUnits: number;
  avgActualSeconds: number | null;   // actual time per piece in seconds
  efficiency: number | null;          // percent vs standard
}

function useStepStats(productId: number, stepIds: number[]): Map<number, StepStats> {
  const reports = useListReports(
    productId ? { productId } : undefined,
    { query: { queryKey: getListReportsQueryKey({ productId }), enabled: !!productId } }
  );

  return useMemo(() => {
    const map = new Map<number, StepStats>();
    for (const stepId of stepIds) {
      const stepReports = (reports.data ?? []).filter((r) => r.stepId === stepId);
      if (stepReports.length === 0) {
        map.set(stepId, { totalReports: 0, totalUnits: 0, avgActualSeconds: null, efficiency: null });
        continue;
      }
      const totalUnits = stepReports.reduce((s, r) => s + (r.quantityCompleted ?? 0), 0);
      const isStep99 = stepReports[0]?.step?.stepNumber === 99;

      // Wall-clock minutes — what the operator logged; used for efficiency ratio.
      // calcStepExpected for step 99 already divides by operatorCount so both
      // expected and actual are in wall-clock minutes and the ratio is correct.
      const totalActualWallClock = stepReports.reduce((s, r) => s + Number(r.timeWorkedMinutes ?? 0), 0);

      // Person-minutes — wall-clock × operators — used for avgActualSeconds so it
      // is in the same unit as standardTimeMinutes (person-seconds per piece).
      const totalActualPersonMin = isStep99
        ? stepReports.reduce((s, r) =>
            s + Number(r.timeWorkedMinutes ?? 0) * Math.max(1, Number(r.operatorCount ?? 1)), 0)
        : totalActualWallClock;

      const totalExpected = stepReports.reduce(
        (s, r) => s + calcStepExpected(
          Number(r.step?.standardTimeMinutes ?? 0),
          r.quantityCompleted ?? 0,
          r.step?.stepNumber,
          r.operatorCount,
        ),
        0
      );
      map.set(stepId, {
        totalReports: stepReports.length,
        totalUnits,
        avgActualSeconds: totalUnits > 0 ? (totalActualPersonMin / totalUnits) * 60 : null,
        efficiency: totalActualWallClock > 0 ? (totalExpected / totalActualWallClock) * 100 : null,
      });
    }
    return map;
  }, [reports.data, stepIds]);
}

function EfficiencyBadge({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-xs text-muted-foreground font-mono">—</span>;
  const label = `${Math.round(pct)}%`;
  if (pct >= 100)
    return (
      <span
        data-testid="badge-step-efficiency-high"
        className="inline-flex items-center gap-1 text-xs font-bold font-mono px-2 py-0.5 rounded-sm bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
      >
        <Zap className="w-3 h-3" />{label}
      </span>
    );
  if (pct >= 90)
    return (
      <span
        data-testid="badge-step-efficiency-mid"
        className="inline-flex items-center gap-1 text-xs font-bold font-mono px-2 py-0.5 rounded-sm bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
      >
        {label}
      </span>
    );
  return (
    <span
      data-testid="badge-step-efficiency-low"
      className="inline-flex items-center gap-1 text-xs font-bold font-mono px-2 py-0.5 rounded-sm bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400"
    >
      {label}
    </span>
  );
}

// ── mini progress bar ─────────────────────────────────────────────────────────

function EfficiencyBar({ pct }: { pct: number | null }) {
  if (pct === null) return null;
  const clamped = Math.min(pct, 150); // cap bar at 150% so it doesn't overflow
  const width = `${(clamped / 150) * 100}%`;
  const color =
    pct >= 100
      ? "bg-emerald-500 dark:bg-emerald-400"
      : pct >= 90
      ? "bg-amber-500 dark:bg-amber-400"
      : "bg-red-500 dark:bg-red-400";
  return (
    <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width }} />
    </div>
  );
}

// ── form schema ───────────────────────────────────────────────────────────────

const schema = z.object({
  stepNumber: z
    .string()
    .min(1, "Step number required")
    .refine((v) => Number.isInteger(Number(v)) && Number(v) > 0, "Must be a positive integer"),
  subStepLabel: z.string().optional(),
  name: z.string().min(1, "Step name required"),
  description: z.string().optional(),
  standardTimeMinutes: z
    .string()
    .min(1, "Standard time required")
    .refine((v) => !isNaN(Number(v)) && Number(v) >= 0, "Must be 0 or greater"),
});
type FormValues = z.infer<typeof schema>;

interface Step {
  id: number;
  productId: number;
  stepNumber: number;
  subStepLabel?: string | null;
  name: string;
  description?: string | null;
  standardTimeMinutes: number | string;
}

// ── page ─────────────────────────────────────────────────────────────────────

export default function AdminProductDetail() {
  const { id } = useParams<{ id: string }>();
  const productId = Number(id);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const role = useRole();
  const canWrite = role === "admin";
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingStep, setEditingStep] = useState<Step | null>(null);

  const product = useGetProduct(productId, {
    query: { enabled: !!productId, queryKey: getGetProductQueryKey(productId) },
  });
  const steps = useListSteps(productId, {
    query: { enabled: !!productId, queryKey: getListStepsQueryKey(productId) },
  });
  const createStep = useCreateStep();
  const updateStep = useUpdateStep();
  const deleteStep = useDeleteStep();

  const sortedSteps = useMemo(
    () => steps.data?.slice().sort((a, b) => a.stepNumber - b.stepNumber) ?? [],
    [steps.data]
  );

  const stepIds = useMemo(() => sortedSteps.map((s) => s.id), [sortedSteps]);
  const stepStats = useStepStats(productId, stepIds);

  // Fetch reports at component level (same cache key — no extra request)
  const productReports = useListReports(
    productId ? { productId } : undefined,
    { query: { queryKey: getListReportsQueryKey({ productId }), enabled: !!productId } }
  );

  // Step 99 — auto-managed "Ready parts for the day"
  const step99 = useMemo(
    () => sortedSteps.find((s) => s.stepNumber === 99 && !s.subStepLabel) ?? null,
    [sortedSteps]
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { stepNumber: "", name: "", description: "", standardTimeMinutes: "" },
  });

  function openCreate() {
    setEditingStep(null);
    form.reset({ stepNumber: String(sortedSteps.length + 1), subStepLabel: "", name: "", description: "", standardTimeMinutes: "" });
    setDialogOpen(true);
  }

  function openEdit(step: Step) {
    setEditingStep(step);
    form.reset({
      stepNumber: String(step.stepNumber),
      subStepLabel: step.subStepLabel ?? "",
      name: step.name,
      description: step.description ?? "",
      standardTimeMinutes: String(step.standardTimeMinutes),
    });
    setDialogOpen(true);
  }

  async function onSubmit(values: FormValues) {
    const data = {
      stepNumber: Number(values.stepNumber),
      subStepLabel: values.subStepLabel?.trim() || null,
      name: values.name,
      description: values.description || null,
      standardTimeMinutes: Number(values.standardTimeMinutes),
    };
    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: getListStepsQueryKey(productId) });
      queryClient.invalidateQueries({ queryKey: getGetProductQueryKey(productId) });
      queryClient.invalidateQueries({ queryKey: getListReportsQueryKey({ productId }) });
    };

    if (editingStep) {
      await updateStep.mutateAsync(
        { productId, stepId: editingStep.id, data },
        {
          onSuccess: () => { toast({ title: "Step updated" }); invalidate(); setDialogOpen(false); },
          onError: () => toast({ title: "Update failed", variant: "destructive" }),
        }
      );
    } else {
      await createStep.mutateAsync(
        { productId, data },
        {
          onSuccess: () => { toast({ title: "Step added" }); invalidate(); setDialogOpen(false); },
          onError: () => toast({ title: "Create failed", variant: "destructive" }),
        }
      );
    }
  }

  function handleDelete(stepId: number) {
    deleteStep.mutate(
      { productId, stepId },
      {
        onSuccess: () => {
          toast({ title: "Step deleted" });
          queryClient.invalidateQueries({ queryKey: getListStepsQueryKey(productId) });
          queryClient.invalidateQueries({ queryKey: getGetProductQueryKey(productId) });
        },
        onError: () => toast({ title: "Delete failed", variant: "destructive" }),
      }
    );
  }

  const isPending = createStep.isPending || updateStep.isPending;
  const stepGroupsForView = useMemo(() => {
    const map = new Map<number, Step[]>();
    for (const step of sortedSteps) {
      const arr = map.get(step.stepNumber) ?? [];
      arr.push(step);
      map.set(step.stepNumber, arr);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a - b)
      .map(([stepNumber, members]) => {
        const parent = members.find((m) => !m.subStepLabel) ?? null;
        const substeps = members
          .filter((m) => !!m.subStepLabel)
          .sort((a, b) => (a.subStepLabel ?? "").localeCompare(b.subStepLabel ?? ""));
        const hasSubsteps = substeps.length > 0;
        const substepTotal = substeps.reduce((s, m) => s + Number(m.standardTimeMinutes), 0);
        const parentTime = parent ? Number(parent.standardTimeMinutes) : null;
        const timesMatch = hasSubsteps && parentTime !== null ? substepTotal === parentTime : null;
        return { stepNumber, parent, substeps, members, hasSubsteps, substepTotal, parentTime, timesMatch };
      });
  }, [sortedSteps]);

  const totalStandardTime = stepGroupsForView.reduce((acc, group) => {
    if (group.hasSubsteps) return acc + (group.parentTime ?? group.substepTotal);
    return acc + Number(group.members[0].standardTimeMinutes);
  }, 0);

  // Step 99 reports only — used for all efficiency calculations
  const step99Reports = useMemo(
    () => (productReports.data ?? []).filter((r) => r.step?.stepNumber === 99),
    [productReports.data]
  );

  // All-time efficiency based on step 99 reports
  const overallEfficiency = useMemo(
    () => calcProductEfficiency(step99Reports, null),
    [step99Reports]
  );

  // Current calendar-week efficiency based on step 99 reports
  const weekEfficiency = useMemo(
    () => calcProductEfficiency(step99Reports, null, currentWeekStart()),
    [step99Reports]
  );

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <Link href="/admin/products">
          <Button variant="ghost" size="sm" className="mb-3 -ml-2 text-muted-foreground" data-testid="link-back-products">
            <ChevronLeft className="w-4 h-4 mr-1" />
            Products
          </Button>
        </Link>

        {product.isLoading ? (
          <Skeleton className="h-8 w-48" />
        ) : (
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
                <Package className="w-5 h-5 text-primary" />
                {product.data?.name}
              </h1>
              {product.data?.description && (
                <p className="text-sm text-muted-foreground mt-1">{product.data.description}</p>
              )}
            </div>
            {canWrite && (
              <Button onClick={openCreate} data-testid="button-add-step">
                <Plus className="w-4 h-4 mr-1.5" />
                Add Step
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Summary bar */}
      {!steps.isLoading && sortedSteps.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 p-3 bg-muted rounded-sm mb-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <ListOrdered className="w-4 h-4" />
            <strong className="text-foreground">{sortedSteps.filter(s => s.stepNumber !== 99).length}</strong> steps
          </span>
          <span className="flex items-center gap-1.5">
            <Timer className="w-4 h-4" />
            Cycle time (step 99):
            <Badge variant="secondary" className="font-mono ml-1">
              {step99 ? `${Number(step99.standardTimeMinutes)} sec` : "—"}
            </Badge>
          </span>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 ml-auto">
            <span className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 flex-shrink-0" />
              <span className="text-xs">All-time efficiency:</span>
              <EfficiencyBadge pct={overallEfficiency} />
            </span>
            <span className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 flex-shrink-0" />
              <span className="text-xs">This week:</span>
              <EfficiencyBadge pct={weekEfficiency} />
            </span>
            <span className="text-[10px] text-muted-foreground/60 italic">based on step 99</span>
          </div>
        </div>
      )}

      {/* Flowchart Steps */}
      {steps.isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : sortedSteps.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground border-2 border-dashed border-border rounded-sm">
          <ListOrdered className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No steps defined</p>
          <p className="text-sm mt-1">Add the first step in this product's flowchart.</p>
          {canWrite && (
            <Button className="mt-4" onClick={openCreate} data-testid="button-add-first-step">
              <Plus className="w-4 h-4 mr-1.5" />
              Add First Step
            </Button>
          )}
        </div>
      ) : (
        <div className="relative">
          {/* Connector line */}
          <div className="absolute left-[1.625rem] top-10 bottom-10 w-px bg-border" />

          <div className="space-y-2">
            {stepGroupsForView.map((group) => {
              if (!group.hasSubsteps) {
                const step = group.members[0];
                const st = stepStats.get(step.id);
                const isAutoStep = step.stepNumber === 99;
                return (
                  <div
                    key={step.id}
                    data-testid={`row-step-${step.id}`}
                    className="relative flex items-start gap-4"
                  >
                    <div className={`relative z-10 min-w-9 h-9 px-1.5 rounded-sm flex items-center justify-center text-sm font-bold font-mono flex-shrink-0 mt-0.5 ${isAutoStep ? "bg-amber-500 text-white" : "bg-primary text-primary-foreground"}`}>
                      {step.stepNumber}{step.subStepLabel ?? ""}
                    </div>
                    <div className={`flex-1 bg-card border rounded-sm px-4 py-3 transition-colors ${isAutoStep ? "border-amber-300 bg-amber-50/40 dark:bg-amber-950/20" : "border-border hover:border-primary/30"}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-foreground">{step.name}</span>
                            {isAutoStep && (
                              <span className="inline-flex items-center gap-1 text-[10.5px] font-medium px-1.5 py-0.5 rounded-sm bg-amber-100 text-amber-700 border border-amber-300">
                                <Cog className="w-3 h-3" />
                                Auto-managed
                              </span>
                            )}
                          </div>
                          {step.description && (
                            <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>
                          )}
                          {isAutoStep && (
                            <p className="text-xs text-amber-700/70 mt-0.5">Sum of all operation standard times — updated automatically</p>
                          )}
                        </div>
                        {!isAutoStep && canWrite && (
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <Button variant="ghost" size="icon" onClick={() => openEdit(step)} data-testid={`button-edit-step-${step.id}`}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" onClick={() => handleDelete(step.id)} disabled={deleteStep.isPending} data-testid={`button-delete-step-${step.id}`}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 mt-2.5 pt-2.5 border-t border-border">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Timer className="w-3.5 h-3.5" />
                          <span>Standard:</span>
                          <span className="font-mono font-medium text-foreground">{step.standardTimeMinutes} sec</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <ClipboardList className="w-3.5 h-3.5" />
                          <span className="font-mono font-medium text-foreground">{st?.totalReports ?? 0}</span>
                          <span>reports,</span>
                          <span className="font-mono font-medium text-foreground">{st?.totalUnits ?? 0}</span>
                          <span>pieces</span>
                        </div>
                        {st?.avgActualSeconds != null && (
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <span>Avg actual:</span>
                            <span className="font-mono font-medium text-foreground">{st.avgActualSeconds.toFixed(1)} sec/piece</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2 ml-auto">
                          <EfficiencyBar pct={st?.efficiency ?? null} />
                          <EfficiencyBadge pct={st?.efficiency ?? null} />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }

              /* ── Substep group ─────────────────────────────────────────── */
              return (
                <div key={group.stepNumber} data-testid={`group-step-${group.stepNumber}`} className="relative flex items-start gap-4">
                  <div className="relative z-10 min-w-9 h-9 px-1.5 bg-primary text-primary-foreground rounded-sm flex items-center justify-center text-sm font-bold font-mono flex-shrink-0 mt-0.5">
                    {group.stepNumber}
                  </div>
                  <div className="flex-1 bg-card border border-border rounded-sm overflow-hidden hover:border-primary/30 transition-colors">
                    {/* Parent step header */}
                    {group.parent && (
                      <div className="px-4 py-3 bg-muted/30 border-b border-border">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <span className="text-sm font-semibold text-foreground">{group.parent.name}</span>
                            {group.parent.description && (
                              <p className="text-xs text-muted-foreground mt-0.5">{group.parent.description}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {group.timesMatch === true && (
                              <span className="inline-flex items-center gap-1 text-[10.5px] font-medium px-1.5 py-0.5 rounded-sm bg-emerald-100 text-emerald-700">
                                <CheckCircle2 className="w-3 h-3" />
                                {group.substepTotal} sec ✓
                              </span>
                            )}
                            {group.timesMatch === false && (
                              <span className="inline-flex items-center gap-1 text-[10.5px] font-medium px-1.5 py-0.5 rounded-sm bg-amber-100 text-amber-700">
                                <AlertTriangle className="w-3 h-3" />
                                {group.substepTotal}/{group.parentTime} sec
                              </span>
                            )}
                            {group.timesMatch === null && (
                              <span className="font-mono text-xs text-muted-foreground">{group.parent.standardTimeMinutes} sec</span>
                            )}
                            {canWrite && (
                              <>
                                <Button variant="ghost" size="icon" onClick={() => openEdit(group.parent!)} data-testid={`button-edit-step-${group.parent.id}`}>
                                  <Pencil className="w-4 h-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" onClick={() => handleDelete(group.parent!.id)} disabled={deleteStep.isPending} data-testid={`button-delete-step-${group.parent.id}`}>
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Substep rows */}
                    {group.substeps.map((substep) => {
                      const st = stepStats.get(substep.id);
                      const pct = group.substepTotal > 0
                        ? Math.round((Number(substep.standardTimeMinutes) / group.substepTotal) * 100)
                        : null;
                      return (
                        <div key={substep.id} data-testid={`row-step-${substep.id}`} className="px-4 py-3 pl-8 border-b border-dashed border-border last:border-b-0">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-xs font-bold font-mono bg-primary/10 text-primary px-1.5 py-0.5 rounded-sm flex-shrink-0">
                                {substep.stepNumber}{substep.subStepLabel}
                              </span>
                              <div className="min-w-0">
                                <span className="text-sm font-semibold text-foreground">{substep.name}</span>
                                {substep.description && (
                                  <p className="text-xs text-muted-foreground mt-0.5">{substep.description}</p>
                                )}
                              </div>
                            </div>
                            {canWrite && (
                              <div className="flex items-center gap-1 flex-shrink-0">
                                <Button variant="ghost" size="icon" onClick={() => openEdit(substep)} data-testid={`button-edit-step-${substep.id}`}>
                                  <Pencil className="w-4 h-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" onClick={() => handleDelete(substep.id)} disabled={deleteStep.isPending} data-testid={`button-delete-step-${substep.id}`}>
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 mt-2.5 pt-2.5 border-t border-border">
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Timer className="w-3.5 h-3.5" />
                              <span>Standard:</span>
                              <span className="font-mono font-medium text-foreground">{substep.standardTimeMinutes} sec</span>
                              {pct !== null && <span className="text-[10px] text-muted-foreground/60">({pct}%)</span>}
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <ClipboardList className="w-3.5 h-3.5" />
                              <span className="font-mono font-medium text-foreground">{st?.totalReports ?? 0}</span>
                              <span>reports,</span>
                              <span className="font-mono font-medium text-foreground">{st?.totalUnits ?? 0}</span>
                              <span>pieces</span>
                            </div>
                            {st?.avgActualSeconds != null && (
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <span>Avg actual:</span>
                                <span className="font-mono font-medium text-foreground">{st.avgActualSeconds.toFixed(1)} sec/piece</span>
                              </div>
                            )}
                            <div className="flex items-center gap-2 ml-auto">
                              <EfficiencyBar pct={st?.efficiency ?? null} />
                              <EfficiencyBadge pct={st?.efficiency ?? null} />
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {/* No parent warning */}
                    {!group.parent && (
                      <div className="px-4 py-2 text-xs text-amber-700 bg-amber-50 border-t border-dashed border-amber-200 flex items-center gap-1.5">
                        <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                        Add a parent step {group.stepNumber} (no sub-step label) to validate total time
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Efficiency legend */}
      {sortedSteps.length > 0 && (
        <div className="flex flex-wrap items-center gap-4 mt-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
            Efficiency &ge; 100% — at or ahead of standard
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
            90–99% — near target
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
            &lt; 90% — below target
          </span>
        </div>
      )}

      {/* Step dialog — admin only */}
      {canWrite && (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingStep ? "Edit Step" : "Add Step"}</DialogTitle>
            </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="stepNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Step Number</FormLabel>
                      <FormControl>
                        <Input type="number" min="1" placeholder="1" data-testid="input-step-number" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="subStepLabel"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sub-step <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. a, b, c" maxLength={5} data-testid="input-sub-step-label" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="standardTimeMinutes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Std. Time (sec)</FormLabel>
                      <FormControl>
                        <Input type="number" min="0" step="1" placeholder="90" data-testid="input-standard-time" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Step Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Assembly" data-testid="input-step-name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description (optional)</FormLabel>
                    <FormControl>
                      <Textarea rows={2} placeholder="Step description..." data-testid="input-step-description" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={isPending} data-testid="button-save-step">
                  {isPending ? "Saving..." : "Save Step"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
