import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

type TypographySettings = {
  headerFont?: string;
  bodyFont?: string;
  headerFontColor?: string;
  paragraphFontColor?: string;
  fontStyle?: {
    fontFamily?: string;
    fontWeight?: number | string;
    fontStyle?: "normal" | "italic";
    textDecorationLine?: "none" | "underline";
  };
};

type MotionStyle = "soft" | "normal" | "minimal";

type ThemeUIContextValue = {
  themeMode: "light" | "dark" | "special-dark";
  typography: TypographySettings;
  motionStyle: MotionStyle;
  setTypography: (v: TypographySettings) => void;
  setMotionStyle: (v: MotionStyle) => void;
};

const ThemeUIContext = createContext<ThemeUIContextValue | null>(null);

export function ThemeUIProvider({ children }: { children: React.ReactNode }) {
  const [themeMode, setThemeMode] = useState<"light" | "dark" | "special-dark">(() => {
    if (typeof window === "undefined") return "light";
    return (localStorage.getItem("theme-mode") as "light" | "dark" | "special-dark") || "light";
  });
  const [typography, setTypography] = useState<TypographySettings>({});
  const [motionStyle, setMotionStyle] = useState<MotionStyle>(() => {
    if (typeof window === "undefined") return "soft";
    return (localStorage.getItem("motion-style") as MotionStyle) || "soft";
  });

  const hexToHsl = (hex: string) => {
    const cleanHex = hex.replace(/^#/, "");
    const fullHex = cleanHex.length === 3 ? cleanHex.split("").map((c) => c + c).join("") : cleanHex;
    const value = parseInt(fullHex, 16);
    if (!Number.isFinite(value)) return null;
    const r = ((value >> 16) & 255) / 255;
    const g = ((value >> 8) & 255) / 255;
    const b = (value & 255) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;
    if (delta !== 0) {
      s = delta / (1 - Math.abs(2 * l - 1));
      switch (max) {
        case r: h = (g - b) / delta + (g < b ? 6 : 0); break;
        case g: h = (b - r) / delta + 2; break;
        case b: h = (r - g) / delta + 4; break;
      }
      h /= 6;
    }
    return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
  };

  const hslString = (theme: { h: number; s: number; l: number }) => `${theme.h} ${theme.s}% ${theme.l}%`;
  const contrast = (theme: { l: number }) => (theme.l > 60 ? "220 25% 10%" : "0 0% 100%");
  const adjustHsl = ({ h, s, l }: { h: number; s: number; l: number }, deltaL: number, deltaS = 0) =>
    `${h} ${Math.min(100, Math.max(0, s + deltaS))}% ${Math.min(100, Math.max(0, l + deltaL))}%`;

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", themeMode === "dark" || themeMode === "special-dark");
    root.classList.toggle("special-dark", themeMode === "special-dark");
    localStorage.setItem("theme-mode", themeMode);
  }, [themeMode]);

  useEffect(() => {
    const root = document.documentElement;
    const themeColor = localStorage.getItem("theme-color");
    const buttonColor = localStorage.getItem("button-color");
    const fieldColor = localStorage.getItem("field-color");
    const shadeColor = localStorage.getItem("theme-light-shade-color");
    const tableHeaderColor = localStorage.getItem("table-header-color") || "#1D4ED8";
    const headerColor = localStorage.getItem("header-font-color");
    const paragraphColor = localStorage.getItem("paragraph-font-color");

    if (themeColor) {
      const theme = hexToHsl(themeColor);
      if (theme) {
        const foreground = contrast(theme);
        root.style.setProperty("--primary", hslString(theme));
        root.style.setProperty("--primary-foreground", foreground);
        root.style.setProperty("--ring", hslString(theme));
        root.style.setProperty("--accent", adjustHsl(theme, theme.l > 50 ? 36 : 16, theme.l > 50 ? -18 : -6));
        root.style.setProperty("--secondary", adjustHsl(theme, theme.l > 50 ? 42 : 20, theme.l > 50 ? -25 : -8));
        root.style.setProperty("--muted", adjustHsl(theme, theme.l > 50 ? 44 : 24, theme.l > 50 ? -28 : -10));
        root.style.setProperty("--chart-1", hslString(theme));
        root.style.setProperty("--chart-2", adjustHsl(theme, theme.l > 50 ? -10 : 20, 15));
        root.style.setProperty("--chart-5", adjustHsl(theme, theme.l > 50 ? -18 : 28, -8));
        root.style.setProperty("--table-header", hslString(theme));
        root.style.setProperty("--table-header-foreground", foreground);
        root.style.setProperty("--sidebar-primary", hslString(theme));
        root.style.setProperty("--sidebar-ring", hslString(theme));
        root.style.setProperty("--premium-gradient-start", `hsla(${theme.h}, ${theme.s}%, ${theme.l}%, 0.18)`);
      }
    }

    if (buttonColor) {
      const button = hexToHsl(buttonColor);
      if (button) {
        root.style.setProperty("--button-color", hslString(button));
        root.style.setProperty("--button-foreground", contrast(button));
        root.style.setProperty("--sidebar-accent", hslString(button));
        root.style.setProperty("--sidebar-accent-foreground", contrast(button));
      }
    }

    if (fieldColor) {
      const input = hexToHsl(fieldColor);
      if (input) {
        root.style.setProperty("--input", hslString(input));
        root.style.setProperty("--field-color", hslString(input));
      }
    }

    if (shadeColor) {
      const shade = hexToHsl(shadeColor);
      if (shade) {
        root.style.setProperty("--theme-light-shade", adjustHsl(shade, 6, shade.s > 60 ? -10 : 0));
        root.style.setProperty("--premium-gradient-end", `hsla(${shade.h}, ${shade.s}%, ${shade.l}%, 0.26)`);
      }
    }

    if (tableHeaderColor) {
      const table = hexToHsl(tableHeaderColor);
      if (table) {
        root.style.setProperty("--table-header", hslString(table));
        root.style.setProperty("--table-header-foreground", contrast(table));
      }
    }

    if (motionStyle) {
      root.style.setProperty("--motion-style", motionStyle);
      localStorage.setItem("motion-style", motionStyle);
      switch (motionStyle) {
        case "soft":
          root.style.setProperty("--page-motion-duration", "1.1s");
          root.style.setProperty("--page-motion-delay", "0.22s");
          root.style.setProperty("--click-motion-duration", "1s");
          root.style.setProperty("--click-motion-delay", "0.14s");
          root.style.setProperty("--panel-motion-duration", "0.95s");
          break;
        case "normal":
          root.style.setProperty("--page-motion-duration", "0.9s");
          root.style.setProperty("--page-motion-delay", "0.18s");
          root.style.setProperty("--click-motion-duration", "0.88s");
          root.style.setProperty("--click-motion-delay", "0.12s");
          root.style.setProperty("--panel-motion-duration", "0.82s");
          break;
        case "minimal":
          root.style.setProperty("--page-motion-duration", "0.5s");
          root.style.setProperty("--page-motion-delay", "0.08s");
          root.style.setProperty("--click-motion-duration", "0.55s");
          root.style.setProperty("--click-motion-delay", "0.06s");
          root.style.setProperty("--panel-motion-duration", "0.5s");
          break;
      }
    }

    if (headerColor) root.style.setProperty("--app-header-color", headerColor);
    if (paragraphColor) root.style.setProperty("--app-paragraph-color", paragraphColor);
  }, [motionStyle]);

  const value = useMemo(() => ({ themeMode, typography, motionStyle, setTypography, setMotionStyle }), [themeMode, typography, motionStyle]);

  return <ThemeUIContext.Provider value={value}>{children}</ThemeUIContext.Provider>;
}

export function useThemeUI() {
  const ctx = useContext(ThemeUIContext);
  if (!ctx) throw new Error("useThemeUI must be used within ThemeUIProvider");
  return ctx;
}
