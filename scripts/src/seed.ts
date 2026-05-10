import { db, employeesTable, attendanceCategoriesTable, attendanceTable, payrollTable, leavesTable, customersTable, vendorsTable, projectsTable, projectTasksTable, purchaseOrdersTable, inventoryTable, inventoryMovementsTable, expensesTable, expenseCategoriesTable, revenueTable, invoicesTable, settingsTable, rolesTable, usersTable, ledgerTable, ledgerTransactionTable } from "@workspace/db";
import { sql, eq } from "drizzle-orm";
import crypto from "crypto";

const EMPLOYEE_IMAGES = [
  "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&crop=face",
  "https://images.unsplash.com/photo-1494790108755-2616b4e07e15?w=150&h=150&fit=crop&crop=face",
  "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&h=150&fit=crop&crop=face",
  "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&h=150&fit=crop&crop=face",
  "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop&crop=face",
  "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&h=150&fit=crop&crop=face",
  "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150&h=150&fit=crop&crop=face",
  "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&h=150&fit=crop&crop=face",
  "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150&h=150&fit=crop&crop=face",
  "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&h=150&fit=crop&crop=face",
  "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150&h=150&fit=crop&crop=face",
  "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=150&h=150&fit=crop&crop=face",
  "https://images.unsplash.com/photo-1501196354995-cbb51c65aaea?w=150&h=150&fit=crop&crop=face",
  "https://images.unsplash.com/photo-1520813792240-56fc4a3765a7?w=150&h=150&fit=crop&crop=face",
  "https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=150&h=150&fit=crop&crop=face",
  "https://images.unsplash.com/photo-1489424731084-a5d8b219a5bb?w=150&h=150&fit=crop&crop=face",
  "https://images.unsplash.com/photo-1527980965255-d3b416303d12?w=150&h=150&fit=crop&crop=face",
  "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&h=150&fit=crop&crop=face",
  "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&h=150&fit=crop&crop=face",
  "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=150&h=150&fit=crop&crop=face",
];

const PRODUCT_IMAGES = [
  "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=200&h=200&fit=crop",
  "https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=200&h=200&fit=crop",
  "https://images.unsplash.com/photo-1586953208448-b95a79798f07?w=200&h=200&fit=crop",
  "https://images.unsplash.com/photo-1504148455328-c376907d081c?w=200&h=200&fit=crop",
  "https://images.unsplash.com/photo-1565106430482-8f6e74349ca1?w=200&h=200&fit=crop",
];

async function ensureVendors() {
  const existing = await db.select().from(vendorsTable);
  if (existing.length) return existing;

  return await db.insert(vendorsTable).values([
    {
      name: "Default Vendor",
      email: "vendor@example.com",
      phone: "+91 9000000000",
      company: "Default Vendor Co",
      gstNumber: "03AABCD1234E1Z1",
      panNumber: "AABCD1234E",
      category: "General",
      status: "active",
      imageUrl: PRODUCT_IMAGES[0],
    },
  ]).returning();
}

async function ensureInventoryItems() {
  const existing = await db.select().from(inventoryTable);
  if (existing.length) return existing;

  return await db.insert(inventoryTable).values([
    {
      sku: "SKU-001",
      name: "Steel Rod",
      category: "Raw Materials",
      quantity: "100",
      unit: "pcs",
      reorderLevel: "10",
      costPrice: "1200",
      sellingPrice: "1500",
      location: "Warehouse A",
      description: "Mild steel rods for general fabrication",
      imageUrl: PRODUCT_IMAGES[1],
    },
    {
      sku: "SKU-002",
      name: "Hydraulic Pump",
      category: "Machinery",
      quantity: "20",
      unit: "pcs",
      reorderLevel: "5",
      costPrice: "8500",
      sellingPrice: "10000",
      location: "Warehouse B",
      description: "Hydraulic pump for equipment maintenance",
      imageUrl: PRODUCT_IMAGES[2],
    },
  ]).returning();
}

async function seedPurchaseOrdersOnly() {
  console.log("Starting purchase orders only seed...");
  await db.execute(sql`TRUNCATE TABLE purchase_orders RESTART IDENTITY CASCADE`);

  const vendors = await ensureVendors();
  const inventoryItems = await ensureInventoryItems();
  const projects = await db.select().from(projectsTable).limit(10);

  const purchaseOrders = await db.insert(purchaseOrdersTable).values(
    Array.from({ length: 20 }, (_, i) => {
      const item = inventoryItems[i % inventoryItems.length];
      const quantity = Math.floor(Math.random() * 50) + 10;
      const unitPrice = Number(item.costPrice);
      const total = quantity * unitPrice;
      const issueDate = new Date(2024, Math.floor(i / 2), (i % 20) + 1);
      const deliveryDate = new Date(issueDate.getTime() + 21 * 86400000);
      const statuses = ["approved", "approved", "received", "pending", "draft", "cancelled"];

      return {
        poNumber: `PO-2024-${String(i + 1).padStart(3, "0")}`,
        customerId: vendors[i % vendors.length].id,
        projectId: projects.length ? String(projects[i % projects.length].id) : undefined,
        status: statuses[i % statuses.length],
        orderDate: issueDate.toISOString().split("T")[0],
        deliveryDate: deliveryDate.toISOString().split("T")[0],
        totalAmount: String(total),
        items: [
          {
            id: 1,
            itemName: item.name,
            quantity,
            unitPrice,
            total,
          },
        ],
        notes: "Generated PO for seeded data.",
        scopeDefinition: "Supply as per standard purchase order.",
        timePeriod: "21 days ARO",
      };
    })
  ).returning();

  console.log(`✅ Seeded ${purchaseOrders.length} purchase orders`);
  if (!projects.length) {
    console.log("ℹ️ No projects found; purchase orders were inserted without project linkage.");
  }
  console.log("Purchase orders-only seed completed.");
}

