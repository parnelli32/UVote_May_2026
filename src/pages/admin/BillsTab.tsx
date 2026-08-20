import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { logError } from '../../lib/errorLogger';
import { useAuth } from '../../context/AuthContext';
import { extractMsg, FormField, Spinner, ConfirmModal, inputStyle } from './AdminShared';
import { BILL_TOPICS } from '../../lib/billUtils';
import { formatNumber } from '../../lib/formatNumber';
import type { Bill, Representative, LegislativeBody } from '../../lib/types';

type BillFormState = {
  title: string;
  summary: string;
  bill_text: string;
  introduced_date: string;
  status: string;
  topic: string;
  bill_number: string;
  source_url: string;
  primary_sponsor_id: string;
  cosponsor_ids: string[];
  legislative_body_id: string;
  passed_by_suspension: boolean;
};

const EMPTY_BILL_FORM: BillFormState = {
  title: '', summary: '', bill_text: '', introduced_date: '',
  status: 'active', topic: '', bill_number: '', source_url: '', primary_sponsor_id: '', cosponsor_ids: [], legislative_body_id: '',
  passed_by_suspension: false,
};

const STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  active: { bg: '#E8F0EB', color: '#1B4332' },
  passed: { bg: '#E6F5EE', color: '#0e6b4a' },
  failed: { bg: '#FEF0EF', color: '#c0392b' },
  tabled: { bg: '#F1F5F9', color: '#475569' },
  pending_review: { bg: '#FEF6E7', color: '#8a5a00' },
};

const STATUS_LABELS: Record<string, string> = {
  pending_review: 'Pending review',
};

function statusLabel(status: string) {
  return STATUS_LABELS[status] ?? status.charAt(0).toUpperCase() + status.slice(1);
}

