import { Badge } from "@/components/ui/badge";

interface StatusBadgeProps {
  status: string;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const s = status.toLowerCase();
  
  let variant: "default" | "secondary" | "destructive" | "outline" = "default";
  let className = "";

  // Green statuses
  if (["active", "paid", "approved", "present", "completed"].includes(s)) {
    variant = "outline";
    className = "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
  } 
  // Amber statuses
  else if (["pending", "draft", "on hold", "late", "half day", "partial"].includes(s)) {
    variant = "outline";
    className = "bg-amber-500/10 text-amber-600 border-amber-500/20";
  }
  // Red statuses
  else if (["inactive", "overdue", "rejected", "absent", "failed", "out of stock"].includes(s)) {
    variant = "outline";
    className = "bg-rose-500/10 text-rose-600 border-rose-500/20";
  }
  // Default / Blue
  else {
    variant = "outline";
    className = "bg-blue-500/10 text-blue-600 border-blue-500/20";
  }

  return (
    <Badge variant={variant} className={`font-medium ${className}`}>
      {status}
    </Badge>
  );
}
