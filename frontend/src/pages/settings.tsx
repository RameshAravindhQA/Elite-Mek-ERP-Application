import React, { useEffect, useState } from "react";
import { useGetSettings, useUpdateSettings, getGetSettingsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, Eye, EyeOff, Building2, Palette, FileOutput, Mail, Bell, CreditCard, Volume2, MessageCircle } from "lucide-react";
import { isSoundEnabled, playSound, SOUND_PRESETS } from "@/lib/sound-effects";

const TABLE_HEADER_PALETTE = [
  "#1D4ED8", "#0F766E", "#047857", "#4338CA", "#7C3AED",
  "#BE185D", "#B45309", "#0369A1", "#334155", "#991B1B",
];

const DEFAULT_PAYSLIP_MESSAGE =
  "Hello {{employeeName}}, your payslip for {{month}} is ready. Net salary: {{netSalary}}. Please find the attached PDF payslip.";

const THEME_PRESETS = [
  { name: "Special Edition Dark", themeMode: "special-dark", themeColor: "#22C55E", buttonColor: "#16A34A", tableHeaderColor: "#0F172A", fieldColor: "#111827", themeLightShadeColor: "#111827", headerFontColor: "#F8FAFC", paragraphFontColor: "#D1D5DB" },
  { name: "Professional Blue", themeColor: "#2563EB", buttonColor: "#2563EB", tableHeaderColor: "#1D4ED8", fieldColor: "#EFF6FF", themeLightShadeColor: "#DBEAFE" },
  { name: "Emerald Operations", themeColor: "#059669", buttonColor: "#047857", tableHeaderColor: "#047857", fieldColor: "#ECFDF5", themeLightShadeColor: "#D1FAE5" },
  { name: "Slate Executive", themeColor: "#334155", buttonColor: "#475569", tableHeaderColor: "#334155", fieldColor: "#F1F5F9", themeLightShadeColor: "#E2E8F0" },
  { name: "Amber Finance", themeColor: "#B45309", buttonColor: "#B45309", tableHeaderColor: "#92400E", fieldColor: "#FFFBEB", themeLightShadeColor: "#FEF3C7" },
];

const buildExportHeader = (settingsData: any) => {
  const pieces = [
    settingsData.companyName || localStorage.getItem("company-name") || "Elite Mek",
    settingsData.companyEmail || localStorage.getItem("company-email"),
    settingsData.companyPhone || localStorage.getItem("company-phone"),
    settingsData.companyPhone2 || localStorage.getItem("company-phone2"),
    settingsData.companyWebsite || localStorage.getItem("company-website"),
    settingsData.companyAddress || localStorage.getItem("company-address"),
  ].filter(Boolean);
  return pieces.join("\n");
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-2">
    <label className="text-sm font-medium text-foreground">{label}</label>
    {children}
  </div>
);

const ColorPicker = ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
  <div className="relative w-14 h-10 shrink-0">
    <input
      type="color"
      value={value}
      onInput={(e) => onChange((e.target as HTMLInputElement).value)}
      onChange={(e) => onChange((e.target as HTMLInputElement).value)}
      onMouseDown={(e) => e.stopPropagation()}
      className="absolute inset-0 h-full w-full cursor-pointer rounded-md opacity-0"
      style={{ border: "none", background: "transparent" }}
    />
    <div
      className="absolute inset-0 rounded-md border border-input pointer-events-none shadow-sm"
      style={{ backgroundColor: value }}
    />
  </div>
);

