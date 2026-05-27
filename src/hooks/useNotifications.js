import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';

export function useNotifications() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['notifications', user?.email],
    queryFn: () => user ? base44.entities.Notification.filter({ recipient_email: user.email }, '-created_date', 200) : [],
    enabled: !!user,
    staleTime: 30000,
    refetchInterval: 30000,
  });

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const markReadMutation = useMutation({
    mutationFn: (id) => base44.entities.Notification.update(id, { is_read: true }),
    onMutate: async (id) => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: ['notifications', user?.email] });
      queryClient.setQueryData(['notifications', user?.email], old =>
        (old || []).map(n => n.id === id ? { ...n, is_read: true } : n)
      );
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      const unread = notifications.filter(n => !n.is_read);
      for (const n of unread) {
        await base44.entities.Notification.update(n.id, { is_read: true });
      }
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['notifications', user?.email] });
      queryClient.setQueryData(['notifications', user?.email], old =>
        (old || []).map(n => ({ ...n, is_read: true }))
      );
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  return {
    notifications,
    unreadCount,
    isLoading,
    markRead: markReadMutation.mutate,
    markAllRead: markAllReadMutation.mutate,
    isMarkingAll: markAllReadMutation.isPending,
  };
}

// Helper: get all users by role
export async function getUsersByRole(roles) {
  const users = await base44.entities.User.list();
  return users.filter(u => roles.includes(u.role));
}