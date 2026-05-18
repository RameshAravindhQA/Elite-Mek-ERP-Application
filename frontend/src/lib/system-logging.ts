import clientLogger from "./client-logger";

type SystemLogEvent = {
  level: "info" | "warn" | "error";
  type: string;
  message?: string;
  path?: string;
  target?: string;
  method?: string;
  status?: number;
  duration?: number;
  stack?: string;
  timestamp: number;
};

const getBaseApiPath = () => {
  const base = import.meta.env.BASE_URL || "/";
  const normalized = base.endsWith("/") ? base.slice(0, -1) : base;
  return `${normalized}/api`;
};

const queue: SystemLogEvent[] = [];
let flushTimer: number | undefined;
let installed = false;

const getToken = () => localStorage.getItem("token");

const enqueue = (event: SystemLogEvent) => {
  queue.push(event);
  if (queue.length > 200) queue.splice(0, queue.length - 200);
  window.clearTimeout(flushTimer);
  flushTimer = window.setTimeout(flush, 1500);
};

const flush = () => {
  const token = getToken();
  if (!token || queue.length === 0) return;

  const events = queue.splice(0, 50);
  fetch(`${getBaseApiPath()}/system-logs/client`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ events }),
    keepalive: true,
  }).catch(() => {
    queue.unshift(...events.slice(0, 25));
  });
};

const describeTarget = (element: Element) => {
  const label = element.getAttribute("aria-label") || element.getAttribute("title") || element.textContent || element.getAttribute("name") || element.id || element.tagName;
  return label.replace(/\s+/g, " ").trim().slice(0, 140);
};

const installClickLogging = () => {
  document.addEventListener(
    "click",
    (event) => {
      const target = event.target instanceof Element
        ? event.target.closest("button,a,[role='button'],input[type='button'],input[type='submit']")
        : null;
      if (!target) return;

      const description = describeTarget(target);
      clientLogger.info(`UI click: ${description}`, { path: window.location.pathname });
      enqueue({
        level: "info",
        type: "ui.click",
        message: "User clicked UI control",
        target: description,
        path: window.location.pathname,
        timestamp: Date.now(),
      });
    },
    { capture: true },
  );
};

const installErrorLogging = () => {
  window.addEventListener("error", (event) => {
    const message = event.message || "Unhandled browser error";
    clientLogger.error(message, event.error, { path: window.location.pathname });
    enqueue({
      level: "error",
      type: "ui.error",
      message,
      path: window.location.pathname,
      stack: event.error?.stack,
      timestamp: Date.now(),
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
    clientLogger.error("Unhandled promise rejection", reason, { path: window.location.pathname });
    enqueue({
      level: "error",
      type: "ui.unhandledrejection",
      message: reason.message,
      path: window.location.pathname,
      stack: reason.stack,
      timestamp: Date.now(),
    });
  });
};

const installFetchLogging = () => {
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
    const isApi = url.includes("/api/");
    const isSystemLog = url.includes("/system-logs/client");
    const start = performance.now();

    try {
      const response = await originalFetch(input, init);
      if (isApi && !isSystemLog) {
        const duration = Math.round(performance.now() - start);
        const path = new URL(url, window.location.origin).pathname;
        enqueue({
          level: response.ok ? "info" : "warn",
          type: "api.call",
          message: `${method} ${path} ${response.status}`,
          method,
          path,
          status: response.status,
          duration,
          timestamp: Date.now(),
        });
      }
      return response;
    } catch (error) {
      if (isApi && !isSystemLog) {
        const duration = Math.round(performance.now() - start);
        const err = error instanceof Error ? error : new Error(String(error));
        const path = new URL(url, window.location.origin).pathname;
        enqueue({
          level: "error",
          type: "api.error",
          message: err.message,
          method,
          path,
          duration,
          stack: err.stack,
          timestamp: Date.now(),
        });
      }
      throw error;
    }
  };
};

export const installSystemLogging = () => {
  if (installed || typeof window === "undefined") return;
  installed = true;
  installClickLogging();
  installErrorLogging();
  installFetchLogging();
  window.addEventListener("pagehide", flush);
};