async function seed() {
  console.log("Starting comprehensive seed...");

  // Clear all tables
  await db.execute(sql`TRUNCATE TABLE attendance_categories, project_tasks, expense_categories, invoices, purchase_orders, inventory_movements, inventory, expenses, revenue, leaves, payroll, attendance, projects, vendors, customers, employees, roles, notifications, audit_logs, reminders, documents, settings RESTART IDENTITY CASCADE`);

  // Settings
  await db.insert(settingsTable).values({
    companyName: "EliteMek Engineering Pvt Ltd",
    companyAddress: "Plot No. 42, Industrial Area Phase II, Chandigarh, Punjab 160002",
    companyPhone: "+91 172 4567890",
    companyPhone2: "+91 172 4567891",
    companyEmail: "info@elitemek.com",
    companyWebsite: "www.elitemek.com",
    gstNumber: "03AABCE0000A1Z5",
    panNumber: "AABCE0000A",
    cinNumber: "U74899CH2010PTC034567",
    bankName: "HDFC Bank Ltd",
    bankAccount: "50200012345678",
    bankIfsc: "HDFC0001234",
    currency: "INR",
    timezone: "Asia/Kolkata",
    themeColor: "#3B82F6",
    themeMode: "light",
    headerFont: "Inter",
    bodyFont: "Inter",
    buttonColor: "#3B82F6",
    fieldColor: "#F9FAFB",
    pdfHeaderContent: "EliteMek Engineering Pvt Ltd | GST: 03AABCE0000A1Z5 | PAN: AABCE0000A",
    pdfFooterContent: "Thank you for your business. For queries: info@elitemek.com | +91 172 4567890",
  });

  // Roles
  const allModules = ["employees", "attendance", "payroll", "leaves", "customers", "vendors", "projects", "purchase_orders", "inventory", "expenses", "revenue", "invoices", "documents", "reports", "settings", "roles"];
  const allActions = ["view", "create", "edit", "delete"];
  const adminPerms = allModules.map(m => ({ module: m, actions: allActions }));
  const managerPerms = allModules.filter(m => !["settings", "roles"].includes(m)).map(m => ({ module: m, actions: ["view", "create", "edit"] }));
  const employeePerms = ["employees", "attendance", "leaves", "payroll"].map(m => ({ module: m, actions: ["view"] }));
  const accountantPerms = ["invoices", "expenses", "revenue", "payroll"].map(m => ({ module: m, actions: ["view", "create", "edit"] }));
  const hrPerms = ["employees", "attendance", "payroll", "leaves"].map(m => ({ module: m, actions: ["view", "create", "edit"] }));

  await db.insert(rolesTable).values([
    { name: "Administrator", description: "Full system access", permissions: adminPerms },
    { name: "Manager", description: "Manage all modules except settings", permissions: managerPerms },
    { name: "Employee", description: "View own data only", permissions: employeePerms },
    { name: "Accountant", description: "Finance and accounting access", permissions: accountantPerms },
    { name: "HR Manager", description: "HR and payroll access", permissions: hrPerms },
  ]);

  // Attendance Categories
  await db.insert(attendanceCategoriesTable).values([
    { name: "Present", color: "#22C55E", shortCode: "P", description: "Employee was present", isPaid: 1 },
    { name: "Absent", color: "#EF4444", shortCode: "A", description: "Employee was absent", isPaid: 0 },
    { name: "Half Day", color: "#F59E0B", shortCode: "HD", description: "Employee worked half day", isPaid: 1 },
    { name: "Late", color: "#F97316", shortCode: "L", description: "Employee came late", isPaid: 1 },
    { name: "Sick Leave", color: "#8B5CF6", shortCode: "SL", description: "Medical leave", isPaid: 1 },
    { name: "Casual Leave", color: "#06B6D4", shortCode: "CL", description: "Casual leave", isPaid: 1 },
    { name: "Earned Leave", color: "#84CC16", shortCode: "EL", description: "Earned/privileged leave", isPaid: 1 },
    { name: "Holiday", color: "#64748B", shortCode: "H", description: "Public holiday", isPaid: 1 },
    { name: "Week Off", color: "#9CA3AF", shortCode: "WO", description: "Weekly off day", isPaid: 1 },
  ]);

  // Expense Categories
  const expCats = await db.insert(expenseCategoriesTable).values([
    { name: "Travel", color: "#3B82F6", description: "Travel and transportation" },
    { name: "Office Supplies", color: "#10B981", description: "Stationery and supplies" },
    { name: "Utilities", color: "#F59E0B", description: "Electricity, water, internet" },
    { name: "Maintenance", color: "#6B7280", description: "Equipment and facility maintenance" },
    { name: "Marketing", color: "#EC4899", description: "Advertising and marketing" },
    { name: "Software", color: "#8B5CF6", description: "Software subscriptions" },
    { name: "Training", color: "#14B8A6", description: "Employee training" },
    { name: "Miscellaneous", color: "#94A3B8", description: "Other expenses" },
  ]).returning();

  // Expense sub-categories
  await db.insert(expenseCategoriesTable).values([
    { name: "Air Travel", parentId: expCats[0].id, color: "#3B82F6" },
    { name: "Hotel", parentId: expCats[0].id, color: "#3B82F6" },
    { name: "Local Transport", parentId: expCats[0].id, color: "#3B82F6" },
    { name: "Printing", parentId: expCats[1].id, color: "#10B981" },
    { name: "Stationery", parentId: expCats[1].id, color: "#10B981" },
    { name: "Electricity", parentId: expCats[2].id, color: "#F59E0B" },
    { name: "Internet", parentId: expCats[2].id, color: "#F59E0B" },
    { name: "Equipment Repair", parentId: expCats[3].id, color: "#6B7280" },
  ]);

  // Employees
  const empData = [
    { firstName: "Rajesh", lastName: "Sharma", email: "rajesh.sharma@elitemek.com", department: "Engineering", designation: "Senior Engineer", salary: "85000", joiningDate: "2021-03-15", employeeId: "EMP001", phone: "+91 9876543210", pfEnabled: true, esicEnabled: true },
    { firstName: "Priya", lastName: "Verma", email: "priya.verma@elitemek.com", department: "HR", designation: "HR Manager", salary: "75000", joiningDate: "2020-07-01", employeeId: "EMP002", phone: "+91 9876543211", pfEnabled: true, esicEnabled: false },
    { firstName: "Amit", lastName: "Patel", email: "amit.patel@elitemek.com", department: "Finance", designation: "CFO", salary: "120000", joiningDate: "2019-01-10", employeeId: "EMP003", phone: "+91 9876543212", pfEnabled: true, esicEnabled: false },
    { firstName: "Sunita", lastName: "Gupta", email: "sunita.gupta@elitemek.com", department: "Sales", designation: "Sales Manager", salary: "70000", joiningDate: "2021-06-20", employeeId: "EMP004", phone: "+91 9876543213", pfEnabled: true, esicEnabled: true },
    { firstName: "Vikram", lastName: "Singh", email: "vikram.singh@elitemek.com", department: "Engineering", designation: "Project Manager", salary: "95000", joiningDate: "2020-02-14", employeeId: "EMP005", phone: "+91 9876543214", pfEnabled: true, esicEnabled: false },
    { firstName: "Meena", lastName: "Reddy", email: "meena.reddy@elitemek.com", department: "Marketing", designation: "Marketing Lead", salary: "65000", joiningDate: "2022-01-05", employeeId: "EMP006", phone: "+91 9876543215", pfEnabled: true, esicEnabled: true },
    { firstName: "Suresh", lastName: "Kumar", email: "suresh.kumar@elitemek.com", department: "Engineering", designation: "CAD Designer", salary: "55000", joiningDate: "2022-04-18", employeeId: "EMP007", phone: "+91 9876543216", pfEnabled: true, esicEnabled: true },
    { firstName: "Anita", lastName: "Joshi", email: "anita.joshi@elitemek.com", department: "Accounts", designation: "Senior Accountant", salary: "68000", joiningDate: "2021-09-12", employeeId: "EMP008", phone: "+91 9876543217", pfEnabled: true, esicEnabled: false },
    { firstName: "Deepak", lastName: "Mehta", email: "deepak.mehta@elitemek.com", department: "Operations", designation: "Operations Manager", salary: "80000", joiningDate: "2020-11-30", employeeId: "EMP009", phone: "+91 9876543218", pfEnabled: true, esicEnabled: false },
    { firstName: "Kavita", lastName: "Nair", email: "kavita.nair@elitemek.com", department: "Engineering", designation: "Structural Engineer", salary: "72000", joiningDate: "2021-12-01", employeeId: "EMP010", phone: "+91 9876543219", pfEnabled: true, esicEnabled: true },
    { firstName: "Rahul", lastName: "Yadav", email: "rahul.yadav@elitemek.com", department: "Engineering", designation: "MEP Engineer", salary: "65000", joiningDate: "2022-03-07", employeeId: "EMP011", phone: "+91 9876543220", pfEnabled: true, esicEnabled: true },
    { firstName: "Divya", lastName: "Saxena", email: "divya.saxena@elitemek.com", department: "Admin", designation: "Admin Executive", salary: "42000", joiningDate: "2023-01-15", employeeId: "EMP012", phone: "+91 9876543221", pfEnabled: false, esicEnabled: true },
    { firstName: "Nitin", lastName: "Agarwal", email: "nitin.agarwal@elitemek.com", department: "Procurement", designation: "Purchase Manager", salary: "78000", joiningDate: "2020-08-22", employeeId: "EMP013", phone: "+91 9876543222", pfEnabled: true, esicEnabled: false },
    { firstName: "Shweta", lastName: "Mishra", email: "shweta.mishra@elitemek.com", department: "Quality", designation: "QA Inspector", salary: "55000", joiningDate: "2022-06-10", employeeId: "EMP014", phone: "+91 9876543223", pfEnabled: true, esicEnabled: true },
    { firstName: "Kiran", lastName: "Bhat", email: "kiran.bhat@elitemek.com", department: "IT", designation: "IT Manager", salary: "88000", joiningDate: "2021-05-25", employeeId: "EMP015", phone: "+91 9876543224", pfEnabled: true, esicEnabled: false },
    { firstName: "Pooja", lastName: "Tiwari", email: "pooja.tiwari@elitemek.com", department: "Sales", designation: "Sales Executive", salary: "48000", joiningDate: "2023-03-20", employeeId: "EMP016", phone: "+91 9876543225", pfEnabled: false, esicEnabled: true },
    { firstName: "Manoj", lastName: "Pandey", email: "manoj.pandey@elitemek.com", department: "Engineering", designation: "Civil Engineer", salary: "62000", joiningDate: "2022-09-01", employeeId: "EMP017", phone: "+91 9876543226", pfEnabled: true, esicEnabled: true },
    { firstName: "Ritu", lastName: "Garg", email: "ritu.garg@elitemek.com", department: "Finance", designation: "Finance Analyst", salary: "58000", joiningDate: "2022-11-15", employeeId: "EMP018", phone: "+91 9876543227", pfEnabled: true, esicEnabled: true },
    { firstName: "Ajay", lastName: "Chauhan", email: "ajay.chauhan@elitemek.com", department: "Operations", designation: "Site Supervisor", salary: "52000", joiningDate: "2023-02-01", employeeId: "EMP019", phone: "+91 9876543228", pfEnabled: false, esicEnabled: true },
    { firstName: "Sneha", lastName: "Kapoor", email: "sneha.kapoor@elitemek.com", department: "Marketing", designation: "Digital Marketer", salary: "55000", joiningDate: "2023-04-10", employeeId: "EMP020", phone: "+91 9876543229", pfEnabled: false, esicEnabled: true },
  ];

  while (empData.length < 30) {
    const idx = empData.length + 1;
    const departments = ["Engineering", "Sales", "HR", "Finance", "Quality", "Operations"];
    const designations = ["Engineer", "Coordinator", "Executive", "Manager", "Analyst", "Supervisor"];
    const department = departments[idx % departments.length];
    empData.push({
      firstName: `Employee${idx}`,
      lastName: "Pandey",
      email: `employee${idx}@elitemek.com`,
      department,
      designation: designations[idx % designations.length],
      salary: `${45000 + idx * 1200}`,
      joiningDate: `2023-${String((idx % 12) + 1).padStart(2, "0")}-${String((idx % 26) + 1).padStart(2, "0")}`,
      employeeId: `EMP${String(idx).padStart(3, "0")}`,
      phone: `+91 9000000${String(idx).padStart(3, "0")}`,
      pfEnabled: idx % 2 === 0,
      esicEnabled: idx % 3 !== 0,
    });
  }

  const employees = await db.insert(employeesTable).values(
    empData.map((e, i) => ({
      ...e,
      imageUrl: EMPLOYEE_IMAGES[i % EMPLOYEE_IMAGES.length],
      status: "active",
      bankName: "HDFC Bank",
      bankAccount: `${1000000000 + i}`,
      ifscCode: "HDFC0001234",
      salaryFormula: "basic",
      basicPercent: "60",
      hraPercent: "20",
      allowancesPercent: "20",
    }))
  ).returning();

  // Customers
  const customerData = [
    { name: "Infosys Limited", email: "procurement@infosys.com", phone: "+91 80 28520261", company: "Infosys Limited", gstNumber: "29AAACI1681G1ZK", panNumber: "AAACI1681G", address: "Electronics City, Bangalore, Karnataka 560100", status: "active", imageUrl: "https://images.unsplash.com/photo-1497366216548-37526070297c?w=150&h=150&fit=crop" },
    { name: "Tata Steel Ltd", email: "purchases@tatasteel.com", phone: "+91 657 6659999", company: "Tata Steel Ltd", gstNumber: "20AAACT2239C1ZH", panNumber: "AAACT2239C", address: "Bombay House, 24 Homi Mody St, Mumbai 400001", status: "active", imageUrl: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=150&h=150&fit=crop" },
    { name: "BHEL Corporation", email: "contracts@bhel.com", phone: "+91 11 26001620", company: "BHEL Corporation", gstNumber: "07AAACB0472M1ZV", panNumber: "AAACB0472M", address: "BHEL House, Siri Fort, New Delhi 110049", status: "active", imageUrl: "https://images.unsplash.com/photo-1565106430482-8f6e74349ca1?w=150&h=150&fit=crop" },
    { name: "L&T Infrastructure", email: "supply@lntecc.com", phone: "+91 22 67525656", company: "Larsen & Toubro", gstNumber: "27AAACL0127G1ZH", panNumber: "AAACL0127G", address: "L&T House, Ballard Estate, Mumbai 400001", status: "active", imageUrl: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=150&h=150&fit=crop" },
    { name: "ONGC Limited", email: "procurement@ongc.co.in", phone: "+91 135 2525050", company: "Oil & Natural Gas Corporation", gstNumber: "05AAACO0020N1ZA", panNumber: "AAACO0020N", address: "Tel Bhavan, Dehradun, Uttarakhand 248003", status: "active", imageUrl: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=150&h=150&fit=crop" },
    { name: "Reliance Industries", email: "engineering@ril.com", phone: "+91 22 44779000", company: "Reliance Industries Ltd", gstNumber: "27AAACR0716A1Z6", panNumber: "AAACR0716A", address: "Maker Chambers IV, 222 Nariman Point, Mumbai 400021", status: "active", imageUrl: "https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=150&h=150&fit=crop" },
    { name: "NTPC Limited", email: "mm@ntpc.co.in", phone: "+91 11 24360100", company: "NTPC Ltd", gstNumber: "07AAACN0071G1ZV", panNumber: "AAACN0071G", address: "NTPC Bhawan, SCOPE Complex, New Delhi 110003", status: "active", imageUrl: "https://images.unsplash.com/photo-1473341304170-971dccb5ac1e?w=150&h=150&fit=crop" },
    { name: "SAIL Steel", email: "procurement@sail.in", phone: "+91 11 24367481", company: "Steel Authority of India", gstNumber: "07AAACS4681F1ZH", panNumber: "AAACS4681F", address: "Ispat Bhawan, Lodhi Road, New Delhi 110003", status: "active", imageUrl: "https://images.unsplash.com/photo-1581094794329-c8112a89af12?w=150&h=150&fit=crop" },
    { name: "Adani Ports", email: "supply@adaniports.com", phone: "+91 79 25555555", company: "Adani Ports & SEZ Ltd", gstNumber: "24AAACA3609G1ZB", panNumber: "AAACA3609G", address: "Adani House, Mithakhali Six Roads, Ahmedabad 380009", status: "active", imageUrl: "https://images.unsplash.com/photo-1578575437130-527eed3abbec?w=150&h=150&fit=crop" },
    { name: "Hindalco Industries", email: "purchase@hindalco.com", phone: "+91 22 66626666", company: "Hindalco Industries Ltd", gstNumber: "27AAACH3942M1Z0", panNumber: "AAACH3942M", address: "Aditya Birla Centre, S.K. Ahire Marg, Mumbai 400030", status: "active", imageUrl: "https://images.unsplash.com/photo-1504148455328-c376907d081c?w=150&h=150&fit=crop" },
    { name: "Mahindra Engineering", email: "contracts@mahindra.com", phone: "+91 22 24905252", company: "Mahindra & Mahindra", gstNumber: "27AAACM3025E1ZA", panNumber: "AAACM3025E", address: "Gateway Building, Apollo Bunder, Mumbai 400001", status: "active", imageUrl: "https://images.unsplash.com/photo-1556761175-4b46a572b786?w=150&h=150&fit=crop" },
    { name: "Punjab Tractors", email: "buy@punjab-tractors.com", phone: "+91 172 2770781", company: "Punjab Tractors Ltd", gstNumber: "03AABCP4567L1ZP", panNumber: "AABCP4567L", address: "Phase VIII, Industrial Area, Mohali 160055", status: "active", imageUrl: "https://images.unsplash.com/photo-1586953208448-b95a79798f07?w=150&h=150&fit=crop" },
    { name: "Bharat Forge", email: "purchase@bharatforge.com", phone: "+91 20 27440100", company: "Bharat Forge Limited", gstNumber: "27AAACB2680P1ZJ", panNumber: "AAACB2680P", address: "Mundhwa, Pune, Maharashtra 411036", status: "active", imageUrl: "https://images.unsplash.com/photo-1597852074816-d933c7d2b988?w=150&h=150&fit=crop" },
    { name: "Thermax Ltd", email: "scm@thermax.com", phone: "+91 20 25884333", company: "Thermax Limited", gstNumber: "27AAACT5674G1ZI", panNumber: "AAACT5674G", address: "D-13, MIDC Industrial Area, Chinchwad, Pune 411019", status: "active", imageUrl: "https://images.unsplash.com/photo-1565106430482-8f6e74349ca1?w=150&h=150&fit=crop" },
    { name: "Ashok Leyland", email: "procurement@ashokleyland.com", phone: "+91 44 24918550", company: "Ashok Leyland Ltd", gstNumber: "33AAACA9920R1ZU", panNumber: "AAACA9920R", address: "No 1, Sardar Patel Road, Guindy, Chennai 600032", status: "active", imageUrl: "https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=150&h=150&fit=crop" },
    { name: "Vedanta Resources", email: "purchase@vedanta.co.in", phone: "+91 22 66464600", company: "Vedanta Ltd", gstNumber: "27AAACV3507G1ZL", panNumber: "AAACV3507G", address: "Sesa Ghor, 20 EDC Complex, Patto, Panaji, Goa 403001", status: "active", imageUrl: "https://images.unsplash.com/photo-1481253127861-534498168948?w=150&h=150&fit=crop" },
    { name: "Kirloskar Electric", email: "supply@kirloskar.com", phone: "+91 80 22994400", company: "Kirloskar Electric Co", gstNumber: "29AAACK0706K1ZE", panNumber: "AAACK0706K", address: "Kirloskar Electric Company, Mysore Road, Bangalore 560026", status: "active", imageUrl: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=150&h=150&fit=crop" },
    { name: "ABB India", email: "scm@in.abb.com", phone: "+91 80 22948400", company: "ABB India Limited", gstNumber: "29AAACA4316H1ZI", panNumber: "AAACA4316H", address: "Khanija Bhavan, Race Course Road, Bangalore 560001", status: "active", imageUrl: "https://images.unsplash.com/photo-1581094794329-c8112a89af12?w=150&h=150&fit=crop" },
    { name: "Cummins India", email: "procurement@cummins.com", phone: "+91 20 67067000", company: "Cummins India Ltd", gstNumber: "27AAACI0025E1ZU", panNumber: "AAACI0025E", address: "Tower A, Survey No 21, Balewadi, Pune 411045", status: "active", imageUrl: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=150&h=150&fit=crop" },
    { name: "Siemens India", email: "supply@siemens.com", phone: "+91 22 39677000", company: "Siemens Limited", gstNumber: "27AAACS0803G1ZI", panNumber: "AAACS0803G", address: "130 Pandurang Budhkar Marg, Worli, Mumbai 400018", status: "active", imageUrl: "https://images.unsplash.com/photo-1497366754035-f200968a6e72?w=150&h=150&fit=crop" },
  ];

  while (customerData.length < 30) {
    const idx = customerData.length + 1;
    customerData.push({
      name: `Customer ${idx}`,
      email: `customer${idx}@example.com`,
      phone: `+91 9000100${String(idx).padStart(3, "0")}`,
      company: `Customer Company ${idx}`,
      gstNumber: `27AABCC${String(1000 + idx).padStart(4, "0")}L1Z${String.fromCharCode(65 + (idx % 26))}`,
      panNumber: `AABCC${String(1000 + idx).padStart(4, "0")}L`,
      address: `Office ${idx}, Business Park, Bangalore 5600${idx % 10}`,
      status: "active",
      imageUrl: "https://images.unsplash.com/photo-1521791055366-0d553872125f?w=150&h=150&fit=crop",
    });
  }

  const customers = await db.insert(customersTable).values(customerData).returning();

  // Vendors
  const vendorData = [
    { name: "Steel Craft Industries", email: "sales@steelcraft.in", phone: "+91 172 2345678", company: "Steel Craft Industries", gstNumber: "03AABCS9876A1ZT", panNumber: "AABCS9876A", category: "Raw Materials", status: "active", imageUrl: PRODUCT_IMAGES[0] },
    { name: "Precision Parts Ltd", email: "orders@precisionparts.in", phone: "+91 120 4567890", company: "Precision Parts Ltd", gstNumber: "09AABCP1234B1ZR", panNumber: "AABCP1234B", category: "Components", status: "active", imageUrl: PRODUCT_IMAGES[1] },
    { name: "Electrical World", email: "supply@electricalworld.in", phone: "+91 44 23456789", company: "Electrical World Pvt Ltd", gstNumber: "33AABCE5678C1ZQ", panNumber: "AABCE5678C", category: "Electrical", status: "active", imageUrl: PRODUCT_IMAGES[2] },
    { name: "Tool House India", email: "tools@toolhouse.in", phone: "+91 80 34567890", company: "Tool House India", gstNumber: "29AABCT2468D1ZP", panNumber: "AABCT2468D", category: "Tools", status: "active", imageUrl: PRODUCT_IMAGES[3] },
    { name: "Safety Gear Co", email: "orders@safetygear.in", phone: "+91 22 45678901", company: "Safety Gear Company", gstNumber: "27AABCS1357E1ZO", panNumber: "AABCS1357E", category: "Safety Equipment", status: "active", imageUrl: PRODUCT_IMAGES[4] },
    { name: "Fastener World", email: "bulk@fastenerworld.in", phone: "+91 172 2345679", company: "Fastener World Pvt Ltd", gstNumber: "03AABCF9753F1ZN", panNumber: "AABCF9753F", category: "Hardware", status: "active", imageUrl: PRODUCT_IMAGES[0] },
    { name: "Metal Works Ludhiana", email: "sales@metalworks.in", phone: "+91 161 2546789", company: "Metal Works Ludhiana", gstNumber: "03AABCM8642G1ZM", panNumber: "AABCM8642G", category: "Raw Materials", status: "active", imageUrl: PRODUCT_IMAGES[1] },
    { name: "Hydraulics Hub", email: "inquiry@hydraulicshub.in", phone: "+91 20 23456780", company: "Hydraulics Hub", gstNumber: "27AABCH7531H1ZL", panNumber: "AABCH7531H", category: "Hydraulics", status: "active", imageUrl: PRODUCT_IMAGES[2] },
    { name: "Paint & Coating Pvt", email: "orders@paintcoating.in", phone: "+91 79 23456781", company: "Paint & Coating Pvt Ltd", gstNumber: "24AABCP6420I1ZK", panNumber: "AABCP6420I", category: "Paint", status: "active", imageUrl: PRODUCT_IMAGES[3] },
    { name: "Lubricants Direct", email: "bulk@lubricants.in", phone: "+91 11 23456782", company: "Lubricants Direct Pvt Ltd", gstNumber: "07AABCL5309J1ZJ", panNumber: "AABCL5309J", category: "Consumables", status: "active", imageUrl: PRODUCT_IMAGES[4] },
    { name: "Bearing Bazaar", email: "orders@bearingbazaar.in", phone: "+91 22 23456783", company: "Bearing Bazaar Ltd", gstNumber: "27AABCB4198K1ZI", panNumber: "AABCB4198K", category: "Components", status: "active", imageUrl: PRODUCT_IMAGES[0] },
    { name: "Pipes & Fittings Co", email: "supply@pipesfittings.in", phone: "+91 40 23456784", company: "Pipes & Fittings Co", gstNumber: "36AABCP3087L1ZH", panNumber: "AABCP3087L", category: "Plumbing", status: "active", imageUrl: PRODUCT_IMAGES[1] },
    { name: "Instrumentation India", email: "sales@instrumentindia.in", phone: "+91 120 23456785", company: "Instrumentation India Pvt Ltd", gstNumber: "09AABCI1976M1ZG", panNumber: "AABCI1976M", category: "Instruments", status: "active", imageUrl: PRODUCT_IMAGES[2] },
    { name: "Welding World", email: "orders@weldingworld.in", phone: "+91 22 23456786", company: "Welding World Pvt Ltd", gstNumber: "27AABCW0865N1ZF", panNumber: "AABCW0865N", category: "Welding", status: "active", imageUrl: PRODUCT_IMAGES[3] },
    { name: "Pump Solutions Ltd", email: "sales@pumpsolutions.in", phone: "+91 80 23456787", company: "Pump Solutions Ltd", gstNumber: "29AABCP9754O1ZE", panNumber: "AABCP9754O", category: "Machinery", status: "active", imageUrl: PRODUCT_IMAGES[4] },
    { name: "Gasket & Seal Co", email: "bulk@gasketseal.in", phone: "+91 172 23456788", company: "Gasket & Seal Company", gstNumber: "03AABCG8643P1ZD", panNumber: "AABCG8643P", category: "Sealing", status: "active", imageUrl: PRODUCT_IMAGES[0] },
    { name: "Filter & Strainer Works", email: "supply@filterworks.in", phone: "+91 22 23456789", company: "Filter & Strainer Works", gstNumber: "27AABCF7532Q1ZC", panNumber: "AABCF7532Q", category: "Filtration", status: "active", imageUrl: PRODUCT_IMAGES[1] },
    { name: "Compressor Mart", email: "orders@compressormart.in", phone: "+91 79 23456790", company: "Compressor Mart Pvt Ltd", gstNumber: "24AABCC6421R1ZB", panNumber: "AABCC6421R", category: "Machinery", status: "active", imageUrl: PRODUCT_IMAGES[2] },
    { name: "Sheet Metal Works", email: "bulk@sheetmetal.in", phone: "+91 161 23456791", company: "Sheet Metal Works Pvt Ltd", gstNumber: "03AABCS5310S1ZA", panNumber: "AABCS5310S", category: "Raw Materials", status: "active", imageUrl: PRODUCT_IMAGES[3] },
    { name: "Control Panel Systems", email: "sales@controlpanel.in", phone: "+91 20 23456792", company: "Control Panel Systems Ltd", gstNumber: "27AABCC4209T1ZZ", panNumber: "AABCC4209T", category: "Electrical", status: "active", imageUrl: PRODUCT_IMAGES[4] },
  ];

  const vendorCategories = ["Raw Materials", "Components", "Electrical", "Tools", "Safety Equipment", "Consumables", "Plumbing", "Machinery", "Filtration", "Hydraulics", "Welding", "Instruments", "Sealing"];

  while (vendorData.length < 30) {
    const idx = vendorData.length + 1;
    vendorData.push({
      name: `Vendor ${idx}`,
      email: `vendor${idx}@example.com`,
      phone: `+91 9000200${String(idx).padStart(3, "0")}`,
      company: `Vendor Company ${idx}`,
      gstNumber: `27AABCV${String(1000 + idx).padStart(4, "0")}M1Z${String.fromCharCode(65 + (idx % 26))}`,
      panNumber: `AABCV${String(1000 + idx).padStart(4, "0")}M`,
      category: vendorCategories[idx % vendorCategories.length],
      status: "active",
      imageUrl: PRODUCT_IMAGES[idx % PRODUCT_IMAGES.length],
    });
  }

  const vendors = await db.insert(vendorsTable).values(vendorData).returning();

  // Projects
  const projects = await db.insert(projectsTable).values([
    { name: "BHEL Turbine Overhaul", description: "Complete overhaul and maintenance of 200MW steam turbines at Korba plant", customerId: customers[2].id, status: "active", priority: "high", budget: "2500000", spent: "850000", startDate: "2024-01-15", endDate: "2025-03-31", progress: 35, managerId: employees[4].id, imageUrl: PRODUCT_IMAGES[0], pendingWorks: ["Blade inspection", "Balance testing"], dependencies: ["Spare parts delivery", "Shutdown approval"], followUps: ["Weekly progress report to BHEL", "Safety audit Q2"] },
    { name: "L&T Chemical Plant Piping", description: "Engineering, supply and installation of high-pressure piping system", customerId: customers[3].id, status: "active", priority: "high", budget: "4800000", spent: "1200000", startDate: "2024-02-01", endDate: "2025-06-30", progress: 25, managerId: employees[4].id, imageUrl: PRODUCT_IMAGES[1], pendingWorks: ["Hydro testing", "Insulation work"], dependencies: ["Pipe procurement", "Civil work completion"], followUps: ["Monthly review meetings", "Quality inspection schedule"] },
    { name: "ONGC Offshore Platform Maintenance", description: "Routine maintenance and emergency repair services for offshore drilling platforms", customerId: customers[4].id, status: "active", priority: "critical", budget: "6500000", spent: "2100000", startDate: "2024-03-01", endDate: "2025-09-30", progress: 32, managerId: employees[0].id, imageUrl: PRODUCT_IMAGES[2], pendingWorks: ["Crane inspection", "Safety system upgrade"], dependencies: ["Offshore permit", "Helicopter access"], followUps: ["Bi-weekly safety report", "Compliance certificates"] },
    { name: "Infosys Data Center HVAC", description: "Design and installation of precision cooling systems for new data center", customerId: customers[0].id, status: "active", priority: "medium", budget: "3200000", spent: "980000", startDate: "2024-04-10", endDate: "2025-04-30", progress: 28, managerId: employees[4].id, imageUrl: PRODUCT_IMAGES[3] },
    { name: "Reliance Refinery Upgrade", description: "Process equipment upgrade and automation for refinery expansion project", customerId: customers[5].id, status: "active", priority: "high", budget: "8900000", spent: "2800000", startDate: "2024-01-01", endDate: "2025-12-31", progress: 22, managerId: employees[0].id, imageUrl: PRODUCT_IMAGES[4] },
    { name: "NTPC Power Plant DCS", description: "Distributed Control System upgrade for 500MW thermal power unit", customerId: customers[6].id, status: "on_hold", priority: "medium", budget: "1800000", spent: "450000", startDate: "2024-05-15", endDate: "2025-08-31", progress: 15, managerId: employees[4].id, imageUrl: PRODUCT_IMAGES[0] },
    { name: "SAIL Blast Furnace Instrumentation", description: "Complete instrumentation and automation package for blast furnace No.4", customerId: customers[7].id, status: "completed", priority: "high", budget: "3600000", spent: "3580000", startDate: "2023-06-01", endDate: "2024-12-31", progress: 100, managerId: employees[0].id, imageUrl: PRODUCT_IMAGES[1] },
    { name: "Adani Port Crane Electrification", description: "Electrical systems for 6 new ship-to-shore cranes", customerId: customers[8].id, status: "active", priority: "medium", budget: "5200000", spent: "1650000", startDate: "2024-06-01", endDate: "2025-11-30", progress: 18, managerId: employees[4].id, imageUrl: PRODUCT_IMAGES[2] },
    { name: "Mahindra Tractor Plant Automation", description: "Robot welding line installation and PLC programming", customerId: customers[10].id, status: "active", priority: "high", budget: "4400000", spent: "1100000", startDate: "2024-07-01", endDate: "2025-07-31", progress: 20, managerId: employees[0].id, imageUrl: PRODUCT_IMAGES[3] },
    { name: "Cummins Engine Test Cell", description: "Complete test cell setup including instrumentation and data acquisition", customerId: customers[17].id, status: "planning", priority: "low", budget: "2100000", spent: "0", startDate: "2025-01-01", endDate: "2025-10-31", progress: 0, managerId: employees[4].id, imageUrl: PRODUCT_IMAGES[4] },
    { name: "ABB Switchgear Factory Fitout", description: "Compressed air system and material handling for new factory", customerId: customers[16].id, status: "active", priority: "medium", budget: "1900000", spent: "620000", startDate: "2024-08-15", endDate: "2025-05-31", progress: 30, managerId: employees[0].id, imageUrl: PRODUCT_IMAGES[0] },
    { name: "Bharat Forge Press Shop Upgrade", description: "Hydraulic press upgrade and die monitoring system installation", customerId: customers[12].id, status: "active", priority: "high", budget: "3800000", spent: "1500000", startDate: "2024-09-01", endDate: "2025-08-31", progress: 28, managerId: employees[4].id, imageUrl: PRODUCT_IMAGES[1] },
    { name: "Siemens Rail Traction Substation", description: "33kV traction substation equipment and installation", customerId: customers[18].id, status: "active", priority: "medium", budget: "7200000", spent: "2200000", startDate: "2024-10-01", endDate: "2026-03-31", progress: 12, managerId: employees[0].id, imageUrl: PRODUCT_IMAGES[2] },
    { name: "Vedanta Copper Smelter Cooling", description: "Evaporative cooling towers for copper smelter process", customerId: customers[14].id, status: "active", priority: "high", budget: "4100000", spent: "1300000", startDate: "2024-11-01", endDate: "2025-09-30", progress: 20, managerId: employees[4].id, imageUrl: PRODUCT_IMAGES[3] },
    { name: "Thermax Heat Exchanger Supply", description: "Design and supply of 8 shell and tube heat exchangers", customerId: customers[13].id, status: "completed", priority: "medium", budget: "2800000", spent: "2750000", startDate: "2024-01-15", endDate: "2024-11-30", progress: 100, managerId: employees[0].id, imageUrl: PRODUCT_IMAGES[4] },
    { name: "HPCL Pump Station Revamp", description: "Complete pump station overhaul at Ambala terminal", customerId: customers[4].id, status: "active", priority: "medium", budget: "2300000", spent: "750000", startDate: "2024-12-01", endDate: "2025-08-31", progress: 15, managerId: employees[4].id, imageUrl: PRODUCT_IMAGES[0] },
    { name: "Kirloskar Motor Rewind Shop", description: "Motor rewind and testing facility setup", customerId: customers[15].id, status: "planning", priority: "low", budget: "1600000", spent: "0", startDate: "2025-02-01", endDate: "2025-10-31", progress: 0, managerId: employees[0].id, imageUrl: PRODUCT_IMAGES[1] },
    { name: "Hindalco Aluminium Smelter MEP", description: "Mechanical, electrical and piping for smelter expansion", customerId: customers[9].id, status: "active", priority: "high", budget: "9500000", spent: "2900000", startDate: "2024-06-15", endDate: "2026-06-30", progress: 18, managerId: employees[4].id, imageUrl: PRODUCT_IMAGES[2] },
    { name: "Punjab Tractor Assembly Line", description: "Assembly line conveyor and tooling systems", customerId: customers[11].id, status: "active", priority: "medium", budget: "3400000", spent: "1100000", startDate: "2024-08-01", endDate: "2025-06-30", progress: 22, managerId: employees[0].id, imageUrl: PRODUCT_IMAGES[3] },
    { name: "Ashok Leyland Chassis Plant", description: "Material handling and automated storage systems", customerId: customers[14].id, status: "planning", priority: "low", budget: "5700000", spent: "0", startDate: "2025-03-01", endDate: "2026-06-30", progress: 0, managerId: employees[4].id, imageUrl: PRODUCT_IMAGES[4] },
  ]).returning();

  // Project Tasks
  await db.insert(projectTasksTable).values([
    { projectId: projects[0].id, title: "Initial site survey and assessment", status: "completed", priority: "high", assignedTo: employees[0].id, dueDate: "2024-01-20" },
    { projectId: projects[0].id, title: "Turbine disassembly and inspection", status: "in_progress", priority: "high", assignedTo: employees[6].id, dueDate: "2024-06-30" },
    { projectId: projects[0].id, title: "Blade replacement procurement", status: "pending", priority: "medium", assignedTo: employees[12].id, dueDate: "2024-07-15" },
    { projectId: projects[0].id, title: "Balancing and alignment check", status: "pending", priority: "high", assignedTo: employees[0].id, dueDate: "2025-01-31" },
    { projectId: projects[1].id, title: "Piping design review", status: "completed", priority: "high", assignedTo: employees[9].id, dueDate: "2024-02-28" },
    { projectId: projects[1].id, title: "Material procurement", status: "in_progress", priority: "high", assignedTo: employees[12].id, dueDate: "2024-05-31" },
    { projectId: projects[1].id, title: "Pipe spool fabrication", status: "pending", priority: "medium", assignedTo: employees[6].id, dueDate: "2024-08-31" },
    { projectId: projects[2].id, title: "Offshore safety induction", status: "completed", priority: "critical", assignedTo: employees[4].id, dueDate: "2024-03-15" },
    { projectId: projects[2].id, title: "Platform inspection survey", status: "in_progress", priority: "high", assignedTo: employees[0].id, dueDate: "2024-09-30" },
    { projectId: projects[3].id, title: "Cooling load calculation", status: "completed", priority: "medium", assignedTo: employees[9].id, dueDate: "2024-04-30" },
    { projectId: projects[3].id, title: "Equipment selection and ordering", status: "in_progress", priority: "medium", assignedTo: employees[12].id, dueDate: "2024-07-31" },
    { projectId: projects[4].id, title: "Process design review", status: "completed", priority: "high", assignedTo: employees[16].id, dueDate: "2024-02-28" },
    { projectId: projects[4].id, title: "Equipment procurement", status: "in_progress", priority: "high", assignedTo: employees[12].id, dueDate: "2024-09-30" },
  ]);

  // Inventory
  const inventoryData = [
    { sku: "STL-001", name: "MS Plate 10mm", category: "Raw Material", quantity: "450", unit: "kg", reorderLevel: "200", costPrice: "85", sellingPrice: "105", location: "Warehouse A-1", description: "Mild Steel plate 10mm thickness IS 2062", imageUrl: PRODUCT_IMAGES[0] },
    { sku: "STL-002", name: "SS 304 Pipe 2 inch", category: "Raw Material", quantity: "180", unit: "mtr", reorderLevel: "50", costPrice: "650", sellingPrice: "820", location: "Warehouse A-2", description: "Stainless steel pipe 304 grade 2 inch NB", imageUrl: PRODUCT_IMAGES[1] },
    { sku: "ELE-001", name: "3 Phase Motor 5HP", category: "Electrical", quantity: "12", unit: "nos", reorderLevel: "3", costPrice: "8500", sellingPrice: "11000", location: "Store B-1", description: "Induction motor 5HP 1440 RPM 415V", imageUrl: PRODUCT_IMAGES[2] },
    { sku: "ELE-002", name: "MCCB 125A", category: "Electrical", quantity: "28", unit: "nos", reorderLevel: "10", costPrice: "2200", sellingPrice: "2900", location: "Store B-2", description: "Molded Case Circuit Breaker 125A 3P", imageUrl: PRODUCT_IMAGES[3] },
    { sku: "HYD-001", name: "Hydraulic Cylinder 50mm", category: "Hydraulics", quantity: "8", unit: "nos", reorderLevel: "3", costPrice: "12000", sellingPrice: "16000", location: "Store C-1", description: "Double acting hydraulic cylinder 50mm bore 200mm stroke", imageUrl: PRODUCT_IMAGES[4] },
    { sku: "HYD-002", name: "Hydraulic Pump 20LPM", category: "Hydraulics", quantity: "5", unit: "nos", reorderLevel: "2", costPrice: "18500", sellingPrice: "24000", location: "Store C-2", description: "Gear pump 20 LPM 210 bar", imageUrl: PRODUCT_IMAGES[0] },
    { sku: "INS-001", name: "Pressure Gauge 0-10 bar", category: "Instruments", quantity: "35", unit: "nos", reorderLevel: "10", costPrice: "450", sellingPrice: "620", location: "Store D-1", description: "Stainless steel pressure gauge 0-10 bar 100mm dial", imageUrl: PRODUCT_IMAGES[1] },
    { sku: "INS-002", name: "RTD PT100 Thermocouple", category: "Instruments", quantity: "22", unit: "nos", reorderLevel: "8", costPrice: "1800", sellingPrice: "2400", location: "Store D-2", description: "PT100 type thermocouple 100mm length with M12 thread", imageUrl: PRODUCT_IMAGES[2] },
    { sku: "CON-001", name: "Welding Rod E6013 2.5mm", category: "Consumables", quantity: "120", unit: "kg", reorderLevel: "30", costPrice: "95", sellingPrice: "125", location: "Warehouse A-3", description: "Carbon steel electrode E6013 2.5mm 5kg pack", imageUrl: PRODUCT_IMAGES[3] },
    { sku: "CON-002", name: "Industrial Grease EP2", category: "Consumables", quantity: "65", unit: "kg", reorderLevel: "20", costPrice: "185", sellingPrice: "240", location: "Store E-1", description: "Extreme pressure grease NLGI grade 2", imageUrl: PRODUCT_IMAGES[4] },
    { sku: "FAB-001", name: "Aluminum Angle 50x50x5", category: "Fabrication", quantity: "320", unit: "mtr", reorderLevel: "100", costPrice: "280", sellingPrice: "360", location: "Warehouse A-4", description: "Aluminum angle section 50x50x5mm", imageUrl: PRODUCT_IMAGES[0] },
    { sku: "FAB-002", name: "Channel Section ISMC 100", category: "Fabrication", quantity: "85", unit: "mtr", reorderLevel: "30", costPrice: "420", sellingPrice: "560", location: "Warehouse A-5", description: "ISMC 100 channel section mild steel IS2062", imageUrl: PRODUCT_IMAGES[1] },
    { sku: "SAF-001", name: "Safety Helmet Class A", category: "Safety", quantity: "45", unit: "nos", reorderLevel: "15", costPrice: "380", sellingPrice: "520", location: "Store F-1", description: "Industrial safety helmet ANSI Class A white color", imageUrl: PRODUCT_IMAGES[2] },
    { sku: "SAF-002", name: "Safety Harness Full Body", category: "Safety", quantity: "18", unit: "nos", reorderLevel: "5", costPrice: "1800", sellingPrice: "2400", location: "Store F-2", description: "Full body safety harness with lanyard IS3521", imageUrl: PRODUCT_IMAGES[3] },
    { sku: "TOL-001", name: "Vernier Caliper 150mm", category: "Tools", quantity: "12", unit: "nos", reorderLevel: "3", costPrice: "850", sellingPrice: "1100", location: "Store G-1", description: "Stainless steel vernier caliper 150mm digital", imageUrl: PRODUCT_IMAGES[4] },
    { sku: "TOL-002", name: "Torque Wrench 20-100Nm", category: "Tools", quantity: "6", unit: "nos", reorderLevel: "2", costPrice: "2800", sellingPrice: "3600", location: "Store G-2", description: "Click type torque wrench 20-100Nm 1/2 drive", imageUrl: PRODUCT_IMAGES[0] },
    { sku: "ELE-003", name: "Cable XLPE 25sqmm 4C", category: "Electrical", quantity: "850", unit: "mtr", reorderLevel: "200", costPrice: "185", sellingPrice: "240", location: "Warehouse B-3", description: "XLPE armored cable 25sqmm 4 core 1.1kV grade", imageUrl: PRODUCT_IMAGES[1] },
    { sku: "STL-003", name: "ERW Pipe 3 inch SCH40", category: "Raw Material", quantity: "0", unit: "mtr", reorderLevel: "50", costPrice: "520", sellingPrice: "680", location: "Warehouse A-6", description: "ERW carbon steel pipe 3 inch schedule 40 IS 1239", imageUrl: PRODUCT_IMAGES[2] },
    { sku: "FAB-003", name: "GI Sheet 0.8mm", category: "Fabrication", quantity: "190", unit: "kg", reorderLevel: "50", costPrice: "78", sellingPrice: "98", location: "Warehouse A-7", description: "Galvanized iron sheet 0.8mm IS 277", imageUrl: PRODUCT_IMAGES[3] },
    { sku: "CON-003", name: "Emery Paper 80 Grit", category: "Consumables", quantity: "240", unit: "nos", reorderLevel: "60", costPrice: "18", sellingPrice: "25", location: "Store E-2", description: "Silicon carbide emery paper 80 grit 230x280mm", imageUrl: PRODUCT_IMAGES[4] },
  ];

  while (inventoryData.length < 30) {
    const idx = inventoryData.length + 1;
    inventoryData.push({
      sku: `GEN-${String(idx).padStart(3, "0")}`,
      name: `Generic Item ${idx}`,
      category: ["Electrical", "Tools", "Consumables", "Fabrication", "Safety", "Hydraulics"][idx % 6],
      quantity: `${Math.floor(Math.random() * 500) + 5}`,
      unit: ["nos", "kg", "mtr"][idx % 3],
      reorderLevel: `${Math.floor(Math.random() * 75) + 10}`,
      costPrice: `${Math.floor(Math.random() * 2500) + 50}`,
      sellingPrice: `${Math.floor(Math.random() * 3000) + 80}`,
      location: `Store ${String.fromCharCode(65 + (idx % 6))}-${idx}`,
      description: `Generated inventory item ${idx} for seed data`,
      imageUrl: PRODUCT_IMAGES[idx % PRODUCT_IMAGES.length],
    });
  }

  const inventoryItems = await db.insert(inventoryTable).values(inventoryData).returning();

  // Inventory movements
  await db.insert(inventoryMovementsTable).values([
    { itemId: inventoryItems[0].id, type: "IN", quantity: "200", previousStock: "250", currentStock: "450", reference: "PO-001", notes: "New stock received", createdBy: "Nitin Agarwal" },
    { itemId: inventoryItems[2].id, type: "OUT", quantity: "3", previousStock: "15", currentStock: "12", reference: "BHEL Project", notes: "Issued for BHEL turbine project", createdBy: "Rajesh Sharma" },
    { itemId: inventoryItems[8].id, type: "IN", quantity: "60", previousStock: "60", currentStock: "120", reference: "PO-002", notes: "Welding rod restocking", createdBy: "Nitin Agarwal" },
    { itemId: inventoryItems[17].id, type: "OUT", quantity: "80", previousStock: "80", currentStock: "0", reference: "L&T Project", notes: "Issued for L&T piping project", createdBy: "Rajesh Sharma" },
    { itemId: inventoryItems[4].id, type: "OUT", quantity: "2", previousStock: "10", currentStock: "8", reference: "ONGC Project", notes: "Hydraulic cylinders for offshore platform", createdBy: "Deepak Mehta" },
  ]);

  // Generate attendance data for last 3 months
  const statuses = ["present", "present", "present", "present", "present", "late", "half_day", "absent", "sick_leave"];
  const today = new Date();
  const attendanceRecords: any[] = [];
  
  for (let monthOffset = 0; monthOffset < 3; monthOffset++) {
    const targetDate = new Date(today.getFullYear(), today.getMonth() - monthOffset, 1);
    const year = targetDate.getFullYear();
    const month = targetDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    for (const emp of employees.slice(0, 10)) {
      for (let day = 1; day <= Math.min(daysInMonth, monthOffset === 0 ? today.getDate() - 1 : daysInMonth); day++) {
        const date = new Date(year, month, day);
        const dow = date.getDay();
        if (dow === 0 || dow === 6) continue; // Skip weekends
        
        const status = statuses[Math.floor(Math.random() * statuses.length)];
        const checkIn = status === "present" ? "09:00" : status === "late" ? "10:30" : status === "half_day" ? "09:00" : undefined;
        const checkOut = status === "present" ? "18:00" : status === "late" ? "18:00" : status === "half_day" ? "13:00" : undefined;
        const hoursWorked = status === "present" || status === "late" ? "9" : status === "half_day" ? "4.5" : null;

        attendanceRecords.push({
          employeeId: emp.id,
          date: `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
          status,
          checkIn,
          checkOut,
          hoursWorked,
          markedBy: "System",
        });
      }
    }
  }
  
  if (attendanceRecords.length > 0) {
    for (let i = 0; i < attendanceRecords.length; i += 100) {
      await db.insert(attendanceTable).values(attendanceRecords.slice(i, i + 100));
    }
  }

  // Payroll (last 3 months)
  const payrollRecords: any[] = [];
  for (let monthOffset = 1; monthOffset <= 3; monthOffset++) {
    const d = new Date(today.getFullYear(), today.getMonth() - monthOffset, 1);
    const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    
    for (const emp of employees) {
      const gross = Number(emp.salary);
      const presentDays = Math.floor(Math.random() * 5) + 22;
      const absentDays = 26 - presentDays;
      const ratio = presentDays / 26;
      const basic = Math.round(gross * 0.6 * ratio);
      const hra = Math.round(gross * 0.2 * ratio);
      const allowances = Math.round(gross * 0.2 * ratio);
      const pf = emp.pfEnabled ? Math.min(Math.round(basic * 0.12), 1800) : 0;
      const esic = emp.esicEnabled ? Math.round((basic + hra) * 0.0075) : 0;
      const deductions = pf + esic;
      const net = basic + hra + allowances - deductions;

      payrollRecords.push({
        employeeId: emp.id,
        month: monthStr,
        basicSalary: String(basic),
        hra: String(hra),
        allowances: String(allowances),
        deductions: String(deductions),
        pf: String(pf),
        esic: String(esic),
        netSalary: String(net),
        status: monthOffset > 1 ? "paid" : "pending",
        presentDays,
        absentDays,
        totalWorkingDays: 26,
        formula: "basic",
        paidAt: monthOffset > 1 ? new Date(d.getFullYear(), d.getMonth() + 1, 5) : null,
      });
    }
  }
  if (payrollRecords.length > 0) {
    for (let i = 0; i < payrollRecords.length; i += 50) {
      await db.insert(payrollTable).values(payrollRecords.slice(i, i + 50));
    }
  }

  // Leaves
  const leaveTypes = ["Sick Leave", "Casual Leave", "Earned Leave", "Emergency Leave"];
  const leaveReasons = ["Medical treatment", "Family function", "Personal work", "Holiday travel", "Eye operation", "Child health", "Festival celebration"];
  
  await db.insert(leavesTable).values(
    Array.from({ length: 20 }, (_, i) => {
      const emp = employees[i % employees.length];
      const startDay = new Date(2024, Math.floor(Math.random() * 4), Math.floor(Math.random() * 20) + 1);
      const endDay = new Date(startDay.getTime() + (Math.floor(Math.random() * 3)) * 86400000);
      const days = Math.ceil((endDay.getTime() - startDay.getTime()) / 86400000) + 1;
      return {
        employeeId: emp.id,
        leaveType: leaveTypes[i % leaveTypes.length],
        startDate: startDay.toISOString().split("T")[0],
        endDate: endDay.toISOString().split("T")[0],
        days: String(days),
        reason: leaveReasons[i % leaveReasons.length],
        status: i < 5 ? "pending" : i < 15 ? "approved" : "rejected",
        approvedBy: i < 5 ? undefined : "Priya Verma",
      };
    })
  );

  // Expenses
  const expCategories = ["Travel", "Office Supplies", "Utilities", "Maintenance", "Marketing", "Software", "Training"];
  const expTitles = [
    "Site visit travel to BHEL Korba", "Stationery and printing supplies", "Electricity bill Q1", "Air compressor servicing",
    "LinkedIn ads for recruitment", "AutoCAD license renewal", "PLC training workshop", "Hotel for Pune client meeting",
    "Internet and connectivity charges", "Generator maintenance", "Google Workspace subscription", "Safety training program",
    "Travel expenses Mumbai trip", "Office furniture repair", "Water and sewage charges", "Welding equipment calibration",
    "Exhibition participation fee", "ERP software subscription", "Crane operator certification", "Bus tickets site visit",
  ];
  
  await db.insert(expensesTable).values(
    Array.from({ length: 20 }, (_, i) => {
      const d = new Date(2024, Math.floor(i / 5), (i % 20) + 1);
      return {
        title: expTitles[i],
        category: expCategories[i % expCategories.length],
        subCategory: i % 3 === 0 ? "Air Travel" : undefined,
        amount: String(Math.floor(Math.random() * 45000) + 5000),
        date: d.toISOString().split("T")[0],
        status: i < 4 ? "pending" : i < 16 ? "approved" : "rejected",
        projectId: i % 4 === 0 ? projects[i % projects.length].id : undefined,
        description: `${expTitles[i]} - expense claim`,
        submittedBy: employees[i % employees.length].firstName + " " + employees[i % employees.length].lastName,
      };
    })
  );

  // Revenue
  const revSources = ["Project Revenue", "Service Contract", "Spare Parts", "AMC", "Consulting"];
  const revTitles = [
    "BHEL Turbine Overhaul - Milestone 1", "L&T Piping Project Advance", "ONGC Platform Maintenance M1", "Infosys HVAC Design Fee",
    "Reliance Refinery Engineering Fee", "SAIL DCS Supply", "Equipment supply to Adani Ports", "Mahindra automation advance",
    "ABB switchgear project M1", "Bharat Forge press M1", "Annual maintenance contract BHEL", "AMC Renewal NTPC",
    "Spare parts supply Vedanta", "Spare parts supply Hindalco", "Consulting fee Siemens project",
    "Thermax heat exchanger final payment", "Punjab Tractors advance", "ONGC Platform M2 payment",
    "L&T Piping milestone 2", "Cummins test cell design fee"
  ];
  
  await db.insert(revenueTable).values(
    Array.from({ length: 20 }, (_, i) => {
      const d = new Date(2024, Math.floor(i / 2), (i % 20) + 1);
      return {
        title: revTitles[i],
        source: revSources[i % revSources.length],
        amount: String(Math.floor(Math.random() * 800000) + 200000),
        date: d.toISOString().split("T")[0],
        customerId: customers[i % customers.length].id,
        projectId: projects[i % projects.length].id,
        description: `${revTitles[i]} payment received`,
      };
    })
  );

  // Invoices
  const invItems = [
    [{ description: "Engineering Design Services", quantity: 1, unitPrice: 350000, taxRate: 18 }, { description: "Site Supervision", quantity: 3, unitPrice: 45000, taxRate: 18 }],
    [{ description: "Supply of Piping Materials", quantity: 1, unitPrice: 680000, taxRate: 18 }, { description: "Installation charges", quantity: 1, unitPrice: 180000, taxRate: 18 }],
    [{ description: "Turbine Overhaul Services", quantity: 1, unitPrice: 850000, taxRate: 18 }],
    [{ description: "HVAC Equipment Supply", quantity: 1, unitPrice: 420000, taxRate: 18 }, { description: "Installation & Commissioning", quantity: 1, unitPrice: 120000, taxRate: 18 }],
    [{ description: "Process Equipment", quantity: 1, unitPrice: 1200000, taxRate: 18 }],
  ];
  
  const invoices = await db.insert(invoicesTable).values(
    Array.from({ length: 20 }, (_, i) => {
      const items = invItems[i % invItems.length];
      const processed = items.map((item, idx) => ({ id: idx + 1, ...item, total: item.quantity * item.unitPrice * (1 + item.taxRate / 100) }));
      const subtotal = items.reduce((s, item) => s + item.quantity * item.unitPrice, 0);
      const taxAmount = items.reduce((s, item) => s + item.quantity * item.unitPrice * item.taxRate / 100, 0);
      const total = subtotal + taxAmount;
      const d = new Date(2024, Math.floor(i / 2), (i % 20) + 1);
      const due = new Date(d.getTime() + 30 * 86400000);
      const statuses = ["paid", "paid", "paid", "sent", "sent", "draft", "overdue", "partial"];
      return {
        invoiceNumber: `INV-2024-${String(i + 1).padStart(3, "0")}`,
        customerId: customers[i % customers.length].id,
        projectId: String(projects[i % projects.length].id),
        status: statuses[i % statuses.length],
        issueDate: d.toISOString().split("T")[0],
        dueDate: due.toISOString().split("T")[0],
        subtotal: String(subtotal),
        taxAmount: String(taxAmount),
        totalAmount: String(total),
        paidAmount: statuses[i % statuses.length] === "paid" ? String(total) : statuses[i % statuses.length] === "partial" ? String(total * 0.5) : "0",
        items: processed,
        scopeDefinition: "Engineering, procurement and construction as per approved drawings",
        timePeriod: "12 months from date of PO",
        notes: "Payment within 30 days of invoice date. Interest @18% pa on delayed payments.",
        termsConditions: "1. Prices are exclusive of applicable taxes\n2. Payment within 30 days\n3. Dispute resolution by arbitration",
      };
    })
  ).returning();

  const purchaseOrders = await db.insert(purchaseOrdersTable).values(
    Array.from({ length: 20 }, (_, i) => {
      const items = [{ id: 1, itemName: inventoryItems[i % inventoryItems.length].name, quantity: Math.floor(Math.random() * 50) + 10, unitPrice: Number(inventoryItems[i % inventoryItems.length].costPrice), total: 0 }];
      items[0].total = items[0].quantity * items[0].unitPrice;
      const total = items[0].total;
      const d = new Date(2024, Math.floor(i / 2), (i % 20) + 1);
      const delivery = new Date(d.getTime() + 21 * 86400000);
      const statuses = ["approved", "approved", "received", "pending", "draft", "cancelled"];
      return {
        poNumber: `PO-2024-${String(i + 1).padStart(3, "0")}`,
        customerId: customers[i % customers.length].id,
        projectId: i % 3 === 0 ? String(projects[i % projects.length].id) : undefined,
        status: statuses[i % statuses.length],
        orderDate: d.toISOString().split("T")[0],
        deliveryDate: delivery.toISOString().split("T")[0],
        totalAmount: String(total),
        items,
        notes: "Delivery within 21 days. Quality certificate required with each shipment.",
        scopeDefinition: "Supply as per technical specifications enclosed",
        timePeriod: "21 days ARO",
      };
    })
  ).returning();

  const customerInvoiceTotals = new Map<number, { debit: number; credit: number }>();
  const projectInvoiceTotals = new Map<number, { debit: number; credit: number }>();

  invoices.forEach((invoice) => {
    const invoiceTotal = Number(invoice.totalAmount || 0);
    const paidAmount = Number(invoice.paidAmount || 0);
    const customerId = invoice.customerId;
    const projectId = Number(invoice.projectId) || 0;

    const customerTotals = customerInvoiceTotals.get(customerId) || { debit: 0, credit: 0 };
    customerTotals.debit += invoiceTotal;
    customerTotals.credit += paidAmount;
    customerInvoiceTotals.set(customerId, customerTotals);

    if (projectId) {
      const projectTotals = projectInvoiceTotals.get(projectId) || { debit: 0, credit: 0 };
      projectTotals.debit += invoiceTotal;
      projectTotals.credit += paidAmount;
      projectInvoiceTotals.set(projectId, projectTotals);
    }
  });

  const ledgerAccountsToInsert = [
    ...Array.from(customerInvoiceTotals.entries()).map(([customerId, totals]) => ({
      accountName: `Receivables - ${customers.find((c) => c.id === customerId)?.company || `Customer ${customerId}`}`,
      accountCode: `AR-${customerId}`,
      accountType: "Asset",
      description: `Customer ledger for receivables from customer ${customerId}`,
      openingBalance: "0",
      closingBalance: String(Math.max(0, totals.debit - totals.credit)),
      currentBalance: String(Math.max(0, totals.debit - totals.credit)),
      startDate: "2024-01-01",
      status: "active",
    })),
    ...Array.from(projectInvoiceTotals.entries()).map(([projectId, totals]) => ({
      accountName: `Project Ledger - ${projects.find((p) => p.id === projectId)?.name || `Project ${projectId}`}`,
      accountCode: `PRJ-${projectId}`,
      accountType: "Income",
      description: `Project ledger for invoices billed on project ${projectId}`,
      openingBalance: "0",
      closingBalance: String(Math.max(0, totals.debit - totals.credit)),
      currentBalance: String(Math.max(0, totals.debit - totals.credit)),
      startDate: "2024-01-01",
      status: "active",
    })),
  ];

  const ledgerAccounts = await db.insert(ledgerTable).values(ledgerAccountsToInsert).returning();

  const ledgerAccountIdByCustomer = new Map<number, number>();
  const ledgerAccountIdByProject = new Map<number, number>();

  ledgerAccounts.forEach((ledger) => {
    if (ledger.accountCode.startsWith("AR-")) {
      ledgerAccountIdByCustomer.set(Number(ledger.accountCode.replace("AR-", "")), ledger.id);
    }
    if (ledger.accountCode.startsWith("PRJ-")) {
      ledgerAccountIdByProject.set(Number(ledger.accountCode.replace("PRJ-", "")), ledger.id);
    }
  });

  const ledgerTransactions = [
    ...invoices.flatMap((invoice) => {
      const invoiceTotal = Number(invoice.totalAmount || 0);
      const paidAmount = Number(invoice.paidAmount || 0);
      const customerLedgerId = ledgerAccountIdByCustomer.get(invoice.customerId);
      const projectLedgerId = ledgerAccountIdByProject.get(Number(invoice.projectId) || 0);
      const transactionDate = invoice.issueDate;

      const transactions: any[] = [];
      if (customerLedgerId) {
        transactions.push({
          ledgerId: customerLedgerId,
          transactionDate,
          description: `Invoice ${invoice.invoiceNumber}`,
          debit: invoiceTotal,
          credit: paidAmount,
          referenceNumber: invoice.invoiceNumber,
          module: "invoices",
          moduleId: invoice.id,
        });
      }
      if (projectLedgerId) {
        transactions.push({
          ledgerId: projectLedgerId,
          transactionDate,
          description: `Invoice ${invoice.invoiceNumber}`,
          debit: invoiceTotal,
          credit: paidAmount,
          referenceNumber: invoice.invoiceNumber,
          module: "invoices",
          moduleId: invoice.id,
        });
      }
      return transactions;
    }),
    ...purchaseOrders.flatMap((po) => {
      const customerLedgerId = ledgerAccountIdByCustomer.get(po.customerId);
      const transactionDate = po.orderDate;
      return customerLedgerId ? [{
        ledgerId: customerLedgerId,
        transactionDate,
        description: `Purchase Order ${po.poNumber}`,
        debit: 0,
        credit: Number(po.totalAmount || 0),
        referenceNumber: po.poNumber,
        module: "purchase_orders",
        moduleId: po.id,
      }] : [];
    }),
  ];

  if (ledgerTransactions.length) {
    for (let i = 0; i < ledgerTransactions.length; i += 100) {
      await db.insert(ledgerTransactionTable).values(ledgerTransactions.slice(i, i + 100));
    }
  }

  // Admin user
  const hash = crypto.createHash("sha256").update("admin123" + "erp_salt_2024").digest("hex");
  const existingUser = await db.select().from(usersTable).where(eq(usersTable.email, "admin@elitemek.com")).limit(1);
  if (existingUser.length === 0) {
    await db.insert(usersTable).values({ name: "Administrator", email: "admin@elitemek.com", passwordHash: hash, role: "admin" });
  } else {
    await db.update(usersTable).set({ passwordHash: hash, role: "admin" }).where(eq(usersTable.email, "admin@elitemek.com"));
  }

  console.log("✅ Seed completed successfully!");
  console.log(`  Employees: ${employees.length}`);
  console.log(`  Customers: ${customers.length}`);
  console.log(`  Vendors: ${vendors.length}`);
  console.log(`  Projects: ${projects.length}`);
  console.log(`  Inventory: ${inventoryItems.length}`);
  console.log(`  Attendance: ${attendanceRecords.length}`);
  console.log(`  Payroll: ${payrollRecords.length}`);
  console.log(`  Admin login: admin@elitemek.com / admin123`);
}

const mode = process.argv[2]?.toLowerCase();

if (mode === "purchase-orders" || mode === "po") {
  seedPurchaseOrdersOnly().catch((e) => {
    console.error(e);
    process.exit(1);
  });
} else {
  seed().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
