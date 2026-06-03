import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import {
  UserPlus, Shield, Clock, CheckCircle2, XCircle, Mail,
  MoreHorizontal, Edit2, UserX, UserCheck, Trash2, RefreshCw, Copy, Check,
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';

// ── constants ────────────────────────────────────────────────────────────────
const ROLES = [
  { value: 'admin',            label: 'Admin',             desc: 'Full access to everything' },
  { value: 'supervisor',       label: 'Supervisor',        desc: 'Full access, cannot manage users' },
  { value: 'purchaser',        label: 'Purchaser',         desc: 'Purchase, warehouse, reports' },
  { value: 'warehouse_keeper', label: 'Warehouse Keeper',  desc: 'Warehouse receipts, bag ledger' },
  { value: 'process_manager',  label: 'Process Manager',   desc: 'Processing log, stock report' },
  { value: 'final_registrar',  label: 'Final Registrar',   desc: 'Output, export contracts, inspections' },
  { value: 'export_manager',   label: 'Export Manager',    desc: 'Export contracts, stock, materials' },
];

const ROLE_COLORS = {
  admin:            'bg-red-100 text-red-700 border-red-200',
  supervisor:       'bg-orange-100 text-orange-700 border-orange-200',
  purchaser:        'bg-blue-100 text-blue-700 border-blue-200',
  warehouse_keeper: 'bg-purple-100 text-purple-700 border-purple-200',
  process_manager:  'bg-teal-100 text-teal-700 border-teal-200',
  final_registrar:  'bg-indigo-100 text-indigo-700 border-indigo-200',
  export_manager:   'bg-green-100 text-green-700 border-green-200',
  unassigned:       'bg-gray-100 text-gray-500 border-gray-200',
};

function RoleBadge({ role }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${ROLE_COLORS[role] || ROLE_COLORS.unassigned}`}>
      {ROLES.find(r => r.value === role)?.label || role || 'Unassigned'}
    </span>
  );
}

// ── DB helpers ────────────────────────────────────────────────────────────────
async function fetchProfiles() {
  const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function fetchInvites() {
  const { data, error } = await supabase.from('user_invites').select('*').order('invited_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function updateProfile(id, patch) {
  const { error } = await supabase.from('profiles').update(patch).eq('id', id);
  if (error) throw error;
}

async function createInvite(email, role, note) {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from('user_invites').upsert(
    { email: email.toLowerCase().trim(), role, note: note || null, invited_by: user?.id || null, status: 'pending', accepted_at: null },
    { onConflict: 'email' }
  );
  if (error) throw error;
}

async function revokeInvite(id) {
  const { error } = await supabase.from('user_invites').update({ status: 'revoked' }).eq('id', id);
  if (error) throw error;
}

async function deleteInvite(id) {
  const { error } = await supabase.from('user_invites').delete().eq('id', id);
  if (error) throw error;
}

const APP_URL = typeof window !== 'undefined' ? window.location.origin : 'https://kkgt-coffee-erp.vercel.app';

// ── Invite dialog ─────────────────────────────────────────────────────────────
function InviteDialog({ open, onOpenChange, onSuccess }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false); // show share step after creation
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const reset = () => { setEmail(''); setRole(''); setNote(''); setErr(''); setDone(false); setCopied(false); };

  const shareMessage = `You have been invited to KKGT Import Export ERP as ${ROLES.find(r => r.value === role)?.label || role}.

To access the app:
1. Open this link: ${APP_URL}/login
2. Click "Sign in with Google"
3. Use this email: ${email}

Your role will be assigned automatically when you sign in.`;

  const copyMessage = () => {
    navigator.clipboard.writeText(shareMessage).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !role) { setErr('Email and role are required.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setErr('Enter a valid email address.'); return; }
    setBusy(true); setErr('');
    try {
      await createInvite(email, role, note);
      setDone(true);
      onSuccess?.();
    } catch (ex) {
      setErr(ex?.message?.includes('unique') ? 'An invite for this email already exists.' : (ex?.message || 'Failed to create invite.'));
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-primary" />
            {done ? 'Invite Created — Share with User' : 'Invite New User'}
          </DialogTitle>
        </DialogHeader>

        {done ? (
          /* ── Step 2: Share message ── */
          <div className="space-y-4 pt-2">
            <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-800 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              Invite created for <strong>{email}</strong> as <strong>{ROLES.find(r => r.value === role)?.label}</strong>.
              Their role will be assigned automatically when they sign in.
            </div>

            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Share this message with the user</p>
              <div className="rounded-lg bg-muted border border-border p-3 text-xs text-foreground whitespace-pre-wrap font-mono leading-relaxed">
                {shareMessage}
              </div>
              <Button type="button" variant="outline" className="w-full gap-2 h-9" onClick={copyMessage}>
                {copied ? <><Check className="w-4 h-4 text-green-600" /> Copied!</> : <><Copy className="w-4 h-4" /> Copy Message</>}
              </Button>
            </div>

            <p className="text-[11px] text-muted-foreground text-center">
              Send this via WhatsApp, Telegram, or email. No automatic email is sent by the system.
            </p>

            <div className="flex justify-end">
              <Button onClick={() => { reset(); onOpenChange(false); }}>Done</Button>
            </div>
          </div>
        ) : (
          /* ── Step 1: Form ── */
          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Email address *</Label>
              <Input value={email} onChange={e => setEmail(e.target.value)} type="email"
                placeholder="user@example.com" className="h-10" autoFocus />
              <p className="text-[11px] text-muted-foreground">
                Must match the Google account they will use to sign in.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Role *</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger className="h-10"><SelectValue placeholder="Choose a role…" /></SelectTrigger>
                <SelectContent>
                  {ROLES.map(r => (
                    <SelectItem key={r.value} value={r.value}>
                      <span className="font-medium">{r.label}</span>
                      <span className="text-muted-foreground text-xs ml-2">— {r.desc}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {role && (
                <div className={`rounded-lg px-3 py-2 border text-xs ${ROLE_COLORS[role]}`}>
                  <strong>{ROLES.find(r => r.value === role)?.label}</strong> — {ROLES.find(r => r.value === role)?.desc}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Note (optional)</Label>
              <Input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Warehouse team, Gimbi branch" className="h-10" />
            </div>

            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[11px] text-amber-800 flex items-start gap-2">
              <Mail className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              No email is sent automatically. After creating the invite, you will get a message to share with the user via WhatsApp or Telegram.
            </div>

            {err && <p className="text-xs text-destructive bg-destructive/5 border border-destructive/20 rounded-lg px-3 py-2">{err}</p>}

            <div className="flex gap-2 justify-end pt-1">
              <Button type="button" variant="outline" onClick={() => { reset(); onOpenChange(false); }}>Cancel</Button>
              <Button type="submit" disabled={busy} className="gap-2">
                <UserPlus className="w-4 h-4" /> {busy ? 'Creating…' : 'Create Invite'}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Edit role dialog ──────────────────────────────────────────────────────────
function EditRoleDialog({ user, open, onOpenChange, onSuccess }) {
  const [role, setRole] = useState(user?.role || '');
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  React.useEffect(() => { if (open) setRole(user?.role || ''); }, [open, user]);

  const save = async () => {
    if (!role) return;
    setBusy(true);
    try {
      await updateProfile(user.id, { role });
      toast({ title: 'Role updated', description: `${user.email} is now ${role}.` });
      onOpenChange(false); onSuccess?.();
    } catch (ex) {
      toast({ title: 'Error', description: ex?.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Edit2 className="w-4 h-4 text-primary" /> Change Role</DialogTitle></DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <p className="text-sm font-medium">{user?.full_name || user?.email}</p>
            <p className="text-xs text-muted-foreground">{user?.email}</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">New role</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned (no access)</SelectItem>
                {ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={save} disabled={busy || role === user?.role}>
              {busy ? 'Saving…' : 'Save Role'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── User row ──────────────────────────────────────────────────────────────────
function UserRow({ user, onEdit, onToggleActive }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const initials = (user.full_name || user.email || '?').slice(0, 2).toUpperCase();
  const isActive = user.is_active !== false;
  const lastSeen = user.last_sign_in_at
    ? formatDistanceToNow(new Date(user.last_sign_in_at), { addSuffix: true })
    : 'Never signed in';

  return (
    <div className={`flex items-center gap-3 px-4 py-3 border-b border-border last:border-0 hover:bg-muted/30 transition-colors ${!isActive ? 'opacity-50' : ''}`}>
      {/* Avatar */}
      <div className="w-9 h-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
        <span className="text-xs font-bold text-primary">{initials}</span>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold text-foreground truncate">{user.full_name || '—'}</p>
          {!isActive && <span className="text-[10px] font-bold bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">Deactivated</span>}
        </div>
        <p className="text-xs text-muted-foreground truncate">{user.email}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
          <Clock className="w-3 h-3" /> {lastSeen}
        </p>
      </div>

      {/* Role badge */}
      <div className="hidden sm:block flex-shrink-0">
        <RoleBadge role={user.role} />
      </div>

      {/* Actions */}
      <div className="relative flex-shrink-0">
        <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setMenuOpen(v => !v)}>
          <MoreHorizontal className="w-4 h-4" />
        </Button>
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 top-9 z-20 w-44 rounded-xl border border-border bg-popover shadow-lg overflow-hidden">
              <button className="w-full text-left text-sm px-3 py-2.5 hover:bg-muted flex items-center gap-2"
                onClick={() => { onEdit(user); setMenuOpen(false); }}>
                <Edit2 className="w-3.5 h-3.5 text-muted-foreground" /> Change Role
              </button>
              <button className="w-full text-left text-sm px-3 py-2.5 hover:bg-muted flex items-center gap-2"
                onClick={() => { onToggleActive(user); setMenuOpen(false); }}>
                {isActive
                  ? <><UserX className="w-3.5 h-3.5 text-destructive" /><span className="text-destructive">Deactivate</span></>
                  : <><UserCheck className="w-3.5 h-3.5 text-green-600" /><span className="text-green-600">Reactivate</span></>}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Invite row ────────────────────────────────────────────────────────────────
function InviteRow({ invite, onRevoke, onDelete }) {
  const isPending = invite.status === 'pending';
  const isAccepted = invite.status === 'accepted';

  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-0">
      <div className="w-9 h-9 rounded-full bg-amber-100 border border-amber-200 flex items-center justify-center flex-shrink-0">
        <Mail className="w-4 h-4 text-amber-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{invite.email}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          Invited {formatDistanceToNow(new Date(invite.invited_at), { addSuffix: true })}
          {invite.note && ` · ${invite.note}`}
        </p>
      </div>
      <RoleBadge role={invite.role} />
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {isPending && (
          <span className="text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full flex items-center gap-1">
            <Clock className="w-3 h-3" /> Pending
          </span>
        )}
        {isAccepted && (
          <span className="text-[10px] font-bold bg-green-100 text-green-700 border border-green-200 px-2 py-0.5 rounded-full flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Accepted
          </span>
        )}
        {invite.status === 'revoked' && (
          <span className="text-[10px] font-bold bg-red-100 text-red-600 border border-red-200 px-2 py-0.5 rounded-full">Revoked</span>
        )}
        {isPending && (
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive hover:text-destructive" onClick={() => onRevoke(invite)}>
            Revoke
          </Button>
        )}
        {(isAccepted || invite.status === 'revoked') && (
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => onDelete(invite)}>
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function UserManagement() {
  const [tab, setTab] = useState('users'); // 'users' | 'invites'
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [search, setSearch] = useState('');
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: profiles = [], isLoading: loadingProfiles, refetch: refetchProfiles } = useQuery({
    queryKey: ['profiles-admin'],
    queryFn: fetchProfiles,
    staleTime: 30000,
  });

  const { data: invites = [], isLoading: loadingInvites, refetch: refetchInvites } = useQuery({
    queryKey: ['user-invites'],
    queryFn: fetchInvites,
    staleTime: 30000,
  });

  const refetchAll = () => { refetchProfiles(); refetchInvites(); };

  const toggleActive = async (user) => {
    try {
      await updateProfile(user.id, { is_active: !user.is_active });
      toast({ title: user.is_active ? 'User deactivated' : 'User reactivated', description: user.email });
      refetchProfiles();
    } catch (ex) { toast({ title: 'Error', description: ex?.message, variant: 'destructive' }); }
  };

  const handleRevoke = async (invite) => {
    try { await revokeInvite(invite.id); refetchInvites(); toast({ title: 'Invite revoked', description: invite.email }); }
    catch (ex) { toast({ title: 'Error', description: ex?.message, variant: 'destructive' }); }
  };

  const handleDelete = async (invite) => {
    try { await deleteInvite(invite.id); refetchInvites(); }
    catch (ex) { toast({ title: 'Error', description: ex?.message, variant: 'destructive' }); }
  };

  // Stats
  const stats = useMemo(() => ({
    total: profiles.length,
    active: profiles.filter(p => p.is_active !== false && p.role !== 'unassigned').length,
    pending: profiles.filter(p => p.role === 'unassigned').length,
    pendingInvites: invites.filter(i => i.status === 'pending').length,
  }), [profiles, invites]);

  const filteredProfiles = useMemo(() => {
    const q = search.toLowerCase();
    return profiles.filter(p =>
      !q || p.email?.toLowerCase().includes(q) || p.full_name?.toLowerCase().includes(q) || p.role?.toLowerCase().includes(q)
    );
  }, [profiles, search]);

  // Role distribution
  const byRole = useMemo(() => {
    const map = {};
    profiles.forEach(p => { map[p.role] = (map[p.role] || 0) + 1; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [profiles]);

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Shield className="w-6 h-6 text-primary" /> User Management
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Invite team members and manage their roles.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={refetchAll}>
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button className="h-9 gap-2" onClick={() => setInviteOpen(true)}>
            <UserPlus className="w-4 h-4" /> Invite User
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total users', value: stats.total, icon: Shield, color: 'text-primary' },
          { label: 'Active with roles', value: stats.active, icon: CheckCircle2, color: 'text-green-600' },
          { label: 'Awaiting role', value: stats.pending, icon: Clock, color: 'text-amber-600' },
          { label: 'Pending invites', value: stats.pendingInvites, icon: Mail, color: 'text-blue-600' },
        ].map(s => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-3">
            <div className="flex items-center gap-2">
              <s.icon className={`w-4 h-4 ${s.color} flex-shrink-0`} />
              <span className="text-[11px] text-muted-foreground">{s.label}</span>
            </div>
            <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Role distribution */}
      {byRole.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Role Distribution</p>
          <div className="flex flex-wrap gap-2">
            {byRole.map(([role, count]) => (
              <div key={role} className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-medium ${ROLE_COLORS[role] || ROLE_COLORS.unassigned}`}>
                <span>{ROLES.find(r => r.value === role)?.label || role}</span>
                <span className="font-bold bg-white/40 px-1 rounded-full">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-border">
        {[
          { key: 'users',   label: 'Users',   count: profiles.length },
          { key: 'invites', label: 'Invites', count: invites.filter(i => i.status === 'pending').length },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${tab === t.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            {t.label}
            {t.count > 0 && <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${tab === t.key ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>{t.count}</span>}
          </button>
        ))}
      </div>

      {/* Users tab */}
      {tab === 'users' && (
        <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
          {/* Search */}
          <div className="p-3 border-b border-border">
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, email or role…" className="h-9 text-sm" />
          </div>

          {loadingProfiles ? (
            <div className="py-12 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
            </div>
          ) : filteredProfiles.length === 0 ? (
            <div className="py-12 text-center">
              <Shield className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">{search ? 'No users match your search.' : 'No users yet.'}</p>
            </div>
          ) : (
            filteredProfiles.map(user => (
              <UserRow key={user.id} user={user}
                onEdit={u => setEditUser(u)}
                onToggleActive={toggleActive} />
            ))
          )}
        </div>
      )}

      {/* Invites tab */}
      {tab === 'invites' && (
        <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
          {loadingInvites ? (
            <div className="py-12 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
            </div>
          ) : invites.length === 0 ? (
            <div className="py-12 text-center">
              <Mail className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No invites yet. Click "Invite User" to add someone.</p>
            </div>
          ) : (
            invites.map(invite => (
              <InviteRow key={invite.id} invite={invite} onRevoke={handleRevoke} onDelete={handleDelete} />
            ))
          )}
        </div>
      )}

      {/* Role guide */}
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Role Guide</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {ROLES.map(r => (
            <div key={r.value} className="flex items-center gap-2.5">
              <RoleBadge role={r.value} />
              <span className="text-xs text-muted-foreground">{r.desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Dialogs */}
      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} onSuccess={refetchAll} />
      {editUser && (
        <EditRoleDialog user={editUser} open={!!editUser} onOpenChange={v => { if (!v) setEditUser(null); }}
          onSuccess={() => { setEditUser(null); refetchProfiles(); }} />
      )}
    </div>
  );
}
