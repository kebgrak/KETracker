import { useState, useRef, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  ClipboardList,
  LayoutDashboard,
  Users,
  Package,
  FileText,
  CalendarDays,
  ChevronRight,
  Factory,
  Settings,
  LogOut,
  KeyRound,
  ShieldHalf,
  PanelLeftClose,
  PanelLeftOpen,
  BarChart2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import ChangePasswordDialog from "@/components/ChangePasswordDialog";
import SetModeratorPasswordDialog from "@/components/SetModeratorPasswordDialog";
import type { UserRole } from "@/hooks/useAdminAuth";

const operatorNavItems = [
  { href: "/", label: "Work Entry", icon: ClipboardList },
  { href: "/weekly-progress", label: "Weekly Progress", icon: BarChart2 },
];

const adminNavItems = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/weekly-plan", label: "Weekly Plan", icon: CalendarDays },
  { href: "/admin/reports", label: "Reports", icon: FileText },
  { href: "/admin/operators", label: "Operators", icon: Users },
  { href: "/admin/products", label: "Products", icon: Package },
];

interface NavItemProps {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
}

function NavItem({ href, label, icon: Icon, exact }: NavItemProps) {
  const [location] = useLocation();
  const isActive = exact
    ? location === href
    : location === href || (href !== "/" && location.startsWith(href));

  return (
    <Link href={href}>
      <div
        data-testid={`nav-${label.toLowerCase().replace(/\s+/g, "-")}`}
        className={cn(
          "flex items-center gap-3 px-3 py-2.5 rounded-sm text-sm font-medium cursor-pointer transition-all duration-150",
          isActive
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
        )}
      >
        <Icon className="w-4 h-4 flex-shrink-0" />
        <span>{label}</span>
        {isActive && <ChevronRight className="w-3 h-3 ml-auto opacity-60" />}
      </div>
    </Link>
  );
}

interface LayoutProps {
  children: React.ReactNode;
  onLogout: (() => void) | null;
  role: UserRole;
}

