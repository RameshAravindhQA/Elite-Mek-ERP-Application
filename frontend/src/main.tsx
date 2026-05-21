import { createRoot } from "react-dom/client";
import { setAuthTokenGetter, setBaseUrl } from "@workspace/api-client-react";
import App from "./App";
import clientLogger from "@/lib/client-logger";
import { playSound } from "@/lib/sound-effects";
import { getApiBaseUrl } from "@/lib/api-url";
import "./index.css";

const apiBaseUrl = getApiBaseUrl() || null;
if (apiBaseUrl) {
  setBaseUrl(apiBaseUrl);

  const originalFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === "string" && input.startsWith("/api")) {
      return originalFetch(`${apiBaseUrl}${input}`, init);
    }

    if (input instanceof Request && input.url.startsWith("/api")) {
      const requestUrl = `${apiBaseUrl}${input.url}`;
      return originalFetch(new Request(requestUrl, input), init);
    }

    return originalFetch(input, init);
  };
}

setAuthTokenGetter(() => localStorage.getItem("token"));

// Global error handler for uncaught errors
window.addEventListener("error", (event) => {
  clientLogger.error("Uncaught error", event.error, {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
  });
  void playSound("danger");
});

// Global handler for unhandled promise rejections
window.addEventListener("unhandledrejection", (event) => {
  clientLogger.error("Unhandled promise rejection", event.reason, {
    reason: String(event.reason),
  });
  void playSound("danger");
});

createRoot(document.getElementById("root")!).render(<App />);
