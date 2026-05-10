import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

type MetricCardProps = {
  label: string;
  value: ReactNode;
  icon: LucideIcon;
  bg: string;
  className?: string;
  onClick?: () => void;
};

export function MetricCard({ label, value, icon: Icon, bg, className = "", onClick }: MetricCardProps) {
  return (
    <Card onClick={onClick} className={`${bg} border-transparent text-white overflow-hidden ${onClick ? "cursor-pointer transition-transform hover:-translate-y-0.5 hover:shadow-lg" : ""} ${className}`}>
      <CardContent className="p-5 flex items-center gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white/20 text-white">
          <Icon size={22} />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/80">{label}</p>
          <p className="mt-1 text-2xl font-bold leading-none">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
