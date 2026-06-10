import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Lock, Eye, EyeOff, ChevronLeft, Mail, ShieldHalf } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import type { UserRole } from "@/hooks/useAdminAuth";

// ── Shared schemas ─────────────────────────────────────────────────────────────

const loginSchema = z.object({
  password: z.string().min(1, "Password is required"),
});
type LoginValues = z.infer<typeof loginSchema>;

const resetSchema = z
  .object({
    email: z.string().email("Enter a valid email address"),
    newPassword: z.string().min(6, "New password must be at least 6 characters"),
    confirmPassword: z.string().min(1, "Please confirm your new password"),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
type ResetValues = z.infer<typeof resetSchema>;

// ── Password input helper ─────────────────────────────────────────────────────

function PasswordInput({
  placeholder,
  autoComplete,
  ...rest
}: React.ComponentProps<typeof Input>) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        type={show ? "text" : "password"}
        placeholder={placeholder}
        autoComplete={autoComplete}
        {...rest}
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
        tabIndex={-1}
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}

// ── Role tab selector ─────────────────────────────────────────────────────────

type LoginRole = "admin" | "moderator";

interface RoleTabProps {
  role: LoginRole;
  onSelect: (r: LoginRole) => void;
}

function RoleTabs({ role, onSelect }: RoleTabProps) {
  return (
    <div className="flex rounded-sm border border-border bg-muted p-0.5 mb-6">
      {(["admin", "moderator"] as LoginRole[]).map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => onSelect(r)}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-sm font-medium rounded-[2px] transition-colors ${
            role === r
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {r === "admin" ? (
            <Lock className="w-3.5 h-3.5" />
          ) : (
            <ShieldHalf className="w-3.5 h-3.5" />
          )}
          {r === "admin" ? "Admin" : "Moderator"}
        </button>
      ))}
    </div>
  );
}

// ── Login view ────────────────────────────────────────────────────────────────

interface LoginViewProps {
  onSuccess: (role: UserRole) => void;
  onForgot: () => void;
}

