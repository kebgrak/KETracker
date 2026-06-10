import { useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { exportToXlsx, importFromFile } from "@/lib/xlsx-utils";
import {
  useListOperators,
  useCreateOperator,
  useUpdateOperator,
  useDeleteOperator,
  getListOperatorsQueryKey,
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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useRole } from "@/context/RoleContext";
import { Users, Plus, Pencil, Trash2, ShieldCheck, Mail, Crown, Upload, Loader2, Download, ShieldHalf } from "lucide-react";

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  employeeId: z.string().min(1, "Employee ID is required"),
  isAdmin: z.boolean().optional(),
  isLineleader: z.boolean().optional(),
  isModerator: z.boolean().optional(),
  email: z.string().email("Enter a valid email address").or(z.literal("")).optional(),
});
type FormValues = z.infer<typeof schema>;

interface Operator {
  id: number;
  name: string;
  employeeId: string;
  isAdmin: boolean;
  isLineleader: boolean;
  isModerator: boolean;
  email?: string | null;
}

function toBool(val: unknown): boolean {
  if (typeof val === "boolean") return val;
  if (typeof val === "number") return val === 1;
  if (typeof val === "string") return ["yes", "true", "1"].includes(val.toLowerCase().trim());
  return false;
}

export default function AdminOperators() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const role = useRole();
  const canWrite = role === "admin";
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingOperator, setEditingOperator] = useState<Operator | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);

  const operators = useListOperators();
  const createOperator = useCreateOperator();
  const updateOperator = useUpdateOperator();
  const deleteOperator = useDeleteOperator();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", employeeId: "", isAdmin: false, isLineleader: false, isModerator: false, email: "" },
  });

  const watchedIsAdmin = form.watch("isAdmin");
  const watchedIsLineleader = form.watch("isLineleader");
  const watchedIsModerator = form.watch("isModerator");

  function openCreate() {
    setEditingOperator(null);
    form.reset({ name: "", employeeId: "", isAdmin: false, isLineleader: false, isModerator: false, email: "" });
    setDialogOpen(true);
  }

  function openEdit(op: Operator) {
    setEditingOperator(op);
    form.reset({
      name: op.name,
      employeeId: op.employeeId,
      isAdmin: op.isAdmin,
      isLineleader: op.isLineleader,
      isModerator: op.isModerator,
      email: op.email ?? "",
    });
    setDialogOpen(true);
  }

  async function onSubmit(values: FormValues) {
    const isAdmin = values.isAdmin ?? false;
    const isModerator = isAdmin ? false : (values.isModerator ?? false);
    const isLineleader = (isAdmin || isModerator) ? false : (values.isLineleader ?? false);
    const data = {
      name: values.name,
      employeeId: values.employeeId,
      isAdmin,
      isLineleader,
      isModerator,
      email: isAdmin && values.email ? values.email : null,
    };

    if (editingOperator) {
      await updateOperator.mutateAsync(
        { id: editingOperator.id, data },
        {
          onSuccess: () => {
            toast({ title: "Operator updated" });
            queryClient.invalidateQueries({ queryKey: getListOperatorsQueryKey() });
            setDialogOpen(false);
          },
          onError: () => toast({ title: "Update failed", variant: "destructive" }),
        }
      );
    } else {
      await createOperator.mutateAsync(
        { data },
        {
          onSuccess: () => {
            toast({ title: "Operator created" });
            queryClient.invalidateQueries({ queryKey: getListOperatorsQueryKey() });
            setDialogOpen(false);
          },
          onError: () => toast({ title: "Create failed", variant: "destructive" }),
        }
      );
    }
  }

  function handleDelete(id: number) {
    deleteOperator.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Operator deleted" });
          queryClient.invalidateQueries({ queryKey: getListOperatorsQueryKey() });
        },
        onError: () => toast({ title: "Delete failed", variant: "destructive" }),
      }
    );
  }

  const isPending = createOperator.isPending || updateOperator.isPending;

  async function handleExport() {
    const rows = (operators.data ?? []).map((op) => ({
      "Name": op.name,
      "Employee ID": op.employeeId,
      "Is Admin": (op as Operator).isAdmin ? "yes" : "no",
      "Is Lineleader": (op as Operator).isLineleader ? "yes" : "no",
      "Is Moderator": (op as Operator).isModerator ? "yes" : "no",
      "Email": op.isAdmin ? (op.email ?? "") : "",
    }));
    if (rows.length === 0) {
      rows.push({ "Name": "", "Employee ID": "", "Is Admin": "no", "Is Lineleader": "no", "Is Moderator": "no", "Email": "" });
    }
    await exportToXlsx([{ name: "Operators", rows }], "operators.xlsx");
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
      let created = 0;
      let skipped = 0;
      for (const row of rows) {
        const name = String(row["Name"] ?? row["name"] ?? "").trim();
        const employeeId = String(row["Employee ID"] ?? row["employee_id"] ?? row["EmployeeID"] ?? "").trim();
        if (!name || !employeeId) { skipped++; continue; }
        const isAdmin = toBool(row["Is Admin"] ?? row["isAdmin"] ?? row["is_admin"] ?? false);
        const isModerator = isAdmin ? false : toBool(row["Is Moderator"] ?? row["isModerator"] ?? row["is_moderator"] ?? false);
        const isLineleader = (isAdmin || isModerator) ? false : toBool(row["Is Lineleader"] ?? row["isLineleader"] ?? row["is_lineleader"] ?? false);
        const emailRaw = String(row["Email"] ?? row["email"] ?? "").trim();
        const email = isAdmin && emailRaw ? emailRaw : null;
        try {
          await createOperator.mutateAsync({ data: { name, employeeId, isAdmin, isLineleader, isModerator, email } });
          created++;
        } catch { skipped++; }
      }
      queryClient.invalidateQueries({ queryKey: getListOperatorsQueryKey() });
      toast({ title: `Import complete — ${created} added, ${skipped} skipped` });
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
            <Users className="w-5 h-5 text-primary" />
            Operators
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {canWrite ? "Manage production operators" : "View production operators"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleExport}
            disabled={operators.isLoading}
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
              <Button onClick={openCreate} data-testid="button-create-operator">
                <Plus className="w-4 h-4 mr-1.5" />
                New Operator
              </Button>
            </>
          )}
        </div>
      </div>

      {operators.isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}
        </div>
      ) : operators.data?.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No operators yet</p>
          <p className="text-sm mt-1">Add your first operator to get started.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {operators.data?.map((op) => (
            <div
              key={op.id}
              data-testid={`row-operator-${op.id}`}
              className="bg-card border border-border rounded-sm px-4 py-3 flex items-center justify-between hover:border-primary/30 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-primary/10 rounded-sm flex items-center justify-center text-xs font-bold text-primary font-mono">
                  {op.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{op.name}</span>
                    {op.isAdmin && (
                      <Badge variant="secondary" className="text-xs flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3" />
                        Admin
                      </Badge>
                    )}
                    {(op as Operator).isModerator && (
                      <Badge variant="outline" className="text-xs flex items-center gap-1 border-blue-400 text-blue-700 bg-blue-50">
                        <ShieldHalf className="w-3 h-3" />
                        Moderator
                      </Badge>
                    )}
                    {(op as Operator).isLineleader && (
                      <Badge variant="outline" className="text-xs flex items-center gap-1 border-amber-400 text-amber-700 bg-amber-50">
                        <Crown className="w-3 h-3" />
                        Lineleader
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground font-mono">{op.employeeId}</span>
                    {op.isAdmin && op.email && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Mail className="w-3 h-3" />
                        {op.email}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {canWrite && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openEdit(op as Operator)}
                    data-testid={`button-edit-operator-${op.id}`}
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => handleDelete(op.id)}
                    disabled={deleteOperator.isPending}
                    data-testid={`button-delete-operator-${op.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {canWrite && (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingOperator ? "Edit Operator" : "New Operator"}</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name</FormLabel>
                      <FormControl>
                        <Input placeholder="John Smith" data-testid="input-operator-name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="employeeId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Employee ID</FormLabel>
                      <FormControl>
                        <Input placeholder="EMP-001" data-testid="input-employee-id" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="isAdmin"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between">
                      <div>
                        <FormLabel className="mb-0">Administrator</FormLabel>
                        <p className="text-xs text-muted-foreground mt-0.5">Full access to all admin panels</p>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={(v) => {
                            field.onChange(v);
                            if (v) { form.setValue("isLineleader", false); form.setValue("isModerator", false); }
                          }}
                          data-testid="switch-is-admin"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                {!watchedIsAdmin && (
                  <FormField
                    control={form.control}
                    name="isModerator"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between">
                        <div>
                          <FormLabel className="mb-0 flex items-center gap-1.5">
                            <ShieldHalf className="w-3.5 h-3.5 text-blue-600" />
                            Moderator
                          </FormLabel>
                          <p className="text-xs text-muted-foreground mt-0.5">View-only access to admin — cannot add/edit/delete</p>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value ?? false}
                            onCheckedChange={(v) => {
                              field.onChange(v);
                              if (v) { form.setValue("isAdmin", false); form.setValue("isLineleader", false); }
                            }}
                            data-testid="switch-is-moderator"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                )}

                {!watchedIsAdmin && !watchedIsModerator && (
                  <FormField
                    control={form.control}
                    name="isLineleader"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between">
                        <div>
                          <FormLabel className="mb-0 flex items-center gap-1.5">
                            <Crown className="w-3.5 h-3.5 text-amber-600" />
                            Lineleader
                          </FormLabel>
                          <p className="text-xs text-muted-foreground mt-0.5">Work Entry only — sees Step 99 ("Ready parts")</p>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={(v) => {
                              field.onChange(v);
                              if (v) { form.setValue("isAdmin", false); form.setValue("isModerator", false); }
                            }}
                            data-testid="switch-is-lineleader"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                )}

                {watchedIsAdmin && (
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-1.5">
                          <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                          Notification Email
                          <span className="text-xs font-normal text-muted-foreground ml-1">(optional)</span>
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="email"
                            placeholder="admin@company.com"
                            data-testid="input-operator-email"
                            {...field}
                          />
                        </FormControl>
                        <p className="text-xs text-muted-foreground">
                          Receives an email when the admin password is changed.
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isPending} data-testid="button-save-operator">
                    {isPending ? "Saving..." : "Save"}
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