function wordCount(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function BillsTab({
  bodies,
  reps,
  onToast,
  onStatsChange,
}: {
  bodies: LegislativeBody[];
  reps: Representative[];
  onToast: (m: string) => void;
  onStatsChange: () => void;
}) {
  const { user } = useAuth();
  const PAGE_SIZE = 30;
  const [bills, setBills] = useState<Bill[]>([]);
  const [billSponsorCounts, setBillSponsorCounts] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<BillFormState>(EMPTY_BILL_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Bill | null>(null);
  const [billSearch, setBillSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const sortedReps = [...reps].sort((a, b) => a.last_name.localeCompare(b.last_name));
  const repMap = new Map(reps.map((r) => [r.representative_id, r]));

  // Debounce the search box before it drives a server-side query.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(billSearch.trim()), 300);
    return () => clearTimeout(t);
  }, [billSearch]);

  // Co-sponsor counts only for the bills currently on screen — this used to be a
  // single unbounded fetch of the whole bill_sponsors table, which doesn't scale
  // any better than the unbounded bills fetch this rewrite replaces.
  async function fetchSponsorCounts(billIds: string[]): Promise<Map<string, number>> {
    if (billIds.length === 0) return new Map();
    const { data } = await supabase.from('bill_sponsors').select('bill_id, sponsor_type').in('bill_id', billIds);
    const counts = new Map<string, number>();
    for (const row of data ?? []) {
      if (row.sponsor_type === 'cosponsor') {
        counts.set(row.bill_id, (counts.get(row.bill_id) ?? 0) + 1);
      }
    }
    return counts;
  }

  function billsQuery(search: string) {
    let q = supabase.from('bills').select('*')
      // created_at has real collisions (LegiScan bulk-inserts many bills in one
      // batch with an identical timestamp) — bill_id as a tie-breaker keeps
      // .range() pagination deterministic across page boundaries.
      .order('created_at', { ascending: false })
      .order('bill_id', { ascending: true });
    // Strip characters with special meaning in PostgREST's .or() filter syntax
    // (comma separates conditions, parens group them) so a search term can't
    // inject extra filter clauses.
    const term = search.replace(/[,()]/g, '');
    if (term) q = q.or(`title.ilike.%${term}%,bill_number.ilike.%${term}%`);
    return q;
  }

  // Reload from the first page — used on mount, on search change, and after save/delete.
  const loadGenerationRef = useRef(0);
  const load = useCallback(async (search: string) => {
    setLoading(true);
    loadGenerationRef.current += 1;
    const { data } = await billsQuery(search).range(0, PAGE_SIZE - 1);
    const rows = data ?? [];
    setBills(rows);
    setHasMore(rows.length === PAGE_SIZE);
    setBillSponsorCounts(await fetchSponsorCounts(rows.map((b) => b.bill_id)));
    setLoading(false);
  }, []);

  useEffect(() => { load(debouncedSearch); }, [debouncedSearch, load]);

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const generation = loadGenerationRef.current;
    const { data } = await billsQuery(debouncedSearch).range(bills.length, bills.length + PAGE_SIZE - 1);
    if (generation === loadGenerationRef.current) {
      const rows = data ?? [];
      setBills((prev) => [...prev, ...rows]);
      setHasMore(rows.length === PAGE_SIZE);
      const moreCounts = await fetchSponsorCounts(rows.map((b) => b.bill_id));
      if (generation === loadGenerationRef.current) {
        setBillSponsorCounts((prev) => new Map([...prev, ...moreCounts]));
      }
    }
    setLoadingMore(false);
  }

  function openAdd() {
    setEditingId(null);
    setForm(EMPTY_BILL_FORM);
    setFormError(null);
    setFormOpen(true);
  }

  async function openEdit(bill: Bill) {
    setEditingId(bill.bill_id);
    // Load existing co-sponsors
    const { data: sponsorRows } = await supabase
      .from('bill_sponsors')
      .select('representative_id, sponsor_type')
      .eq('bill_id', bill.bill_id)
      .eq('sponsor_type', 'cosponsor');
    setForm({
      title: bill.title,
      summary: bill.summary ?? '',
      bill_text: bill.bill_text ?? '',
      introduced_date: bill.introduced_date ?? '',
      status: bill.status,
      topic: bill.topic ?? '',
      bill_number: bill.bill_number ?? '',
      source_url: bill.source_url ?? '',
      primary_sponsor_id: bill.primary_sponsor_id ?? '',
      cosponsor_ids: (sponsorRows ?? []).map((r) => r.representative_id),
      legislative_body_id: bill.legislative_body_id ?? '',
      passed_by_suspension: bill.passed_by_suspension ?? false,
    });
    setFormError(null);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
    setForm(EMPTY_BILL_FORM);
    setFormError(null);
  }

  async function handleSave() {
    if (!form.title.trim() || !form.summary.trim() || !form.introduced_date || !form.legislative_body_id) {
      setFormError('Please fill in all required fields.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const selectedRep = form.primary_sponsor_id ? repMap.get(form.primary_sponsor_id) : null;
      const payload = {
        title: form.title.trim(),
        summary: form.summary.trim(),
        bill_text: form.bill_text.trim() || null,
        introduced_date: form.introduced_date,
        status: form.status,
        topic: form.topic || null,
        bill_number: form.bill_number.trim() || null,
        source_url: form.source_url.trim() || null,
        primary_sponsor: selectedRep ? `${selectedRep.first_name} ${selectedRep.last_name}` : null,
        primary_sponsor_id: form.primary_sponsor_id || null,
        legislative_body_id: form.legislative_body_id,
        passed_by_suspension: form.passed_by_suspension,
      };

      let billId = editingId;
      if (editingId) {
        const { error } = await supabase.from('bills').update(payload).eq('bill_id', editingId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('bills').insert(payload).select('bill_id').single();
        if (error) throw error;
        billId = data.bill_id;
      }

      if (billId) {
        // Sync primary sponsor in bill_sponsors
        if (form.primary_sponsor_id) {
          await supabase.from('bill_sponsors').upsert(
            { bill_id: billId, representative_id: form.primary_sponsor_id, sponsor_type: 'primary' },
            { onConflict: 'bill_id,representative_id' }
          );
        } else {
          await supabase.from('bill_sponsors')
            .delete()
            .eq('bill_id', billId)
            .eq('sponsor_type', 'primary');
        }

        // Sync co-sponsors
        await supabase.from('bill_sponsors')
          .delete()
          .eq('bill_id', billId)
          .eq('sponsor_type', 'cosponsor');
        if (form.cosponsor_ids.length > 0) {
          await supabase.from('bill_sponsors').insert(
            form.cosponsor_ids.map((rid) => ({
              bill_id: billId!,
              representative_id: rid,
              sponsor_type: 'cosponsor',
            }))
          );
        }
      }

      closeForm();
      await load(debouncedSearch);
      onStatsChange();
      onToast('Bill saved.');
    } catch (err) {
      const msg = extractMsg(err);
      await logError({ action: 'admin_bill_save', userId: user?.id, errorMessage: msg });
      setFormError(msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(bill: Bill) {
    try {
      await supabase.from('user_votes').delete().eq('bill_id', bill.bill_id);
      await supabase.from('rep_votes').delete().eq('bill_id', bill.bill_id);
      const { error } = await supabase.from('bills').delete().eq('bill_id', bill.bill_id);
      if (error) throw error;
      await load(debouncedSearch);
      onStatsChange();
      onToast('Bill deleted.');
    } catch (err) {
      const msg = extractMsg(err);
      await logError({ action: 'admin_bill_delete', userId: user?.id, errorMessage: msg });
    }
    setDeleteTarget(null);
  }

  return (
    <>
      {deleteTarget && (
        <ConfirmModal
          message={`Delete "${deleteTarget.title}"? This will also delete all votes on this bill and cannot be undone.`}
          onConfirm={() => handleDelete(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
      <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E2E8E4' }}>
        {/* Header */}
        <div style={{ padding: '12px 14px', borderBottom: '1px solid #F4F6F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.6px', color: '#94a3b8' }}>Bills</span>
          <button
            onClick={openAdd}
            style={{ background: '#1B4332', color: 'white', border: 'none', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
          >
            Add Bill
          </button>
        </div>

        {/* Inline Form */}
        {formOpen && (
          <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid #F4F6F0', background: '#FAFCFB' }}>
            <FormField label="Title *">
              <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                style={inputStyle} placeholder="Bill title" />
            </FormField>
            <FormField label={`Summary * — ${wordCount(form.summary)} words (target 120–180)`}>
              <textarea value={form.summary} onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))}
                rows={5} style={{ ...inputStyle, resize: 'vertical' }}
                placeholder="What it does / Who it affects / If it passes / If it doesn't pass." />
            </FormField>
            <FormField label="Bill Text (optional)">
              <textarea value={form.bill_text} onChange={(e) => setForm((f) => ({ ...f, bill_text: e.target.value }))}
                rows={3} style={{ ...inputStyle, resize: 'vertical' }} placeholder="Full bill text..." />
            </FormField>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <FormField label="Introduced Date *">
                <input type="date" value={form.introduced_date} onChange={(e) => setForm((f) => ({ ...f, introduced_date: e.target.value }))}
                  style={inputStyle} />
              </FormField>
              <FormField label="Status *">
                <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} style={inputStyle}>
                  <option value="active">Active</option>
                  <option value="passed">Passed</option>
                  <option value="failed">Failed</option>
                  <option value="tabled">Tabled</option>
                  <option value="pending_review">Pending review</option>
                </select>
              </FormField>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <FormField label="Topic">
                <select value={form.topic} onChange={(e) => setForm((f) => ({ ...f, topic: e.target.value }))} style={inputStyle}>
                  <option value="">Select topic…</option>
                  {BILL_TOPICS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </FormField>
              <FormField label="Bill Number">
                <input value={form.bill_number} onChange={(e) => setForm((f) => ({ ...f, bill_number: e.target.value }))}
                  style={inputStyle} placeholder="e.g. 250341" />
              </FormField>
            </div>
            <FormField label="Official source link">
              <input value={form.source_url} onChange={(e) => setForm((f) => ({ ...f, source_url: e.target.value }))}
                style={inputStyle} placeholder="e.g. https://phlcouncil.com/..." />
            </FormField>
            <div style={{ marginBottom: 10 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={form.passed_by_suspension}
                  onChange={(e) => setForm((f) => ({ ...f, passed_by_suspension: e.target.checked }))}
                  style={{ accentColor: '#1B4332', width: 14, height: 14, flexShrink: 0 }}
                />
                <span style={{ fontSize: 12, color: '#0f1724', fontWeight: 600 }}>Passed by suspension of rules</span>
              </label>
              {form.passed_by_suspension && form.status === 'passed' && (
                <div style={{ background: '#FFF3D6', borderRadius: 8, padding: '10px 12px', display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 8 }}>
                  <i className="fa-solid fa-circle-info" style={{ fontSize: 13, color: '#7A4F00', flexShrink: 0, marginTop: 1 }} />
                  <span style={{ fontSize: 11, color: '#7A4F00', lineHeight: 1.5 }}>
                    No rep votes need to be entered for this bill. Bills passed by suspension of rules do not produce individual member vote records.
                  </span>
                </div>
              )}
            </div>
            <FormField label="Primary Sponsor">
              <select
                value={form.primary_sponsor_id}
                onChange={(e) => setForm((f) => ({ ...f, primary_sponsor_id: e.target.value, cosponsor_ids: f.cosponsor_ids.filter((id) => id !== e.target.value) }))}
                style={inputStyle}
              >
                <option value="">No primary sponsor</option>
                {sortedReps.map((r) => (
                  <option key={r.representative_id} value={r.representative_id}>
                    {r.first_name} {r.last_name}{r.title ? ` — ${r.title}` : ''}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Co-Sponsors (optional)">
              <div style={{ ...inputStyle, height: 'auto', maxHeight: 120, overflowY: 'auto', padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                {sortedReps
                  .filter((r) => r.representative_id !== form.primary_sponsor_id)
                  .map((r) => {
                    const checked = form.cosponsor_ids.includes(r.representative_id);
                    return (
                      <label key={r.representative_id} style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', padding: '3px 2px', borderRadius: 4 }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setForm((f) => ({
                              ...f,
                              cosponsor_ids: checked
                                ? f.cosponsor_ids.filter((id) => id !== r.representative_id)
                                : [...f.cosponsor_ids, r.representative_id],
                            }));
                          }}
                          style={{ accentColor: '#1B4332', width: 13, height: 13, flexShrink: 0 }}
                        />
                        <span style={{ fontSize: 12, color: '#0f1724' }}>
                          {r.first_name} {r.last_name}{r.title ? ` — ${r.title}` : ''}
                        </span>
                      </label>
                    );
                  })}
                {sortedReps.filter((r) => r.representative_id !== form.primary_sponsor_id).length === 0 && (
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>No other representatives available.</span>
                )}
              </div>
            </FormField>
            <FormField label="Legislative Body *">
              <select value={form.legislative_body_id} onChange={(e) => setForm((f) => ({ ...f, legislative_body_id: e.target.value }))} style={inputStyle}>
                <option value="">Select body…</option>
                {bodies.map((b) => <option key={b.legislative_body_id} value={b.legislative_body_id}>{b.name}</option>)}
              </select>
            </FormField>
            {formError && <p style={{ fontSize: 11, color: '#F0455A', marginBottom: 8 }}>{formError}</p>}
            <button onClick={handleSave} disabled={saving}
              style={{ width: '100%', background: '#1B4332', color: 'white', border: 'none', borderRadius: 10, padding: 13, fontSize: 13, fontWeight: 700, cursor: 'pointer', marginBottom: 8 }}>
              {saving ? 'Saving…' : 'Save Bill'}
            </button>
            <button onClick={closeForm}
              style={{ width: '100%', background: 'white', color: '#64748b', border: '1px solid #E2E8E4', borderRadius: 10, padding: 13, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        )}

        {/* Bill rows */}
        {!loading && (
          <div style={{ padding: '8px 14px 0' }}>
            <input
              value={billSearch}
              onChange={(e) => setBillSearch(e.target.value)}
              placeholder="Search by bill number or title..."
              style={{ width: '100%', background: '#F4F6F0', border: '1px solid #E2E8E4', borderRadius: 8, padding: '8px 11px', fontSize: 12, color: '#0f1724', boxSizing: 'border-box', marginBottom: 8 }}
            />
          </div>
        )}
        {loading ? (
          <div style={{ padding: 20, textAlign: 'center' }}><Spinner /></div>
        ) : bills.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', fontSize: 12, color: '#94a3b8' }}>
            {debouncedSearch ? 'No bills match your search.' : 'No bills yet.'}
          </div>
        ) : (
          <>
            {bills.map((bill, i) => {
              const st = STATUS_STYLES[bill.status] ?? STATUS_STYLES.tabled;
              const date = bill.introduced_date ? new Date(bill.introduced_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
              const sponsorRep = bill.primary_sponsor_id ? repMap.get(bill.primary_sponsor_id) : null;
              const sponsorDisplay = sponsorRep
                ? `${sponsorRep.first_name} ${sponsorRep.last_name}`
                : bill.primary_sponsor ?? null;
              const cosponsorCount = billSponsorCounts.get(bill.bill_id) ?? 0;
              return (
                <div key={bill.bill_id} style={{ padding: '11px 14px', borderBottom: i < bills.length - 1 || hasMore ? '1px solid #F4F6F0' : 'none', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: '#0f1724', lineHeight: 1.35, marginBottom: 4, wordBreak: 'break-word' }}>{bill.title}</p>
                    {bill.bill_number && (
                      <span style={{ fontSize: 10, color: '#94a3b8', display: 'block', marginTop: 2, marginBottom: 3 }}>Bill #{bill.bill_number}</span>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
                      <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 10, background: st.bg, color: st.color }}>
                        {statusLabel(bill.status)}
                      </span>
                      {bill.passed_by_suspension && (
                        <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 10, background: '#F1F5F9', color: '#475569', marginLeft: 4 }}>
                          Suspension
                        </span>
                      )}
                      {date && <span style={{ fontSize: 10, color: '#94a3b8' }}>{date}</span>}
                    </div>
                    {sponsorDisplay && (
                      <span style={{ fontSize: 10, color: '#64748b', marginTop: 3, display: 'block' }}>
                        {sponsorDisplay}{cosponsorCount > 0 ? ` +${formatNumber(cosponsorCount)} co-sponsor${cosponsorCount !== 1 ? 's' : ''}` : ''}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                    <button onClick={() => openEdit(bill)}
                      style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer', color: '#1B4332', minHeight: 'unset' }}>
                      <i className="fa-solid fa-pen" style={{ fontSize: 14 }} />
                    </button>
                    <button onClick={() => setDeleteTarget(bill)}
                      style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer', color: '#F0455A', minHeight: 'unset' }}>
                      <i className="fa-solid fa-trash" style={{ fontSize: 14 }} />
                    </button>
                  </div>
                </div>
              );
            })}
            {hasMore && (
              <div style={{ padding: 12, textAlign: 'center' }}>
                <button onClick={loadMore} disabled={loadingMore}
                  style={{ background: 'white', color: '#1B4332', border: '1px solid #E2E8E4', borderRadius: 8, padding: '8px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  {loadingMore ? 'Loading…' : 'Load more'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
