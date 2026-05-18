export const getBaseApiPath = () => {
  const base = import.meta.env.BASE_URL || "/";
  const normalized = base.endsWith("/") ? base.slice(0, -1) : base;
  return `${normalized}/api`;
};

export type ImportValidationIssue = {
  row?: number;
  field?: string;
  message: string;
  expected?: string;
  value?: unknown;
};

export type ImportErrorPayload = {
  title: string;
  message: string;
  validationErrors?: ImportValidationIssue[];
  expectedHeaders?: string[];
  receivedHeaders?: string[];
};

export class ImportRequestError extends Error {
  payload: ImportErrorPayload;

  constructor(payload: ImportErrorPayload) {
    super(payload.message);
    this.name = "ImportRequestError";
    this.payload = payload;
  }
}

const notifyImportError = (payload: ImportErrorPayload) => {
  window.dispatchEvent(new CustomEvent<ImportErrorPayload>("import-validation-error", { detail: payload }));
};

const getAuthHeaders = (): HeadersInit => {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export const downloadImportTemplate = async (moduleName: string, fileName: string) => {
  const response = await fetch(`${getBaseApiPath()}/import/${moduleName}/template`, {
    credentials: "include",
    headers: {
      ...getAuthHeaders(),
    },
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Unable to download template");
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
};

export const importModuleFile = async (moduleName: string, file: File) => {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${getBaseApiPath()}/import/${moduleName}`, {
    method: "POST",
    body: formData,
    credentials: "include",
    headers: {
      ...getAuthHeaders(),
    },
  });

  const payload = await response.json();
  if (!response.ok) {
    const errorPayload: ImportErrorPayload = {
      title: "Import failed",
      message: payload.error || "Import failed",
      validationErrors: payload.validationErrors,
      expectedHeaders: payload.expectedHeaders,
      receivedHeaders: payload.receivedHeaders,
    };
    notifyImportError(errorPayload);
    throw new ImportRequestError(errorPayload);
  }

  return payload;
};
