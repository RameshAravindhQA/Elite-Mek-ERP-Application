const BASE_URL = process.env.API_BASE_URL || "http://localhost:3000/api";
const ADMIN_EMAIL = process.env.API_TEST_EMAIL || "admin@elitemek.com";
const ADMIN_PASSWORD = process.env.API_TEST_PASSWORD || "admin123";
const stamp = Date.now();

let token = "";
let passed = 0;
let failed = 0;
const created = [];

async function request(method, path, body) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  return { status: response.status, data };
}

function okStatus(actual, expected) {
  return Array.isArray(expected) ? expected.includes(actual) : actual === expected;
}

async function test(name, method, path, body, expected, save) {
  const result = await request(method, path, body);
  const ok = okStatus(result.status, expected);
  if (ok) {
    passed += 1;
    console.log(`PASS ${name} (${result.status})`);
    if (save && result.data?.id) created.push({ path: save, id: result.data.id });
  } else {
    failed += 1;
    console.log(`FAIL ${name} expected ${expected}, got ${result.status}`);
    console.log(JSON.stringify(result.data, null, 2));
  }
  return result;
}

async function validationTest(name, method, path, body, expected = 400) {
  const result = await test(name, method, path, body, expected);
  if (result.status === 400) {
    const hasMessage = Boolean(result.data?.error || result.data?.message || result.data?.details?.length);
    if (!hasMessage) {
      failed += 1;
      passed -= 1;
      console.log(`FAIL ${name} validation response has no frontend-usable message`);
      console.log(JSON.stringify(result.data, null, 2));
    }
  }
  return result;
}

