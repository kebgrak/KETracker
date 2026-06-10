import { useState, useMemo, useRef } from "react";
import { exportToXlsx, importFromFile } from "@/lib/xlsx-utils";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "wouter";
import {
  useListProducts,
  useListReports,
  useCreateProduct,
  useUpdateProduct,
  useDeleteProduct,
  useDuplicateProduct,
  getListProductsQueryKey,
  listSteps,
  createStep,
} from "@workspace/api-client-react";
import { useRole } from "@/context/RoleContext";
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
import { Package, Plus, Trash2, ChevronRight, Zap, Pencil, Copy, Upload, Loader2, Download } from "lucide-react";
import { calcProductEfficiency, currentWeekStart } from "@/lib/efficiency";

const schema = z.object({
  name: z.string().min(1, "Product name is required"),
  description: z.string().optional(),
  revision: z
    .string()
    .max(10, "Max 10 characters")
    .optional(),
});
type FormValues = z.infer<typeof schema>;

interface ProductRow {
  id: number;
  name: string;
  description?: string | null;
  revision?: string | null;
}

function EfficiencyBadge({ pct, label }: { pct: number | null; label: string }) {
  if (pct === null)
    return (
      <span className="text-[10px] text-muted-foreground font-mono">{label}: —</span>
    );
  const pctStr = `${Math.round(pct)}%`;
  if (pct >= 100)
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-bold font-mono px-1.5 py-0.5 rounded-sm bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
        <Zap className="w-2.5 h-2.5" />{label}: {pctStr}
      </span>
    );
  if (pct >= 80)
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-bold font-mono px-1.5 py-0.5 rounded-sm bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
        {label}: {pctStr}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold font-mono px-1.5 py-0.5 rounded-sm bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400">
      {label}: {pctStr}
    </span>
  );
}

