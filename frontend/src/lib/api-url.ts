const getConfiguredApiUrl = () => {
  const apiBaseUrl = import.meta.env.VITE_API_URL?.trim() ?? import.meta.env.VITE_API_BASE_URL?.trim();
  if (!apiBaseUrl) return "";
  return apiBaseUrl.replace(/\/+$|\/$/, "");
};

export const getApiBaseUrl = () => {
  return getConfiguredApiUrl();
};

export const getBaseApiPath = () => {
  const apiBaseUrl = getConfiguredApiUrl();
  if (apiBaseUrl) {
    return `${apiBaseUrl}/api`;
  }

  const base = import.meta.env.BASE_URL || "/";
  const normalized = base.endsWith("/") ? base.slice(0, -1) : base;
  return `${normalized}/api`;
};
