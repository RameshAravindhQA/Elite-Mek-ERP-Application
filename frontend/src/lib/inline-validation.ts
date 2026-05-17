import { getFieldValidationErrors, type FieldValidationError } from "./error-utils";

type Control = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

const MESSAGE_ATTR = "data-inline-validation-message";
const ERROR_CLASS = "border-destructive focus-visible:ring-destructive";

const FIELD_LABELS: Record<string, string> = {
  aadharNumber: "Aadhar number",
  bankAccount: "Bank account",
  basicSalary: "Basic salary",
  costPrice: "Cost price",
  customerId: "Customer",
  dueDate: "Due date",
  employeeId: "Employee",
  firstName: "First name",
  gstNumber: "GST number",
  ifscCode: "IFSC code",
  issueDate: "Issue date",
  lastName: "Last name",
  netSalary: "Net salary",
  paidAmount: "Paid amount",
  panNumber: "PAN number",
  phone: "Phone number",
  poNumber: "PO number",
  projectId: "Project",
  reorderLevel: "Reorder level",
  sellingPrice: "Selling price",
  startDate: "Start date",
  totalAmount: "Total amount",
  unitPrice: "Unit price",
};

const FORMAT_RULES: Array<{
  names: string[];
  pattern: RegExp;
  message: string;
  optional?: boolean;
}> = [
  { names: ["email"], pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: "Enter a valid email address.", optional: true },
  { names: ["phone", "emergencyContact"], pattern: /^[+]?[0-9 ()-]{7,20}$/, message: "Enter a valid phone number.", optional: true },
  { names: ["panNumber", "pan"], pattern: /^[A-Z]{5}[0-9]{4}[A-Z]$/, message: "PAN must be in ABCDE1234F format.", optional: true },
  { names: ["aadharNumber", "aadhar"], pattern: /^[0-9]{12}$/, message: "Aadhar must be exactly 12 digits.", optional: true },
  { names: ["ifscCode", "ifsc"], pattern: /^[A-Z]{4}0[A-Z0-9]{6}$/, message: "IFSC must be in SBIN0001234 format.", optional: true },
  { names: ["gstNumber", "gstin"], pattern: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, message: "GST number format is invalid.", optional: true },
  { names: ["bankAccount"], pattern: /^[0-9]{8,20}$/, message: "Bank account must be 8 to 20 digits.", optional: true },
];

const MONEY_OR_QUANTITY_FIELDS = new Set([
  "amount",
  "allowances",
  "basicSalary",
  "budget",
  "costPrice",
  "credit",
  "debit",
  "deductions",
  "hours",
  "netSalary",
  "paidAmount",
  "quantity",
  "reorderLevel",
  "salary",
  "sellingPrice",
  "subtotal",
  "taxAmount",
  "totalAmount",
  "unitPrice",
]);

function fieldLabel(control: Control) {
  const key = control.name || control.id;
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];

  const label =
    control.labels?.[0]?.textContent ||
    control.closest(".space-y-1,.space-y-2,div")?.querySelector("label")?.textContent ||
    key;

  return label.replace(/\*/g, "").trim() || "This field";
}

function getControlValue(control: Control) {
  return typeof control.value === "string" ? control.value.trim() : "";
}

function getCustomMessage(control: Control) {
  const name = control.name || control.id;
  const value = getControlValue(control);

  if (control.required && !value) return `${fieldLabel(control)} is required.`;

  if (control instanceof HTMLInputElement && control.type === "number" && value) {
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) return `${fieldLabel(control)} must be a valid number.`;
    if ((control.min && numberValue < Number(control.min)) || (MONEY_OR_QUANTITY_FIELDS.has(name) && numberValue < 0)) {
      return `${fieldLabel(control)} cannot be negative.`;
    }
    if (control.max && numberValue > Number(control.max)) return `${fieldLabel(control)} must be ${control.max} or less.`;
  }

  if (control instanceof HTMLInputElement && control.type === "date" && value && Number.isNaN(Date.parse(value))) {
    return `${fieldLabel(control)} must be a valid date.`;
  }

  const formatRule = FORMAT_RULES.find((rule) => rule.names.includes(name));
  if (formatRule && (!formatRule.optional || value)) {
    const normalized = ["panNumber", "pan", "ifscCode", "ifsc", "gstNumber", "gstin"].includes(name) ? value.toUpperCase() : value;
    if (!formatRule.pattern.test(normalized)) return formatRule.message;
  }

  if (!control.validity.valid) return control.validationMessage || `${fieldLabel(control)} is invalid.`;
  return "";
}