export default function AdminProducts() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const role = useRole();
  const canWrite = role === "admin";
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductRow | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);

  const products = useListProducts();
  const allReports = useListReports();
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();
  const duplicateProduct = useDuplicateProduct();

  const weekStart = useMemo(() => currentWeekStart(), []);

  const productEfficiency = useMemo(() => {
    const reports = allReports.data ?? [];
    const map = new Map<number, { allTime: number | null; week: number | null }>();
    for (const p of products.data ?? []) {
      const pr = reports.filter(
        (r) => r.productId === p.id && (r.step?.stepNumber ?? 0) === 99,
      );
      map.set(p.id, {
        allTime: calcProductEfficiency(pr, null),
        week: calcProductEfficiency(pr, null, weekStart),
      });
    }
    return map;
  }, [allReports.data, products.data, weekStart]);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", description: "", revision: "" },
  });

  function openCreate() {
    setEditingProduct(null);
    form.reset({ name: "", description: "", revision: "" });
    setDialogOpen(true);
  }

  function openEdit(p: ProductRow, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setEditingProduct(p);
    form.reset({
      name: p.name,
      description: p.description ?? "",
      revision: p.revision ?? "",
    });
    setDialogOpen(true);
  }

  function invalidateProducts() {
    queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
  }

  async function onSubmit(values: FormValues) {
    const data = {
      name: values.name,
      description: values.description || null,
      revision: values.revision?.trim() || null,
    };

    if (editingProduct) {
      await updateProduct.mutateAsync(
        { id: editingProduct.id, data },
        {
          onSuccess: () => {
            toast({ title: "Product updated" });
            invalidateProducts();
            setDialogOpen(false);
          },
          onError: () => toast({ title: "Update failed", variant: "destructive" }),
        }
      );
    } else {
      await createProduct.mutateAsync(
        { data },
        {
          onSuccess: () => {
            toast({ title: "Product created" });
            invalidateProducts();
            setDialogOpen(false);
          },
          onError: () => toast({ title: "Create failed", variant: "destructive" }),
        }
      );
    }
  }

  function handleDelete(id: number, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    deleteProduct.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Product deleted" });
          invalidateProducts();
        },
        onError: () => toast({ title: "Delete failed", variant: "destructive" }),
      }
    );
  }

  function handleDuplicate(id: number, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    duplicateProduct.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Product duplicated" });
          invalidateProducts();
        },
        onError: () => toast({ title: "Duplicate failed", variant: "destructive" }),
      }
    );
  }

  const isSaving = createProduct.isPending || updateProduct.isPending;

  async function handleExport() {
    const allProducts = products.data ?? [];
    const stepsPerProduct = await Promise.all(
      allProducts.map((p) => listSteps(p.id).catch(() => [] as ReturnType<typeof listSteps> extends Promise<infer T> ? T : never[]))
    );
    type ExportRow = {
      "Product Name": string;
      "Description": string;
      "Revision": string;
      "Step Number": string | number;
      "Sub-step Label": string;
      "Step Name": string;
      "Step Description": string;
      "Standard Time (sec)": string | number;
    };
    const rows: ExportRow[] = [];
    for (let i = 0; i < allProducts.length; i++) {
      const p = allProducts[i];
      const steps = (stepsPerProduct[i] as Array<{stepNumber:number;subStepLabel?:string|null;name:string;description?:string|null;standardTimeMinutes:string|number}>);
      if (!steps || steps.length === 0) {
        rows.push({
          "Product Name": p.name,
          "Description": p.description ?? "",
          "Revision": p.revision ?? "",
          "Step Number": "",
          "Sub-step Label": "",
          "Step Name": "",
          "Step Description": "",
          "Standard Time (sec)": "",
        });
      } else {
        for (const s of steps) {
          rows.push({
            "Product Name": p.name,
            "Description": p.description ?? "",
            "Revision": p.revision ?? "",
            "Step Number": s.stepNumber,
            "Sub-step Label": s.subStepLabel ?? "",
            "Step Name": s.name,
            "Step Description": s.description ?? "",
            "Standard Time (sec)": Number(s.standardTimeMinutes),
          });
        }
      }
    }
    if (rows.length === 0) {
      rows.push({
        "Product Name": "", "Description": "", "Revision": "",
        "Step Number": "", "Sub-step Label": "", "Step Name": "",
        "Step Description": "", "Standard Time (sec)": "",
      });
    }
    await exportToXlsx(
      [{ name: "Products", rows, colWidths: [24, 30, 12, 14, 16, 28, 30, 20] }],
      "products.xlsx"
    );
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setIsImporting(true);
    try {
      const rows = await importFromFile(file);
      if (rows.length === 0) {
        toast({ title: "No rows found in file", variant: "destructive" });
        return;
      }

      type StepRow = { stepNumber: number; subStepLabel: string | null; name: string; description: string | null; standardTimeMinutes: number };
      type ProductGroup = { description: string | null; revision: string | null; steps: StepRow[] };
      const productMap = new Map<string, ProductGroup>();

      for (const row of rows) {
        const name = String(row["Product Name"] ?? row["Name"] ?? row["name"] ?? "").trim();
        if (!name) continue;
        const description = String(row["Description"] ?? row["description"] ?? "").trim() || null;
        const revision = String(row["Revision"] ?? row["revision"] ?? row["Version"] ?? "").trim().slice(0, 10) || null;
        if (!productMap.has(name)) {
          productMap.set(name, { description, revision, steps: [] });
        }
        const group = productMap.get(name)!;
        if (!group.description && description) group.description = description;
        if (!group.revision && revision) group.revision = revision;

        const stepNumberRaw = row["Step Number"] ?? row["step_number"] ?? "";
        const stepName = String(row["Step Name"] ?? row["step_name"] ?? "").trim();
        const standardTimeSec = Number(row["Standard Time (sec)"] ?? row["standard_time"] ?? row["Standard Time"] ?? 0);

        if (stepNumberRaw !== "" && stepName && standardTimeSec > 0) {
          const stepNumber = Number(stepNumberRaw);
          const subStepLabel = String(row["Sub-step Label"] ?? row["sub_step_label"] ?? row["Substep Label"] ?? "").trim() || null;
          const stepDescription = String(row["Step Description"] ?? row["step_description"] ?? "").trim() || null;
          group.steps.push({ stepNumber, subStepLabel, name: stepName, description: stepDescription, standardTimeMinutes: standardTimeSec });
        }
      }

      let productsCreated = 0;
      let stepsCreated = 0;
      let skipped = 0;

      for (const [productName, group] of productMap) {
        try {
          const created = await createProduct.mutateAsync({
            data: { name: productName, description: group.description, revision: group.revision },
          });
          productsCreated++;
          for (const s of group.steps) {
            try {
              await createStep(created.id, {
                stepNumber: s.stepNumber,
                subStepLabel: s.subStepLabel,
                name: s.name,
                description: s.description,
                standardTimeMinutes: s.standardTimeMinutes,
              });
              stepsCreated++;
            } catch { skipped++; }
          }
        } catch { skipped++; }
      }

      queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
      toast({
        title: `Import complete — ${productsCreated} product${productsCreated !== 1 ? "s" : ""}, ${stepsCreated} step${stepsCreated !== 1 ? "s" : ""} added${skipped > 0 ? `, ${skipped} skipped` : ""}`,
      });
    } catch {
      toast({ title: "Failed to read file", variant: "destructive" });
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <div className="p-6">
      {canWrite && (
        <input
          ref={importFileRef}
          type="file"
          accept=".xlsx,.csv"
          className="hidden"
          onChange={handleImportFile}
        />
      )}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Package className="w-5 h-5 text-primary" />
            Products
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {canWrite ? "Manage products and their production flowcharts" : "View products and their production flowcharts"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleExport}
            disabled={products.isLoading}
          >
            <Download className="w-4 h-4 mr-1.5" />
            Export Excel
          </Button>
          {canWrite && (
            <>
              <Button
                variant="outline"
                onClick={() => importFileRef.current?.click()}
                disabled={isImporting}
              >
                {isImporting ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Upload className="w-4 h-4 mr-1.5" />}
                Import Excel
              </Button>
              <Button onClick={openCreate} data-testid="button-create-product">
                <Plus className="w-4 h-4 mr-1.5" />
                New Product
              </Button>
            </>
          )}
        </div>
      </div>

      {products.isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : products.data?.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No products yet</p>
          <p className="text-sm mt-1">Create a product to define its production flowchart.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {products.data?.map((p) => (
            <Link key={p.id} href={`/admin/products/${p.id}`}>
              <div
                data-testid={`row-product-${p.id}`}
                className="bg-card border border-border rounded-sm px-4 py-3 flex items-center justify-between cursor-pointer hover:border-primary/40 hover:shadow-sm transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-primary/10 rounded-sm flex items-center justify-center flex-shrink-0">
                    <Package className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">{p.name}</span>
                      {p.revision && (
                        <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0 h-4">
                          rev {p.revision}
                        </Badge>
                      )}
                    </div>
                    {p.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 max-w-md truncate">
                        {p.description}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <div className="hidden sm:flex items-center gap-1.5 mr-2">
                    <EfficiencyBadge pct={productEfficiency.get(p.id)?.allTime ?? null} label="All-time" />
                    <EfficiencyBadge pct={productEfficiency.get(p.id)?.week ?? null} label="This week" />
                  </div>
                  {canWrite && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-foreground"
                        onClick={(e) => openEdit(p, e)}
                        title="Edit product"
                        data-testid={`button-edit-product-${p.id}`}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-foreground"
                        onClick={(e) => handleDuplicate(p.id, e)}
                        title="Duplicate product"
                        disabled={duplicateProduct.isPending}
                        data-testid={`button-duplicate-product-${p.id}`}
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={(e) => handleDelete(p.id, e)}
                        disabled={deleteProduct.isPending}
                        data-testid={`button-delete-product-${p.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </>
                  )}
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {canWrite && (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingProduct ? "Edit Product" : "New Product"}</DialogTitle>
            </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Product Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Widget A" data-testid="input-product-name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="revision"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Revision / Version <span className="text-muted-foreground font-normal">(optional, max 10 chars)</span></FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g. A, 1.2, Rev3B"
                        maxLength={10}
                        data-testid="input-product-revision"
                        {...field}
                      />
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
                    <FormLabel>Description <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Brief product description..."
                        rows={2}
                        data-testid="input-product-description"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSaving} data-testid="button-save-product">
                  {isSaving ? "Saving..." : editingProduct ? "Save Changes" : "Create Product"}
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