export default function Layout({ children, onLogout, role }: LayoutProps) {
  const [changePwOpen, setChangePwOpen] = useState(false);
  const [modPwOpen, setModPwOpen] = useState(false);
  const isLoggedIn = onLogout !== null;
  const isAdmin = role === "admin";
  const isModerator = role === "moderator";

  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sidebarVisible = isLoggedIn || pinned || hovered;

  const onSidebarMouseEnter = useCallback(() => {
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
    setHovered(true);
  }, []);

  const onSidebarMouseLeave = useCallback(() => {
    leaveTimer.current = setTimeout(() => setHovered(false), 200);
  }, []);

  const onEdgeMouseEnter = useCallback(() => {
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
    setHovered(true);
  }, []);

  const onEdgeMouseLeave = useCallback(() => {
    leaveTimer.current = setTimeout(() => setHovered(false), 200);
  }, []);

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Far-left hover strip — only when not logged in and sidebar is hidden */}
      {!isLoggedIn && !sidebarVisible && (
        <div
          className="absolute left-0 top-0 h-full w-3 z-50 cursor-pointer"
          onMouseEnter={onEdgeMouseEnter}
          onMouseLeave={onEdgeMouseLeave}
        />
      )}

      <aside
        onMouseEnter={!isLoggedIn ? onSidebarMouseEnter : undefined}
        onMouseLeave={!isLoggedIn ? onSidebarMouseLeave : undefined}
        className={cn(
          "flex-shrink-0 bg-sidebar flex flex-col border-r border-sidebar-border transition-all duration-200 ease-in-out overflow-hidden",
          !isLoggedIn && "absolute left-0 top-0 h-full z-40 shadow-lg",
          sidebarVisible ? "w-56" : "w-0 border-r-0"
        )}
      >
        <div className="px-4 py-5 border-b border-sidebar-border flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-sidebar-accent rounded-sm flex items-center justify-center flex-shrink-0">
              <Factory className="w-4 h-4 text-sidebar-foreground" />
            </div>
            <div>
              <div className="text-xs font-bold text-sidebar-foreground tracking-wider uppercase whitespace-nowrap">
                Production
              </div>
              <div className="text-xs text-sidebar-foreground/50 font-mono tracking-wider whitespace-nowrap">
                Tracker
              </div>
            </div>
          </div>
          {!isLoggedIn && (
            <Button
              variant="ghost"
              size="icon"
              className="w-6 h-6 text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 flex-shrink-0"
              onClick={() => setPinned(false)}
              title="Collapse sidebar"
            >
              <PanelLeftClose className="w-4 h-4" />
            </Button>
          )}
        </div>

        <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
          <div className="px-2 mb-2">
            <span className="text-xs font-semibold uppercase tracking-widest text-sidebar-foreground/40 whitespace-nowrap">
              Operator
            </span>
          </div>
          {operatorNavItems.map((item) => (
            <NavItem key={item.href} {...item} exact={item.href === "/"} />
          ))}

          <div className="px-2 mt-5 mb-2">
            <span className="text-xs font-semibold uppercase tracking-widest text-sidebar-foreground/40 whitespace-nowrap">
              {isModerator ? "Moderator" : "Admin"}
            </span>
          </div>
          {adminNavItems.map((item) => (
            <NavItem key={item.href} {...item} />
          ))}
        </nav>

        <div className="px-3 py-3 border-t border-sidebar-border space-y-1">
          {onLogout ? (
            <>
              {/* Role badge */}
              <div className="flex items-center gap-1.5 px-1 mb-1.5">
                <ShieldHalf className={cn("w-3.5 h-3.5", isAdmin ? "text-primary" : "text-amber-500")} />
                <span className={cn("text-xs font-semibold whitespace-nowrap", isAdmin ? "text-sidebar-foreground/70" : "text-amber-600")}>
                  {isAdmin ? "Admin" : "Moderator"}
                </span>
              </div>

              {/* Admin-only: change own password */}
              {isAdmin && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setChangePwOpen(true)}
                  className="w-full justify-start gap-2 text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 text-xs"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span className="whitespace-nowrap">Change Password</span>
                </Button>
              )}

              {/* Admin-only: set moderator password */}
              {isAdmin && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setModPwOpen(true)}
                  className="w-full justify-start gap-2 text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 text-xs"
                >
                  <ShieldHalf className="w-3.5 h-3.5" />
                  <span className="whitespace-nowrap">Moderator Password</span>
                </Button>
              )}

              <Button
                variant="ghost"
                size="sm"
                onClick={onLogout}
                className="w-full justify-start gap-2 text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 text-xs"
                data-testid="button-admin-logout"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="whitespace-nowrap">Sign out</span>
              </Button>
            </>
          ) : (
            <div className="flex items-center gap-2 px-1">
              <Settings className="w-3 h-3 text-sidebar-foreground/30" />
              <span className="text-xs text-sidebar-foreground/30 font-mono whitespace-nowrap">v1.0.0</span>
            </div>
          )}
        </div>

        <ChangePasswordDialog open={changePwOpen} onOpenChange={setChangePwOpen} />
        <SetModeratorPasswordDialog open={modPwOpen} onOpenChange={setModPwOpen} />
      </aside>

      {/* Main content */}
      <main className={cn("flex-1 overflow-y-auto", isLoggedIn && "ml-0")}>
        {/* Expand button — only when sidebar is hidden on operator pages */}
        {!isLoggedIn && !sidebarVisible && (
          <button
            onClick={() => setPinned(true)}
            className="fixed top-3 left-3 z-50 w-7 h-7 flex items-center justify-center rounded-sm bg-sidebar text-sidebar-foreground/60 hover:text-sidebar-foreground border border-sidebar-border shadow-sm hover:shadow-md transition-all"
            title="Show sidebar"
          >
            <PanelLeftOpen className="w-4 h-4" />
          </button>
        )}
        {children}
      </main>
    </div>
  );
}