function findMessageHost(control: Control) {
  return control.closest(".space-y-1,.space-y-2") || control.parentElement || control;
}

function setControlError(control: Control, message: string) {
  const host = findMessageHost(control);
  if (!host) return;

  clearControlError(control);
  control.setAttribute("aria-invalid", "true");
  control.classList.add(...ERROR_CLASS.split(" "));

  const element = document.createElement("p");
  element.setAttribute(MESSAGE_ATTR, control.name || control.id || "field");
  element.className = "text-xs text-destructive";
  element.textContent = message;
  host.appendChild(element);
}

function clearControlError(control: Control) {
  const host = findMessageHost(control);
  control.removeAttribute("aria-invalid");
  control.classList.remove(...ERROR_CLASS.split(" "));
  host?.querySelectorAll(`[${MESSAGE_ATTR}]`).forEach((element) => element.remove());
}

function controlsFor(form: HTMLFormElement): Control[] {
  return Array.from(form.elements).filter((element): element is Control => {
    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)) return false;
    if (element.type === "hidden" || element.disabled) return false;
    return Boolean(element.name || element.id);
  });
}

export function validateInlineForm(form: HTMLFormElement) {
  let firstInvalid: Control | null = null;

  for (const control of controlsFor(form)) {
    const message = getCustomMessage(control);
    if (message) {
      setControlError(control, message);
      firstInvalid ||= control;
    } else {
      clearControlError(control);
    }
  }

  if (firstInvalid) {
    firstInvalid.focus();
    firstInvalid.scrollIntoView({ behavior: "smooth", block: "center" });
    return false;
  }

  return true;
}

export function showInlineValidationErrors(error: unknown) {
  const errors = getFieldValidationErrors(error);
  if (!errors.length) return;
  showInlineFieldErrors(errors);
}

export function showInlineFieldErrors(errors: FieldValidationError[]) {
  const forms = Array.from(document.querySelectorAll("form"));
  const activeDialog = document.querySelector("[role='dialog']");
  const searchRoot = activeDialog || document;
  let firstControl: Control | null = null;

  for (const error of errors) {
    const selector = `[name="${CSS.escape(error.field)}"],#${CSS.escape(error.field)}`;
    const control =
      searchRoot.querySelector<Control>(selector) ||
      forms.map((form) => form.querySelector<Control>(selector)).find(Boolean);

    if (control) {
      setControlError(control, error.message);
      firstControl ||= control;
    }
  }

  firstControl?.focus();
}

export function validateRequiredFields(values: Record<string, unknown>, labels: Record<string, string>) {
  const errors = Object.entries(labels)
    .filter(([field]) => {
      const value = values[field];
      return value === undefined || value === null || String(value).trim() === "";
    })
    .map(([field, label]) => ({ field, message: `${label} is required.` }));

  if (errors.length) {
    showInlineFieldErrors(errors);
    return false;
  }

  return true;
}

export function installInlineValidation() {
  document.addEventListener(
    "submit",
    (event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      if (!validateInlineForm(form)) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    true,
  );

  document.addEventListener(
    "input",
    (event) => {
      const control = event.target;
      if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement) {
        clearControlError(control);
      }
    },
    true,
  );

  document.addEventListener(
    "change",
    (event) => {
      const control = event.target;
      if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement) {
        clearControlError(control);
      }
    },
    true,
  );
}
