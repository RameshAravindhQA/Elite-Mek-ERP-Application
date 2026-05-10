import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useListReminders, getListRemindersQueryKey } from "@workspace/api-client-react";
import {
  LayoutDashboard, Users, CalendarCheck, CreditCard, CalendarOff, Building2, Truck,
  Briefcase, ShoppingCart, Package, ArrowRightLeft, Receipt, TrendingUp, FileText,
  Files, Bell, ShieldCheck, Settings, Clock, UserCircle, LogOut, Menu,
  KeyRound, BarChart3, ChevronDown, ChevronRight, GitFork, BookOpen, Sparkles, Timer, HandCoins
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const NAV_GROUPS = [
  {
    label: "Overview",
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard },
      { href: "/reports", label: "Reports", icon: BarChart3 },
    ]
  },
  {
    label: "HR & Payroll",
    items: [
      { href: "/employees", label: "Employees", icon: Users },
      { href: "/attendance", label: "Attendance", icon: CalendarCheck },
      { href: "/payroll", label: "Payroll", icon: CreditCard },
      { href: "/overtime", label: "Overtime", icon: Timer },
      { href: "/advance-payments", label: "Advances", icon: HandCoins },
      { href: "/leaves", label: "Leaves", icon: CalendarOff },
      { href: "/work-allocation", label: "Work Allocation", icon: GitFork },
    ]
  },
  {
    label: "Sales & Clients",
    items: [
      { href: "/customers", label: "Customers", icon: Building2 },
      { href: "/invoices", label: "Invoices", icon: FileText },
      { href: "/revenue", label: "Revenue", icon: TrendingUp },
      { href: "/ledger", label: "Ledger", icon: BookOpen },
    ]
  },
  {
    label: "Procurement",
    items: [
      { href: "/vendors", label: "Vendors", icon: Truck },
      { href: "/purchase-orders", label: "Purchase Orders", icon: ShoppingCart },
    ]
  },
  {
    label: "Operations",
    items: [
      { href: "/projects", label: "Projects", icon: Briefcase },
      { href: "/inventory", label: "Inventory", icon: Package },
      { href: "/inventory-movements", label: "Movements", icon: ArrowRightLeft },
      { href: "/expenses", label: "Expenses", icon: Receipt },
    ]
  },
  {
    label: "Admin",
    items: [
      { href: "/documents", label: "Documents", icon: Files },
      { href: "/notifications", label: "Notifications", icon: Bell },
      { href: "/roles", label: "Roles", icon: ShieldCheck },
      { href: "/reminders", label: "Reminders", icon: Clock },
      { href: "/settings", label: "Settings", icon: Settings },
    ]
  },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, logout, isLoading } = useAuth();
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const [showRemindersModal, setShowRemindersModal] = useState(true);
  const [showWelcomeDialog, setShowWelcomeDialog] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const { data: remindersData } = useListReminders({ page: 1, limit: 10 }, {
    query: { enabled: !!user, queryKey: getListRemindersQueryKey({ page: 1, limit: 10 }) }
  });

  const dueReminders = (remindersData?.data || []).filter((r: any) => {
    if (!r.remindAt) return false;
    const remindDate = new Date(r.remindAt);
    const today = new Date();
    return remindDate.getDate() === today.getDate() && remindDate.getMonth() === today.getMonth();
  });

  const todayKey = new Date().toISOString().slice(0, 10);
  const userStorageId = user?.id || user?.email || user?.name || "guest";
  const welcomeStorageKey = user ? `welcome-shown-${userStorageId}-${todayKey}` : "";
  const loginTime = useMemo(() => new Date(), [userStorageId]);
  const greeting = (() => {
    const hour = loginTime.getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  })();

  useEffect(() => {
    if (!user || !welcomeStorageKey) return;
    if (sessionStorage.getItem("show-welcome-after-login") === "true") {
      sessionStorage.removeItem("show-welcome-after-login");
      sessionStorage.setItem(welcomeStorageKey, "1");
      const timer = window.setTimeout(() => setShowWelcomeDialog(true), 180);
      return () => window.clearTimeout(timer);
    }
    if (sessionStorage.getItem(welcomeStorageKey)) return;
    const timer = window.setTimeout(() => {
      setShowWelcomeDialog(true);
    }, 280);
    sessionStorage.setItem(welcomeStorageKey, "1");
    return () => window.clearTimeout(timer);
  }, [user, welcomeStorageKey]);

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" /></div>;
  }

  const brandName = "Elite Mek";
  const brandSubName = "Excellence in Engineering Since 2020";
  const brandInitials = "EM";

  const toggleGroup = (label: string) => {
    setCollapsedGroups(prev => ({ ...prev, [label]: !prev[label] }));
  };

  const NavLinks = ({ onNavigate }: { onNavigate?: () => void }) => (
    <nav className="p-3 space-y-1">
      {NAV_GROUPS.map((group) => {
        const isCollapsed = collapsedGroups[group.label];
        const hasActive = group.items.some(item => location === item.href || (item.href !== "/" && location.startsWith(item.href)));
        return (
          <div key={group.label} className="mb-1">
            <button
              onClick={() => toggleGroup(group.label)}
              className={cn(
                "w-full flex items-center justify-between px-2 py-1.5 text-xs font-semibold uppercase tracking-wider rounded-md transition-colors",
                hasActive ? "text-sidebar-foreground bg-sidebar-accent/10" : "text-sidebar-foreground/50 hover:text-sidebar-foreground/80"
              )}
            >
              {group.label}
              {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
            </button>
            {!isCollapsed && (
              <div className="mt-0.5 space-y-0.5">
                {group.items.map((item) => {
                  const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
                  const Icon = item.icon;
                  return (
                    <Link key={item.href} href={item.href}>
                      <div
                        onClick={onNavigate}
                        className={cn(
                          "flex items-center gap-2.5 px-3 py-2 rounded-md transition-all cursor-pointer text-sm font-medium",
                          isActive
                            ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                            : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                        )}
                      >
                        <Icon size={16} />
                        {item.label}
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {dueReminders.length > 0 && (
        <Dialog open={showRemindersModal} onOpenChange={setShowRemindersModal}>
          <DialogContent>
            <DialogHeader><DialogTitle>Reminders Due Today</DialogTitle></DialogHeader>
            <div className="space-y-3 mt-2">
              {dueReminders.map((reminder: any) => (
                <div key={reminder.id} className="p-3 border rounded-lg bg-muted/50">
                  <h4 className="font-semibold text-sm">{reminder.title}</h4>
                  <p className="text-xs text-muted-foreground mt-1">{reminder.message}</p>
                </div>
              ))}
            </div>
            <Button className="mt-2 w-full" onClick={() => setShowRemindersModal(false)}>Dismiss</Button>
          </DialogContent>
        </Dialog>
      )}

      <AlertDialog open={showLogoutDialog} onOpenChange={setShowLogoutDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Logout</AlertDialogTitle>
            <AlertDialogDescription>You will be returned to the login screen.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => logout()}>Logout</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showWelcomeDialog} onOpenChange={setShowWelcomeDialog}>
        <DialogContent className="max-w-lg overflow-hidden border border-border bg-card p-0 shadow-2xl">
          <div className="relative">
            <div className="absolute inset-0 bg-[linear-gradient(135deg,hsl(var(--card)),hsl(var(--muted))_62%,hsl(var(--primary)/0.12))]" />
            <div className="relative p-6 text-card-foreground">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-card-foreground">
                  <Sparkles className="h-4 w-4 text-primary" />
                  {greeting}, {user?.name || "User"}
                </DialogTitle>
            </DialogHeader>
            <div className="mt-5 space-y-4 text-sm">
            <div className="rounded-lg border border-border bg-muted/60 p-4 shadow-sm">
              <p className="font-semibold text-card-foreground">Welcome to Elite Mek</p>
              <p className="mt-1 text-muted-foreground">Excellence in Engineering Since 2020.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-border bg-card p-3">
                <span className="block text-xs text-muted-foreground">User</span>
                <span className="font-medium text-card-foreground">{user?.name || "-"}</span>
              </div>
              <div className="rounded-lg border border-border bg-card p-3">
                <span className="block text-xs text-muted-foreground">Role</span>
                <span className="font-medium text-card-foreground">{user?.role || "-"}</span>
              </div>
              <div className="col-span-2 rounded-lg border border-border bg-card p-3">
                <span className="block text-xs text-muted-foreground">Login Time</span>
                <span className="font-medium text-card-foreground">{loginTime.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span>
              </div>
            </div>
            <p className="rounded-lg border border-border bg-card/95 p-4 text-card-foreground shadow-sm">
              Thought for the day: steady progress, clean records, and timely decisions create excellent outcomes.
            </p>
          </div>
          <Button onClick={() => setShowWelcomeDialog(false)} className="mt-5 bg-primary text-primary-foreground hover:bg-primary/90">Start Work</Button>
          </div>
          </div>
        </DialogContent>
      </Dialog>

      <aside className="hidden h-screen md:flex w-64 flex-col bg-sidebar border-r border-sidebar-border shrink-0 shadow-sm">
        <div className="p-6 border-b border-sidebar-border/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-white font-bold text-lg shadow-lg" style={{ backgroundImage: "linear-gradient(135deg, rgba(59,130,246,0.95), rgba(14,165,233,0.82), rgba(16,185,129,0.74))" }}>
              {brandInitials}
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-bold tracking-tight text-sidebar-foreground leading-tight">{brandName}</h1>
              <p className="max-w-[10rem] truncate text-[10px] leading-tight text-sidebar-foreground/60">{brandSubName}</p>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <NavLinks />
        </div>
        <div className="p-4 border-t border-sidebar-border/50 bg-sidebar/95">
          <div className="flex items-center gap-3 px-2 mb-3">
            <div className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm shrink-0 shadow-lg">
              {user?.name?.charAt(0)?.toUpperCase() || "U"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold truncate text-sidebar-foreground">{user?.name}</p>
              <p className="text-[10px] text-sidebar-foreground/60 truncate">{user?.role}</p>
            </div>
          </div>
          <div className="flex gap-1 px-2 mb-2">
            <Link href="/profile">
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"><UserCircle size={13} className="mr-1" />Profile</Button>
            </Link>
            <Link href="/change-password">
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"><KeyRound size={13} className="mr-1" />Password</Button>
            </Link>
          </div>
          <Button variant="ghost" size="sm" className="w-full justify-start text-sidebar-foreground/70 hover:text-red-400 hover:bg-red-500/10 h-8 px-2" onClick={() => setShowLogoutDialog(true)}>
            <LogOut size={14} className="mr-2" />Logout
          </Button>
        </div>
      </aside>

      <main className="flex-1 flex h-screen flex-col min-w-0 overflow-hidden">
        <header className="h-16 flex items-center justify-between px-6 border-b bg-card border-border shrink-0 shadow-sm">
          <div className="flex items-center gap-4">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden h-9 w-9">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 p-0 bg-sidebar border-sidebar-border">
                <div className="p-6 border-b border-sidebar-border/50">
                  <h1 className="text-sm font-bold text-sidebar-foreground">{brandName}</h1>
                  <p className="mt-1 text-[10px] leading-tight text-sidebar-foreground/60">{brandSubName}</p>
                </div>
                <div className="overflow-y-auto h-[calc(100vh-80px)] custom-scrollbar">
                  <NavLinks onNavigate={() => setMobileOpen(false)} />
                </div>
              </SheetContent>
            </Sheet>
            <span className="md:hidden font-semibold text-sm">{brandName}</span>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/notifications">
              <Button variant="ghost" size="icon" className="relative h-9 w-9">
                <Bell className="h-4 w-4" />
                <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-destructive rounded-full" />
              </Button>
            </Link>
            <Link href="/profile">
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <UserCircle className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </header>

        <div
          key={location}
          className="flex-1 min-h-0 overflow-x-auto overflow-y-auto p-4 md:p-6 page-transition min-w-0 custom-scrollbar"
        >
          {children}
        </div>
      </main>
    </div>
  );
}
