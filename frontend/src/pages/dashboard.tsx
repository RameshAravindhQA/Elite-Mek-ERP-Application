import { useGetDashboardSummary, useGetMonthlyFinancials, useGetRecentActivity, useGetExpenseStats } from "@workspace/api-client-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricCard } from "@/components/MetricCard";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Briefcase, TrendingUp, TrendingDown, Receipt, CalendarOff, AlertTriangle, ShoppingCart, Loader2, Package, FileText, ArrowUpRight, ArrowDownRight } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, PieChart, Pie, Cell, Sector
} from "recharts";
import { format } from "date-fns";
import { useState } from "react";

const COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#14B8A6", "#F97316"];

const DASHBOARD_MODULES = [
  { value: "all", label: "All Modules" },
  { value: "hr", label: "HR & Payroll" },
  { value: "sales", label: "Sales & Clients" },
  { value: "procurement", label: "Procurement" },
  { value: "operations", label: "Operations" },
  { value: "finance", label: "Finance" },
];

const renderActiveShape = (props: any) => {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, payload, percent, value } = props;
  return (
    <g>
      <text x={cx} y={cy - 8} textAnchor="middle" fill="hsl(var(--foreground))" className="text-sm font-semibold" fontSize={13}>
        {payload.category}
      </text>
      <text x={cx} y={cy + 12} textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize={11}>
        {`${(percent * 100).toFixed(1)}%`}
      </text>
      <Sector cx={cx} cy={cy} innerRadius={innerRadius} outerRadius={outerRadius + 8} startAngle={startAngle} endAngle={endAngle} fill={fill} />
      <Sector cx={cx} cy={cy} innerRadius={outerRadius + 12} outerRadius={outerRadius + 16} startAngle={startAngle} endAngle={endAngle} fill={fill} />
    </g>
  );
};

