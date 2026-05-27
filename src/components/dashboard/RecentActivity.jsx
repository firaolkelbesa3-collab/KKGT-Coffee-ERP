import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity } from 'lucide-react';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';

function ActionBadge({ type }) {
  const map = {
    Created: 'bg-green-100 text-green-700',
    Edited: 'bg-blue-100 text-blue-700',
    Archived: 'bg-amber-100 text-amber-700',
    Restored: 'bg-purple-100 text-purple-700',
  };
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold ${map[type] || 'bg-muted text-muted-foreground'}`}>
      {type}
    </span>
  );
}

export default function RecentActivity() {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['activity-log-recent'],
    queryFn: () => base44.entities.ActivityLog.list('-created_date', 10),
    refetchInterval: 30000,
    staleTime: 0,
  });

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Recent Activity</h3>
          <span className="text-[10px] text-muted-foreground">· last 10 actions · auto-refresh 30s</span>
        </div>
        <Link to="/activity-log" className="text-xs text-primary hover:underline">
          View all →
        </Link>
      </div>
      <div className="divide-y divide-border">
        {isLoading ? (
          <div className="px-4 py-6 text-sm text-muted-foreground text-center">Loading recent activity...</div>
        ) : logs.length === 0 ? (
          <div className="px-4 py-6 text-sm text-muted-foreground text-center">No activity recorded yet.</div>
        ) : (
          logs.map(l => (
            <div key={l.id} className="px-4 py-2.5 flex items-start gap-3 hover:bg-muted/20">
              <div className="text-[10px] text-muted-foreground font-mono whitespace-nowrap w-24 pt-0.5">
                {l.created_date ? format(new Date(l.created_date), 'dd MMM HH:mm') : '—'}
              </div>
              <div className="w-16 flex-shrink-0 pt-0.5">
                <ActionBadge type={l.action_type} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground truncate">{l.record_description || l.screen_name}</p>
                <p className="text-[10px] text-muted-foreground truncate">
                  <span className="font-semibold">{l.user_email}</span>
                  {l.screen_name && <span> · {l.screen_name}</span>}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}