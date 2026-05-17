export type FieldValidationError = {
  field: string;
  message: string;
  type?: string;
};

function getErrorPayload(error: unknown): any {
  const err = error as any;
  return err?.data ?? err?.response?.data ?? err?.response?.data?.data ?? null;
}

export function getFieldValidationErrors(error: unknown): FieldValidationError[] {
  const payload = getErrorPayload(error);
  const details = payload?.details;

  if (!Array.isArray(details)) return [];

  return details
    .map((detail: any) => ({
      field: String(detail?.field || detail?.path || "form"),
      message: String(detail?.message || "Invalid value"),
      type: detail?.type ? String(detail.type) : undefined,
    }))
    .filter((detail: FieldValidationError) => detail.message.trim().length > 0);
}

export function formatFieldValidationErrors(error: unknown): string {
  return getFieldValidationErrors(error)
    .map((detail) => `${detail.field}: ${detail.message}`)
    .join("; ");
}

export function getApiErrorMessage(error: unknown, fallback = "Something went wrong"): string {
  const payload = getErrorPayload(error);
  const fieldDetails = formatFieldValidationErrors(error);
  const base =
    payload?.error ||
    payload?.message ||
    (error instanceof Error ? error.message : "") ||
    fallback;

  return fieldDetails ? `${base} - ${fieldDetails}` : base;
}

export function getFieldErrorMap(error: unknown): Record<string, string> {
  return getFieldValidationErrors(error).reduce<Record<string, string>>((acc, detail) => {
    acc[detail.field] = detail.message;
    return acc;
  }, {});
}
