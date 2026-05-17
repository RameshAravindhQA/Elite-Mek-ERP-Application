import { createRoot } from "react-dom/client";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import App from "./App";
import clientLogger from "@/lib/client-logger";
import { playSound } from "@/lib/sound-effects";
import "./index.css";

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
