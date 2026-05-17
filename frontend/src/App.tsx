import { Switch, Route, Router as WouterRouter } from "wouter";
import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "./contexts/AuthContext";
import { ThemeUIProvider } from "./contexts/ThemeUIContext";
import { AppLayout } from "./components/layout/AppLayout";
import { DebugLogs } from "./components/debug-logs";
import NotFound from "@/pages/not-found";
import { installGlobalClickSound } from "@/lib/sound-effects";
import { getApiErrorMessage } from "@/lib/error-utils";
import { installInlineValidation, showInlineValidationErrors } from "@/lib/inline-validation";
import { toast } from "@/hooks/use-toast";
import { useEffect } from "react";

import Login from "./pages/login";
import Dashboard from "./pages/dashboard";
import Profile from "./pages/profile";
import ChangePassword from "./pages/change-password";
import Employees from "./pages/employees";
import EmployeeDetail from "./pages/employee-detail";
import Attendance from "./pages/attendance";
import Payroll from "./pages/payroll";
import Overtime from "./pages/overtime";
import AdvancePayments from "./pages/advance-payments";
import Leaves from "./pages/leaves";
import Customers from "./pages/customers";
import Vendors from "./pages/vendors";
import Projects from "./pages/projects";
import PurchaseOrders from "./pages/purchase-orders";
import Inventory from "./pages/inventory";
import InventoryMovements from "./pages/inventory-movements";
import Expenses from "./pages/expenses";
import Revenue from "./pages/revenue";
import Invoices from "./pages/invoices";
import Documents from "./pages/documents";
import AuditLogs from "./pages/audit-logs";
import Notifications from "./pages/notifications";
import WorkAllocation from "./pages/work-allocation";
import Roles from "./pages/roles";
import Settings from "./pages/settings";
import Reminders, { ReminderModal } from "./pages/reminders";
import Reports from "./pages/reports";
import ImportPage from "./pages/import"; 
import Ledger from "./pages/ledger";

const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onError: (error) => {
      showInlineValidationErrors(error);
      toast({
        title: "Action failed",
        description: getApiErrorMessage(error, "Please check the highlighted fields and try again."),
        variant: "destructive",
      });
    },
  }),
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

function ProtectedRoute({ component: Component, ...rest }: any) {
  return (
    <Route {...rest}>
      {(params) => (
        <AppLayout>
          <Component params={params} />
        </AppLayout>
      )}
    </Route>
  );
}

function AppRoutes() {
  return (
    <>
      <Switch>
        <Route path="/login" component={Login} />
        <ProtectedRoute path="/" component={Dashboard} />
        <ProtectedRoute path="/dashboard" component={Dashboard} />
        <ProtectedRoute path="/profile" component={Profile} />
        <ProtectedRoute path="/change-password" component={ChangePassword} />
        <ProtectedRoute path="/employees/:id" component={EmployeeDetail} />
        <ProtectedRoute path="/employees" component={Employees} />
        <ProtectedRoute path="/attendance" component={Attendance} />
        <ProtectedRoute path="/payroll" component={Payroll} />
        <ProtectedRoute path="/overtime" component={Overtime} />
        <ProtectedRoute path="/advance-payments" component={AdvancePayments} />
        <ProtectedRoute path="/leaves" component={Leaves} />
        <ProtectedRoute path="/customers" component={Customers} />
        <ProtectedRoute path="/vendors" component={Vendors} />
        <ProtectedRoute path="/projects" component={Projects} />
        <ProtectedRoute path="/purchase-orders" component={PurchaseOrders} />
        <ProtectedRoute path="/inventory" component={Inventory} />
        <ProtectedRoute path="/inventory-movements" component={InventoryMovements} />
        <ProtectedRoute path="/expenses" component={Expenses} />
        <ProtectedRoute path="/revenue" component={Revenue} />
        <ProtectedRoute path="/invoices" component={Invoices} />
        <ProtectedRoute path="/documents" component={Documents} />
        <ProtectedRoute path="/work-allocation" component={WorkAllocation} />
        <ProtectedRoute path="/audit-logs" component={AuditLogs} />
        <ProtectedRoute path="/notifications" component={Notifications} />
        <ProtectedRoute path="/roles" component={Roles} />
        <ProtectedRoute path="/settings" component={Settings} />
        <ProtectedRoute path="/reminders" component={Reminders} />
        <ProtectedRoute path="/reports" component={Reports} />
        <ProtectedRoute path="/import" component={ImportPage} />
        <ProtectedRoute path="/ledger" component={Ledger} />
        <Route component={NotFound} />
      </Switch>
      <ReminderModal />
    </>
  );
}

function App() {
  useEffect(() => {
    installGlobalClickSound();
    installInlineValidation();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <ThemeUIProvider>
            <AuthProvider>
              <AppRoutes />
              <DebugLogs />
            </AuthProvider>
          </ThemeUIProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
