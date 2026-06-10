import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Layout from "@/components/Layout";
import OperatorEntry from "@/pages/OperatorEntry";
import Reports from "@/pages/Reports";
import AdminDashboard from "@/pages/admin/Dashboard";
import AdminOperators from "@/pages/admin/Operators";
import AdminProducts from "@/pages/admin/Products";
import AdminProductDetail from "@/pages/admin/ProductDetail";
import AdminWeeklyPlan from "@/pages/admin/WeeklyPlan";
import WeeklyProgress from "@/pages/WeeklyProgress";
import AdminLogin from "@/pages/AdminLogin";
import NotFound from "@/pages/not-found";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { RoleContext } from "@/context/RoleContext";
import { Skeleton } from "@/components/ui/skeleton";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

function AdminGuard({ children }: { children: React.ReactNode }) {
  const { authState, role, onLoginSuccess, logout } = useAdminAuth();

  if (authState === "loading") {
    return (
      <Layout onLogout={null} role={null}>
        <div className="p-8 space-y-3">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-32 w-full mt-4" />
        </div>
      </Layout>
    );
  }

  if (authState === "unauthenticated") {
    return <AdminLogin onSuccess={onLoginSuccess} />;
  }

  return (
    <RoleContext.Provider value={role}>
      <Layout onLogout={logout} role={role}>{children}</Layout>
    </RoleContext.Provider>
  );
}

function Router() {
  return (
    <Switch>
      {/* Operator routes — no auth required */}
      <Route path="/">
        <Layout onLogout={null} role={null}>
          <OperatorEntry />
        </Layout>
      </Route>
      <Route path="/weekly-progress">
        <Layout onLogout={null} role={null}>
          <WeeklyProgress />
        </Layout>
      </Route>

      {/* Admin/Moderator routes — protected */}
      <Route path="/admin">
        <AdminGuard>
          <AdminDashboard />
        </AdminGuard>
      </Route>
      <Route path="/admin/reports">
        <AdminGuard>
          <Reports />
        </AdminGuard>
      </Route>
      <Route path="/admin/operators">
        <AdminGuard>
          <AdminOperators />
        </AdminGuard>
      </Route>
      <Route path="/admin/products">
        <AdminGuard>
          <AdminProducts />
        </AdminGuard>
      </Route>
      <Route path="/admin/products/:id">
        <AdminGuard>
          <AdminProductDetail />
        </AdminGuard>
      </Route>
      <Route path="/admin/weekly-plan">
        <AdminGuard>
          <AdminWeeklyPlan />
        </AdminGuard>
      </Route>

      <Route>
        <Layout onLogout={null} role={null}>
          <NotFound />
        </Layout>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