export default function Dashboard() {
  const { data: summary, isLoading: loadingSummary } = useGetDashboardSummary();
  const [moduleFilter, setModuleFilter] = useState("all");
  const [dashboardTab, setDashboardTab] = useState("overview");
  const [months, setMonths] = useState("12");
  const [focusMonth, setFocusMonth] = useState("");
  const { data: financials, isLoading: loadingFinancials } = useGetMonthlyFinancials({ months: Number(months) });
  const { data: activity, isLoading: loadingActivity } = useGetRecentActivity();
  const { data: expenseStats } = useGetExpenseStats();
  const [activePieIndex, setActivePieIndex] = useState(0);

  if (loadingSummary || loadingFinancials || loadingActivity) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const currentMonth = financials?.data?.[financials.data.length - 1];
  const previousMonth = financials?.data?.[financials.data.length - 2];
  const revenueChange = currentMonth && previousMonth ? (((currentMonth.revenue - previousMonth.revenue) / previousMonth.revenue) * 100).toFixed(1) : 0;
  const expenseChange = currentMonth && previousMonth ? (((currentMonth.expenses - previousMonth.expenses) / previousMonth.expenses) * 100).toFixed(1) : 0;

  if (loadingSummary || loadingFinancials || loadingActivity) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const kpis = [
    { title: "Total Employees", value: summary?.totalEmployees || 0, icon: Users, bg: "bg-blue-600" },
    { title: "Active Projects", value: summary?.activeProjects || 0, icon: Briefcase, bg: "bg-violet-600" },
    { title: "Monthly Revenue", value: `₹${(summary?.monthlyRevenue || 0).toLocaleString('en-IN')}`, icon: TrendingUp, bg: "bg-emerald-600" },
    { title: "Monthly Expenses", value: `₹${(summary?.monthlyExpenses || 0).toLocaleString('en-IN')}`, icon: TrendingDown, bg: "bg-rose-600" },
    { title: "Pending Invoices", value: summary?.pendingInvoices || 0, icon: Receipt, bg: "bg-amber-500" },
    { title: "Pending Leaves", value: summary?.pendingLeaves || 0, icon: CalendarOff, bg: "bg-orange-600" },
    { title: "Low Stock Items", value: summary?.lowStockItems || 0, icon: AlertTriangle, bg: "bg-red-600" },
    { title: "Open POs", value: summary?.openPurchaseOrders || 0, icon: ShoppingCart, bg: "bg-cyan-600" },
  ];
  const getKpiModule = (title: string) => {
    if (["Total Employees", "Pending Leaves"].includes(title)) return "hr";
    if (["Pending Invoices"].includes(title)) return "sales";
    if (["Open POs"].includes(title)) return "procurement";
    if (["Active Projects", "Low Stock Items"].includes(title)) return "operations";
    return "finance";
  };
  const visibleKpis = moduleFilter === "all" ? kpis : kpis.filter(kpi => getKpiModule(kpi.title) === moduleFilter);

  const pieData = (expenseStats?.byCategory || []).filter((c: any) => c.amount > 0).map((c: any) => ({
    category: c.category || "Other",
    value: Number(c.amount)
  }));

  const monthlyData = (financials?.data || []).filter((m: any) => !focusMonth || String(m.month || "").toLowerCase().includes(focusMonth.toLowerCase()));
  const barData = monthlyData.slice(-6).map((m: any) => ({
    month: m.month,
    Revenue: m.revenue,
    Expenses: m.expenses,
    Profit: m.profit
  }));
  const hrData = [
    { name: "Employees", value: Number(summary?.totalEmployees || 0), fill: "#3B82F6" },
    { name: "Pending Leaves", value: Number(summary?.pendingLeaves || 0), fill: "#F59E0B" },
  ].filter(item => item.value > 0);
  const salesProcurementData = [
    { name: "Pending Invoices", value: Number(summary?.pendingInvoices || 0), fill: "#10B981" },
    { name: "Open POs", value: Number(summary?.openPurchaseOrders || 0), fill: "#8B5CF6" },
  ];
  const operationsRiskData = [
    { name: "Active Projects", value: Number(summary?.activeProjects || 0), fill: "#0EA5E9" },
    { name: "Low Stock", value: Number(summary?.lowStockItems || 0), fill: "#EF4444" },
  ];
  const showFinance = moduleFilter === "all" || moduleFilter === "finance";
  const showHr = moduleFilter === "all" || moduleFilter === "hr";
  const showSalesProcurement = moduleFilter === "all" || moduleFilter === "sales" || moduleFilter === "procurement";
  const showOperations = moduleFilter === "all" || moduleFilter === "operations";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Advanced module dashboard with filters, KPIs, charts, and operational signals"
      />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Dashboard Filters</CardTitle>
          <CardDescription>Focus the dashboard by module and financial period.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className="mb-2 block text-sm font-medium">Module</label>
            <Select value={moduleFilter} onValueChange={setModuleFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent searchable>
                {DASHBOARD_MODULES.map(module => <SelectItem key={module.value} value={module.value}>{module.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">Financial Range</label>
            <Select value={months} onValueChange={setMonths}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent searchable>
                <SelectItem value="3">Last 3 months</SelectItem>
                <SelectItem value="6">Last 6 months</SelectItem>
                <SelectItem value="12">Last 12 months</SelectItem>
                <SelectItem value="24">Last 24 months</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">Month Search</label>
            <Input value={focusMonth} onChange={event => setFocusMonth(event.target.value)} placeholder="Example: Jan 2026" />
          </div>
        </CardContent>
      </Card>

      <Tabs value={dashboardTab} onValueChange={setDashboardTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 rounded-full bg-muted/50 p-1 mb-4">
          <TabsTrigger value="overview" className="rounded-full">Overview</TabsTrigger>
          <TabsTrigger value="finance" className="rounded-full">Finance</TabsTrigger>
          <TabsTrigger value="operations" className="rounded-full">Operations</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {visibleKpis.map((kpi) => (
              <MetricCard key={kpi.title} label={kpi.title} value={kpi.value} icon={kpi.icon} bg={kpi.bg} onClick={() => setModuleFilter(getKpiModule(kpi.title))} />
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2 bg-gradient-to-br from-card to-card/80 shadow-md border-primary/10">
              <CardHeader className="pb-4">
                <CardTitle className="text-xl">Financial Overview</CardTitle>
                <CardDescription>Monthly revenue vs expenses (last 12 months)</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[320px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={monthlyData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                      <YAxis tickFormatter={(val) => `₹${val >= 100000 ? `${(val/100000).toFixed(0)}L` : `${(val/1000).toFixed(0)}k`}`} stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                      <Tooltip
                        contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                        formatter={(val: number) => [`₹${val.toLocaleString('en-IN')}`, undefined]}
                      />
                      <Legend />
                      <Line type="monotone" name="Revenue" dataKey="revenue" stroke="#10B981" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                      <Line type="monotone" name="Expenses" dataKey="expenses" stroke="#EF4444" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                      <Line type="monotone" name="Profit" dataKey="profit" stroke="#3B82F6" strokeWidth={2} dot={{ r: 3 }} strokeDasharray="4 4" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-card to-card/80 shadow-md border-primary/10">
              <CardHeader className="pb-4">
                <CardTitle className="text-xl">Recent Activity</CardTitle>
                <CardDescription>Latest actions across the system</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 max-h-[300px] overflow-y-auto">
                  {activity?.data?.map((item: any) => (
                    <div key={item.id} className="flex gap-3">
                      <div className="w-2 h-2 mt-2 rounded-full bg-primary shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-foreground leading-tight">{item.description}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-xs text-muted-foreground">{item.user}</span>
                          <span className="text-xs text-muted-foreground">&bull;</span>
                          <span className="text-xs text-muted-foreground">{format(new Date(item.createdAt), 'MMM d, h:mm a')}</span>
                        </div>
                        <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground uppercase mt-0.5 inline-block">{item.module}</span>
                      </div>
                    </div>
                  ))}
                  {(!activity?.data || activity.data.length === 0) && (
                    <div className="text-center text-muted-foreground py-8 text-sm">No recent activity</div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {showHr && <Card className="bg-gradient-to-br from-blue-50 to-blue-50/50 dark:from-blue-950/20 dark:to-blue-950/10 shadow-md border-blue-200/50 dark:border-blue-800/50">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-lg"><Users className="h-5 w-5 text-blue-600" /> HR Snapshot</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[220px]">
                  {hrData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={hrData} cx="50%" cy="50%" innerRadius={52} outerRadius={82} dataKey="value" label>
                          {hrData.map((entry, index) => <Cell key={entry.name} fill={entry.fill || COLORS[index % COLORS.length]} />)}
                        </Pie>
                        <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No HR data yet</div>
                  )}
                </div>
              </CardContent>
            </Card>}

            {showSalesProcurement && <Card className="bg-gradient-to-br from-emerald-50 to-emerald-50/50 dark:from-emerald-950/20 dark:to-emerald-950/10 shadow-md border-emerald-200/50 dark:border-emerald-800/50">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-lg"><FileText className="h-5 w-5 text-emerald-600" /> Sales & Procurement</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={salesProcurementData} layout="vertical" margin={{ top: 8, right: 24, bottom: 8, left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                      <XAxis type="number" allowDecimals={false} stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                      <YAxis type="category" dataKey="name" width={112} stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }} />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                        {salesProcurementData.map(entry => <Cell key={entry.name} fill={entry.fill} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>}

            {showOperations && <Card className="bg-gradient-to-br from-rose-50 to-rose-50/50 dark:from-rose-950/20 dark:to-rose-950/10 shadow-md border-rose-200/50 dark:border-rose-800/50">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-lg"><Package className="h-5 w-5 text-rose-600" /> Operations Risk</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={operationsRiskData} margin={{ top: 8, right: 20, bottom: 8, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                      <YAxis allowDecimals={false} stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }} />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                        {operationsRiskData.map(entry => <Cell key={entry.name} fill={entry.fill} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>}
          </div>
        </TabsContent>

        <TabsContent value="finance" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-gradient-to-br from-emerald-50 to-emerald-50/50 dark:from-emerald-950/20 dark:to-emerald-950/10 border-emerald-200/50 dark:border-emerald-800/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Total Revenue</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-3xl font-bold">₹{(currentMonth?.revenue || 0).toLocaleString('en-IN')}</p>
                    <div className="flex items-center gap-1 mt-2">
                      {Number(revenueChange) >= 0 ? (
                        <ArrowUpRight className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <ArrowDownRight className="w-4 h-4 text-red-600" />
                      )}
                      <span className={Number(revenueChange) >= 0 ? "text-sm text-emerald-600" : "text-sm text-red-600"}>{Math.abs(Number(revenueChange))}% vs last month</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-rose-50 to-rose-50/50 dark:from-rose-950/20 dark:to-rose-950/10 border-rose-200/50 dark:border-rose-800/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Total Expenses</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-3xl font-bold">₹{(currentMonth?.expenses || 0).toLocaleString('en-IN')}</p>
                    <div className="flex items-center gap-1 mt-2">
                      {Number(expenseChange) <= 0 ? (
                        <ArrowDownRight className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <ArrowUpRight className="w-4 h-4 text-red-600" />
                      )}
                      <span className={Number(expenseChange) <= 0 ? "text-sm text-emerald-600" : "text-sm text-red-600"}>{Math.abs(Number(expenseChange))}% vs last month</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-blue-50 to-blue-50/50 dark:from-blue-950/20 dark:to-blue-950/10 border-blue-200/50 dark:border-blue-800/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Net Profit</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-3xl font-bold">₹{(currentMonth?.profit || 0).toLocaleString('en-IN')}</p>
                    <p className="text-sm text-muted-foreground mt-2">{((currentMonth?.profit || 0) / (currentMonth?.revenue || 1) * 100).toFixed(1)}% margin</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-white dark:bg-slate-900 shadow-md border-primary/10">
            <CardHeader className="pb-4">
              <CardTitle className="text-2xl">Financial Trend Analysis</CardTitle>
              <CardDescription>Revenue, Expenses & Profit Trajectory</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={monthlyData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis tickFormatter={(val) => `₹${val >= 100000 ? `${(val/100000).toFixed(0)}L` : `${(val/1000).toFixed(0)}k`}`} stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                      formatter={(val: number) => [`₹${val.toLocaleString('en-IN')}`, undefined]}
                    />
                    <Legend />
                    <Line type="monotone" name="Revenue" dataKey="revenue" stroke="#10B981" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                    <Line type="monotone" name="Expenses" dataKey="expenses" stroke="#EF4444" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                    <Line type="monotone" name="Profit" dataKey="profit" stroke="#3B82F6" strokeWidth={2.5} dot={{ r: 4 }} strokeDasharray="5 5" activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="bg-white dark:bg-slate-900 shadow-md border-primary/10">
              <CardHeader className="pb-4">
                <CardTitle className="text-xl">Monthly Performance</CardTitle>
                <CardDescription>Revenue vs Expenses Comparison</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                      <YAxis tickFormatter={(val) => `₹${val >= 100000 ? `${(val/100000).toFixed(0)}L` : `${(val/1000).toFixed(0)}k`}`} stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                      <Tooltip
                        contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                        formatter={(val: number) => [`₹${val.toLocaleString('en-IN')}`, undefined]}
                      />
                      <Legend />
                      <Bar dataKey="Revenue" fill="#10B981" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Expenses" fill="#EF4444" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white dark:bg-slate-900 shadow-md border-primary/10">
              <CardHeader className="pb-4">
                <CardTitle className="text-xl">Expense Breakdown</CardTitle>
                <CardDescription>Expenses by category (this year)</CardDescription>
              </CardHeader>
              <CardContent>
                {pieData.length > 0 ? (
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          activeIndex={activePieIndex}
                          activeShape={renderActiveShape}
                          data={pieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={90}
                          dataKey="value"
                          onMouseEnter={(_, index) => setActivePieIndex(index)}
                        >
                          {pieData.map((_: any, index: number) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                          formatter={(val: number) => [`₹${val.toLocaleString('en-IN')}`, "Amount"]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-[300px] flex flex-col items-center justify-center gap-4">
                    <div className="grid grid-cols-2 gap-3 w-full">
                      {["Travel", "Office Supplies", "Utilities", "Marketing"].map((cat, i) => (
                        <div key={cat} className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i] }} />
                          <span className="text-xs text-muted-foreground">{cat}</span>
                        </div>
                      ))}
                    </div>
                    <p className="text-sm text-muted-foreground">No expense data yet</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="operations" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="bg-gradient-to-br from-blue-50 to-blue-50/50 dark:from-blue-950/20 dark:to-blue-950/10 border-blue-200/50 dark:border-blue-800/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Active Projects</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{summary?.activeProjects || 0}</p>
                <p className="text-xs text-muted-foreground mt-2">Projects in progress</p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-red-50 to-red-50/50 dark:from-red-950/20 dark:to-red-950/10 border-red-200/50 dark:border-red-800/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Low Stock Items</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{summary?.lowStockItems || 0}</p>
                <p className="text-xs text-muted-foreground mt-2">Require attention</p>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-white dark:bg-slate-900 shadow-md border-primary/10">
            <CardHeader className="pb-4">
              <CardTitle className="text-2xl">Operations Overview</CardTitle>
              <CardDescription>Project workload and inventory status</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[350px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={operationsRiskData} margin={{ top: 20, right: 30, bottom: 20, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis allowDecimals={false} stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }} />
                    <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                      {operationsRiskData.map(entry => <Cell key={entry.name} fill={entry.fill} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="bg-white dark:bg-slate-900 shadow-md border-primary/10">
              <CardHeader className="pb-4">
                <CardTitle className="text-xl">HR Operations</CardTitle>
                <CardDescription>Employees and leave management</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[250px]">
                  {hrData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={hrData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" label>
                          {hrData.map((entry, index) => <Cell key={entry.name} fill={entry.fill || COLORS[index % COLORS.length]} />)}
                        </Pie>
                        <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No HR data yet</div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white dark:bg-slate-900 shadow-md border-primary/10">
              <CardHeader className="pb-4">
                <CardTitle className="text-xl">Procurement Status</CardTitle>
                <CardDescription>Invoices and purchase orders</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={salesProcurementData} layout="vertical" margin={{ top: 8, right: 24, bottom: 8, left: 100 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                      <XAxis type="number" allowDecimals={false} stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                      <YAxis type="category" dataKey="name" width={96} stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }} />
                      <Bar dataKey="value" radius={[0, 8, 8, 0]}>
                        {salesProcurementData.map(entry => <Cell key={entry.name} fill={entry.fill} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
