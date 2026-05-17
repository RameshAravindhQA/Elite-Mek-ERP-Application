import { z, ZodError } from "zod";
import { logger } from "./logger";

/**
 * Comprehensive field-level validation utility
 * Provides detailed error messages for each field
 */

export interface ValidationError {
  field: string;
  message: string;
  value?: any;
  type?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors?: ValidationError[];
  data?: any;
}

// ============================================
// REGEX PATTERNS - Used across all modules
// ============================================

export const VALIDATION_PATTERNS = {
  phone: /^[\+]?[(]?[0-9]{1,4}[)]?[-\s\.]?[(]?[0-9]{1,4}[)]?[-\s\.]?[0-9]{1,9}$/,
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  pan: /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/,
  aadhar: /^[0-9]{12}$/,
  ifsc: /^[A-Z]{4}0[A-Z0-9]{6}$/,
  gstin: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/,
  gst: /^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/,
  date: /^\d{4}-\d{2}-\d{2}$/,
  time: /^\d{2}:\d{2}:\d{2}$/,
  zipCode: /^\d{6}$/,
  bankAccount: /^[0-9]{8,20}$/,
  pincode: /^[0-9]{6}$/,
  alphanumeric: /^[a-zA-Z0-9\s\-_]+$/,
  alphabetic: /^[a-zA-Z\s'-]+$/,
  numeric: /^[0-9]+(\.[0-9]{1,2})?$/,
};

// ============================================
// EMPLOYEE VALIDATION SCHEMAS
// ============================================

export const employeeFieldSchemas = {
  first_name: z.string()
    .min(2, "First name must be at least 2 characters")
    .max(50, "First name must not exceed 50 characters")
    .regex(/^[a-zA-Z\s'-]+$/, "First name can only contain letters, spaces, hyphens, and apostrophes"),

  last_name: z.string()
    .min(2, "Last name must be at least 2 characters")
    .max(50, "Last name must not exceed 50 characters")
    .regex(/^[a-zA-Z\s'-]+$/, "Last name can only contain letters, spaces, hyphens, and apostrophes"),

  email: z.string()
    .email("Invalid email format")
    .transform(val => val.toLowerCase()),

  phone: z.string()
    .regex(VALIDATION_PATTERNS.phone, "Invalid phone number format (e.g., +91-9876543210)")
    .transform(val => val.replace(/[\s\-()]/g, '').trim()),

  employee_id: z.string()
    .min(3, "Employee ID must be at least 3 characters")
    .max(20, "Employee ID must not exceed 20 characters")
    .regex(/^[A-Z0-9]+$/, "Employee ID can only contain uppercase letters and numbers"),

  department: z.string()
    .min(2, "Department must be at least 2 characters")
    .max(50, "Department must not exceed 50 characters"),

  designation: z.string()
    .min(2, "Designation must be at least 2 characters")
    .max(50, "Designation must not exceed 50 characters"),

  status: z.enum(["active", "inactive", "on-leave", "suspended"], {
    errorMap: () => ({ message: "Status must be one of: active, inactive, on-leave, suspended" })
  }).default("active"),

  salary: z.number()
    .positive("Salary must be greater than 0")
    .refine(val => val < 10000000, "Salary exceeds maximum limit (₹1 Crore)"),

  date_of_joining: z.string()
    .regex(VALIDATION_PATTERNS.date, "Date must be in YYYY-MM-DD format"),

  date_of_birth: z.string()
    .regex(VALIDATION_PATTERNS.date, "Date must be in YYYY-MM-DD format")
    .refine((date) => {
      const parsed = new Date(date);
      if (isNaN(parsed.getTime())) return false;
      const age = new Date().getFullYear() - parsed.getFullYear();
      return age >= 18 && age <= 80;
    }, "Employee must be between 18 and 80 years old"),

  pan: z.string()
    .regex(VALIDATION_PATTERNS.pan, "Invalid PAN format (e.g., AAAAA9999A)")
    .transform(val => val.toUpperCase()),

  aadhar: z.string()
    .regex(VALIDATION_PATTERNS.aadhar, "Aadhar must be exactly 12 digits"),

  ifsc: z.string()
    .regex(VALIDATION_PATTERNS.ifsc, "Invalid IFSC code format (e.g., SBIN0001234)")
    .transform(val => val.toUpperCase()),

  bank_account: z.string()
    .min(8, "Bank account must be at least 8 characters")
    .max(20, "Bank account must not exceed 20 characters")
    .regex(/^[0-9]+$/, "Bank account can only contain numbers"),

  bank_name: z.string()
    .min(3, "Bank name must be at least 3 characters")
    .max(100, "Bank name must not exceed 100 characters"),

  address: z.string()
    .min(10, "Address must be at least 10 characters")
    .max(200, "Address must not exceed 200 characters"),

  city: z.string()
    .min(2, "City must be at least 2 characters")
    .max(50, "City must not exceed 50 characters"),

  state: z.string()
    .length(2, "State code must be exactly 2 characters")
    .regex(/^[A-Z]{2}$/, "State code must be uppercase letters"),

  zip_code: z.string()
    .regex(VALIDATION_PATTERNS.zipCode, "Zip code must be 6 digits"),

  country: z.string()
    .max(50)
    .default("India"),

  emergency_contact_name: z.string()
    .min(2, "Contact name must be at least 2 characters")
    .max(50, "Contact name must not exceed 50 characters")
    .optional(),

  emergency_contact_phone: z.string()
    .regex(VALIDATION_PATTERNS.phone, "Invalid emergency contact phone format")
    .optional(),

  emergency_contact_relation: z.string()
    .max(30, "Relation must not exceed 30 characters")
    .optional(),
};

// ============================================
// ATTENDANCE VALIDATION SCHEMAS
// ============================================

export const attendanceFieldSchemas = {
  employee_id: z.number()
    .positive("Invalid employee ID"),

  date: z.string()
    .regex(VALIDATION_PATTERNS.date, "Date must be in YYYY-MM-DD format")
    .refine(date => !isNaN(new Date(date).getTime()), "Invalid date"),

  check_in_time: z.string()
    .regex(VALIDATION_PATTERNS.time, "Time must be in HH:MM:SS format"),

  check_out_time: z.string()
    .regex(VALIDATION_PATTERNS.time, "Time must be in HH:MM:SS format")
    .optional(),

  status: z.enum(["present", "absent", "leave", "holiday", "weekend", "late"], {
    errorMap: () => ({ message: "Status must be one of: present, absent, leave, holiday, weekend, late" })
  }).default("present"),

  notes: z.string()
    .max(500, "Notes must not exceed 500 characters")
    .optional(),
};

// ============================================
// PAYROLL VALIDATION SCHEMAS
// ============================================

export const payrollFieldSchemas = {
  employee_id: z.number()
    .positive("Invalid employee ID"),

  month: z.number()
    .min(1, "Month must be between 1-12")
    .max(12, "Month must be between 1-12"),

  year: z.number()
    .min(2000, "Year must be 2000 or later")
    .max(2099, "Year must be 2099 or earlier"),

  basic_salary: z.number()
    .positive("Salary must be greater than 0")
    .refine(val => val < 10000000, "Salary exceeds maximum limit"),

  bonus: z.number()
    .min(0, "Bonus cannot be negative")
    .default(0),

  deductions: z.number()
    .min(0, "Deductions cannot be negative")
    .default(0),

  tax: z.number()
    .min(0, "Tax cannot be negative")
    .default(0),

  leaves_count: z.number()
    .min(0, "Leaves cannot be negative")
    .default(0),

  status: z.enum(["draft", "pending", "approved", "rejected", "paid"], {
    errorMap: () => ({ message: "Status must be one of: draft, pending, approved, rejected, paid" })
  }).default("draft"),

  notes: z.string()
    .max(500, "Notes must not exceed 500 characters")
    .optional(),
};

// ============================================
// CUSTOMER VALIDATION SCHEMAS
// ============================================

export const customerFieldSchemas = {
  customer_id: z.string()
    .min(3, "Customer ID must be at least 3 characters")
    .max(20, "Customer ID must not exceed 20 characters")
    .regex(/^[A-Z0-9]+$/, "Customer ID can only contain uppercase letters and numbers"),

  name: z.string()
    .min(3, "Company name must be at least 3 characters")
    .max(100, "Company name must not exceed 100 characters"),

  email: z.string()
    .email("Invalid email format")
    .toLowerCase(),

  phone: z.string()
    .regex(VALIDATION_PATTERNS.phone, "Invalid phone format"),

  contact_person: z.string()
    .min(2, "Contact person name required")
    .max(100, "Contact person name too long")
    .optional(),

  address: z.string()
    .min(10, "Address must be at least 10 characters")
    .max(200, "Address must not exceed 200 characters"),

  city: z.string()
    .min(2, "City must be at least 2 characters")
    .max(50, "City must not exceed 50 characters"),

  state: z.string()
    .length(2, "State code must be 2 characters")
    .regex(/^[A-Z]{2}$/, "State code must be uppercase"),

  zip_code: z.string()
    .regex(VALIDATION_PATTERNS.zipCode, "Zip code must be 6 digits"),

  country: z.string()
    .default("India"),

  credit_limit: z.number()
    .min(0, "Credit limit cannot be negative"),

  payment_terms: z.enum(["net-30", "net-60", "net-90", "cod"], {
    errorMap: () => ({ message: "Payment terms must be one of: net-30, net-60, net-90, cod" })
  }).default("net-30"),

  gstin: z.string()
    .regex(VALIDATION_PATTERNS.gstin, "Invalid GSTIN format")
    .transform(val => val.toUpperCase())
    .optional(),

  pan: z.string()
    .regex(VALIDATION_PATTERNS.pan, "Invalid PAN format")
    .transform(val => val.toUpperCase())
    .optional(),
};

// ============================================
// INVOICE VALIDATION SCHEMAS
// ============================================

export const invoiceFieldSchemas = {
  invoice_number: z.string()
    .min(3, "Invoice number required")
    .max(20, "Invoice number too long")
    .regex(/^[A-Z0-9\-]+$/, "Invalid invoice format"),

  customer_id: z.number()
    .positive("Invalid customer ID"),

  issue_date: z.string()
    .regex(VALIDATION_PATTERNS.date, "Date must be in YYYY-MM-DD format"),

  due_date: z.string()
    .regex(VALIDATION_PATTERNS.date, "Date must be in YYYY-MM-DD format"),

  tax_amount: z.number()
    .min(0, "Tax cannot be negative"),

  discount: z.number()
    .min(0, "Discount cannot be negative")
    .default(0),

  total_amount: z.number()
    .positive("Total must be greater than 0"),

  status: z.enum(["draft", "sent", "paid", "overdue", "cancelled"], {
    errorMap: () => ({ message: "Status must be one of: draft, sent, paid, overdue, cancelled" })
  }).default("draft"),

  notes: z.string()
    .max(1000, "Notes too long")
    .optional(),
};

// ============================================
// LEAVE VALIDATION SCHEMAS
// ============================================

export const leaveFieldSchemas = {
  employee_id: z.number()
    .positive("Invalid employee ID"),

  leave_type: z.enum(["sick", "casual", "earned", "unpaid", "maternity", "paternity"], {
    errorMap: () => ({ message: "Invalid leave type" })
  }),

  start_date: z.string()
    .regex(VALIDATION_PATTERNS.date, "Date must be in YYYY-MM-DD format"),

  end_date: z.string()
    .regex(VALIDATION_PATTERNS.date, "Date must be in YYYY-MM-DD format"),

  days: z.number()
    .positive("Days must be greater than 0"),

  reason: z.string()
    .min(5, "Reason must be at least 5 characters")
    .max(500, "Reason must not exceed 500 characters"),

  status: z.enum(["pending", "approved", "rejected", "cancelled"], {
    errorMap: () => ({ message: "Status must be one of: pending, approved, rejected, cancelled" })
  }).default("pending"),
};

// ============================================
// MAIN FIELD VALIDATOR CLASS
// ============================================

export class FieldValidator {
  /**
   * Format Zod validation errors into readable field-level errors
   */
  static formatZodErrors(error: ZodError): ValidationError[] {
    return error.errors.map(err => ({
      field: err.path.join('.'),
      message: err.message,
      value: undefined,
      type: err.code,
    }));
  }

  /**
   * Validate data against a Zod schema
   */
  static validate(schema: z.ZodTypeAny, data: any): ValidationResult {
    try {
      const validated = schema.parse(data);
      return { valid: true, data: validated };
    } catch (error) {
      if (error instanceof ZodError) {
        const errors = this.formatZodErrors(error);
        logger.warn({
          msg: "Validation failed",
          fieldCount: errors.length,
          fields: errors.map(e => e.field),
        });
        return { valid: false, errors };
      }
      return {
        valid: false,
        errors: [{ field: 'unknown', message: 'Validation failed', type: 'unknown' }],
      };
    }
  }

  /**
   * Validate individual fields for real-time feedback
   */
  static validateEmail(email: string): { valid: boolean; message?: string } {
    if (!VALIDATION_PATTERNS.email.test(email)) {
      return { valid: false, message: 'Invalid email format' };
    }
    return { valid: true };
  }

  static validatePhone(phone: string): { valid: boolean; message?: string } {
    if (!VALIDATION_PATTERNS.phone.test(phone)) {
      return { valid: false, message: 'Invalid phone number' };
    }
    return { valid: true };
  }

  static validatePAN(pan: string): { valid: boolean; message?: string } {
    if (!VALIDATION_PATTERNS.pan.test(pan.toUpperCase())) {
      return { valid: false, message: 'Invalid PAN format (e.g., AAAAA9999A)' };
    }
    return { valid: true };
  }

  static validateAadhar(aadhar: string): { valid: boolean; message?: string } {
    if (!VALIDATION_PATTERNS.aadhar.test(aadhar)) {
      return { valid: false, message: 'Aadhar must be exactly 12 digits' };
    }
    return { valid: true };
  }

  static validateIFSC(ifsc: string): { valid: boolean; message?: string } {
    if (!VALIDATION_PATTERNS.ifsc.test(ifsc.toUpperCase())) {
      return { valid: false, message: 'Invalid IFSC code (e.g., SBIN0001234)' };
    }
    return { valid: true };
  }

  static validateDate(date: string): { valid: boolean; message?: string } {
    if (!VALIDATION_PATTERNS.date.test(date)) {
      return { valid: false, message: 'Date must be in YYYY-MM-DD format' };
    }
    const parsed = new Date(date);
    if (isNaN(parsed.getTime())) {
      return { valid: false, message: 'Invalid date' };
    }
    return { valid: true };
  }

  static validateSalary(salary: number): { valid: boolean; message?: string } {
    if (salary <= 0) {
      return { valid: false, message: 'Salary must be greater than 0' };
    }
    if (salary > 10000000) {
      return { valid: false, message: 'Salary exceeds maximum limit (₹1 Crore)' };
    }
    return { valid: true };
  }

  static validateAge(birthDate: string): { valid: boolean; message?: string } {
    const birth = new Date(birthDate);
    if (isNaN(birth.getTime())) {
      return { valid: false, message: 'Invalid date of birth' };
    }
    const age = new Date().getFullYear() - birth.getFullYear();
    if (age < 18) {
      return { valid: false, message: 'Employee must be at least 18 years old' };
    }
    if (age > 80) {
      return { valid: false, message: 'Invalid age' };
    }
    return { valid: true };
  }

  static validateGSTIN(gstin: string): { valid: boolean; message?: string } {
    if (!VALIDATION_PATTERNS.gstin.test(gstin.toUpperCase())) {
      return { valid: false, message: 'Invalid GSTIN format' };
    }
    return { valid: true };
  }

  static validateBankAccount(account: string): { valid: boolean; message?: string } {
    if (!VALIDATION_PATTERNS.bankAccount.test(account)) {
      return { valid: false, message: 'Bank account must be 8-20 digits' };
    }
    return { valid: true };
  }

  static validateZipCode(zip: string): { valid: boolean; message?: string } {
    if (!VALIDATION_PATTERNS.zipCode.test(zip)) {
      return { valid: false, message: 'Zip code must be 6 digits' };
    }
    return { valid: true };
  }

  /**
   * Create validation schemas for common patterns
   */
  static createArraySchema<T>(schema: z.ZodType<T>): z.ZodType<T[]> {
    return z.array(schema).min(1, "At least one item required");
  }

  static createOptionalSchema<T>(schema: z.ZodType<T>): z.ZodType<T | undefined> {
    return schema.optional();
  }
}

export default FieldValidator;
