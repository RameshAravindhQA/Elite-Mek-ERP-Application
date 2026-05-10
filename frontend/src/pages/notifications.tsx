import React, { useState } from "react";
import { useListNotifications, useMarkNotificationRead, useMarkAllNotificationsRead, getListNotificationsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { Info, AlertTriangle, XCircle, CheckCircle, Check, Loader2 } from "lucide-react";
import { Pagination } from "@/components/Pagination";

const getIcon = (type: string) => {
  switch (type?.toLowerCase()) {
    case "warning": return <AlertTriangle className="w-5 h-5 text-amber-500" />;
    case "error": return <XCircle className="w-5 h-5 text-red-500" />;
    case "success": return <CheckCircle className="w-5 h-5 text-green-500" />;
    default: return <Info className="w-5 h-5 text-blue-500" />;
  }
};

export default function Notifications() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useListNotifications({ page, limit: 10 });
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const unreadCount = data?.unreadCount || 0;

  const handleMarkRead = async (id: number) => {
    try {
      await markRead.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
    } catch (error) {
      toast({ title: "Failed to mark notification as read", variant: "destructive" });
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllRead.mutateAsync();
      toast({ title: "All notifications marked as read" });
      queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
    } catch (error) {
      toast({ title: "Failed to mark all as read", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex justify-between items-center border-b pb-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
          {unreadCount > 0 && (
            <Badge variant="default" className="bg-primary text-primary-foreground">
              {unreadCount} unread
            </Badge>
          )}
        </div>
        <Button variant="outline" onClick={handleMarkAllRead} disabled={unreadCount === 0 || markAllRead.isPending}>
          <Check className="w-4 h-4 mr-2" /> Mark All Read
        </Button>
      </div>

      <div className="space-y-3">
        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : data?.data?.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground border rounded-lg bg-muted/20">No notifications</div>
        ) : (
          data?.data?.map((notification) => (
            <div 
              key={notification.id} 
              className={`flex items-start gap-4 p-4 rounded-lg border transition-colors ${notification.isRead ? 'bg-card' : 'bg-blue-50/40 dark:bg-blue-950/20 border-blue-100 dark:border-blue-900'}`}
            >
              <div className="shrink-0 mt-1">
                {getIcon(notification.type)}
              </div>
              <div className="flex-1 space-y-1">
                <div className="flex items-center justify-between">
                  <p className={`font-medium ${notification.isRead ? 'text-foreground' : 'text-foreground'}`}>
                    {notification.title}
                  </p>
                  <span className="text-xs text-muted-foreground whitespace-nowrap ml-4">
                    {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">{notification.message}</p>
                <div className="pt-2">
                  <Badge variant="secondary" className="text-xs font-normal">{notification.module}</Badge>
                </div>
              </div>
              {!notification.isRead && (
                <div className="flex flex-col items-end justify-center shrink-0 h-full gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-blue-500 mb-1" />
                  <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => handleMarkRead(notification.id)}>
                    Mark Read
                  </Button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {data?.pagination && (
        <Pagination 
          page={page} 
          totalPages={data.pagination.totalPages} 
          onPageChange={setPage} 
        />
      )}
    </div>
  );
}
