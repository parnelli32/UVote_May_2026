import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { logError } from '../../lib/errorLogger';
import { useAuth } from '../../context/AuthContext';
import { extractMsg, FormField, Spinner, inputStyle } from './AdminShared';
import { formatNumber } from '../../lib/formatNumber';
import type { Bill, Representative, RepVote } from '../../lib/types';

type BulkVoteFormState = {
  bill_id: string;
  vote: string;
  explanation: string;
  scope: 'all' | 'district' | 'atlarge';
};

const EMPTY_BULK_FORM: BulkVoteFormState = { bill_id: '', vote: 'support', explanation: '', scope: 'all' };

function BulkVoteEntry({
  bills,
  reps,
  onToast,
  onRefresh,
}: {
  bills: Bill[];
  reps: Representative[];
  onToast: (m: string) => void;
  onRefresh: () => void;
}) {
  const { user } = useAuth();
  const [form, setForm] = useState<BulkVoteFormState>(EMPTY_BULK_FORM);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ inserted: number; skipped: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedBill = bills.find((b) => b.bill_id === form.bill_id) ?? null;
  const isSuspension = selectedBill?.passed_by_suspension ?? false;

  async function handleSubmit() {
    if (!form.bill_id || !form.vote) { setError('Please select a bill and a vote.'); return; }
    setSaving(true);
    setError(null);
    setResult(null);
    try {
      // Step 1 — resolve reps for scope
      const billBodyId = selectedBill?.legislative_body_id;
      let scopedReps: Representative[];
      if (!billBodyId) {
        scopedReps = reps;
      } else {
        const bodyReps = reps.filter((r) => r.legislative_body_id === billBodyId);
        if (form.scope === 'district') {
          scopedReps = bodyReps.filter((r) => r.district_id !== null);
        } else if (form.scope === 'atlarge') {
          scopedReps = bodyReps.filter((r) => r.district_id === null);
        } else {
          scopedReps = bodyReps;
        }
      }

      // Step 2 — check existing votes
      const { data: existing, error: existErr } = await supabase
        .from('rep_votes')
        .select('representative_id')
        .eq('bill_id', form.bill_id);
      if (existErr) throw existErr;

      const existingIds = new Set((existing ?? []).map((rv) => rv.representative_id as string));

      // Step 3 — batch insert only those without a vote
      const toInsert = scopedReps
        .filter((r) => !existingIds.has(r.representative_id))
        .map((r) => ({
          bill_id: form.bill_id,
          representative_id: r.representative_id,
          vote: form.vote,
          explanation: form.explanation.trim() || null,
        }));

      const skipped = scopedReps.length - toInsert.length;

      if (toInsert.length > 0) {
        const { error: insertErr } = await supabase.from('rep_votes').insert(toInsert);
        if (insertErr) throw insertErr;
      }

      setResult({ inserted: toInsert.length, skipped });
      setForm(EMPTY_BULK_FORM);
      onRefresh();
      if (toInsert.length > 0) onToast(`${formatNumber(toInsert.length)} rep vote${toInsert.length !== 1 ? 's' : ''} inserted.`);
    } catch (err) {
      const msg = extractMsg(err);
      await logError({ action: 'admin_bulk_vote_insert', userId: user?.id, errorMessage: msg });
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E2E8E4', padding: 14, marginBottom: 12 }}>
      <span style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: '#94a3b8', marginBottom: 6 }}>
        Bulk Vote Entry
      </span>
      <p style={{ fontSize: 11, color: '#64748b', lineHeight: 1.5, marginBottom: 14 }}>
        Record the same vote for all council members on a single bill at once. Use for unanimous votes. Bills passed by suspension of rules should be marked on the bill record instead.
      </p>

      <FormField label="Bill">
        <select value={form.bill_id} onChange={(e) => { setForm((f) => ({ ...f, bill_id: e.target.value })); setResult(null); }} style={inputStyle}>
          <option value="">Select bill…</option>
          {bills.map((b) => <option key={b.bill_id} value={b.bill_id}>{b.title} ({b.status})</option>)}
        </select>
        {isSuspension && (
          <div style={{ background: '#FEF0EF', borderRadius: 8, padding: '8px 10px', fontSize: 11, color: '#c0392b', marginTop: 6 }}>
            <i className="fa-solid fa-triangle-exclamation" style={{ fontSize: 11, marginRight: 5 }} />
            This bill is marked as passed by suspension of rules. Individual votes are typically not recorded for suspension bills.
          </div>
        )}
      </FormField>

      <FormField label="Vote">
        <select value={form.vote} onChange={(e) => setForm((f) => ({ ...f, vote: e.target.value }))} style={inputStyle}>
          <option value="support">Support</option>
          <option value="oppose">Oppose</option>
        </select>
      </FormField>

      <FormField label="Explanation (optional)">
        <textarea
          value={form.explanation}
          onChange={(e) => setForm((f) => ({ ...f, explanation: e.target.value }))}
          rows={3}
          style={{ ...inputStyle, resize: 'vertical' }}
          placeholder="Applied to all rep vote records created."
        />
        <span style={{ display: 'block', fontSize: 10, color: '#94a3b8', marginTop: 4 }}>Applied to all rep vote records created.</span>
      </FormField>

      <FormField label="Apply to">
        <select value={form.scope} onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value as BulkVoteFormState['scope'] }))} style={inputStyle}>
          <option value="all">All council members</option>
          <option value="district">District members only (10 seats)</option>
          <option value="atlarge">At-large members only (7 seats)</option>
        </select>
      </FormField>

      {error && <p style={{ fontSize: 11, color: '#F0455A', marginBottom: 8 }}>{error}</p>}

      {result && (
        <div style={{
          background: result.inserted === 0 ? '#FFF3D6' : '#E6F5EE',
          color: result.inserted === 0 ? '#7A4F00' : '#0e6b4a',
          borderRadius: 8, padding: '10px 12px', fontSize: 12, fontWeight: 700, marginBottom: 12,
        }}>
          {result.inserted === 0 && result.skipped > 0
            ? 'All council members already have votes recorded for this bill.'
            : `${result.inserted} vote${result.inserted !== 1 ? 's' : ''} inserted. ${result.skipped} already had votes — skipped.`}
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={saving}
        style={{ width: '100%', background: '#1B4332', color: 'white', border: 'none', borderRadius: 10, padding: 12, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
      >
        {saving ? 'Inserting…' : 'Insert Rep Votes'}
      </button>
    </div>
  );
}

type RepVoteFormState = {
  bill_id: string;
  representative_id: string;
  vote: string;
  explanation: string;
};

const EMPTY_RV_FORM: RepVoteFormState = { bill_id: '', representative_id: '', vote: 'support', explanation: '' };

export function RepVotesTab({
  bills,
  reps,
  onToast,
}: {
  bills: Bill[];
  reps: Representative[];
  onToast: (m: string) => void;
}) {
  const { user } = useAuth();
  const [repVotes, setRepVotes] = useState<(RepVote & { rep_name: string; bill_title: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<RepVoteFormState>(EMPTY_RV_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('rep_votes').select('*').order('created_at', { ascending: false });
    const billMap = new Map(bills.map((b) => [b.bill_id, b.title]));
    const repMap = new Map(reps.map((r) => [r.representative_id, `${r.first_name} ${r.last_name}`]));
    setRepVotes((data ?? []).map((rv) => ({
      ...rv,
      rep_name: repMap.get(rv.representative_id ?? '') ?? '—',
      bill_title: billMap.get(rv.bill_id ?? '') ?? '—',
    })));
    setLoading(false);
  }, [bills, reps]);

  useEffect(() => { load(); }, [load]);

  function openAdd() {
    setEditingId(null);
    setForm(EMPTY_RV_FORM);
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(rv: RepVote) {
    setEditingId(rv.rep_vote_id);
    setForm({
      bill_id: rv.bill_id ?? '',
      representative_id: rv.representative_id ?? '',
      vote: rv.vote,
      explanation: rv.explanation ?? '',
    });
    setFormError(null);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
    setForm(EMPTY_RV_FORM);
    setFormError(null);
  }

  async function handleSave() {
    if (!form.bill_id || !form.representative_id || !form.vote) {
      setFormError('Please fill in all required fields.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (!editingId) {
        const { data: existing } = await supabase
          .from('rep_votes')
          .select('rep_vote_id')
          .eq('representative_id', form.representative_id)
          .eq('bill_id', form.bill_id)
          .maybeSingle();
        if (existing) {
          setFormError('A vote for this representative on this bill already exists. Use the edit button to update it.');
          setSaving(false);
          return;
        }
      }
      const payload = {
        bill_id: form.bill_id,
        representative_id: form.representative_id,
        vote: form.vote,
        explanation: form.explanation.trim() || null,
      };
      if (editingId) {
        const { error } = await supabase.from('rep_votes').update(payload).eq('rep_vote_id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('rep_votes').insert(payload);
        if (error) throw error;
      }
      closeForm();
      await load();
      onToast('Rep vote saved.');
    } catch (err) {
      const msg = extractMsg(err);
      await logError({ action: 'admin_rep_vote_save', userId: user?.id, errorMessage: msg });
      setFormError(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <BulkVoteEntry bills={bills} reps={reps} onToast={onToast} onRefresh={load} />
      <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E2E8E4' }}>
      <div style={{ padding: '12px 14px', borderBottom: '1px solid #F4F6F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.6px', color: '#94a3b8' }}>Rep Votes</span>
        <button onClick={openAdd}
          style={{ background: '#1B4332', color: 'white', border: 'none', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
          Add Rep Vote
        </button>
      </div>

      {formOpen && (
        <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid #F4F6F0', background: '#FAFCFB' }}>
          <FormField label="Bill *">
            <select value={form.bill_id} onChange={(e) => setForm((f) => ({ ...f, bill_id: e.target.value }))} style={inputStyle}>
              <option value="">Select bill…</option>
              {bills.map((b) => <option key={b.bill_id} value={b.bill_id}>{b.title} ({b.status})</option>)}
            </select>
          </FormField>
          <FormField label="Representative *">
            <select value={form.representative_id} onChange={(e) => setForm((f) => ({ ...f, representative_id: e.target.value }))} style={inputStyle}>
              <option value="">Select representative…</option>
              {reps.map((r) => <option key={r.representative_id} value={r.representative_id}>{r.first_name} {r.last_name} — {r.title}</option>)}
            </select>
          </FormField>
          <FormField label="Vote *">
            <select value={form.vote} onChange={(e) => setForm((f) => ({ ...f, vote: e.target.value }))} style={inputStyle}>
              <option value="support">Support</option>
              <option value="oppose">Oppose</option>
            </select>
          </FormField>
          <FormField label="Explanation (optional — include if vote diverges from constituent majority)">
            <textarea value={form.explanation} onChange={(e) => setForm((f) => ({ ...f, explanation: e.target.value }))}
              rows={3} style={{ ...inputStyle, resize: 'vertical' }} placeholder="Representative's explanation…" />
          </FormField>
          {formError && <p style={{ fontSize: 11, color: '#F0455A', marginBottom: 8 }}>{formError}</p>}
          <button onClick={handleSave} disabled={saving}
            style={{ width: '100%', background: '#1B4332', color: 'white', border: 'none', borderRadius: 10, padding: 13, fontSize: 13, fontWeight: 700, cursor: 'pointer', marginBottom: 8 }}>
            {saving ? 'Saving…' : 'Save Rep Vote'}
          </button>
          <button onClick={closeForm}
            style={{ width: '100%', background: 'white', color: '#64748b', border: '1px solid #E2E8E4', borderRadius: 10, padding: 13, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
      )}

      {loading ? (
        <div style={{ padding: 20, textAlign: 'center' }}><Spinner /></div>
      ) : repVotes.length === 0 ? (
        <div style={{ padding: 20, textAlign: 'center', fontSize: 12, color: '#94a3b8' }}>No rep votes yet.</div>
      ) : (
        repVotes.map((rv, i) => {
          const isSupport = rv.vote === 'support';
          return (
            <div key={rv.rep_vote_id} style={{ padding: '12px 14px', borderBottom: i < repVotes.length - 1 ? '1px solid #F4F6F0' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              {/* Vote indicator stripe */}
              <div style={{ width: 3, borderRadius: 2, alignSelf: 'stretch', flexShrink: 0, background: isSupport ? '#1DB97A' : '#F0455A' }} />

              <div style={{ flex: 1, minWidth: 0 }}>
                {/* Top row: rep name + vote pill */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#0f1724' }}>{rv.rep_name}</span>
                  <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 10, flexShrink: 0, background: isSupport ? '#E8F0EB' : '#FEF0EF', color: isSupport ? '#0e6b4a' : '#c0392b' }}>
                    {isSupport ? 'Supported' : 'Opposed'}
                  </span>
                  {rv.explanation && (
                    <i className="fa-solid fa-comment-dots" style={{ fontSize: 10, color: '#94a3b8', flexShrink: 0 }} title="Has explanation" />
                  )}
                </div>
                {/* Bill title */}
                <p style={{ fontSize: 11, color: '#64748b', lineHeight: 1.35, margin: 0, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                  {rv.bill_title}
                </p>
              </div>

              <button onClick={() => openEdit(rv)}
                style={{ background: 'none', border: 'none', padding: '6px 6px', cursor: 'pointer', color: '#94a3b8', minHeight: 'unset', flexShrink: 0, borderRadius: 6, transition: 'color 0.15s' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#1B4332')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
              >
                <i className="fa-solid fa-pen" style={{ fontSize: 12 }} />
              </button>
            </div>
          );
        })
      )}
      </div>
    </div>
  );
}
