import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { logError } from '../lib/errorLogger';
import { bustCache } from '../lib/cache';
import { useAuth } from '../context/AuthContext';
import { BottomNav } from '../components/BottomNav';
import { AppHeader } from '../components/AppHeader';
import type { NavTab } from '../components/BottomNav';
import {
  getTopicTag,
  parseSummaryIntoSections,
  formatIntroducedDate,
  isBillVotable,
} from '../lib/billUtils';
import { BillPrioritySection } from '../components/BillPrioritySection';
import type { Bill, UserVote, RepVote, Representative, BillVotingBlockPosition } from '../lib/types';

type NavProps = {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  onNavigateToProfile: () => void;
  onNavigateToAdmin: () => void;
};

type Tally = { support_count: number; oppose_count: number; total_votes: number };

type RepVoteWithRep = RepVote & {
  representatives: Pick<Representative, 'first_name' | 'last_name' | 'title' | 'representative_id'> | null;
};

type BillDetailPageProps = {
  billId: string;
  onNavigateToRep: (repId: string) => void;
  onNavigateToVotingBlock: (blockId: string) => void;
  onNavigateToHowItWorks: () => void;
  onNavigateToAbout: () => void;
  onNavigateToElectionCenter: () => void;
  onSignUp?: () => void;
  navProps?: NavProps;
};

