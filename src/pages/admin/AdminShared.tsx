import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';

export function extractMsg(err: unknown): string {
  return (err as { message?: string })?.message ?? (err instanceof Error ? err.message : null) ?? String(err);
}

// ─── Summary Stats ────────────────────────────────────────────────────────────

export type Stats = {
  users: number;
  votes: number;
  activeBills: number;
  unresolvedErrors: number;
};

export function useDashboardStats() {
  const [stats, setStats] = useState<Stats | null>(null);
  const load = useCallback(async () => {
    const [usersRes, votesRes, billsRes, errorsRes] = await Promise.all([
      supabase.from('users').select('user_id', { count: 'exact', head: true }),
      supabase.from('user_votes').select('user_vote_id', { count: 'exact', head: true }),
      supabase.from('bills').select('bill_id', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('error_logs').select('log_id', { count: 'exact', head: true }).eq('resolved', false),
    ]);
    setStats({
      users: usersRes.count ?? 0,
      votes: votesRes.count ?? 0,
      activeBills: billsRes.count ?? 0,
      unresolvedErrors: errorsRes.count ?? 0,
    });
  }, []);
  useEffect(() => { load(); }, [load]);
  return { stats, reload: load };
}

export function DashboardStats({ stats }: { stats: Stats | null }) {
  const items = [
    { label: 'Registered users', value: stats?.users ?? '—', color: '#0f1724' },
    { label: 'Votes cast', value: stats?.votes ?? '—', color: '#0f1724' },
    { label: 'Active bills', value: stats?.activeBills ?? '—', color: '#1B4332' },
    {
      label: 'Unresolved errors',
      value: stats?.unresolvedErrors ?? '—',
      color: (stats?.unresolvedErrors ?? 0) > 0 ? '#F0455A' : '#1DB97A',
    },
  ];
  return (
    <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E2E8E4', padding: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {items.map((item) => (
          <div key={item.label} style={{ background: '#F4F6F0', borderRadius: 8, padding: 10, textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: item.color, marginBottom: 4 }}>{item.value}</div>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{item.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────

export function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2200);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div style={{
      position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
      background: '#1B4332', color: 'white', padding: '10px 18px',
      borderRadius: 10, fontSize: 13, fontWeight: 700, zIndex: 9999,
      boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
    }}>
      {message}
    </div>
  );
}

// ─── Confirm Modal ────────────────────────────────────────────────────────────

export function ConfirmModal({
  message,
  onConfirm,
  onCancel,
}: {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9998, padding: 20,
    }}>
      <div style={{ background: 'white', borderRadius: 14, padding: 20, maxWidth: 340, width: '100%' }}>
        <p style={{ fontSize: 13, color: '#0f1724', lineHeight: 1.55, marginBottom: 16 }}>{message}</p>
        <button
          onClick={onConfirm}
          style={{ width: '100%', background: '#F0455A', color: 'white', border: 'none', borderRadius: 10, padding: 12, fontSize: 13, fontWeight: 700, marginBottom: 8, cursor: 'pointer' }}
        >
          Delete
        </button>
        <button
          onClick={onCancel}
          style={{ width: '100%', background: 'white', color: '#64748b', border: '1px solid #E2E8E4', borderRadius: 10, padding: 12, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

export const inputStyle: React.CSSProperties = {
  width: '100%', background: '#F4F6F0', border: '1px solid #E2E8E4', borderRadius: 8,
  padding: '9px 11px', fontSize: 12, color: '#0f1724', boxSizing: 'border-box',
};

export function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', color: '#374151', marginBottom: 4 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

export function Spinner() {
  return (
    <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
      {[0, 150, 300].map((d) => (
        <span key={d} className="w-1.5 h-1.5 rounded-full animate-bounce"
          style={{ background: '#1B4332', animationDelay: `${d}ms`, display: 'inline-block', width: 6, height: 6, borderRadius: '50%' }} />
      ))}
    </div>
  );
}