function LoginView({ onSuccess, onForgot }: LoginViewProps) {
  const [loginRole, setLoginRole] = useState<LoginRole>("admin");
  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { password: "" },
  });

  function handleRoleChange(r: LoginRole) {
    setLoginRole(r);
    setServerError(null);
    form.reset();
  }

  async function onSubmit(values: LoginValues) {
    setServerError(null);
    setLoading(true);
    const endpoint = loginRole === "admin" ? "auth/login" : "auth/moderator-login";
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password: values.password }),
      });
      if (res.ok) {
        onSuccess(loginRole);
      } else {
        const body = await res.json().catch(() => ({}));
        setServerError((body as { error?: string }).error ?? "Login failed.");
        form.setValue("password", "");
      }
    } catch {
      setServerError("Could not reach the server. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-sm bg-primary/10 mb-4">
          {loginRole === "admin" ? (
            <Lock className="w-5 h-5 text-primary" />
          ) : (
            <ShieldHalf className="w-5 h-5 text-primary" />
          )}
        </div>
        <h1 className="text-xl font-bold text-foreground">
          {loginRole === "admin" ? "Admin Access" : "Moderator Access"}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {loginRole === "admin"
            ? "Enter the admin password to continue"
            : "Enter the moderator password to continue"}
        </p>
      </div>

      <RoleTabs role={loginRole} onSelect={handleRoleChange} />

      <div className="border border-border rounded-sm bg-card p-6 shadow-sm">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <PasswordInput
                      placeholder={`Enter ${loginRole} password`}
                      autoFocus
                      autoComplete="current-password"
                      data-testid="input-admin-password"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {serverError && (
              <p className="text-sm text-destructive font-medium" data-testid="login-error">
                {serverError}
              </p>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={loading}
              data-testid="button-admin-login"
            >
              {loading ? "Checking..." : `Sign in as ${loginRole === "admin" ? "Admin" : "Moderator"}`}
            </Button>
          </form>
        </Form>
      </div>

      <div className="flex justify-between items-center mt-4">
        <p className="text-xs text-muted-foreground">
          Operators don't need a password —{" "}
          <a
            href={import.meta.env.BASE_URL}
            className="underline underline-offset-2 hover:text-foreground transition-colors"
          >
            go to Work Entry
          </a>
        </p>
        {loginRole === "admin" && (
          <button
            type="button"
            onClick={onForgot}
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
          >
            Forgot password?
          </button>
        )}
      </div>
    </>
  );
}

// ── Reset password view ───────────────────────────────────────────────────────

interface ResetViewProps {
  onBack: () => void;
}

function ResetView({ onBack }: ResetViewProps) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ emailsSent: number; emailSkipped: boolean } | null>(null);
  const [loading, setLoading] = useState(false);

  const form = useForm<ResetValues>({
    resolver: zodResolver(resetSchema),
    defaultValues: { email: "", newPassword: "", confirmPassword: "" },
  });

  async function onSubmit(values: ResetValues) {
    setServerError(null);
    setLoading(true);
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: values.email, newPassword: values.newPassword }),
      });
      if (res.ok) {
        const body = await res.json().catch(() => ({})) as { emailsSent?: number; emailSkipped?: boolean };
        setSuccess({ emailsSent: body.emailsSent ?? 0, emailSkipped: body.emailSkipped ?? false });
      } else {
        const body = await res.json().catch(() => ({}));
        setServerError((body as { error?: string }).error ?? "Reset failed.");
      }
    } catch {
      setServerError("Could not reach the server. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <>
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-sm bg-green-500/10 mb-4">
            <Lock className="w-5 h-5 text-green-600" />
          </div>
          <h1 className="text-xl font-bold text-foreground">Password Changed</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Your new password is now active.
          </p>
        </div>

        {!success.emailSkipped && (
          <div className="flex items-start gap-2.5 rounded-sm border border-border bg-muted/40 px-4 py-3 mb-4 text-sm text-muted-foreground">
            <Mail className="w-4 h-4 mt-0.5 flex-shrink-0 text-primary" />
            <span>
              {success.emailsSent > 0
                ? `A notification email was sent to ${success.emailsSent} administrator${success.emailsSent > 1 ? "s" : ""}.`
                : "No admin email addresses are configured. Add emails to administrator operators to enable notifications."}
            </span>
          </div>
        )}

        <Button className="w-full" onClick={onBack}>
          Back to Login
        </Button>
      </>
    );
  }

  return (
    <>
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-sm bg-primary/10 mb-4">
          <Lock className="w-5 h-5 text-primary" />
        </div>
        <h1 className="text-xl font-bold text-foreground">Forgot Password</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Enter your administrator email and choose a new password.
        </p>
      </div>

      <div className="border border-border rounded-sm bg-card p-6 shadow-sm">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Administrator Email</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="admin@company.com"
                      autoFocus
                      autoComplete="email"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="newPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>New Password</FormLabel>
                  <FormControl>
                    <PasswordInput
                      placeholder="At least 6 characters"
                      autoComplete="new-password"
                      autoFocus
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirm New Password</FormLabel>
                  <FormControl>
                    <PasswordInput
                      placeholder="Repeat new password"
                      autoComplete="new-password"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {serverError && (
              <p className="text-sm text-destructive font-medium">{serverError}</p>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Changing password..." : "Change Password"}
            </Button>
          </form>
        </Form>
      </div>

      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mt-4 mx-auto"
      >
        <ChevronLeft className="w-3 h-3" />
        Back to Login
      </button>
    </>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

interface Props {
  onSuccess: (role: UserRole) => void;
}

export default function AdminLogin({ onSuccess }: Props) {
  const [view, setView] = useState<"login" | "reset">("login");

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        {view === "login" ? (
          <LoginView onSuccess={onSuccess} onForgot={() => setView("reset")} />
        ) : (
          <ResetView onBack={() => setView("login")} />
        )}
      </div>
    </div>
  );
}
