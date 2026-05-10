import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useLogin } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Building2, Loader2 } from "lucide-react";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [look, setLook] = useState<"premium" | "standard">("premium");
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const loginMutation = useLogin();

  if (user) {
    setLocation("/dashboard");
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast({
        title: "Error",
        description: "Please enter email and password",
        variant: "destructive",
      });
      return;
    }

    setIsSimulating(true);
    await new Promise((resolve) => setTimeout(resolve, 420));

    loginMutation.mutate(
      { data: { email, password } },
      {
        onSuccess: (data) => {
          localStorage.setItem("token", data.token);
          sessionStorage.setItem("show-welcome-after-login", "true");
          if (rememberMe) {
            localStorage.setItem("rememberedEmail", email);
          } else {
            localStorage.removeItem("rememberedEmail");
          }
          toast({
            title: "Success",
            description: "Logged in successfully",
          });
          setTimeout(() => {
            window.location.href = "/dashboard";
          }, 280);
        },
        onError: () => {
          setIsSimulating(false);
          toast({
            title: "Error",
            description: "Invalid credentials",
            variant: "destructive",
          });
        },
      }
    );
  };

  return (
    <div
      className="min-h-screen overflow-hidden text-slate-900 page-transition"
      style={{
        background:
          (look === "premium"
            ? "linear-gradient(135deg, rgba(14,165,233,0.22), transparent 32%),radial-gradient(circle at 18% 8%, rgba(16,185,129,0.16), transparent 28%),radial-gradient(circle at 88% 92%, rgba(245,158,11,0.12), transparent 26%),"
            : "linear-gradient(135deg, rgba(59,130,246,0.12), transparent 34%),") +
          "hsl(var(--background));",
      }}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-cyan-500 via-emerald-400 to-amber-300" />
      <div className="relative mx-auto flex min-h-screen max-w-[1440px] items-center px-4 py-8 sm:px-6 lg:px-8">
        <div className="absolute left-6 top-6 z-20 flex items-center gap-3 rounded-2xl border border-white/70 bg-white/80 px-4 py-3 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.55)] backdrop-blur-xl">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 via-blue-600 to-emerald-500 text-sm font-bold text-white shadow-lg">
            EM
          </div>
          <div>
            <p className="text-sm font-bold leading-tight text-slate-950">Elite Mek</p>
            <p className="text-[10px] leading-tight text-slate-500">Excellence in Engineering Since 2020</p>
          </div>
        </div>

        <div className={`smooth-panel relative z-10 mt-16 grid w-full overflow-hidden border border-white/75 ${look === "premium" ? "rounded-[1.75rem] bg-white/[0.88] shadow-[0_60px_140px_-70px_rgba(15,23,42,0.60)] backdrop-blur-2xl" : "rounded-xl bg-white shadow-xl"} lg:grid-cols-[1.18fr_0.82fr]`}>
          <div className={`relative overflow-hidden ${look === "premium" ? "rounded-[1.75rem]" : "rounded-xl"} bg-white/95 p-8 sm:p-12 lg:p-14`}>
            <div
              className="absolute left-0 top-0 w-2/3 h-1/2 blur-3xl"
              style={{
                background:
                  "linear-gradient(135deg, rgba(14,165,233,0.20), rgba(16,185,129,0.13), transparent 72%)",
              }}
            />
            <div className="absolute inset-y-0 right-0 w-2/3 bg-gradient-to-b from-cyan-300/[0.16] via-white to-amber-200/[0.12] blur-3xl" />
            <div className="relative z-10 max-w-xl">
              <div className="inline-flex items-center gap-3 rounded-full border border-slate-200 bg-white/90 px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm shadow-slate-900/5">
                <Building2 className="h-5 w-5 text-cyan-500" />
                Elite Mek ERP Suite
              </div>
              <div className="mt-10 space-y-5">
                <h1 className="text-5xl font-bold tracking-tight text-slate-950 sm:text-6xl">Elite Mek</h1>
                <p className="text-lg leading-8 text-slate-600">
                  Excellence in Engineering Since 2020. A refined workspace for operations, finance, procurement, and records.
                </p>
              </div>
              <div className="mt-10 grid gap-4 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-white/80 p-5 shadow-sm">
                  <p className="text-[10px] uppercase tracking-[0.3em] text-slate-500">Operations</p>
                  <p className="mt-3 text-base font-semibold text-slate-900">Workflows and approvals</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white/80 p-5 shadow-sm">
                  <p className="text-[10px] uppercase tracking-[0.3em] text-slate-500">Finance</p>
                  <p className="mt-3 text-base font-semibold text-slate-900">Invoices and ledgers</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white/80 p-5 shadow-sm">
                  <p className="text-[10px] uppercase tracking-[0.3em] text-slate-500">Reports</p>
                  <p className="mt-3 text-base font-semibold text-slate-900">PDF and Excel ready</p>
                </div>
              </div>
              <div className="mt-8 rounded-[1.75rem] border border-cyan-100 bg-gradient-to-r from-cyan-500/15 via-slate-50 to-emerald-500/10 p-5 text-sm leading-6 text-slate-700 shadow-lg shadow-cyan-200/30 backdrop-blur-sm">
                <div className="mb-2 text-xs uppercase tracking-[0.35em] text-cyan-700">Welcome Dialog</div>
                <p className="font-semibold text-slate-900">Instant visibility for operations, finance and client projects.</p>
                <p className="mt-2 text-slate-600">Your workspace is ready with invoices, ledgers, purchase orders and project tracking. Sign in to continue.</p>
              </div>
            </div>
          </div>

          <div className={`relative flex items-center justify-center overflow-hidden ${look === "premium" ? "rounded-[1.75rem] bg-gradient-to-br from-cyan-600 via-blue-600 to-emerald-500" : "rounded-xl bg-slate-100"} p-6 sm:p-10 lg:p-12`}>
            {look === "premium" && <div className="absolute inset-0 bg-[linear-gradient(135deg,_rgba(255,255,255,0.32),_transparent_32%),linear-gradient(315deg,_rgba(15,23,42,0.26),_transparent_35%)]" />}
            <div className={`smooth-panel relative z-10 w-full max-w-md border ${look === "premium" ? "rounded-[1.35rem] border-white/70 bg-white/[0.96] shadow-[0_38px_90px_-46px_rgba(15,23,42,0.70)] backdrop-blur-xl" : "rounded-xl border-slate-200 bg-white shadow-sm"} p-8`}>
              <div className="mb-8">
                <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm shadow-slate-900/5">
                  <Building2 className="h-5 w-5 text-cyan-500" />
                  Elite Mek Secure Login
                </div>
                <div className="mt-5 grid grid-cols-2 rounded-lg border border-slate-200 bg-slate-50 p-1">
                  <button type="button" onClick={() => setLook("premium")} className={`soft-click rounded-md px-3 py-2 text-sm font-semibold ${look === "premium" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`}>Premium</button>
                  <button type="button" onClick={() => setLook("standard")} className={`soft-click rounded-md px-3 py-2 text-sm font-semibold ${look === "standard" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`}>Standard</button>
                </div>
                <h2 className="mt-6 text-4xl font-bold tracking-tight text-slate-950">Welcome back</h2>
                <p className="mt-2 text-sm text-slate-600">Excellence in Engineering Since 2020.</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="admin@elitemek.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="bg-white text-slate-950 shadow-sm"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    <a href="#" className="text-sm font-semibold text-cyan-600 hover:text-cyan-700">Forgot password?</a>
                  </div>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="bg-white text-slate-950 shadow-sm"
                  />
                </div>

                <div className="flex items-center gap-3">
                  <Checkbox
                    id="remember"
                    checked={rememberMe}
                    onCheckedChange={(checked) => setRememberMe(checked === true)}
                  />
                  <label htmlFor="remember" className="text-sm font-medium leading-none text-slate-600">
                    Remember me for 30 days
                  </label>
                </div>

                <Button
                  type="submit"
                  size="lg"
                  className={look === "premium" ? "w-full bg-gradient-to-r from-cyan-500 via-fuchsia-500 to-emerald-500 text-white shadow-lg shadow-fuchsia-500/20 hover:opacity-95" : "w-full"}
                  disabled={isSimulating || loginMutation.isPending}
                >
                  {isSimulating || loginMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Authenticating...
                    </>
                  ) : (
                    "Sign In"
                  )}
                </Button>
              </form>

              <div className="mt-10 rounded-lg border border-slate-200 bg-slate-50 p-6 text-sm text-slate-600 shadow-sm">
                <p className="font-semibold text-slate-900">Ready for a smooth start?</p>
                <p>Use <span className="font-semibold text-slate-900">admin@elitemek.com</span> / <span className="font-semibold text-slate-900">admin123</span>.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
