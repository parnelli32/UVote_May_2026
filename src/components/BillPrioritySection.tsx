import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { logError } from '../lib/errorLogger';
import { useAuth } from '../context/AuthContext';
import type { UserVote } from '../lib/types';

type BillPrioritySectionProps = {
  billId: string;
  billStatus: string;
  legislativeBodyId: string | null;
  userVote: UserVote | null;
};

const MAX_SLOTS = 3;
const MAX_STATEMENT_CHARS = 280;

type CommunityVoice = {
  priority_id: string;
  priority_type: 'endorse' | 'block';
  statement: string;
  created_at: string;
};

export function BillPrioritySection({
  billId,
  billStatus,
  legislativeBodyId,
  userVote,
}: BillPrioritySectionProps) {
  const { user, districtUserIds: cachedDistrictUserIds } = useAuth();

  const [userPriority, setUserPriority] = useState<'endorse' | 'block' | null>(null);
  const [priorityId, setPriorityId] = useState<string | null>(null);
  const [userStatement, setUserStatement] = useState<string | null>(null);
  const [endorseSlotsUsed, setEndorseSlotsUsed] = useState(0);
  const [blockSlotsUsed, setBlockSlotsUsed] = useState(0);
  const [communityVoices, setCommunityVoices] = useState<CommunityVoice[]>([]);
  const [totalEndorsements, setTotalEndorsements] = useState(0);
  const [totalBlocks, setTotalBlocks] = useState(0);
  const [statement, setStatement] = useState('');
  const [showInput, setShowInput] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const fetchPriorityData = useCallback(async () => {
    if (!user || !legislativeBodyId) return;
    setLoading(true);
    try {
      const districtIds = cachedDistrictUserIds.size > 0
        ? [...cachedDistrictUserIds]
        : [];

      const [existingRes, slotsRes, totalsRes, voicesRes] = await Promise.all([
        supabase
          .from('bill_priorities')
          .select('priority_id, priority_type, statement')
          .eq('bill_id', billId)
          .eq('user_id', user.id)
          .maybeSingle(),
        supabase
          .from('bill_priorities')
          .select('priority_id, priority_type, bills(status)')
          .eq('user_id', user.id)
          .eq('legislative_body_id', legislativeBodyId),
        supabase
          .from('bill_priorities')
          .select('priority_type')
          .eq('bill_id', billId),
        districtIds.length > 0
          ? supabase
              .from('bill_priorities')
              .select('priority_id, priority_type, statement, created_at')
              .eq('bill_id', billId)
              .not('statement', 'is', null)
              .neq('statement', '')
              .in('user_id', districtIds)
              .order('created_at', { ascending: false })
              .limit(5)
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (existingRes.data) {
        setUserPriority(existingRes.data.priority_type as 'endorse' | 'block');
        setPriorityId(existingRes.data.priority_id);
        setUserStatement(existingRes.data.statement ?? null);
      } else {
        setUserPriority(null);
        setPriorityId(null);
        setUserStatement(null);
      }

      if (slotsRes.data) {
        type SlotRow = { priority_id: string; priority_type: string; bills: { status: string } | null };
        const activeRows = (slotsRes.data as SlotRow[]).filter(
          (r) => r.bills?.status === 'active'
        );
        setEndorseSlotsUsed(activeRows.filter((r) => r.priority_type === 'endorse').length);
        setBlockSlotsUsed(activeRows.filter((r) => r.priority_type === 'block').length);
      }

      if (totalsRes.data) {
        type TotalRow = { priority_type: string };
        setTotalEndorsements((totalsRes.data as TotalRow[]).filter((r) => r.priority_type === 'endorse').length);
        setTotalBlocks((totalsRes.data as TotalRow[]).filter((r) => r.priority_type === 'block').length);
      }

      if (voicesRes.data) {
        const voices = (voicesRes.data as CommunityVoice[]).filter(
          (v) => v.priority_id !== existingRes.data?.priority_id
        );
        setCommunityVoices(voices);
      }
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? (err instanceof Error ? err.message : null) ?? String(err);
      logError({ action: 'fetch_priority_data', userId: user.id, errorMessage: msg });
    } finally {
      setLoading(false);
    }
  }, [user, billId, legislativeBodyId, cachedDistrictUserIds]);

  useEffect(() => {
    if (user && legislativeBodyId) {
      fetchPriorityData();
    }
  }, [user, billId, legislativeBodyId, cachedDistrictUserIds, fetchPriorityData]);

  async function handlePriority(type: 'endorse' | 'block') {
    if (!user || !legislativeBodyId) return;
    setSubmitError(null);

    if (type === 'endorse' && userVote?.vote !== 'support') {
      setSubmitError('You must support this bill to endorse it.');
      return;
    }
    if (type === 'block' && userVote?.vote !== 'oppose') {
      setSubmitError('You must oppose this bill to block it.');
      return;
    }
    if (type === 'endorse' && endorseSlotsUsed >= MAX_SLOTS) {
      setSubmitError("You've used all 3 endorsement slots.");
      return;
    }
    if (type === 'block' && blockSlotsUsed >= MAX_SLOTS) {
      setSubmitError("You've used all 3 block slots.");
      return;
    }

    setSubmitting(true);
    try {
      const { error: insertErr } = await supabase.from('bill_priorities').insert({
        priority_type: type,
        user_id: user.id,
        bill_id: billId,
        legislative_body_id: legislativeBodyId,
        statement: statement.trim() || null,
      });
      if (insertErr) throw insertErr;
      await fetchPriorityData();
      setStatement('');
      setShowInput(false);
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? (err instanceof Error ? err.message : null) ?? String(err);
      logError({ action: 'submit_bill_priority', userId: user.id, errorMessage: msg });
      setSubmitError('Could not save your priority. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRemove() {
    if (!priorityId || !user) return;
    setRemoving(true);
    try {
      const { error: delErr } = await supabase
        .from('bill_priorities')
        .delete()
        .eq('priority_id', priorityId);
      if (delErr) throw delErr;
      await fetchPriorityData();
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? (err instanceof Error ? err.message : null) ?? String(err);
      logError({ action: 'remove_bill_priority', userId: user.id, errorMessage: msg });
    } finally {
      setRemoving(false);
    }
  }

  if (!user || !userVote || billStatus !== 'active') return null;

  const pendingType = userVote.vote === 'support' ? 'endorse' : 'block';
  const showCommunity = communityVoices.length > 0 || totalEndorsements > 0 || totalBlocks > 0;

  return (
    <div style={{
      marginTop: 10,
      background: 'white',
      borderRadius: 12,
      border: '1px solid #E2E8E4',
      overflow: 'hidden',
      padding: '14px 16px 16px',
    }}>
      <span style={{
        display: 'block',
        fontSize: 11,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.8px',
        color: '#94a3b8',
        marginBottom: 10,
      }}>
        Your Priority
      </span>

      {loading ? null : userPriority ? (
        /* ── EXISTING PRIORITY ── */
        <div style={{
          background: userPriority === 'endorse' ? '#E6F5EE' : '#FEF0EF',
          borderRadius: 8,
          padding: 12,
          marginBottom: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 12,
              fontWeight: 700,
              padding: '3px 9px',
              borderRadius: 10,
              background: userPriority === 'endorse' ? '#1B4332' : '#c0392b',
              color: 'white',
            }}>
              {userPriority === 'endorse' ? 'Endorsed' : 'Blocked'}
            </span>
            <span style={{ fontSize: 13, color: '#64748b' }}>
              You've marked this bill as a priority.
            </span>
          </div>

          {userStatement && (
            <div style={{
              borderLeft: `2px solid ${userPriority === 'endorse' ? '#1DB97A' : '#F0455A'}`,
              paddingLeft: 8,
              marginTop: 8,
            }}>
              <p style={{
                fontSize: 13,
                color: '#374151',
                fontStyle: 'italic',
                lineHeight: 1.5,
                margin: 0,
              }}>
                {userStatement}
              </p>
            </div>
          )}

          <button
            onClick={handleRemove}
            disabled={removing}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              marginTop: 10,
              fontSize: 13,
              fontWeight: 700,
              color: '#94a3b8',
              textDecoration: 'underline',
              cursor: removing ? 'default' : 'pointer',
              display: 'block',
            }}
          >
            Remove priority
          </button>
        </div>
      ) : showInput ? (
        /* ── STATEMENT INPUT ── */
        <div>
          <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.5, marginBottom: 8 }}>
            {pendingType === 'endorse'
              ? 'Add a public statement about why this is your priority (optional). Your statement may be shared with your representative.'
              : 'Add a public statement about why you want this bill stopped (optional). Your statement may be shared with your representative.'}
          </p>
          <textarea
            rows={3}
            value={statement}
            onChange={(e) => setStatement(e.target.value)}
            maxLength={MAX_STATEMENT_CHARS}
            placeholder="What makes this your priority? (optional)"
            style={{
              resize: 'none',
              width: '100%',
              background: '#F4F6F0',
              border: '1px solid #E2E8E4',
              borderRadius: 8,
              padding: '9px 11px',
              fontSize: 13,
              color: '#0f1724',
              boxSizing: 'border-box',
            }}
          />
          <p style={{ textAlign: 'right', fontSize: 12, color: '#94a3b8', margin: '2px 0 10px' }}>
            {statement.length} / {MAX_STATEMENT_CHARS}
          </p>
          {submitError && (
            <p style={{ fontSize: 13, color: '#c0392b', fontWeight: 700, marginBottom: 8 }}>
              {submitError}
            </p>
          )}
          <button
            onClick={() => handlePriority(pendingType)}
            disabled={submitting}
            style={{
              width: '100%',
              background: pendingType === 'endorse' ? '#1B4332' : '#c0392b',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              padding: 11,
              fontSize: 13,
              fontWeight: 700,
              marginBottom: 6,
              opacity: submitting ? 0.6 : 1,
            }}
          >
            {pendingType === 'endorse' ? 'Endorse' : 'Block'}
          </button>
          <button
            onClick={() => { setShowInput(false); setStatement(''); setSubmitError(null); }}
            style={{
              width: '100%',
              background: 'white',
              color: '#64748b',
              border: '1px solid #E2E8E4',
              borderRadius: 8,
              padding: 11,
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            Cancel
          </button>
        </div>
      ) : (
        /* ── PRIORITY BUTTON ── */
        <div>
          {submitError && (
            <p style={{ fontSize: 13, color: '#c0392b', fontWeight: 700, marginBottom: 8 }}>
              {submitError}
            </p>
          )}
          {userVote.vote === 'support' && (
            <button
              onClick={() => { if (endorseSlotsUsed < MAX_SLOTS) setShowInput(true); }}
              disabled={endorseSlotsUsed >= MAX_SLOTS}
              style={{
                width: '100%',
                background: 'white',
                color: '#1B4332',
                border: '1.5px solid #1B4332',
                borderRadius: 8,
                padding: 12,
                fontSize: 13,
                fontWeight: 700,
                opacity: endorseSlotsUsed >= MAX_SLOTS ? 0.5 : 1,
              }}
            >
              <i className="fa-solid fa-circle-check" style={{ marginRight: 6 }} />
              {endorseSlotsUsed >= MAX_SLOTS
                ? 'Endorsement slots full (3/3)'
                : `Endorse this bill (${MAX_SLOTS - endorseSlotsUsed} of ${MAX_SLOTS} slots remaining)`}
            </button>
          )}
          {userVote.vote === 'oppose' && (
            <button
              onClick={() => { if (blockSlotsUsed < MAX_SLOTS) setShowInput(true); }}
              disabled={blockSlotsUsed >= MAX_SLOTS}
              style={{
                width: '100%',
                background: 'white',
                color: '#c0392b',
                border: '1.5px solid #F0455A',
                borderRadius: 8,
                padding: 12,
                fontSize: 13,
                fontWeight: 700,
                opacity: blockSlotsUsed >= MAX_SLOTS ? 0.5 : 1,
              }}
            >
              <i className="fa-solid fa-hand-back-fist" style={{ marginRight: 6 }} />
              {blockSlotsUsed >= MAX_SLOTS
                ? 'Block slots full (3/3)'
                : `Block this bill (${MAX_SLOTS - blockSlotsUsed} of ${MAX_SLOTS} slots remaining)`}
            </button>
          )}
        </div>
      )}

      {/* ── COMMUNITY VOICES ── */}
      {showCommunity && (
        <>
          <div style={{ height: 1, background: '#F4F6F0', margin: '12px 0' }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: communityVoices.length > 0 ? 8 : 0 }}>
            <span style={{
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.8px',
              color: '#94a3b8',
            }}>
              Community Voices
            </span>
            <div style={{ display: 'flex', gap: 5 }}>
              {totalEndorsements > 0 && (
                <span style={{
                  background: '#E6F5EE',
                  color: '#0e6b4a',
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '2px 7px',
                  borderRadius: 10,
                }}>
                  {totalEndorsements} Endorsed
                </span>
              )}
              {totalBlocks > 0 && (
                <span style={{
                  background: '#FEF0EF',
                  color: '#c0392b',
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '2px 7px',
                  borderRadius: 10,
                }}>
                  {totalBlocks} Blocked
                </span>
              )}
            </div>
          </div>

          {communityVoices.length > 0 ? (
            communityVoices.map((voice, i) => (
              <div
                key={voice.priority_id}
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'flex-start',
                  padding: '8px 0',
                  borderBottom: i < communityVoices.length - 1 ? '1px solid #F4F6F0' : 'none',
                }}
              >
                <span style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '2px 7px',
                  borderRadius: 10,
                  flexShrink: 0,
                  background: voice.priority_type === 'endorse' ? '#E6F5EE' : '#FEF0EF',
                  color: voice.priority_type === 'endorse' ? '#0e6b4a' : '#c0392b',
                }}>
                  {voice.priority_type === 'endorse' ? 'Endorsed' : 'Blocked'}
                </span>
                <p style={{
                  fontSize: 13,
                  color: '#374151',
                  lineHeight: 1.5,
                  fontStyle: 'italic',
                  margin: 0,
                }}>
                  {voice.statement}
                </p>
              </div>
            ))
          ) : (
            <p style={{
              fontSize: 13,
              color: '#94a3b8',
              fontStyle: 'italic',
              marginTop: 8,
            }}>
              District members have not endorsed or blocked this bill yet.
            </p>
          )}
        </>
      )}
    </div>
  );
}