const SaveButtons = ({
  isSubmitting,
  onSave,
  onReset,
}: {
  isSubmitting: boolean;
  onSave: () => void;
  onReset: () => void;
}) => (
  <div className="mt-4 flex flex-wrap items-center gap-3">
    <Button onClick={onSave} disabled={isSubmitting} className="bg-[hsl(var(--button-color))] text-[hsl(var(--button-foreground))] hover:bg-[hsl(var(--button-color))]/90">
      {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
      Save Changes
    </Button>
    <Button variant="outline" onClick={onReset} disabled={isSubmitting}>Restore Defaults</Button>
  </div>
);

export default function Settings() {
  const { data: settings, isLoading } = useGetSettings();
  const updateSettings = useUpdateSettings();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [formData, setFormData] = useState<any>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showKeys, setShowKeys] = useState({ whatsapp: false, sms: false });
  const [soundEnabled, setSoundEnabled] = useState(() => isSoundEnabled());
  const [soundPreset, setSoundPreset] = useState(() => localStorage.getItem("sound-effects-preset") || "0");

  const hexToHsl = (hex: string) => {
    // normalize to HSL object

    const cleanHex = hex.replace(/^#/, "");
    const fullHex = cleanHex.length === 3 ? cleanHex.split("").map((c) => c + c).join("") : cleanHex;
    const bigint = parseInt(fullHex, 16);
    const r = ((bigint >> 16) & 255) / 255;
    const g = ((bigint >> 8) & 255) / 255;
    const b = (bigint & 255) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;
    if (delta !== 0) {
      s = delta / (1 - Math.abs(2 * l - 1));
      switch (max) {
        case r: h = ((g - b) / delta + (g < b ? 6 : 0)); break;
        case g: h = ((b - r) / delta + 2); break;
        case b: h = ((r - g) / delta + 4); break;
      }
      h /= 6;
    }
    return {
      h: Math.round(h * 360),
      s: Math.round(s * 100),
      l: Math.round(l * 100),
    } as HslTheme;

  };

  type HslTheme = { h: number; s: number; l: number };

  const hslString = ({ h, s, l }: HslTheme): string => `${h} ${s}% ${l}%`;



  const getContrastForeground = ({ l }: { l: number }) => (l > 60 ? "220 25% 10%" : "0 0% 100%");

  // Accept either already-formatted "h s% l%" string or raw HSL input
  const hslStringOrTheme = (val: { h: number; s: number; l: number } | string) => {
    if (typeof val === "string") return val;
    return hslString(val);
  };

  const adjustHsl = ({ h, s, l }: { h: number; s: number; l: number }, deltaL: number, deltaS = 0) => {
    const adjusted = {
      h,
      s: Math.min(100, Math.max(0, s + deltaS)),
      l: Math.min(100, Math.max(0, l + deltaL)),
    };
    return hslString(adjusted);
  };

  const specialDarkTokens: Record<string, string> = {
    "--background": "222 47% 5%",
    "--foreground": "210 40% 96%",
    "--border": "220 24% 18%",
    "--card": "222 35% 8%",
    "--card-foreground": "210 40% 96%",
    "--card-border": "220 24% 18%",
    "--sidebar": "222 47% 4%",
    "--sidebar-foreground": "210 40% 96%",
    "--sidebar-border": "220 24% 16%",
    "--sidebar-primary": "142 72% 38%",
    "--sidebar-primary-foreground": "0 0% 100%",
    "--sidebar-accent": "220 28% 12%",
    "--sidebar-accent-foreground": "210 40% 96%",
    "--sidebar-ring": "142 72% 42%",
    "--button-color": "142 72% 38%",
    "--button-foreground": "0 0% 100%",
    "--popover": "222 35% 7%",
    "--popover-foreground": "210 40% 96%",
    "--popover-border": "220 24% 18%",
    "--primary": "142 72% 42%",
    "--primary-foreground": "0 0% 100%",
    "--secondary": "220 28% 12%",
    "--secondary-foreground": "210 40% 96%",
    "--muted": "220 26% 12%",
    "--muted-foreground": "215 20% 68%",
    "--accent": "142 55% 14%",
    "--accent-foreground": "210 40% 96%",
    "--input": "220 28% 12%",
    "--field-color": "220 28% 12%",
    "--theme-light-shade": "220 28% 10%",
    "--ui-surface": "220 28% 10%",
    "--table-header": "220 30% 10%",
    "--table-header-foreground": "210 40% 96%",
    "--table-row-hover": "220 28% 11%",
    "--ring": "142 72% 42%",
    "--header-color": "210 40% 98%",
    "--paragraph-color": "214 24% 82%",
    "--premium-gradient-start": "rgba(34,197,94,0.10)",
    "--premium-gradient-end": "rgba(14,165,233,0.08)",
    "--dashboard-gradient-start": "rgba(34,197,94,0.08)",
    "--dashboard-gradient-end": "rgba(14,165,233,0.06)",
  };

  const applySpecialDarkTheme = () => {
    const root = document.documentElement;
    root.classList.add("dark", "special-dark");
    Object.entries(specialDarkTokens).forEach(([key, value]) => root.style.setProperty(key, value));
    root.style.setProperty("--app-header-color", "#F8FAFC");
    root.style.setProperty("--app-paragraph-color", "#D1D5DB");
    localStorage.setItem("theme-mode", "special-dark");
    localStorage.setItem("theme-color", "#22C55E");
    localStorage.setItem("button-color", "#16A34A");
    localStorage.setItem("field-color", "#111827");
    localStorage.setItem("table-header-color", "#0F172A");
    localStorage.setItem("theme-light-shade-color", "#111827");
    localStorage.setItem("header-font-color", "#F8FAFC");
    localStorage.setItem("paragraph-font-color", "#D1D5DB");
  };

  // TS helper: ensure we never pass a Theme object into a function expecting a string
  // (some earlier edits introduced incorrect typing around hslString/sets)


  const applyThemeSettings = (settingsData: any) => {
    if (!settingsData) return;

    // Apply typography/font style preview via CSS variables (used globally across the app)
    const root = document.documentElement;
    if (settingsData?.headerFont) root.style.setProperty("--app-font-header", settingsData.headerFont);
    if (settingsData?.bodyFont) root.style.setProperty("--app-font-body", settingsData.bodyFont);

    // Use body font as global sans fallback so it affects most UI immediately
    if (settingsData?.bodyFont) root.style.setProperty("--app-font-sans", settingsData.bodyFont);
    const isSpecialDark = settingsData.themeMode === "special-dark";
    root.classList.toggle("dark", settingsData.themeMode === "dark" || isSpecialDark);
    root.classList.toggle("special-dark", isSpecialDark);

    if (settingsData.themeColor) {
      const theme = hexToHsl(settingsData.themeColor);
      const sidebarBackground = adjustHsl(theme, theme.l > 50 ? 30 : 12, theme.l > 50 ? -20 : -10);
      const sidebarBorder = adjustHsl(theme, theme.l > 50 ? 14 : -20, theme.l > 50 ? -10 : -5);
      const background = adjustHsl(theme, theme.l > 50 ? 58 : 80, theme.l > 50 ? -20 : -10);
      root.style.setProperty("--primary", hslStringOrTheme(theme));
      root.style.setProperty("--button-color", hslStringOrTheme(theme));
      root.style.setProperty("--background", background);
      root.style.setProperty("--ring", hslStringOrTheme(theme));
      root.style.setProperty("--accent", adjustHsl(theme, theme.l > 50 ? 36 : 16, theme.l > 50 ? -18 : -6));
      root.style.setProperty("--secondary", adjustHsl(theme, theme.l > 50 ? 42 : 20, theme.l > 50 ? -25 : -8));
      root.style.setProperty("--muted", adjustHsl(theme, theme.l > 50 ? 44 : 24, theme.l > 50 ? -28 : -10));
      root.style.setProperty("--chart-1", hslStringOrTheme(theme));
      root.style.setProperty("--chart-2", adjustHsl(theme, theme.l > 50 ? -10 : 20, 15));
      root.style.setProperty("--chart-5", adjustHsl(theme, theme.l > 50 ? -18 : 28, -8));
      root.style.setProperty("--sidebar", sidebarBackground);
      root.style.setProperty("--sidebar-border", sidebarBorder);
      root.style.setProperty("--sidebar-primary", hslStringOrTheme(theme));
      root.style.setProperty("--sidebar-accent", hslStringOrTheme(theme));
      root.style.setProperty("--sidebar-ring", hslStringOrTheme(theme));
      root.style.setProperty("--sidebar-primary-border", adjustHsl(theme, theme.l > 50 ? 14 : -18, theme.l > 50 ? -10 : -5));
      root.style.setProperty("--sidebar-accent-border", adjustHsl(theme, theme.l > 50 ? 14 : -18, theme.l > 50 ? -10 : -5));
      root.style.setProperty("--sidebar-foreground", getContrastForeground(theme));
      root.style.setProperty("--sidebar-accent-foreground", getContrastForeground(theme));
      root.style.setProperty("--primary-foreground", getContrastForeground(theme));
      root.style.setProperty("--accent-foreground", getContrastForeground(theme));
      root.style.setProperty("--table-header", hslStringOrTheme(theme));
      root.style.setProperty("--table-header-foreground", getContrastForeground(theme));
      root.style.setProperty("--premium-gradient-start", `hsla(${theme.h}, ${theme.s}%, ${theme.l}%, 0.18)`);
      localStorage.setItem("theme-color", settingsData.themeColor);
    }

    if (settingsData.tableHeaderColor) {
      const tableHeader = hexToHsl(settingsData.tableHeaderColor);
      root.style.setProperty("--table-header", hslString(tableHeader));
      root.style.setProperty("--table-header-foreground", getContrastForeground(tableHeader));
      localStorage.setItem("table-header-color", settingsData.tableHeaderColor);
    }

    if (settingsData.buttonColor) {
      const button = hexToHsl(settingsData.buttonColor);
      root.style.setProperty("--button-color", hslString(button));
      root.style.setProperty("--sidebar-accent", hslString(button));
      root.style.setProperty("--sidebar-ring", hslString(button));
      root.style.setProperty("--button-foreground", getContrastForeground(button));
      root.style.setProperty("--sidebar-accent-foreground", getContrastForeground(button));
      localStorage.setItem("button-color", settingsData.buttonColor);
    }

    if (settingsData.fieldColor) {
      const inputColor = hexToHsl(settingsData.fieldColor);
      root.style.setProperty("--input", hslString(inputColor));
      root.style.setProperty("--field-color", hslString(inputColor));
      localStorage.setItem("field-color", settingsData.fieldColor);
    }

    if (settingsData.headerFontColor) {
      root.style.setProperty("--app-header-color", settingsData.headerFontColor);
      localStorage.setItem("header-font-color", settingsData.headerFontColor);
    }

    if (settingsData.paragraphFontColor) {
      root.style.setProperty("--app-paragraph-color", settingsData.paragraphFontColor);
      localStorage.setItem("paragraph-font-color", settingsData.paragraphFontColor);
    }

    // Light shade used for light UI surfaces (global)
    // If not provided, default to a subtle tinted surface derived from background.
    if (settingsData?.themeLightShadeColor) {
      const shadeHex = settingsData.themeLightShadeColor;
      const shadeHsl = hexToHsl(shadeHex);
      const lightShade = adjustHsl(shadeHsl, 6, shadeHsl.s > 60 ? -10 : 0);
      root.style.setProperty("--theme-light-shade", lightShade);
      localStorage.setItem("theme-light-shade-color", shadeHex);

      // Apply as a background tint for general UI cards/panels in light mode
      root.style.setProperty("--ui-surface", lightShade);
      root.style.setProperty("--premium-gradient-end", `hsla(${shadeHsl.h}, ${shadeHsl.s}%, ${shadeHsl.l}%, 0.26)`);
    }

    if (settingsData?.motionStyle) {
      const style = settingsData.motionStyle;
      localStorage.setItem("motion-style", style);
      root.style.setProperty("--motion-style", style);
      switch (style) {
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

    if (settingsData?.pdfHeaderContent) {
      localStorage.setItem("pdf-header-content", settingsData.pdfHeaderContent);
    }

    if (settingsData?.pdfFooterContent) {
      localStorage.setItem("pdf-footer-content", settingsData.pdfFooterContent);
    }

    if (settingsData?.excelHeaderContent) {
      localStorage.setItem("excel-header-content", settingsData.excelHeaderContent);
    }

    if (settingsData?.excelFooterContent) {
      localStorage.setItem("excel-footer-content", settingsData.excelFooterContent);
    }

    if (settingsData?.pdfFormatting) {
      localStorage.setItem("pdf-formatting", settingsData.pdfFormatting);
    }

    if (settingsData?.companyName) {
      localStorage.setItem("company-name", settingsData.companyName);
    }

    if (settingsData?.companyEmail) {
      localStorage.setItem("company-email", settingsData.companyEmail);
    }

    if (settingsData?.companyPhone) {
      localStorage.setItem("company-phone", settingsData.companyPhone);
    }

    if (settingsData?.companyPhone2) {
      localStorage.setItem("company-phone2", settingsData.companyPhone2);
    }

    if (settingsData?.companyWebsite) {
      localStorage.setItem("company-website", settingsData.companyWebsite);
    }

    if (settingsData?.companyAddress) {
      localStorage.setItem("company-address", settingsData.companyAddress);
    }

    if (settingsData?.companyLogo) {
      localStorage.setItem("company-logo", settingsData.companyLogo);
    }

    if (settingsData?.themeMode) {
      localStorage.setItem("theme-mode", settingsData.themeMode);
    }

    if (isSpecialDark) {
      applySpecialDarkTheme();
    }

    // If themeLightShadeColor not passed but a previous value exists, keep it.
  };

  useEffect(() => {
    if (settings) {
      const mergedSettings = {
        ...settings,
        headerFontColor: (settings as any).headerFontColor || localStorage.getItem("header-font-color") || "#111827",
        paragraphFontColor: (settings as any).paragraphFontColor || localStorage.getItem("paragraph-font-color") || "#374151",
        themeLightShadeColor: (settings as any).themeLightShadeColor || localStorage.getItem("theme-light-shade-color") || "#EEF2FF",
        tableHeaderColor: (settings as any).tableHeaderColor || localStorage.getItem("table-header-color") || "#1D4ED8",
        motionStyle: (settings as any).motionStyle || (localStorage.getItem("motion-style") as any) || "soft",
        excelHeaderContent: (settings as any).excelHeaderContent || localStorage.getItem("excel-header-content") || buildExportHeader(settings),
        excelFooterContent: (settings as any).excelFooterContent || localStorage.getItem("excel-footer-content") || "",
        payslipWhatsappEnabled: Boolean((settings as any).payslipWhatsappEnabled),
        payslipWhatsappMode: (settings as any).payslipWhatsappMode || "whatsapp-web",
        payslipWhatsappSenderPhone: (settings as any).payslipWhatsappSenderPhone || "",
        openwaApiUrl: (settings as any).openwaApiUrl || "http://localhost:2785/api",
        openwaApiKey: (settings as any).openwaApiKey || "",
        openwaSessionId: (settings as any).openwaSessionId || "",
        payslipMessageTemplate: (settings as any).payslipMessageTemplate || DEFAULT_PAYSLIP_MESSAGE,
        payslipDefaultWorkingDays: (settings as any).payslipDefaultWorkingDays || 26,
        payslipIncludeLeaveDetails: (settings as any).payslipIncludeLeaveDetails !== false,
      };
      setFormData(mergedSettings);
      applyThemeSettings(mergedSettings);
    }
  }, [settings]);

  useEffect(() => {
    applyThemeSettings(formData);
  }, [formData.themeColor, formData.buttonColor, formData.fieldColor, formData.themeMode, formData.headerFont, formData.bodyFont, formData.headerFontColor, formData.paragraphFontColor, formData.themeLightShadeColor, formData.tableHeaderColor, formData.motionStyle]);

  const handleChange = (key: string, value: any) => {
    setFormData((prev: any) => ({ ...prev, [key]: value }));
  };

  const updateSoundEnabled = (enabled: boolean) => {
    setSoundEnabled(enabled);
    localStorage.setItem("sound-effects-enabled", String(enabled));
    if (enabled) window.setTimeout(() => playSound("success"), 40);
  };

  const updateSoundPreset = (value: string) => {
    setSoundPreset(value);
    localStorage.setItem("sound-effects-preset", value);
    window.setTimeout(() => playSound("click"), 40);
  };

  const previewSound = (event: Parameters<typeof playSound>[0]) => {
    if (!soundEnabled) {
      setSoundEnabled(true);
      localStorage.setItem("sound-effects-enabled", "true");
    }
    void playSound(event);
  };

  const handleSave = async () => {
    setIsSubmitting(true);
    const payload = {
      ...formData,
      payslipDefaultWorkingDays: formData.payslipDefaultWorkingDays !== undefined ? Number(formData.payslipDefaultWorkingDays) : formData.payslipDefaultWorkingDays,
      smtpPort: formData.smtpPort ? Number(formData.smtpPort) : formData.smtpPort,
      pdfHeaderContent: formData.pdfHeaderContent?.trim() ? formData.pdfHeaderContent : buildExportHeader(formData),
      excelHeaderContent: formData.excelHeaderContent?.trim() ? formData.excelHeaderContent : buildExportHeader(formData),
    };
    try {
      await updateSettings.mutateAsync({ data: payload });
      setFormData(payload);
      applyThemeSettings(payload);
      toast({ title: "Settings saved successfully", description: "All changes have been applied." });
      queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
    } catch {
      toast({ title: "Failed to save settings", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetDefaults = () => {
    const defaults = {
      themeColor: "#3B82F6",
      buttonColor: "#3B82F6",
      fieldColor: "#F9FAFB",
      themeLightShadeColor: "#EEF2FF",
      tableHeaderColor: "#3B82F6",
      themeMode: "light",
      motionStyle: "soft",
      headerFont: "Inter",
      bodyFont: "Inter",
      headerFontColor: "#111827",
      paragraphFontColor: "#374151",
      pdfHeaderContent: "Elite Mek Excellence in Engineering\nGST: 22AAAAA0000A1Z5\n123 Industrial Road, Mumbai",
      pdfFooterContent: "Payment terms: 40% advance, balance due on completion.\nPlease send PO confirmation within 3 days.",
      pdfFormatting: "Use a clean invoice header, bold titles, a soft shaded table header row, and a strong total summary section.",
      payslipWhatsappEnabled: false,
      payslipWhatsappMode: "whatsapp-web",
      payslipWhatsappSenderPhone: "",
      openwaApiUrl: "http://localhost:2785/api",
      openwaApiKey: "",
      openwaSessionId: "",
      payslipMessageTemplate: DEFAULT_PAYSLIP_MESSAGE,
      payslipDefaultWorkingDays: 26,
      payslipIncludeLeaveDetails: true,
    };
    setFormData(defaults);
    applyThemeSettings(defaults);
    toast({ title: "Default theme restored", description: "System defaults are applied." });
  };

  const applyThemePreset = (preset: (typeof THEME_PRESETS)[number]) => {
    const next = { ...formData, ...preset };
    setFormData(next);
    applyThemeSettings(next);
  };

  if (isLoading) {
    return <div className="flex h-[50vh] items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <PageHeader title="System Settings" description="Configure your ERP system - company info, theme, export formats, and integrations" />

      <Tabs defaultValue="company" className="w-full">
        <div className="mb-6 rounded-lg border border-primary/30 bg-primary/15 p-3 shadow-sm">
          <TabsList className="h-auto w-full justify-center rounded-2xl bg-primary/10 p-3 gap-2 flex-wrap border border-primary/20">
            {[
              { value: "company", label: "Company Info", icon: Building2 },
              { value: "bank", label: "Banking", icon: CreditCard },
              { value: "theme", label: "Theme & UI", icon: Palette },
              { value: "sounds", label: "Sounds", icon: Volume2 },
              { value: "export", label: "Export Config", icon: FileOutput },
              { value: "payslip", label: "Payslip Automator", icon: MessageCircle },
              { value: "mail", label: "Mail Config", icon: Mail },
              { value: "notifications", label: "Notifications", icon: Bell },
            ].map(({ value, label, icon: Icon }) => (
              <TabsTrigger key={value} value={value} className="inline-flex items-center justify-center whitespace-nowrap rounded-2xl border border-transparent bg-white/80 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:bg-primary/15 hover:text-primary data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md">
                <Icon size={15} />{label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {/* Company Info */}
        <TabsContent value="company" className="mt-0">
          <Card>
            <CardHeader><CardTitle className="text-base">Company Information</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Field label="Company Name"><Input value={formData.companyName || ""} onChange={e => handleChange("companyName", e.target.value)} /></Field>
              <Field label="Company Email"><Input type="email" value={formData.companyEmail || ""} onChange={e => handleChange("companyEmail", e.target.value)} /></Field>
              <Field label="Primary Phone"><Input value={formData.companyPhone || ""} onChange={e => handleChange("companyPhone", e.target.value)} /></Field>
              <Field label="Secondary Phone"><Input value={formData.companyPhone2 || ""} onChange={e => handleChange("companyPhone2", e.target.value)} /></Field>
              <Field label="Website"><Input value={formData.companyWebsite || ""} onChange={e => handleChange("companyWebsite", e.target.value)} placeholder="www.company.com" /></Field>
              <Field label="Currency">
                <Select value={formData.currency || "INR"} onValueChange={val => handleChange("currency", val)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="INR">INR (₹)</SelectItem>
                    <SelectItem value="USD">USD ($)</SelectItem>
                    <SelectItem value="EUR">EUR (€)</SelectItem>
                    <SelectItem value="GBP">GBP (£)</SelectItem>
                    <SelectItem value="AED">AED (د.إ)</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Timezone">
                <Select value={formData.timezone || "Asia/Kolkata"} onValueChange={val => handleChange("timezone", val)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Asia/Kolkata">Asia/Kolkata (IST)</SelectItem>
                    <SelectItem value="UTC">UTC</SelectItem>
                    <SelectItem value="America/New_York">America/New_York</SelectItem>
                    <SelectItem value="Europe/London">Europe/London</SelectItem>
                    <SelectItem value="Asia/Dubai">Asia/Dubai</SelectItem>
                    <SelectItem value="Asia/Singapore">Asia/Singapore</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium">Company Address</label>
                <Textarea value={formData.companyAddress || ""} onChange={e => handleChange("companyAddress", e.target.value)} className="min-h-[80px]" />
              </div>
            </CardContent>
          </Card>

          <Card className="mt-6">
            <CardHeader><CardTitle className="text-base">Tax & Registration</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Field label="GST Number"><Input value={formData.gstNumber || ""} onChange={e => handleChange("gstNumber", e.target.value)} placeholder="22AAAAA0000A1Z5" /></Field>
              <Field label="PAN Number"><Input value={formData.panNumber || ""} onChange={e => handleChange("panNumber", e.target.value)} placeholder="AAAAA0000A" /></Field>
              <Field label="CIN Number"><Input value={formData.cinNumber || ""} onChange={e => handleChange("cinNumber", e.target.value)} placeholder="U00000MH2000PTC000000" /></Field>
              <Field label="Company Logo URL"><Input value={formData.companyLogo || ""} onChange={e => handleChange("companyLogo", e.target.value)} placeholder="https://..." /></Field>
              {formData.companyLogo && (
                <div className="md:col-span-2 flex items-center gap-4">
                  <img src={formData.companyLogo} alt="Logo preview" className="h-16 w-auto rounded border p-1" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  <span className="text-sm text-muted-foreground">Logo preview</span>
                </div>
              )}
            </CardContent>
          </Card>
          <SaveButtons isSubmitting={isSubmitting} onSave={handleSave} onReset={resetDefaults} />
        </TabsContent>

        {/* Banking */}
        <TabsContent value="bank" className="mt-0">
          <Card>
            <CardHeader><CardTitle className="text-base">Bank Account Details</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Field label="Bank Name"><Input value={formData.bankName || ""} onChange={e => handleChange("bankName", e.target.value)} /></Field>
              <Field label="Account Number"><Input value={formData.bankAccount || ""} onChange={e => handleChange("bankAccount", e.target.value)} /></Field>
              <Field label="IFSC Code"><Input value={formData.bankIfsc || ""} onChange={e => handleChange("bankIfsc", e.target.value)} /></Field>
            </CardContent>
          </Card>
          <SaveButtons isSubmitting={isSubmitting} onSave={handleSave} onReset={resetDefaults} />
        </TabsContent>

        {/* Theme */}
        <TabsContent value="theme" className="mt-0">
          <Card className="mb-6">
            <CardHeader><CardTitle className="text-base">System Theme Presets</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-5">
              {THEME_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => applyThemePreset(preset)}
                  className="rounded-md border bg-card p-3 text-left transition hover:border-primary hover:bg-primary/5"
                >
                  <div className="mb-3 flex gap-1">
                    {[preset.themeColor, preset.buttonColor, preset.tableHeaderColor, preset.themeLightShadeColor].map((color) => (
                      <span key={color} className="h-5 w-5 rounded-sm border" style={{ backgroundColor: color }} />
                    ))}
                  </div>
                  <p className="text-sm font-semibold text-foreground">{preset.name}</p>
                </button>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Colors & Appearance</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Field label="Primary Color">
                <div className="flex gap-2 items-center">
                  <ColorPicker
                    value={formData.themeColor || "#3B82F6"}
                    onChange={(value) => handleChange("themeColor", value)}
                  />
                  <Input className="flex-1" value={formData.themeColor || "#3B82F6"} onChange={e => handleChange("themeColor", e.target.value)} />
                </div>
              </Field>
              <Field label="Preview">
                <div className="h-10 rounded-md flex items-center justify-center text-white font-medium text-sm" style={{ backgroundColor: formData.themeColor || "#3B82F6" }}>
                  Primary Color Preview
                </div>
              </Field>
              <Field label="Button Color">
                <div className="flex gap-2 items-center">
                  <ColorPicker
                    value={formData.buttonColor || "#3B82F6"}
                    onChange={(value) => handleChange("buttonColor", value)}
                  />
                  <Input className="flex-1" value={formData.buttonColor || "#3B82F6"} onChange={e => handleChange("buttonColor", e.target.value)} />
                </div>
              </Field>
              <Field label="Input Field Background">
                <div className="flex gap-2 items-center">
                  <ColorPicker
                    value={formData.fieldColor || "#F9FAFB"}
                    onChange={(value) => handleChange("fieldColor", value)}
                  />
                  <Input className="flex-1" value={formData.fieldColor || "#F9FAFB"} onChange={e => handleChange("fieldColor", e.target.value)} />
                </div>
              </Field>
              <Field label="Light Shade (UI surfaces)">
                <div className="flex gap-2 items-center">
                  <ColorPicker
                    value={formData.themeLightShadeColor || "#EEF2FF"}
                    onChange={(value) => handleChange("themeLightShadeColor", value)}
                  />
                  <Input
                    className="flex-1"
                    value={formData.themeLightShadeColor || "#EEF2FF"}
                    onChange={(e) => handleChange("themeLightShadeColor", e.target.value)}
                  />
                </div>
              </Field>
              <Field label="Table Header Color">
                <div className="flex gap-2 items-center">
                  <ColorPicker
                    value={formData.tableHeaderColor || formData.themeColor || "#3B82F6"}
                    onChange={(value) => handleChange("tableHeaderColor", value)}
                  />
                  <Input
                    className="flex-1"
                    value={formData.tableHeaderColor || formData.themeColor || "#3B82F6"}
                    onChange={(e) => handleChange("tableHeaderColor", e.target.value)}
                  />
                </div>
              </Field>
              <Field label="Table Header Palette">
                <div className="grid grid-cols-5 gap-2 sm:flex sm:flex-wrap">
                  {TABLE_HEADER_PALETTE.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => handleChange("tableHeaderColor", color)}
                      className={`h-9 w-9 rounded-md border transition-all focus-visible:ring-2 focus-visible:ring-ring ${formData.tableHeaderColor === color ? "border-foreground ring-2 ring-ring" : "border-input"}`}
                      style={{ backgroundColor: color }}
                      aria-label={`Set table header color to ${color}`}
                    />
                  ))}
                </div>
              </Field>
              <Field label="Theme Mode">
                <Select value={formData.themeMode || "light"} onValueChange={val => handleChange("themeMode", val)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">Light</SelectItem>
                    <SelectItem value="dark">Dark</SelectItem>
                    <SelectItem value="special-dark">Special Edition Dark</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Motion Style">
                <Select value={formData.motionStyle || "soft"} onValueChange={val => handleChange("motionStyle", val)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="soft">Soft</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="minimal">Minimal</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </CardContent>
          </Card>
          <Card className="mt-6">
            <CardHeader><CardTitle className="text-base">Typography</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Field label="Header Font">
                <Select value={formData.headerFont || "Inter"} onValueChange={val => handleChange("headerFont", val)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Inter", "Poppins", "Roboto", "Montserrat", "Nunito", "Open Sans", "Lato"].map(f => (
                      <SelectItem key={f} value={f}>{f}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Body Font">
                <Select value={formData.bodyFont || "Inter"} onValueChange={val => handleChange("bodyFont", val)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Inter", "Poppins", "Roboto", "Montserrat", "Nunito", "Open Sans", "Lato"].map(f => (
                      <SelectItem key={f} value={f}>{f}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Header Text Color">
                <div className="flex gap-2 items-center">
                  <ColorPicker
                    value={formData.headerFontColor || "#111827"}
                    onChange={(value) => handleChange("headerFontColor", value)}
                  />
                  <Input
                    className="flex-1"
                    value={formData.headerFontColor || "#111827"}
                    onChange={(e) => handleChange("headerFontColor", e.target.value)}
                  />
                </div>
              </Field>

              <Field label="Paragraph Text Color">
                <div className="flex gap-2 items-center">
                  <ColorPicker
                    value={formData.paragraphFontColor || "#374151"}
                    onChange={(value) => handleChange("paragraphFontColor", value)}
                  />
                  <Input
                    className="flex-1"
                    value={formData.paragraphFontColor || "#374151"}
                    onChange={(e) => handleChange("paragraphFontColor", e.target.value)}
                  />
                </div>
              </Field>

              <div className="md:col-span-2">
                <Field label="Preview">
                  <div className="rounded-md border p-4 space-y-3">
                    <h2
                      className="text-lg font-semibold"
                      style={{
                        fontFamily: formData.headerFont || "Inter",
                        color: formData.headerFontColor || "hsl(var(--header-color))",
                      }}
                    >
                      Header Example: The quick brown fox
                    </h2>
                    <p
                      className="text-sm"
                      style={{
                        fontFamily: formData.bodyFont || "Inter",
                        color: formData.paragraphFontColor || "hsl(var(--paragraph-color))",
                      }}
                    >
                      Body Example: Jumped over the lazy dog. Customize font style globally from Theme & UI.
                    </p>
                  </div>
                </Field>
              </div>
            </CardContent>
          </Card>
          <SaveButtons isSubmitting={isSubmitting} onSave={handleSave} onReset={resetDefaults} />
        </TabsContent>

        <TabsContent value="sounds" className="mt-0">
          <Card>
            <CardHeader><CardTitle className="text-base">Sound Effects</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between rounded-lg border bg-card p-4">
                <div>
                  <p className="text-sm font-semibold text-foreground">Enable system sounds</p>
                  <p className="text-xs text-muted-foreground">Applies to clicks, import, success, danger, and validation feedback.</p>
                </div>
                <Switch checked={soundEnabled} onCheckedChange={updateSoundEnabled} />
              </div>

              <Field label="Default Sound Effect">
                <Select value={soundPreset} onValueChange={updateSoundPreset}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SOUND_PRESETS.map((preset, index) => (
                      <SelectItem key={preset.name} value={String(index)}>{index + 1}. {preset.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                {[
                  ["Click", "click"],
                  ["Success", "success"],
                  ["Danger", "danger"],
                  ["Validation", "validation"],
                  ["Import", "import"],
                ].map(([label, event]) => (
                  <Button key={event} type="button" variant="outline" onClick={() => previewSound(event as any)}>
                    {label}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Export */}
        <TabsContent value="export" className="mt-0">
          <Card>
            <CardHeader><CardTitle className="text-base">PDF & Excel Export Settings</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Field label="PDF Header Content">
                <Textarea value={formData.pdfHeaderContent || ""} onChange={e => handleChange("pdfHeaderContent", e.target.value)} className="min-h-[100px]" placeholder="Company name, GST, address..." />
              </Field>
              <Field label="PDF Footer Content">
                <Textarea value={formData.pdfFooterContent || ""} onChange={e => handleChange("pdfFooterContent", e.target.value)} className="min-h-[100px]" placeholder="Terms, contact info..." />
              </Field>
              <Field label="Excel Header Content">
                <Textarea value={formData.excelHeaderContent || ""} onChange={e => handleChange("excelHeaderContent", e.target.value)} className="min-h-[100px]" />
              </Field>
              <Field label="Excel Footer Content">
                <Textarea value={formData.excelFooterContent || ""} onChange={e => handleChange("excelFooterContent", e.target.value)} className="min-h-[100px]" />
              </Field>
              <div className="md:col-span-2">
                <Field label="PDF Formatting Notes">
                  <Textarea value={formData.pdfFormatting || ""} onChange={e => handleChange("pdfFormatting", e.target.value)} className="min-h-[80px]" placeholder="Custom formatting instructions..." />
                </Field>
              </div>
            </CardContent>
          </Card>
          <SaveButtons isSubmitting={isSubmitting} onSave={handleSave} onReset={resetDefaults} />
        </TabsContent>

        <TabsContent value="payslip" className="mt-0">
          <Card>
            <CardHeader><CardTitle className="text-base">Payslip WhatsApp Automation</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between rounded-lg border bg-card p-4">
                <div>
                  <p className="text-sm font-semibold text-foreground">Enable payslip automation</p>
                  <p className="text-xs text-muted-foreground">Generate standard payslip PDFs and prepare WhatsApp delivery for employee phone numbers.</p>
                </div>
                <Switch
                  checked={Boolean(formData.payslipWhatsappEnabled)}
                  onCheckedChange={(checked) => handleChange("payslipWhatsappEnabled", checked)}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Field label="Automation Method">
                  <Select value={formData.payslipWhatsappMode || "whatsapp-web"} onValueChange={val => handleChange("payslipWhatsappMode", val)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="whatsapp-web">WhatsApp Web Automation</SelectItem>
                      <SelectItem value="manual-link">Manual WhatsApp Link</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Sender WhatsApp Number">
                  <Input
                    value={formData.payslipWhatsappSenderPhone || ""}
                    onChange={e => handleChange("payslipWhatsappSenderPhone", e.target.value)}
                    placeholder="+91XXXXXXXXXX"
                  />
                </Field>
                <Field label="OpenWA API URL">
                  <Input
                    value={formData.openwaApiUrl || ""}
                    onChange={e => handleChange("openwaApiUrl", e.target.value)}
                    placeholder="http://localhost:2785/api"
                  />
                </Field>
                <Field label="OpenWA API Key">
                  <Input
                    value={formData.openwaApiKey || ""}
                    onChange={e => handleChange("openwaApiKey", e.target.value)}
                    placeholder="Your OpenWA API Key"
                  />
                </Field>
                <Field label="OpenWA Session ID">
                  <Input
                    value={formData.openwaSessionId || ""}
                    onChange={e => handleChange("openwaSessionId", e.target.value)}
                    placeholder="Your WhatsApp Session ID"
                  />
                </Field>
                <Field label="Default Working Days">
                  <Input
                    type="number"
                    min={1}
                    max={31}
                    value={formData.payslipDefaultWorkingDays || 26}
                    onChange={e => handleChange("payslipDefaultWorkingDays", e.target.value)}
                  />
                </Field>
              </div>

              <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-4">
                <div>
                  <p className="text-sm font-semibold text-foreground">Include leave records</p>
                  <p className="text-xs text-muted-foreground">Payslip PDF includes working days, present days, absent days, and leave summary.</p>
                </div>
                <Switch
                  checked={formData.payslipIncludeLeaveDetails !== false}
                  onCheckedChange={(checked) => handleChange("payslipIncludeLeaveDetails", checked)}
                />
              </div>

              <Field label="WhatsApp Message Template">
                <Textarea
                  value={formData.payslipMessageTemplate || DEFAULT_PAYSLIP_MESSAGE}
                  onChange={e => handleChange("payslipMessageTemplate", e.target.value)}
                  className="min-h-[110px]"
                />
              </Field>

              <div className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
                WhatsApp Web sends from the number that scans the QR code. Enter the same sender number here for audit/configuration clarity.
                <br />
                Available fields: {"{{employeeName}}"}, {"{{month}}"}, {"{{netSalary}}"}, {"{{workingDays}}"}, {"{{presentDays}}"}, {"{{absentDays}}"}.
                Use the Payroll page to generate/download the standard payslip PDF before sending.
              </div>
            </CardContent>
          </Card>
          <SaveButtons isSubmitting={isSubmitting} onSave={handleSave} onReset={resetDefaults} />
        </TabsContent>

        {/* Mail */}
        <TabsContent value="mail" className="mt-0">
          <Card>
            <CardHeader><CardTitle className="text-base">SMTP Email Configuration</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Field label="SMTP Host"><Input value={formData.smtpHost || ""} onChange={e => handleChange("smtpHost", e.target.value)} placeholder="smtp.gmail.com" /></Field>
              <Field label="SMTP Port"><Input type="number" value={formData.smtpPort || ""} onChange={e => handleChange("smtpPort", e.target.value)} placeholder="587" /></Field>
              <Field label="SMTP Username"><Input value={formData.smtpUser || ""} onChange={e => handleChange("smtpUser", e.target.value)} /></Field>
              <Field label="From Email"><Input type="email" value={formData.smtpFromEmail || ""} onChange={e => handleChange("smtpFromEmail", e.target.value)} /></Field>
            </CardContent>
          </Card>
          <SaveButtons isSubmitting={isSubmitting} onSave={handleSave} onReset={resetDefaults} />
        </TabsContent>

        {/* Notifications */}
        <TabsContent value="notifications" className="mt-0">
          <Card>
            <CardHeader><CardTitle className="text-base">API Keys & Integrations</CardTitle></CardHeader>
            <CardContent className="space-y-6 max-w-xl">
              <Field label="WhatsApp API Key">
                <div className="relative">
                  <Input type={showKeys.whatsapp ? "text" : "password"} value={formData.whatsappApiKey || ""} onChange={e => handleChange("whatsappApiKey", e.target.value)} />
                  <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-full" onClick={() => setShowKeys(s => ({ ...s, whatsapp: !s.whatsapp }))}>
                    {showKeys.whatsapp ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
              </Field>
              <Field label="SMS API Key">
                <div className="relative">
                  <Input type={showKeys.sms ? "text" : "password"} value={formData.smsApiKey || ""} onChange={e => handleChange("smsApiKey", e.target.value)} />
                  <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-full" onClick={() => setShowKeys(s => ({ ...s, sms: !s.sms }))}>
                    {showKeys.sms ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
              </Field>
            </CardContent>
          </Card>
          <SaveButtons isSubmitting={isSubmitting} onSave={handleSave} onReset={resetDefaults} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
