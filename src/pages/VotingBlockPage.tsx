import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { logError } from '../lib/errorLogger';
import { useAuth } from '../context/AuthContext';
import { BottomNav } from '../components/BottomNav';
import { AppHeader } from '../components/AppHeader';
import type { NavTab } from '../components/BottomNav';
import type { Bill, VotingBlockPublic, VotingBlockGeoBreakdown, VotingBlockBillPosition } from '../lib/types';

type NavProps = {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  onNavigateToProfile: () => void;
  onNavigateToAdmin: () => void;
};

type VotingBlockPageProps = {
  blockId: string;
  onBack: () => void;
  onNavigateToBill: (billId: string) => void;
  onNavigateToHowItWorks: () => void;
  onNavigateToAbout: () => void;
  navProps?: NavProps;
};

type PositionRow = VotingBlockBillPosition & {
  bill: Pick<Bill, 'title' | 'bill_number' | 'status'> | null;
};

function extractMsg(err: unknown): string {
  return (err as { message?: string })?.message ?? (err instanceof Error ? err.message : null) ?? String(err);
}

export function VotingBlockPage({ blockId, onBack, onNavigateToBill, onNavigateToHowItWorks, onNavigateToAbout, navProps }: VotingBlockPageProps) {
  const { user } = useAuth();

  const [block, setBlock] = useState<VotingBlockPublic | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [myMembership, setMyMembership] = useState<{ is_admin: boolean } | null>(null);
  const [joinCode, setJoinCode] = useState<string | null>(null);

  const [geoBreakdown, setGeoBreakdown] = useState<VotingBlockGeoBreakdown[]>([]);
  const [positions, setPositions] = useState<PositionRow[]>([]);

  const [leaving, setLeaving] = useState(false);
  const [reviving, setReviving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [addAdminUsername, setAddAdminUsername] = useState('');
  const [addingAdmin, setAddingAdmin] = useState(false);
  const [addAdminError, setAddAdminError] = useState<string | null>(null);
  const [addAdminSuccess, setAddAdminSuccess] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const { data: blockData, error: blockErr } = await supabase
        .from('voting_blocks_public' as never)
        .select('*')
        .eq('voting_block_id', blockId)
        .maybeSingle();
      if (blockErr) throw blockErr;
      if (!blockData) {
        setNotFound(true);
        return;
      }
      setBlock(blockData as unknown as VotingBlockPublic);

      const [geoRpcRes, posRpcRes, membershipRes] = await Promise.all([
        supabase.rpc('get_voting_block_geo_breakdown' as never, { p_block_id: blockId } as never),
        supabase.rpc('get_voting_block_bill_positions' as never, { p_block_id: blockId } as never),
        user
          ? supabase
              .from('voting_block_members')
              .select('is_admin')
              .eq('voting_block_id', blockId)
              .eq('user_id', user.id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      const geoRes = geoRpcRes as unknown as { data: VotingBlockGeoBreakdown[] | null };
      const posRes = posRpcRes as unknown as { data: VotingBlockBillPosition[] | null };

      setGeoBreakdown(geoRes.data ?? []);
      setMyMembership((membershipRes?.data as { is_admin: boolean } | null) ?? null);

      const rawPositions = posRes.data ?? [];
      if (rawPositions.length > 0) {
        const { data: bills } = await supabase
          .from('bills')
          .select('bill_id, title, bill_number, status')
          .in('bill_id', rawPositions.map((p) => p.bill_id));
        const billMap = new Map((bills ?? []).map((b) => [b.bill_id, b]));
        setPositions(
          rawPositions.map((p) => ({ ...p, bill: billMap.get(p.bill_id) ?? null }))
        );
      } else {
        setPositions([]);
      }

      if (membershipRes?.data?.is_admin) {
        const { data: fullBlock } = await supabase
          .from('voting_blocks')
          .select('join_code')
          .eq('voting_block_id', blockId)
          .maybeSingle();
        setJoinCode(fullBlock?.join_code ?? null);
      }
    } catch (err) {
      logError({ action: 'load_voting_block', userId: user?.id ?? null, errorMessage: extractMsg(err) });
      setError("We couldn't load this voting block right now.");
    } finally {
      setLoading(false);
    }
  }, [blockId, user]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleLeave() {
    if (!user) return;
    setLeaving(true);
    setActionError(null);
    try {
      const { error: err } = await supabase
        .from('voting_block_members')
        .delete()
        .eq('voting_block_id', blockId)
        .eq('user_id', user.id);
      if (err) throw err;
      onBack();
    } catch (err) {
      logError({ action: 'leave_voting_block', userId: user.id, errorMessage: extractMsg(err) });
      setActionError("We couldn't remove you from this block right now.");
    } finally {
      setLeaving(false);
    }
  }

  async function handleRevive() {
    if (!user) return;
    setReviving(true);
    setActionError(null);
    try {
      const { error: err } = await supabase.rpc('revive_voting_block' as never, { p_block_id: blockId } as never);
      if (err) throw err;
      await load();
    } catch (err) {
      logError({ action: 'revive_voting_block', userId: user.id, errorMessage: extractMsg(err) });
      setActionError("We couldn't revive this block right now.");
    } finally {
      setReviving(false);
    }
  }

  async function handleRegenerateCode() {
    setRegenerating(true);
    setActionError(null);
    try {
      const { data, error: err } = await supabase.rpc('regenerate_voting_block_join_code' as never, { p_block_id: blockId } as never);
      if (err) throw err;
      setJoinCode(data as unknown as string);
    } catch (err) {
      logError({ action: 'regenerate_voting_block_join_code', userId: user?.id ?? null, errorMessage: extractMsg(err) });
      setActionError("We couldn't regenerate the join code right now.");
    } finally {
      setRegenerating(false);
    }
  }

  function handleCopyCode() {
    if (!joinCode) return;
    navigator.clipboard.writeText(joinCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  async function handleAddAdmin() {
    if (!addAdminUsername.trim()) return;
    setAddingAdmin(true);
    setAddAdminError(null);
    setAddAdminSuccess(false);
    try {
      const { error: err } = await supabase.rpc('add_voting_block_admin' as never, {
        p_block_id: blockId,
        p_username: addAdminUsername.trim(),
      } as never);
      if (err) throw err;
      setAddAdminUsername('');
      setAddAdminSuccess(true);
      setTimeout(() => setAddAdminSuccess(false), 2500);
    } catch (err) {
      const msg = extractMsg(err);
      if (msg.includes('user_not_found')) {
        setAddAdminError(`No user found with username "${addAdminUsername.trim()}".`);
      } else if (msg.includes('not_a_member')) {
        setAddAdminError('That user is not a member of this block yet.');
      } else {
        logError({ action: 'add_voting_block_admin', userId: user?.id ?? null, errorMessage: msg });
        setAddAdminError("We couldn't add that admin right now.");
      }
    } finally {
      setAddingAdmin(false);
    }
  }

  const shell = (content: React.ReactNode) => (
    <div className="flex flex-col items-center overflow-hidden" style={{ background: '#F4F6F0', height: '100dvh' }}>
      <div className="w-full max-w-[600px] flex flex-col" style={{ height: '100dvh' }}>
        <AppHeader onNavigateToHowItWorks={onNavigateToHowItWorks} onNavigateToAbout={onNavigateToAbout} />
        {content}
        {navProps && <BottomNav {...navProps} />}
      </div>
    </div>
  );

  if (loading) {
    return shell(
      <div className="flex-1 flex items-center justify-center">
        <div className="flex gap-1.5">
          {[0, 150, 300].map((delay) => (
            <span key={delay} className="w-1.5 h-1.5 rounded-full animate-bounce"
              style={{ background: '#1B4332', animationDelay: `${delay}ms` }} />
          ))}
        </div>
      </div>
    );
  }

  if (notFound) {
    return shell(
      <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
        <i className="fa-solid fa-lock" style={{ fontSize: 28, color: '#94a3b8', marginBottom: 10 }} />
        <p style={{ fontSize: 13, color: '#0f1724', fontWeight: 700, marginBottom: 4 }}>This voting block isn't available</p>
        <p style={{ fontSize: 13, color: '#64748b' }}>It may be private, or the link may be out of date.</p>
        <button onClick={onBack} style={{ marginTop: 14, background: '#1B4332', color: 'white', border: 'none', borderRadius: 8, padding: '10px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          Go back
        </button>
      </div>
    );
  }

  if (error || !block) {
    return shell(
      <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
        <i className="fa-solid fa-triangle-exclamation" style={{ fontSize: 28, color: '#F0455A', marginBottom: 10 }} />
        <p style={{ fontSize: 13, color: '#0f1724', fontWeight: 700, marginBottom: 4 }}>Something went wrong</p>
        <p style={{ fontSize: 13, color: '#64748b' }}>{error ?? "We couldn't load this voting block."}</p>
      </div>
    );
  }

  const isMember = !!myMembership;
  const isAdmin = !!myMembership?.is_admin;
  const memberSince = block.created_at
    ? new Date(block.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : null;

  return shell(
    <main className="scrollbar-hide" style={{ flex: 1, overflowY: 'auto', padding: 10, paddingBottom: navProps ? 10 : 24, display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* ── HEADER CARD ── */}
      <div style={{ background: '#1B4332', borderRadius: 12, padding: '16px 14px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 16, fontWeight: 900, color: 'white', lineHeight: 1.2, marginBottom: 4 }}>{block.name}</p>
            {memberSince && (
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', margin: 0 }}>Created {memberSince}</p>
            )}
          </div>
          <span style={{
            fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px',
            padding: '3px 9px', borderRadius: 10, flexShrink: 0,
            background: 'rgba(245,166,35,0.2)', color: '#F5A623',
          }}>
            {block.visibility}
          </span>
        </div>
        {!block.is_active && (
          <div style={{ marginTop: 10, background: 'rgba(240,69,90,0.18)', borderRadius: 8, padding: '8px 10px' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#F0455A' }}>
              This block has no admin right now. {isMember ? 'Any member can revive it.' : ''}
            </span>
          </div>
        )}
      </div>

      {actionError && (
        <div style={{ background: '#FEF0EF', borderRadius: 10, padding: '10px 12px' }}>
          <span style={{ fontSize: 13, color: '#c0392b', fontWeight: 600 }}>{actionError}</span>
        </div>
      )}

      {/* ── MEMBERSHIP STATS ── */}
      <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E2E8E4', overflow: 'hidden' }}>
        <div style={{ padding: '12px 14px 6px', borderBottom: '1px solid #F4F6F0' }}>
          <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: '#94a3b8' }}>Membership</span>
        </div>
        <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 24, fontWeight: 900, color: '#0f1724' }}>{block.member_count}</span>
          <span style={{ fontSize: 13, color: '#64748b' }}>member{block.member_count === 1 ? '' : 's'}</span>
        </div>
        {geoBreakdown.length > 0 && (
          <div style={{ padding: '0 14px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {geoBreakdown.map((g, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ color: '#374151' }}>
                  {g.district_name ?? 'Unassigned district'}{g.legislative_body_name ? ` · ${g.legislative_body_name}` : ''}
                </span>
                <span style={{ fontWeight: 700, color: '#1B4332' }}>{g.member_count}</span>
              </div>
            ))}
          </div>
        )}
        <p style={{ fontSize: 11, color: '#94a3b8', padding: '0 14px 12px', margin: 0, lineHeight: 1.5 }}>
          For every member's privacy, no one — including fellow members and admins — can see who else is in this block.
        </p>
      </div>

      {/* ── BLOCK POSITIONS ── */}
      <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E2E8E4', overflow: 'hidden' }}>
        <div style={{ padding: '12px 14px 6px', borderBottom: '1px solid #F4F6F0' }}>
          <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: '#94a3b8' }}>Bill Positions</span>
        </div>
        {positions.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center' }}>
            <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>
              This block doesn't have a position on any bill yet — that needs at least 2 members to have voted.
            </p>
          </div>
        ) : (
          positions.map((p, i) => {
            const supportPct = p.total_votes > 0 ? Math.round((p.support_count / p.total_votes) * 100) : 0;
            const opposePct = p.total_votes > 0 ? Math.round((p.oppose_count / p.total_votes) * 100) : 0;
            return (
              <button
                key={p.bill_id}
                onClick={() => onNavigateToBill(p.bill_id)}
                style={{
                  width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', minHeight: 'unset',
                  padding: '11px 14px', borderBottom: i < positions.length - 1 ? '1px solid #F4F6F0' : 'none',
                }}
              >
                <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#0f1724', marginBottom: 6, lineHeight: 1.35 }}>
                  {p.bill?.title ?? 'Untitled Bill'}
                </span>
                {p.vote_position === 'tied' ? (
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', background: '#F1F5F9', padding: '3px 8px', borderRadius: 6 }}>
                    Evenly split · {p.total_votes} votes
                  </span>
                ) : (
                  <>
                    <div style={{ height: 5, borderRadius: 3, background: '#E2E8E4', overflow: 'hidden', display: 'flex', marginBottom: 4 }}>
                      <div style={{ width: `${supportPct}%`, background: '#1DB97A' }} />
                      <div style={{ width: `${opposePct}%`, background: '#F0455A' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#1DB97A' }}>{supportPct}% Support</span>
                      <span style={{ fontSize: 11, color: '#94a3b8' }}>{p.total_votes} votes</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#F0455A' }}>{opposePct}% Oppose</span>
                    </div>
                  </>
                )}
              </button>
            );
          })
        )}
      </div>

      {/* ── MY MEMBERSHIP ACTIONS ── */}
      {user && isMember && (
        <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E2E8E4', padding: 14 }}>
          <span style={{ display: 'block', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: '#94a3b8', marginBottom: 10 }}>
            Your Membership
          </span>

          {!block.is_active && (
            <button
              onClick={handleRevive}
              disabled={reviving}
              style={{ width: '100%', background: '#1B4332', color: 'white', border: 'none', borderRadius: 10, padding: 12, fontSize: 13, fontWeight: 700, cursor: 'pointer', marginBottom: 10, opacity: reviving ? 0.6 : 1 }}
            >
              {reviving ? 'Reviving…' : 'Revive this block (you\'ll become an admin)'}
            </button>
          )}

          {isAdmin && (
            <div style={{ marginBottom: 14 }}>
              <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#0f1724', marginBottom: 6 }}>Join code</span>
              {joinCode && (
                <div style={{ background: '#F4F6F0', borderRadius: 8, padding: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 15, fontWeight: 900, color: '#0f1724', letterSpacing: '1px', fontFamily: 'monospace' }}>{joinCode}</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={handleCopyCode} style={{ background: 'white', color: '#1B4332', border: '1px solid #E2E8E4', borderRadius: 6, padding: '6px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                    <button onClick={handleRegenerateCode} disabled={regenerating} style={{ background: 'white', color: '#1B4332', border: '1px solid #E2E8E4', borderRadius: 6, padding: '6px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                      Regenerate
                    </button>
                  </div>
                </div>
              )}

              <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#0f1724', marginBottom: 6 }}>Add another admin</span>
              <p style={{ fontSize: 12, color: '#94a3b8', margin: '0 0 8px', lineHeight: 1.5 }}>
                Enter the username of an existing member — no member roster is shown here.
              </p>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  value={addAdminUsername}
                  onChange={(e) => { setAddAdminUsername(e.target.value); setAddAdminError(null); }}
                  placeholder="Username"
                  style={{ flex: 1, background: '#F4F6F0', border: '1px solid #E2E8E4', borderRadius: 8, padding: '9px 11px', fontSize: 13, color: '#0f1724', boxSizing: 'border-box' }}
                />
                <button onClick={handleAddAdmin} disabled={addingAdmin || !addAdminUsername.trim()}
                  style={{ background: '#1B4332', color: 'white', border: 'none', borderRadius: 8, padding: '9px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: addingAdmin || !addAdminUsername.trim() ? 0.6 : 1 }}>
                  Add
                </button>
              </div>
              {addAdminError && <p style={{ fontSize: 12, color: '#F0455A', fontWeight: 600, marginTop: 6 }}>{addAdminError}</p>}
              {addAdminSuccess && <p style={{ fontSize: 12, color: '#0e6b4a', fontWeight: 600, marginTop: 6 }}>Admin added.</p>}
            </div>
          )}

          <button
            onClick={handleLeave}
            disabled={leaving}
            style={{ width: '100%', background: 'white', color: '#F0455A', border: '1.5px solid #F0455A', borderRadius: 10, padding: 12, fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: leaving ? 0.6 : 1 }}
          >
            {leaving ? 'Leaving…' : 'Leave this block'}
          </button>
        </div>
      )}
    </main>
  );
}