export function BillDetailPage({ billId, onNavigateToRep, onNavigateToVotingBlock, onNavigateToHowItWorks, onNavigateToAbout, onNavigateToElectionCenter, onSignUp, navProps }: BillDetailPageProps) {
  const { user, profile, legislativeBodies } = useAuth();

  const [bill, setBill] = useState<Bill | null>(null);
  const [blockPositions, setBlockPositions] = useState<BillVotingBlockPosition[]>([]);
  const [primarySponsorRep, setPrimarySponsorRep] = useState<Pick<Representative, 'representative_id' | 'first_name' | 'last_name'> | null>(null);
  const [cosponsors, setCosponsors] = useState<Pick<Representative, 'representative_id' | 'first_name' | 'last_name'>[]>([]);
  const [tally, setTally] = useState<Tally>({ support_count: 0, oppose_count: 0, total_votes: 0 });
  const [userVote, setUserVote] = useState<UserVote | null>(null);
  const [districtRepVote, setDistrictRepVote] = useState<RepVoteWithRep | null | undefined>(undefined);
  const [atLargeRepVotes, setAtLargeRepVotes] = useState<RepVoteWithRep[]>([]);
  const [atLargeExpanded, setAtLargeExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [voting, setVoting] = useState(false);
  const [voteError, setVoteError] = useState<string | null>(null);
  const [repVoteError, setRepVoteError] = useState<string | null>(null);
  const [showRepReveal, setShowRepReveal] = useState(false);
  const [copyToast, setCopyToast] = useState(false);
  const [animateTally, setAnimateTally] = useState(false);

  const fetchTally = useCallback(async () => {
    const { data } = await supabase
      .from('bill_vote_tallies')
      .select('support_count, oppose_count, total_votes')
      .eq('bill_id', billId)
      .maybeSingle();
    if (data) {
      setTally({
        support_count: Number(data.support_count ?? 0),
        oppose_count: Number(data.oppose_count ?? 0),
        total_votes: Number(data.total_votes ?? 0),
      });
    }
  }, [billId]);

  const fetchRepVotes = useCallback(async () => {
    if (!user || !profile?.district_id) return;
    try {
      const [districtRepRes, atLargeRepsRes] = await Promise.all([
        supabase
          .from('representatives')
          .select('representative_id, first_name, last_name, title, district_id')
          .eq('district_id', profile.district_id)
          .maybeSingle(),
        supabase
          .from('representatives')
          .select('representative_id, first_name, last_name, title')
          .is('district_id', null),
      ]);

      const districtRep = districtRepRes.data;
      const atLargeReps = atLargeRepsRes.data;

      const allRepIds: string[] = [];
      if (districtRep) allRepIds.push(districtRep.representative_id);
      if (atLargeReps) allRepIds.push(...atLargeReps.map((r) => r.representative_id));

      if (allRepIds.length === 0) {
        setDistrictRepVote(null);
        return;
      }

      const { data: repVotesData, error: rvErr } = await supabase
        .from('rep_votes')
        .select('*, representatives(representative_id, first_name, last_name, title)')
        .eq('bill_id', billId)
        .in('representative_id', allRepIds);

      if (rvErr) throw rvErr;

      const rvMap = new Map<string, RepVoteWithRep>(
        (repVotesData ?? []).map((rv) => [rv.representative_id!, rv as RepVoteWithRep])
      );

      if (districtRep) {
        setDistrictRepVote(rvMap.get(districtRep.representative_id) ?? null);
      } else {
        setDistrictRepVote(null);
      }

      if (atLargeReps) {
        const alVotes: RepVoteWithRep[] = atLargeReps.map((rep) => {
          const rv = rvMap.get(rep.representative_id);
          if (rv) return rv;
          // Stub entry so we still show the rep name with "not recorded"
          return {
            rep_vote_id: '',
            bill_id: billId,
            representative_id: rep.representative_id,
            vote: '',
            explanation: null,
            created_at: '',
            representatives: {
              representative_id: rep.representative_id,
              first_name: rep.first_name,
              last_name: rep.last_name,
              title: rep.title,
            },
          } as RepVoteWithRep;
        });
        setAtLargeRepVotes(alVotes);
      }
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? (err instanceof Error ? err.message : null) ?? String(err);
      logError({ action: 'load_rep_vote', userId: user?.id ?? null, errorMessage: msg });
      setRepVoteError('Could not load your representative\'s vote.');
    }
  }, [billId, user, profile?.district_id]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [billRes, tallyRes, userVoteRes, sponsorRes, blockPositionsRes] = await Promise.all([
          supabase.from('bills').select('*').eq('bill_id', billId).maybeSingle(),
          supabase
            .from('bill_vote_tallies')
            .select('support_count, oppose_count, total_votes')
            .eq('bill_id', billId)
            .maybeSingle(),
          user
            ? supabase
                .from('user_votes')
                .select('*')
                .eq('bill_id', billId)
                .eq('user_id', user.id)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
          supabase
            .from('bill_sponsors')
            .select('representative_id, sponsor_type, representatives(representative_id, first_name, last_name)')
            .eq('bill_id', billId),
          supabase.rpc('get_bill_voting_block_positions' as never, { p_bill_id: billId } as never),
        ]);

        setBlockPositions(((blockPositionsRes as { data: BillVotingBlockPosition[] | null }).data ?? []));

        if (billRes.error) throw billRes.error;
        setBill(billRes.data);

        // Process sponsor data from parallel fetch
        const sponsorRows = sponsorRes.data;
        if (sponsorRows) {
          type SponsorRow = { representative_id: string; sponsor_type: string; representatives: { representative_id: string; first_name: string; last_name: string } | null };
          const primary = (sponsorRows as SponsorRow[]).find((r) => r.sponsor_type === 'primary');
          const coRows = (sponsorRows as SponsorRow[]).filter((r) => r.sponsor_type === 'cosponsor');
          setPrimarySponsorRep(primary?.representatives ?? null);
          setCosponsors(coRows.map((r) => r.representatives).filter(Boolean) as Pick<Representative, 'representative_id' | 'first_name' | 'last_name'>[]);
        }
        // Fallback: if no bill_sponsors row but primary_sponsor_id exists, fetch the rep
        if (billRes.data && !sponsorRows?.find((r: { sponsor_type: string }) => r.sponsor_type === 'primary') && billRes.data.primary_sponsor_id) {
          const { data: repData } = await supabase
            .from('representatives')
            .select('representative_id, first_name, last_name')
            .eq('representative_id', billRes.data.primary_sponsor_id)
            .maybeSingle();
          setPrimarySponsorRep(repData ?? null);
        }

        if (tallyRes.data) {
          setTally({
            support_count: Number(tallyRes.data.support_count ?? 0),
            oppose_count: Number(tallyRes.data.oppose_count ?? 0),
            total_votes: Number(tallyRes.data.total_votes ?? 0),
          });
        }

        if (userVoteRes.data) {
          setUserVote(userVoteRes.data);
          setShowRepReveal(true);
          if (!billRes.data?.passed_by_suspension) {
            await fetchRepVotes();
          }
        }
      } catch (err) {
        const msg = (err as { message?: string })?.message ?? (err instanceof Error ? err.message : null) ?? String(err);
        const action = user ? 'load_bill_detail' : 'load_bill_detail_public';
        logError({ action, userId: user?.id ?? null, errorMessage: msg });
        setError("We couldn't load this bill right now. Please try again.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [billId, user, fetchRepVotes]);

  async function castVote(choice: 'support' | 'oppose') {
    if (!user) return;
    if (userVote) {
      setVoteError("You've already voted on this bill.");
      return;
    }
    const requiresCommitteeReport = legislativeBodies.find((b) => b.legislative_body_id === bill?.legislative_body_id)?.requires_committee_report ?? false;
    if (!bill || !isBillVotable(bill, requiresCommitteeReport)) {
      // Defense in depth — the vote buttons are already hidden in this case
      // (see the render below), and the server-side RLS check on
      // user_votes is the real enforcement, but this avoids a wasted round
      // trip to an insert that's guaranteed to be rejected.
      setVoteError('This bill is still in committee and isn\'t open for voting yet.');
      return;
    }
    setVoting(true);
    setVoteError(null);
    try {
      const { error: insertErr } = await supabase.from('user_votes').insert({
        bill_id: billId,
        user_id: user.id,
        vote: choice,
      });
      if (insertErr) throw insertErr;

      setUserVote({
        user_vote_id: '',
        bill_id: billId,
        user_id: user.id,
        vote: choice,
        explanation: null,
        created_at: new Date().toISOString(),
      });

      setAnimateTally(true);
      setShowRepReveal(true);
      bustCache(`bills_${user!.id}_`);
      bustCache(`dash_main_${user!.id}`);
      bustCache(`dash_scores_${user!.id}`);
      const promises: Promise<unknown>[] = [fetchTally()];
      if (!bill?.passed_by_suspension) {
        promises.push(fetchRepVotes());
      }
      await Promise.all(promises);
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? (err instanceof Error ? err.message : null) ?? String(err);
      logError({ action: 'cast_vote', userId: user.id, errorMessage: msg });
      setVoteError("Your vote couldn't be saved. Please try again.");
    } finally {
      setVoting(false);
    }
  }

  function handleShare() {
    const url = `${window.location.origin}/bill/${billId}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopyToast(true);
      setTimeout(() => setCopyToast(false), 2000);
    });
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center overflow-hidden" style={{ background: '#F4F6F0', height: '100dvh' }}>
        <div className="w-full max-w-[600px] flex flex-col" style={{ height: '100dvh' }}>
          <AppHeader onNavigateToHowItWorks={onNavigateToHowItWorks} onNavigateToAbout={onNavigateToAbout} onNavigateToElectionCenter={onNavigateToElectionCenter} />
          <div className="flex-1 flex items-center justify-center">
            <div className="flex gap-1.5">
              {[0, 150, 300].map((delay) => (
                <span
                  key={delay}
                  className="w-1.5 h-1.5 rounded-full animate-bounce"
                  style={{ background: '#1B4332', animationDelay: `${delay}ms` }}
                />
              ))}
            </div>
          </div>
          {navProps && <BottomNav {...navProps} />}
        </div>
      </div>
    );
  }

  if (error || !bill) {
    return (
      <div className="flex flex-col items-center overflow-hidden" style={{ background: '#F4F6F0', height: '100dvh' }}>
        <div className="w-full max-w-[600px] flex flex-col" style={{ height: '100dvh' }}>
          <AppHeader onNavigateToHowItWorks={onNavigateToHowItWorks} onNavigateToAbout={onNavigateToAbout} onNavigateToElectionCenter={onNavigateToElectionCenter} />
          <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
            <i className="fa-solid fa-triangle-exclamation" style={{ fontSize: 28, color: '#F0455A', marginBottom: 10 }} />
            <p style={{ fontSize: 13, color: '#0f1724', fontWeight: 700, marginBottom: 4 }}>Something went wrong</p>
            <p style={{ fontSize: 13, color: '#64748b' }}>{error ?? "We couldn't load this bill right now."}</p>
          </div>
          {navProps && <BottomNav {...navProps} />}
        </div>
      </div>
    );
  }

  const tag = getTopicTag(bill.title, bill.summary, bill.topic);
  const sections = parseSummaryIntoSections(bill.summary);
  const supportPct = tally.total_votes > 0 ? Math.round((tally.support_count / tally.total_votes) * 100) : 0;
  const opposePct = tally.total_votes > 0 ? Math.round((tally.oppose_count / tally.total_votes) * 100) : 0;
  const isSupport = userVote?.vote === 'support';
  const requiresCommitteeReport = legislativeBodies.find((b) => b.legislative_body_id === bill.legislative_body_id)?.requires_committee_report ?? false;
  const votable = isBillVotable(bill, requiresCommitteeReport);

  return (
    <div className="flex flex-col items-center overflow-hidden" style={{ background: '#F4F6F0', height: '100dvh' }}>
      <div className="w-full max-w-[600px] flex flex-col" style={{ height: '100dvh' }}>
        <AppHeader onNavigateToHowItWorks={onNavigateToHowItWorks} onNavigateToAbout={onNavigateToAbout} onNavigateToElectionCenter={onNavigateToElectionCenter} />

        <main className="flex-1 overflow-y-auto scrollbar-hide" style={{ padding: 10, paddingBottom: navProps ? 10 : 24 }}>
          {/* Copy toast */}
          {copyToast && (
            <div style={{
              position: 'fixed', top: 60, left: '50%', transform: 'translateX(-50%)',
              background: '#1B4332', color: 'white', fontSize: 13, fontWeight: 700,
              padding: '7px 16px', borderRadius: 20, zIndex: 50,
            }}>
              Link copied.
            </div>
          )}

          {/* Main content card */}
          <div style={{
            background: 'white', borderRadius: 12, border: '1px solid #E2E8E4', overflow: 'hidden',
          }}>

            {/* ── HEADER BLOCK ── */}
            <div style={{ padding: 16 }}>
              {/* Tag row */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{
                  display: 'inline-block', fontSize: 12, fontWeight: 700,
                  textTransform: 'uppercase', letterSpacing: '0.6px',
                  background: tag.bg, color: tag.color,
                  padding: '3px 9px', borderRadius: 6,
                }}>
                  {tag.label}
                </span>
                {userVote && (
                  <span style={{
                    fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px',
                    background: isSupport ? '#E6F5EE' : '#FEF0EF',
                    color: isSupport ? '#0e6b4a' : '#c0392b',
                    padding: '3px 9px', borderRadius: 6,
                  }}>
                    {isSupport ? 'Voted Support' : 'Voted Oppose'}
                  </span>
                )}
              </div>

              {/* Title */}
              <p style={{
                fontSize: 16, fontWeight: 800, color: '#0f1724',
                lineHeight: 1.4, marginBottom: bill.bill_number ? 6 : 12,
                whiteSpace: 'normal', wordWrap: 'break-word',
              }}>
                {bill.title}
              </p>

              {/* Bill number */}
              {bill.bill_number && (
                <span style={{
                  fontSize: 13,
                  color: '#94a3b8',
                  display: 'block',
                  marginBottom: 8,
                }}>
                  Bill #{bill.bill_number}
                </span>
              )}

              {/* Metadata */}
              {(bill.primary_sponsor || bill.primary_sponsor_id || bill.introduced_date) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
                  {(bill.primary_sponsor_id || bill.primary_sponsor) && (
                    <span style={{ fontSize: 13, color: '#64748b', lineHeight: 1.4 }}>
                      Sponsored by:{' '}
                      {primarySponsorRep ? (
                        <button
                          onClick={() => onNavigateToRep(primarySponsorRep.representative_id)}
                          style={{ background: 'none', border: 'none', padding: 0, fontSize: 13, fontWeight: 600, color: '#1B4332', cursor: 'pointer', minHeight: 'unset' }}
                        >
                          {primarySponsorRep.first_name} {primarySponsorRep.last_name}
                        </button>
                      ) : (
                        bill.primary_sponsor
                      )}
                    </span>
                  )}
                  {cosponsors.length > 0 && (
                    <span style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.4 }}>
                      Co-sponsored by:{' '}
                      {cosponsors.map((cs, i) => (
                        <span key={cs.representative_id}>
                          <button
                            onClick={() => onNavigateToRep(cs.representative_id)}
                            style={{ background: 'none', border: 'none', padding: 0, fontSize: 12, color: '#94a3b8', cursor: 'pointer', minHeight: 'unset', textDecoration: 'underline' }}
                          >
                            {cs.first_name} {cs.last_name}
                          </button>
                          {i < cosponsors.length - 1 ? ', ' : ''}
                        </span>
                      ))}
                    </span>
                  )}
                  {bill.introduced_date && (
                    <span style={{ fontSize: 13, color: '#64748b', lineHeight: 1.4 }}>
                      Introduced: {formatIntroducedDate(bill.introduced_date)}
                    </span>
                  )}
                </div>
              )}

              {/* Tally bar */}
              <div style={{ height: 7, borderRadius: 4, background: '#E2E8E4', overflow: 'hidden', display: 'flex', marginBottom: 6 }}>
                {tally.total_votes > 0 && (
                  <>
                    <div style={{
                      width: `${supportPct}%`, background: '#1DB97A',
                      transition: animateTally ? 'width 0.5s ease' : undefined,
                    }} />
                    <div style={{
                      width: `${opposePct}%`, background: '#F0455A',
                      transition: animateTally ? 'width 0.5s ease' : undefined,
                    }} />
                  </>
                )}
              </div>

              {/* Tally labels */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#1DB97A' }}>{supportPct}% Support</span>
                <span style={{ fontSize: 12, color: '#94a3b8' }}>{tally.total_votes} votes cast</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#F0455A' }}>{opposePct}% Oppose</span>
              </div>
            </div>

            {/* Divider between header and sections */}
            <div style={{ height: 1, background: '#E2E8E4' }} />

            {/* ── SUMMARY SECTIONS ── */}
            {sections.map((section, i) => (
              <div
                key={section.label}
                style={{
                  padding: '14px 16px',
                  borderBottom: i < sections.length - 1 ? '1px solid #F4F6F0' : 'none',
                  background: 'white',
                }}
              >
                <span style={{
                  display: 'block',
                  fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '0.8px', color: '#1B4332', marginBottom: 6,
                }}>
                  {section.label}
                </span>
                <span style={{
                  display: 'block',
                  fontSize: 13, color: '#0f1724', lineHeight: 1.65,
                  whiteSpace: 'normal', wordWrap: 'break-word',
                }}>
                  {section.text}
                </span>
              </div>
            ))}

            {/* ── VOTE BUTTONS ── */}
            <div style={{
              background: 'white', borderTop: '1px solid #E2E8E4',
              padding: '12px 16px 14px', display: 'flex', gap: 8,
            }}>
              {!user ? (
                <button
                  onClick={onSignUp}
                  style={{
                    flex: 1, background: '#1B4332', color: 'white',
                    border: 'none', borderRadius: 8, padding: 12,
                    fontSize: 13, fontWeight: 700, minHeight: 44,
                  }}
                >
                  Create a free account to vote on this bill
                </button>
              ) : userVote ? (
                <>
                  <button
                    disabled
                    style={{
                      flex: 1,
                      background: isSupport ? '#1DB97A' : '#F4F6F0',
                      color: isSupport ? 'white' : '#94a3b8',
                      border: `1.5px solid ${isSupport ? '#1DB97A' : '#E2E8E4'}`,
                      borderRadius: 8, padding: 12, fontSize: 13, fontWeight: 700,
                      opacity: isSupport ? 1 : 0.5, pointerEvents: 'none',
                    }}
                  >
                    {isSupport ? '✓ Supported' : 'Support'}
                  </button>
                  <button
                    disabled
                    style={{
                      flex: 1,
                      background: !isSupport ? '#F0455A' : '#F4F6F0',
                      color: !isSupport ? 'white' : '#94a3b8',
                      border: `1.5px solid ${!isSupport ? '#F0455A' : '#E2E8E4'}`,
                      borderRadius: 8, padding: 12, fontSize: 13, fontWeight: 700,
                      opacity: !isSupport ? 1 : 0.5, pointerEvents: 'none',
                    }}
                  >
                    {!isSupport ? '✓ Opposed' : 'Oppose'}
                  </button>
                </>
              ) : !votable ? (
                <div style={{
                  flex: 1, display: 'flex', alignItems: 'center', gap: 8,
                  background: '#F4F6F0', borderRadius: 8, padding: 12,
                }}>
                  <i className="fa-solid fa-hourglass-half" style={{ fontSize: 13, color: '#94a3b8', flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: '#64748b', lineHeight: 1.4 }}>
                    This bill is still in committee. It'll open for voting once it's reported out.
                  </span>
                </div>
              ) : (
                <>
                  <button
                    onClick={() => castVote('support')}
                    disabled={voting}
                    style={{
                      flex: 1, background: 'white', color: '#1DB97A',
                      border: '1.5px solid #1DB97A', borderRadius: 8, padding: 12,
                      fontSize: 13, fontWeight: 700, minHeight: 44,
                      opacity: voting ? 0.6 : 1,
                    }}
                  >
                    Support
                  </button>
                  <button
                    onClick={() => castVote('oppose')}
                    disabled={voting}
                    style={{
                      flex: 1, background: 'white', color: '#F0455A',
                      border: '1.5px solid #F0455A', borderRadius: 8, padding: 12,
                      fontSize: 13, fontWeight: 700, minHeight: 44,
                      opacity: voting ? 0.6 : 1,
                    }}
                  >
                    Oppose
                  </button>
                </>
              )}
            </div>

            {voteError && (
              <div style={{
                background: '#FEF0EF', padding: '8px 16px',
                textAlign: 'center', borderTop: '1px solid #F4F6F0',
              }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#c0392b' }}>{voteError}</span>
              </div>
            )}
          </div>

          {/* ── VOTING BLOCK POSITIONS ── */}
          {blockPositions.length > 0 && (
            <div style={{ marginTop: 10, background: 'white', borderRadius: 12, border: '1px solid #E2E8E4', overflow: 'hidden' }}>
              <div style={{ padding: '12px 14px 6px', borderBottom: '1px solid #F4F6F0' }}>
                <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: '#94a3b8' }}>
                  Voting Block Positions
                </span>
              </div>
              {blockPositions.map((bp, i) => {
                const supportPct = bp.total_votes > 0 ? Math.round((bp.support_count / bp.total_votes) * 100) : 0;
                const opposePct = bp.total_votes > 0 ? Math.round((bp.oppose_count / bp.total_votes) * 100) : 0;
                return (
                  <button
                    key={bp.voting_block_id}
                    onClick={() => onNavigateToVotingBlock(bp.voting_block_id)}
                    style={{
                      width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', minHeight: 'unset',
                      padding: '11px 14px', borderBottom: i < blockPositions.length - 1 ? '1px solid #F4F6F0' : 'none',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                    }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#0f1724', flexShrink: 0 }}>{bp.name}</span>
                    {bp.vote_position === 'tied' ? (
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', background: '#F1F5F9', padding: '3px 8px', borderRadius: 6, flexShrink: 0 }}>
                        Evenly split
                      </span>
                    ) : (
                      <span style={{
                        fontSize: 12, fontWeight: 700, padding: '3px 8px', borderRadius: 6, flexShrink: 0,
                        background: bp.vote_position === 'support' ? '#E6F5EE' : '#FEF0EF',
                        color: bp.vote_position === 'support' ? '#0e6b4a' : '#c0392b',
                      }}>
                        {bp.vote_position === 'support' ? supportPct : opposePct}% {bp.vote_position === 'support' ? 'Support' : 'Oppose'} · {bp.total_votes} votes
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* ── REP REVEAL + ACTION ROW ── */}
          {user && showRepReveal && (
            <>
              <RepRevealSection
                userVote={userVote}
                districtRepVote={districtRepVote}
                atLargeRepVotes={atLargeRepVotes}
                atLargeExpanded={atLargeExpanded}
                onToggleAtLarge={() => setAtLargeExpanded((v) => !v)}
                repVoteError={repVoteError}
                onNavigateToRep={onNavigateToRep}
                onShare={handleShare}
                passedBySuspension={bill.passed_by_suspension ?? false}
                legislativeBodyName={
                  legislativeBodies.find((b) => b.legislative_body_id === bill.legislative_body_id)?.name
                  ?? 'Philadelphia City Council'
                }
              />
              {bill.status === 'active' && userVote && (
                <BillPrioritySection
                  billId={billId}
                  billStatus={bill.status}
                  legislativeBodyId={bill.legislative_body_id ?? null}
                  userVote={userVote}
                />
              )}
            </>
          )}
        </main>
        {navProps && <BottomNav {...navProps} />}
      </div>
    </div>
  );
}

type RepRevealProps = {
  userVote: UserVote | null;
  districtRepVote: RepVoteWithRep | null | undefined;
  atLargeRepVotes: RepVoteWithRep[];
  atLargeExpanded: boolean;
  onToggleAtLarge: () => void;
  repVoteError: string | null;
  onNavigateToRep: (repId: string) => void;
  onShare: () => void;
  passedBySuspension: boolean;
  legislativeBodyName: string;
};

function RepRevealSection({
  userVote,
  districtRepVote,
  atLargeRepVotes,
  atLargeExpanded,
  onToggleAtLarge,
  repVoteError,
  onNavigateToRep,
  onShare,
  passedBySuspension,
  legislativeBodyName,
}: RepRevealProps) {
  const repId = districtRepVote?.representative_id ?? districtRepVote?.representatives?.representative_id;

  return (
    <div style={{
      marginTop: 10,
      background: 'white', borderRadius: 12, border: '1px solid #E2E8E4',
      overflow: 'hidden', padding: '14px 16px 16px',
    }}>
      {/* Section label */}
      <span style={{
        display: 'block',
        fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '0.8px', color: '#94a3b8',
        marginBottom: 10,
      }}>
        Your Representative's Vote
      </span>

      {passedBySuspension ? (
        <div style={{
          background: '#F4F6F0',
          borderRadius: 8,
          padding: '12px 14px',
          marginBottom: 10,
          display: 'flex',
          alignItems: 'flex-start',
          gap: 8,
        }}>
          <i className="fa-solid fa-circle-info" style={{ fontSize: 13, color: '#94a3b8', flexShrink: 0, marginTop: 1 }} />
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#0f1724', margin: '0 0 4px' }}>
              Passed by suspension of rules
            </p>
            <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.5, margin: 0 }}>
              Individual member votes were not recorded for this bill. {legislativeBodyName} passed it by suspending normal voting procedures.
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* District rep reveal block */}
          <div style={{ background: '#F4F6F0', borderRadius: 8, padding: 12, marginBottom: 10 }}>
            {repVoteError ? (
              <p style={{ fontSize: 13, color: '#94a3b8', fontStyle: 'italic' }}>{repVoteError}</p>
            ) : districtRepVote === undefined ? (
              <p style={{ fontSize: 13, color: '#94a3b8', fontStyle: 'italic' }}>Loading…</p>
            ) : (
              <RepVoteBlock
                repVote={districtRepVote}
                userVote={userVote}
                onNavigateToRep={onNavigateToRep}
              />
            )}
          </div>

          {/* At-large reps */}
          {atLargeRepVotes.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <button
                onClick={onToggleAtLarge}
                style={{
                  width: '100%', background: '#F4F6F0', color: '#1B4332',
                  border: '1px solid #E2E8E4', borderRadius: 8, padding: '9px 12px',
                  fontSize: 13, fontWeight: 700, textAlign: 'left', minHeight: 'unset',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}
              >
                <span>At-Large Representatives' Votes</span>
                <i className={`fa-solid fa-chevron-${atLargeExpanded ? 'up' : 'down'}`} style={{ fontSize: 12 }} />
              </button>

              {atLargeExpanded && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
                  {atLargeRepVotes.map((rv) => (
                    <div key={rv.representative_id} style={{ background: '#F4F6F0', borderRadius: 8, padding: 12 }}>
                      <RepVoteBlock repVote={rv} userVote={userVote} onNavigateToRep={onNavigateToRep} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Action row */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={onShare}
          style={{
            flex: 1, background: '#F4F6F0', color: '#1B4332',
            border: '1px solid #E2E8E4', borderRadius: 8, padding: 10,
            fontSize: 13, fontWeight: 700,
          }}
        >
          <i className="fa-solid fa-share-nodes" style={{ marginRight: 6 }} />
          Share
        </button>
        {repId && (
          <button
            onClick={() => onNavigateToRep(repId)}
            style={{
              flex: 1, background: '#1B4332', color: 'white',
              border: 'none', borderRadius: 8, padding: 10,
              fontSize: 13, fontWeight: 700,
            }}
          >
            View Rep Profile
          </button>
        )}
      </div>
    </div>
  );
}

function RepVoteBlock({
  repVote,
  userVote,
  onNavigateToRep,
}: {
  repVote: RepVoteWithRep | null;
  userVote: UserVote | null;
  onNavigateToRep: (repId: string) => void;
}) {
  if (!repVote) {
    return (
      <p style={{ fontSize: 13, color: '#94a3b8', fontStyle: 'italic' }}>
        Your representative's vote has not been recorded yet.
      </p>
    );
  }

  const rep = repVote.representatives;
  const repName = rep ? `${rep.first_name} ${rep.last_name}` : 'Your Representative';
  const repTitle = rep?.title ?? '';
  const repId = repVote.representative_id ?? '';
  const hasVote = repVote.vote === 'support' || repVote.vote === 'oppose';

  if (!hasVote) {
    return (
      <>
        <button
          onClick={() => repId && onNavigateToRep(repId)}
          style={{
            background: 'none', border: 'none', padding: 0, textAlign: 'left',
            fontSize: 13, fontWeight: 700, color: '#0f1724', minHeight: 'unset',
            marginBottom: 4, display: 'block',
          }}
        >
          {repName}{repTitle ? ` · ${repTitle}` : ''}
        </button>
        <span style={{ display: 'block', fontSize: 13, color: '#94a3b8', fontStyle: 'italic' }}>
          Vote has not been recorded yet.
        </span>
      </>
    );
  }

  const isMatch = userVote && repVote.vote === userVote.vote;
  const voteLabel = repVote.vote === 'support' ? 'Supported' : 'Opposed';
  const voteColor = isMatch ? '#1DB97A' : '#F0455A';

  return (
    <>
      <button
        onClick={() => repId && onNavigateToRep(repId)}
        style={{
          background: 'none', border: 'none', padding: 0, textAlign: 'left',
          fontSize: 13, fontWeight: 700, color: '#0f1724', minHeight: 'unset',
          marginBottom: 4, display: 'block',
        }}
      >
        {repName}{repTitle ? ` · ${repTitle}` : ''}
      </button>

      <span style={{
        display: 'block',
        fontSize: 13, fontWeight: 700, color: voteColor,
        marginBottom: repVote.explanation ? 6 : 0,
      }}>
        {voteLabel}
      </span>

      {repVote.explanation && (
        <div style={{ borderTop: '1px solid #E2E8E4', paddingTop: 8, marginTop: 4 }}>
          <span style={{
            display: 'block',
            fontSize: 11, color: '#94a3b8', fontWeight: 600, marginBottom: 3,
          }}>
            Why they voted this way:
          </span>
          <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.5 }}>{repVote.explanation}</p>
        </div>
      )}
    </>
  );
}
