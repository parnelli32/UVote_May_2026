import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { logError } from '../../lib/errorLogger';
import { useAuth } from '../../context/AuthContext';
import { extractMsg, Spinner } from './AdminShared';
import { formatNumber } from '../../lib/formatNumber';
import type { ErrorLog } from '../../lib/types';

export function ErrorLogsTab({ onStatsChange }: { onStatsChange: () => void }) {
  const { user } = useAuth();
  const [logs, setLogs] = useState<ErrorLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'unresolved' | 'resolved' | 'all'>('unresolved');
  const [search, setSearch] = useState('');
  const [unresolvedCount, setUnresolvedCount] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase.from('error_logs').select('*').order('created_at', { ascending: false });
    if (filter === 'unresolved') q = q.eq('resolved', false);
    else if (filter === 'resolved') q = q.eq('resolved', true);
    const { data } = await q;
    setLogs(data ?? []);
    const { count } = await supabase.from('error_logs').select('log_id', { count: 'exact', head: true }).eq('resolved', false);
    setUnresolvedCount(count ?? 0);
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  async function markResolved(logId: string) {
    try {
      const { error } = await supabase.from('error_logs').update({ resolved: true }).eq('log_id', logId);
      if (error) throw error;
      await load();
      onStatsChange();
    } catch (err) {
      const msg = extractMsg(err);
      await logError({ action: 'admin_resolve_error_log', userId: user?.id, errorMessage: msg });
    }
  }

  const filtered = search.trim()
    ? logs.filter((l) => (l.action ?? '').toLowerCase().includes(search.toLowerCase()))
    : logs;

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Summary bar */}
      <div style={{
        background: unresolvedCount > 0 ? '#FEF0EF' : '#E6F5EE',
        borderRadius: 8, padding: '10px 14px',
        color: unresolvedCount > 0 ? '#c0392b' : '#0e6b4a',
        fontSize: 12, fontWeight: 700,
      }}>
        {unresolvedCount > 0 ? `${formatNumber(unresolvedCount)} unresolved error${unresolvedCount !== 1 ? 's' : ''}` : 'No unresolved errors'}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8 }}>
        <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}
          style={{ flex: 1, fontSize: 12, border: '1px solid #E2E8E4', borderRadius: 8, padding: '8px 10px', background: 'white', color: '#0f1724' }}>
          <option value="all">All errors</option>
          <option value="unresolved">Unresolved</option>
          <option value="resolved">Resolved</option>
        </select>
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by action…"
          style={{ flex: 1, fontSize: 12, border: '1px solid #E2E8E4', borderRadius: 8, padding: '8px 10px', background: 'white', color: '#0f1724' }} />
      </div>

      {/* Log rows */}
      <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E2E8E4', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 20, textAlign: 'center' }}><Spinner /></div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', fontSize: 12, color: '#94a3b8' }}>No logs to show.</div>
        ) : (
          filtered.map((log, i) => (
            <div key={log.log_id} style={{ padding: '11px 14px', borderBottom: i < filtered.length - 1 ? '1px solid #F4F6F0' : 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#0f1724' }}>{log.action ?? '(no action)'}</span>
                <span style={{ fontSize: 10, color: '#94a3b8', flexShrink: 0, marginLeft: 8 }}>{formatDate(log.created_at)}</span>
              </div>
              {log.error_message && (
                <p style={{ fontSize: 11, color: '#64748b', lineHeight: 1.4, marginBottom: 3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                  {log.error_message}
                </p>
              )}
              {log.error_code && (
                <p style={{ fontSize: 10, color: '#94a3b8', marginBottom: 3 }}>Code: {log.error_code}</p>
              )}
              {log.resolved ? (
                <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 10, background: '#E6F5EE', color: '#0e6b4a' }}>Resolved</span>
              ) : (
                <button onClick={() => markResolved(log.log_id)}
                  style={{ background: 'none', border: 'none', padding: 0, fontSize: 11, fontWeight: 700, color: '#1B4332', textDecoration: 'underline', cursor: 'pointer' }}>
                  Mark Resolved
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