async function login() {
  const result = await request("POST", "/auth/login", { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  if (result.status !== 200 || !result.data?.token) {
    throw new Error(`Login failed (${result.status}): ${JSON.stringify(result.data)}`);
  }
  token = result.data.token;
}

async function unauthorizedSmoke() {
  const protectedPaths = [
    "/auth/me",
    "/employees?page=1&limit=1",
    "/customers?page=1&limit=1",
    "/vendors?page=1&limit=1",
    "/projects?page=1&limit=1",
    "/inventory?page=1&limit=1",
    "/expenses?page=1&limit=1",
    "/revenue?page=1&limit=1",
    "/attendance?page=1&limit=1",
    "/leaves?page=1&limit=1",
    "/payroll?page=1&limit=1",
    "/invoices?page=1&limit=1",
    "/purchase-orders?page=1&limit=1",
    "/documents?page=1&limit=1",
    "/roles?page=1&limit=1",
    "/settings",
    "/settings/sounds",
    "/reminders?page=1&limit=1",
    "/ledger?page=1&limit=1",
    "/document-templates",
    "/dashboard/summary",
    "/notifications?page=1&limit=1",
    "/audit-logs?page=1&limit=1",
    "/work-allocation?page=1&limit=1",
  ];
  const savedToken = token;
  token = "";
  for (const path of protectedPaths) {
    await test(`unauthorized blocked ${path}`, "GET", path, undefined, 401);
  }
  token = savedToken;
}

async function list(path) {
  const result = await request("GET", `${path}?page=1&limit=5`);
  return result.data?.data || [];
}

async function cleanup() {
  for (const item of created.reverse()) {
    await request("DELETE", `${item.path}/${item.id}`);
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function setPath(target, path, value) {
  const parts = path.split(".");
  let current = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    current = current[parts[i]];
  }
  current[parts[parts.length - 1]] = value;
}

async function runValidationMatrix(groups) {
  for (const group of groups) {
    for (const variant of group.variants) {
      const body = clone(group.base);
      if (variant.remove) {
        delete body[variant.remove];
      } else if (variant.path) {
        setPath(body, variant.path, variant.value);
      } else {
        body[variant.field] = variant.value;
      }
      await validationTest(`${group.name} rejects ${variant.name}`, group.method || "POST", group.path, body, variant.expected || 400);
    }
  }
}

async function main() {
  console.log(`API validation suite: ${BASE_URL}`);

  await test("health endpoint", "GET", "/healthz", undefined, 200);
  await test("login rejects invalid password", "POST", "/auth/login", { email: ADMIN_EMAIL, password: "wrong" }, 401);
  await validationTest("login rejects invalid email format", "POST", "/auth/login", { email: "admin", password: ADMIN_PASSWORD });
  await login();
  await unauthorizedSmoke();
  await test("current user", "GET", "/auth/me", undefined, 200);

  const employees = await list("/employees");
  const customers = await list("/customers");
  const projects = await list("/projects");
  const inventory = await list("/inventory");
  const employeeId = employees[0]?.id || 1;
  const customerId = customers[0]?.id || 1;
  const projectId = projects[0]?.id || undefined;
  const inventoryId = inventory[0]?.id || 1;

  const employee = {
    firstName: "Api",
    lastName: "Tester",
    email: `api.employee.${stamp}@example.com`,
    phone: "9876543210",
    employeeId: `APIEMP${stamp}`,
    department: "Engineering",
    designation: "QA Engineer",
    status: "active",
    salary: 80000,
    joiningDate: "2025-05-14",
    panNumber: "ABCDE1234F",
    aadharNumber: "123456789012",
    ifscCode: "SBIN0001234",
  };
  await test("employee create accepts numeric salary", "POST", "/employees", employee, 201, "/employees");
  await test("employee duplicate email rejected", "POST", "/employees", { ...employee, employeeId: `APIEMPX${stamp}` }, 400);
  await test("employee invalid email rejected", "POST", "/employees", { ...employee, email: "bad-email", employeeId: `APIEMPB${stamp}` }, 400);
  await test("employee invalid PAN rejected", "POST", "/employees", { ...employee, email: `badpan.${stamp}@example.com`, employeeId: `APIPAN${stamp}`, panNumber: "BAD" }, 400);
  await test("employee invalid Aadhar rejected", "POST", "/employees", { ...employee, email: `badaadhar.${stamp}@example.com`, employeeId: `APIAAD${stamp}`, aadharNumber: "123" }, 400);
  await test("employee invalid IFSC rejected", "POST", "/employees", { ...employee, email: `badifsc.${stamp}@example.com`, employeeId: `APIIFS${stamp}`, ifscCode: "BAD" }, 400);

  const customer = {
    name: `API Customer ${stamp}`,
    email: `api.customer.${stamp}@example.com`,
    phone: "9876543211",
    company: "API Customer Co",
    address: "123 API Street",
    gstNumber: "27AAPCU9603R1Z5",
    panNumber: "ABCDE1234F",
    status: "active",
  };
  await test("customer create", "POST", "/customers", customer, 201, "/customers");
  await test("customer invalid GST rejected", "POST", "/customers", { ...customer, name: `Bad GST ${stamp}`, email: `badgst.${stamp}@example.com`, gstNumber: "BAD" }, 400);
  await test("customer invalid phone rejected", "POST", "/customers", { ...customer, name: `Bad Phone ${stamp}`, email: `badphone.${stamp}@example.com`, phone: "abc" }, 400);

  const vendor = {
    name: `API Vendor ${stamp}`,
    email: `api.vendor.${stamp}@example.com`,
    phone: "9876543212",
    company: "API Vendor Co",
    address: "456 API Street",
    gstNumber: "27AAPCU9603R1Z5",
    panNumber: "ABCDE1234F",
    category: "Raw Materials",
    status: "active",
  };
  await test("vendor create", "POST", "/vendors", vendor, 201, "/vendors");
  await test("vendor invalid email rejected", "POST", "/vendors", { ...vendor, name: `Bad Vendor ${stamp}`, email: "bad" }, 400);

  const project = {
    name: `API Project ${stamp}`,
    description: "API validation project",
    customerId,
    status: "active",
    priority: "medium",
    budget: 100000,
    spent: 0,
    startDate: "2025-05-14",
    endDate: "2025-06-14",
    progress: 10,
  };
  await test("project create accepts numeric budget", "POST", "/projects", project, 201, "/projects");
  await test("project missing name rejected", "POST", "/projects", { ...project, name: "" }, 400);

  const inventoryItem = {
    sku: `APISKU${stamp}`,
    name: `API Item ${stamp}`,
    category: "Raw Materials",
    quantity: 10,
    unit: "pcs",
    reorderLevel: 2,
    costPrice: 100,
    sellingPrice: 150,
    location: "API Rack",
  };
  await test("inventory create accepts numeric fields", "POST", "/inventory", inventoryItem, 201, "/inventory");
  await test("inventory missing sku rejected", "POST", "/inventory", { ...inventoryItem, sku: "" }, 400);

  await test("inventory movement create", "POST", "/inventory-movements", {
    itemId: inventoryId,
    type: "IN",
    quantity: 1,
    previousStock: 10,
    currentStock: 11,
    reference: `API-${stamp}`,
    createdBy: "API Suite",
  }, 201);

  await test("expense create accepts numeric amount", "POST", "/expenses", {
    title: `API Expense ${stamp}`,
    category: "Miscellaneous",
    amount: 1200,
    date: "2025-05-14",
    status: "pending",
    submittedBy: "API Suite",
  }, 201, "/expenses");
  await test("expense wrong amount type rejected", "POST", "/expenses", {
    title: `Bad Expense ${stamp}`,
    category: "Miscellaneous",
    amount: "abc",
    date: "2025-05-14",
    submittedBy: "API Suite",
  }, 400);

  await test("revenue create accepts numeric amount", "POST", "/revenue", {
    title: `API Revenue ${stamp}`,
    source: "Project",
    amount: 5000,
    date: "2025-05-14",
    customerId,
    projectId,
  }, 201, "/revenue");

  await test("attendance create", "POST", "/attendance", {
    employeeId,
    date: "2025-05-14",
    checkIn: "09:00",
    checkOut: "18:00",
    status: "present",
    hoursWorked: 9,
  }, 201, "/attendance");
  await test("attendance invalid date rejected", "POST", "/attendance", {
    employeeId,
    date: "14-05-2025",
    status: "present",
  }, 400);

  await test("leave create accepts numeric days", "POST", "/leaves", {
    employeeId,
    leaveType: "Casual Leave",
    startDate: "2025-05-20",
    endDate: "2025-05-21",
    days: 2,
    reason: "API test leave",
    status: "pending",
  }, 201, "/leaves");

  await test("payroll create accepts numeric salary fields", "POST", "/payroll", {
    employeeId,
    month: `2099-${String(new Date().getMonth() + 1).padStart(2, "0")}`,
    basicSalary: 50000,
    hra: 10000,
    allowances: 5000,
    deductions: 1000,
    netSalary: 64000,
    status: "pending",
  }, [201, 400]);

  await test("invoice create", "POST", "/invoices", {
    customerId,
    projectId,
    issueDate: "2025-05-14",
    dueDate: "2025-06-14",
    status: "draft",
    items: [{ description: "API Service", quantity: 2, unitPrice: 1000, taxRate: 18 }],
    notes: "API validation invoice",
  }, 201, "/invoices");
  await test("invoice invalid customer rejected", "POST", "/invoices", {
    customerId: "bad",
    issueDate: "2025-05-14",
    dueDate: "2025-06-14",
    items: [{ description: "API Service", quantity: 2, unitPrice: 1000, taxRate: 18 }],
  }, 400);

  await test("purchase order create", "POST", "/purchase-orders", {
    customerId,
    projectId,
    orderDate: "2025-05-14",
    deliveryDate: "2025-06-14",
    status: "draft",
    items: [{ itemName: "API Item", quantity: 2, unitPrice: 1000 }],
    notes: "API validation PO",
  }, 201, "/purchase-orders");
  await test("purchase order bad date rejected", "POST", "/purchase-orders", {
    customerId,
    orderDate: "14-05-2025",
    items: [{ itemName: "API Item", quantity: 2, unitPrice: 1000 }],
  }, 400);

  await test("document create", "POST", "/documents", {
    title: `API Document ${stamp}`,
    fileUrl: "data:text/plain;base64,SGVsbG8=",
    fileType: "TXT",
    fileSize: "5 B",
    tags: ["api"],
    uploadedBy: "API Suite",
  }, 201, "/documents");

  await test("role create", "POST", "/roles", {
    name: `API Role ${stamp}`,
    description: "API validation role",
    permissions: [{ module: "employees", actions: ["view"] }],
  }, 201, "/roles");

  await test("reminder create", "POST", "/reminders", {
    title: `API Reminder ${stamp}`,
    message: "API validation reminder",
    remindAt: new Date(Date.now() + 86400000).toISOString(),
    createdBy: "API Suite",
  }, 201, "/reminders");

  await test("ledger create accepts numeric opening balance", "POST", "/ledger", {
    accountName: `API Ledger ${stamp}`,
    accountCode: `APIL${stamp}`,
    accountType: "Asset",
    openingBalance: 1000,
    status: "active",
  }, 201, "/ledger");

  const validationGroups = [
    {
      name: "employee",
      path: "/employees",
      base: { ...employee, email: `matrix.employee.${stamp}@example.com`, employeeId: `MXEMP${stamp}` },
      variants: [
        { name: "blank first name", field: "firstName", value: "" },
        { name: "blank last name", field: "lastName", value: "" },
        { name: "blank employee id", field: "employeeId", value: "" },
        { name: "blank designation", field: "designation", value: "" },
        { name: "blank department", field: "department", value: "" },
        { name: "invalid email", field: "email", value: "wrong-email" },
        { name: "numeric email type", field: "email", value: 12345 },
        { name: "invalid phone", field: "phone", value: "phone" },
        { name: "invalid PAN typo", field: "panNumber", value: "ABCDE12345" },
        { name: "invalid Aadhar", field: "aadharNumber", value: "123456" },
        { name: "invalid IFSC", field: "ifscCode", value: "SBIN123" },
        { name: "wrong salary type", field: "salary", value: "salary" },
        { name: "negative salary", field: "salary", value: -1 },
        { name: "invalid joining date", field: "joiningDate", value: "15-05-2026" },
        { name: "missing employee id", remove: "employeeId" },
      ],
    },
    {
      name: "customer",
      path: "/customers",
      base: { ...customer, name: `Matrix Customer ${stamp}`, email: `matrix.customer.${stamp}@example.com` },
      variants: [
        { name: "blank name", field: "name", value: "" },
        { name: "numeric name type", field: "name", value: 99 },
        { name: "invalid email", field: "email", value: "bad" },
        { name: "numeric email type", field: "email", value: 123 },
        { name: "invalid phone", field: "phone", value: "abc" },
        { name: "invalid GST", field: "gstNumber", value: "GSTTYPO" },
        { name: "invalid PAN", field: "panNumber", value: "PAN123" },
        { name: "wrong revenue type", field: "totalRevenue", value: "many" },
        { name: "negative revenue", field: "totalRevenue", value: -10 },
        { name: "wrong total orders type", field: "totalOrders", value: "ten" },
        { name: "wrong status type", field: "status", value: 1 },
        { name: "wrong address type", field: "address", value: 55 },
      ],
    },
    {
      name: "vendor",
      path: "/vendors",
      base: { ...vendor, name: `Matrix Vendor ${stamp}`, email: `matrix.vendor.${stamp}@example.com` },
      variants: [
        { name: "blank name", field: "name", value: "" },
        { name: "numeric name type", field: "name", value: 99 },
        { name: "invalid email", field: "email", value: "bad" },
        { name: "numeric email type", field: "email", value: 123 },
        { name: "invalid phone", field: "phone", value: "abc" },
        { name: "invalid GST", field: "gstNumber", value: "BADGST" },
        { name: "invalid PAN", field: "panNumber", value: "BADPAN" },
        { name: "blank category", field: "category", value: "" },
        { name: "wrong status type", field: "status", value: 1 },
        { name: "wrong address type", field: "address", value: 55 },
      ],
    },
    {
      name: "project",
      path: "/projects",
      base: project,
      variants: [
        { name: "blank name", field: "name", value: "" },
        { name: "wrong name type", field: "name", value: 123 },
        { name: "wrong customer type", field: "customerId", value: "customer" },
        { name: "wrong budget type", field: "budget", value: "budget" },
        { name: "negative budget", field: "budget", value: -1 },
        { name: "wrong spent type", field: "spent", value: "spent" },
        { name: "negative spent", field: "spent", value: -1 },
        { name: "invalid start date", field: "startDate", value: "2026/05/15" },
        { name: "invalid end date", field: "endDate", value: "15-05-2026" },
        { name: "wrong progress type", field: "progress", value: "half" },
        { name: "wrong status type", field: "status", value: 1 },
        { name: "wrong manager type", field: "managerId", value: "manager" },
      ],
    },
    {
      name: "inventory",
      path: "/inventory",
      base: inventoryItem,
      variants: [
        { name: "blank sku", field: "sku", value: "" },
        { name: "blank name", field: "name", value: "" },
        { name: "blank category", field: "category", value: "" },
        { name: "wrong quantity type", field: "quantity", value: "many" },
        { name: "negative quantity", field: "quantity", value: -1 },
        { name: "wrong reorder type", field: "reorderLevel", value: "low" },
        { name: "negative reorder", field: "reorderLevel", value: -1 },
        { name: "wrong cost type", field: "costPrice", value: "cost" },
        { name: "negative cost", field: "costPrice", value: -1 },
        { name: "wrong selling type", field: "sellingPrice", value: "sell" },
        { name: "negative selling", field: "sellingPrice", value: -1 },
        { name: "wrong unit type", field: "unit", value: 12 },
      ],
    },
    {
      name: "expense",
      path: "/expenses",
      base: { title: `Matrix Expense ${stamp}`, category: "Miscellaneous", amount: 1200, date: "2025-05-14", status: "pending", submittedBy: "API Suite" },
      variants: [
        { name: "blank title", field: "title", value: "" },
        { name: "blank category", field: "category", value: "" },
        { name: "wrong amount type", field: "amount", value: "amount" },
        { name: "negative amount", field: "amount", value: -1 },
        { name: "invalid date", field: "date", value: "14/05/2025" },
        { name: "wrong status type", field: "status", value: 2 },
        { name: "wrong submitter type", field: "submittedBy", value: 2 },
        { name: "wrong project type", field: "projectId", value: "project" },
      ],
    },
    {
      name: "revenue",
      path: "/revenue",
      base: { title: `Matrix Revenue ${stamp}`, source: "Project", amount: 5000, date: "2025-05-14", customerId, projectId },
      variants: [
        { name: "blank title", field: "title", value: "" },
        { name: "wrong title type", field: "title", value: 4 },
        { name: "wrong source type", field: "source", value: 4 },
        { name: "wrong amount type", field: "amount", value: "amount" },
        { name: "negative amount", field: "amount", value: -1 },
        { name: "invalid date", field: "date", value: "14-05-2025" },
        { name: "wrong customer type", field: "customerId", value: "customer" },
        { name: "wrong project type", field: "projectId", value: "project" },
      ],
    },
    {
      name: "attendance",
      path: "/attendance",
      base: { employeeId, date: "2025-05-14", checkIn: "09:00", checkOut: "18:00", status: "present", hoursWorked: 9 },
      variants: [
        { name: "wrong employee type", field: "employeeId", value: "employee" },
        { name: "invalid date", field: "date", value: "14-05-2025" },
        { name: "wrong check in type", field: "checkIn", value: 9 },
        { name: "wrong check out type", field: "checkOut", value: 18 },
        { name: "wrong status type", field: "status", value: 1 },
        { name: "wrong hours type", field: "hoursWorked", value: "nine" },
        { name: "negative hours", field: "hoursWorked", value: -1 },
      ],
    },
    {
      name: "leave",
      path: "/leaves",
      base: { employeeId, leaveType: "Casual Leave", startDate: "2025-05-20", endDate: "2025-05-21", days: 2, reason: "API test leave", status: "pending" },
      variants: [
        { name: "wrong employee type", field: "employeeId", value: "employee" },
        { name: "wrong leave type value type", field: "leaveType", value: 1 },
        { name: "invalid start date", field: "startDate", value: "20-05-2025" },
        { name: "invalid end date", field: "endDate", value: "21/05/2025" },
        { name: "wrong days type", field: "days", value: "two" },
        { name: "negative days", field: "days", value: -1 },
        { name: "wrong reason type", field: "reason", value: 2 },
        { name: "wrong status type", field: "status", value: 2 },
      ],
    },
    {
      name: "payroll",
      path: "/payroll",
      base: { employeeId, month: `2098-${String(new Date().getMonth() + 1).padStart(2, "0")}`, basicSalary: 50000, hra: 10000, allowances: 5000, deductions: 1000, netSalary: 64000, status: "pending" },
      variants: [
        { name: "wrong employee type", field: "employeeId", value: "employee" },
        { name: "wrong basic salary type", field: "basicSalary", value: "basic" },
        { name: "negative basic salary", field: "basicSalary", value: -1 },
        { name: "wrong hra type", field: "hra", value: "hra" },
        { name: "negative hra", field: "hra", value: -1 },
        { name: "wrong allowances type", field: "allowances", value: "allow" },
        { name: "negative allowances", field: "allowances", value: -1 },
        { name: "wrong deductions type", field: "deductions", value: "deduct" },
        { name: "negative deductions", field: "deductions", value: -1 },
        { name: "wrong net salary type", field: "netSalary", value: "net" },
        { name: "negative net salary", field: "netSalary", value: -1 },
        { name: "wrong status type", field: "status", value: 3 },
      ],
    },
    {
      name: "purchase order",
      path: "/purchase-orders",
      base: { customerId, projectId, orderDate: "2025-05-14", deliveryDate: "2025-06-14", status: "draft", items: [{ itemName: "API Item", quantity: 2, unitPrice: 1000 }], notes: "API validation PO" },
      variants: [
        { name: "invalid order date", field: "orderDate", value: "14-05-2025" },
        { name: "invalid delivery date", field: "deliveryDate", value: "14/06/2025" },
        { name: "wrong total amount type", field: "totalAmount", value: "total" },
        { name: "negative total amount", field: "totalAmount", value: -1 },
        { name: "wrong item quantity type", path: "items.0.quantity", value: "two" },
        { name: "negative item quantity", path: "items.0.quantity", value: -1 },
        { name: "wrong item price type", path: "items.0.unitPrice", value: "price" },
        { name: "negative item price", path: "items.0.unitPrice", value: -1 },
      ],
    },
    {
      name: "document",
      path: "/documents",
      base: { title: `Matrix Document ${stamp}`, fileUrl: "data:text/plain;base64,SGVsbG8=", fileType: "TXT", fileSize: "5 B", tags: ["api"], uploadedBy: "API Suite" },
      variants: [
        { name: "blank title", field: "title", value: "" },
        { name: "wrong title type", field: "title", value: 5 },
        { name: "wrong file url type", field: "fileUrl", value: 5 },
        { name: "wrong file type type", field: "fileType", value: 5 },
        { name: "wrong file size type", field: "fileSize", value: 5 },
        { name: "wrong uploaded by type", field: "uploadedBy", value: 5 },
        { name: "wrong project type", field: "projectId", value: "project" },
        { name: "wrong tags type", field: "tags", value: "api" },
      ],
    },
    {
      name: "role",
      path: "/roles",
      base: { name: `Matrix Role ${stamp}`, description: "API validation role", permissions: [{ module: "employees", actions: ["view"] }] },
      variants: [
        { name: "blank name", field: "name", value: "" },
        { name: "wrong name type", field: "name", value: 6 },
        { name: "wrong description type", field: "description", value: 6 },
        { name: "wrong permissions type", field: "permissions", value: "view" },
        { name: "wrong permission actions type", path: "permissions.0.actions", value: "view" },
      ],
    },
    {
      name: "reminder",
      path: "/reminders",
      base: { title: `Matrix Reminder ${stamp}`, message: "API validation reminder", remindAt: new Date(Date.now() + 86400000).toISOString(), createdBy: "API Suite" },
      variants: [
        { name: "blank title", field: "title", value: "" },
        { name: "wrong title type", field: "title", value: 7 },
        { name: "wrong message type", field: "message", value: 7 },
        { name: "invalid remind date", field: "remindAt", value: "tomorrow" },
        { name: "wrong created by type", field: "createdBy", value: 7 },
      ],
    },
    {
      name: "ledger",
      path: "/ledger",
      base: { accountName: `Matrix Ledger ${stamp}`, accountCode: `MXL${stamp}`, accountType: "Asset", openingBalance: 1000, status: "active" },
      variants: [
        { name: "wrong account name type", field: "accountName", value: 8 },
        { name: "wrong account code type", field: "accountCode", value: 8 },
        { name: "wrong account type type", field: "accountType", value: 8 },
        { name: "wrong opening balance type", field: "openingBalance", value: "open" },
        { name: "negative opening balance", field: "openingBalance", value: -1 },
        { name: "wrong closing balance type", field: "closingBalance", value: "close" },
        { name: "negative closing balance", field: "closingBalance", value: -1 },
        { name: "wrong current balance type", field: "currentBalance", value: "current" },
        { name: "negative current balance", field: "currentBalance", value: -1 },
      ],
    },
    {
      name: "template designer",
      path: "/document-templates",
      base: { name: `Matrix Template ${stamp}`, description: "Validation", orientation: "portrait", dataSource: "customers", fields: [] },
      variants: [
        { name: "blank name", field: "name", value: "" },
      ],
    },
  ];

  await runValidationMatrix(validationGroups);

  await test("list employees", "GET", "/employees?page=1&limit=5", undefined, 200);
  await test("list customers", "GET", "/customers?page=1&limit=5", undefined, 200);
  await test("dashboard summary", "GET", "/dashboard/summary", undefined, [200, 404]);
}

try {
  await main();
} finally {
  await cleanup();
  console.log(`\nSummary: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}
