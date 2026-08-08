import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { logError } from '../lib/errorLogger';
import { getTopicTag } from '../lib/billUtils';
import { getCache, setCache, TTL } from '../lib/cache';
import type { UserVote } from '../lib/types';
import { BillCard } from '../components/BillCard';
import type { BillWithTally } from '../components/BillCard';
import { BottomNav } from '../components/BottomNav';

export function HomeTab({ onNavigateToBill, onNavigateToAbout }: { onNavigateToBill: (billId: string) => void; onNavigateToAbout: () => void }) {
  const { user, profile } = useAuth();
  const [bills, setBills] = useState<BillWithTally[]>([]);
  const [userVotes, setUserVotes] = useState<Map<string, UserVote>>(new Map());
  const [districtTallies, setDistrictTallies] = useState<{ bill_id: string; support_count: number; oppose_count: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter & sort state
  const [statusFilter, setStatusFilter] = useState<'active' | 'passed' | 'all'>('active');
  const [voteFilter, setVoteFilter] = useState<'all' | 'not-voted' | 'voted' | 'matched-majority'>('all');
  const [topicFilter, setTopicFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'most-votes' | 'topic' | 'highest-support'>('newest');
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const cacheKey = `bills_${user?.id ?? 'anon'}_${statusFilter}`;
        type BillsCache = {
          bills: BillWithTally[];
          userVotes: [string, UserVote][];
          districtTallies: { bill_id: string; support_count: number; oppose_count: number }[];
        };
        const cached = getCache<BillsCache>(cacheKey, TTL.SHORT);
        if (cached) {
          setBills(cached.bills);
          setUserVotes(new Map(cached.userVotes));
          setDistrictTallies(cached.districtTallies);
          setLoading(false);
          return;
        }

        // Resolve legislative_body_id from user's district
        let legislativeBodyId: string | null = null;
        if (profile?.district_id) {
          const { data: districtData } = await supabase
            .from('districts')
            .select('legislative_body_id')
            .eq('district_id', profile.district_id)
            .maybeSingle();
          legislativeBodyId = districtData?.legislative_body_id ?? null;
        }

        let billQuery = supabase
          .from('bills')
          .select('*')
          .order('created_at', { ascending: false });

        if (legislativeBodyId) {
          billQuery = billQuery.eq('legislative_body_id', legislativeBodyId);
        }

        if (statusFilter === 'active') {
          billQuery = billQuery.eq('status', 'active');
        } else if (statusFilter === 'passed') {
          billQuery = billQuery.eq('status', 'passed');
        }
        // statusFilter === 'all': no filter, fetch all statuses

        const { data: billsData, error: billsErr } = await billQuery;
        if (billsErr) throw billsErr;

        if (!billsData || billsData.length === 0) {
          setBills([]);
          setLoading(false);
          return;
        }

        const billIds = billsData.map((b) => b.bill_id);

        // Fetch tallies and user votes in parallel
        const [talliesRes, uvRes] = await Promise.all([
          supabase
            .from('bill_vote_tallies')
            .select('bill_id, support_count, oppose_count, total_votes')
            .in('bill_id', billIds),
          user
            ? supabase.from('user_votes').select('*').eq('user_id', user.id).in('bill_id', billIds)
            : Promise.resolve({ data: null }),
        ]);

        const tallies = talliesRes.data;
        const uvData = uvRes.data;

        const tallyMap = new Map<string, { support_count: number; oppose_count: number; total_votes: number }>(
          (tallies ?? []).map((t) => [
            t.bill_id,
            {
              support_count: Number(t.support_count ?? 0),
              oppose_count: Number(t.oppose_count ?? 0),
              total_votes: Number(t.total_votes ?? 0),
            },
          ])
        );

        const merged: BillWithTally[] = billsData.map((b) => ({
          ...b,
          ...(tallyMap.get(b.bill_id) ?? { support_count: 0, oppose_count: 0, total_votes: 0 }),
        }));
        setBills(merged);

        if (user) {
          setUserVotes(
            new Map((uvData ?? []).map((uv) => [uv.bill_id!, uv]))
          );
        }

        // Fetch district tallies for "Matched Majority" filter — aggregated server-side,
        // scoped to the signed-in user's own district (safe for an arbitrary bill_id list
        // since membership is always resolved from auth.uid(), never client-supplied)
        let dTallies: { bill_id: string; support_count: number; oppose_count: number }[] = [];

        if (user) {
          const { data: dt } = await supabase.rpc('my_district_bill_tallies', { p_bill_ids: billIds });
          dTallies = dt ?? [];
        }

        setDistrictTallies(dTallies);

        setCache(cacheKey, {
          bills: merged,
          userVotes: user
            ? [...new Map((uvData ?? []).map((uv) => [uv.bill_id!, uv])).entries()]
            : [],
          districtTallies: dTallies,
        });
      } catch (err) {
        const msg = (err as { message?: string })?.message ?? (err instanceof Error ? err.message : null) ?? String(err);
        logError({ action: 'load_bill_feed', userId: user?.id ?? null, errorMessage: msg });
        setError("We couldn't load bills right now. Please try again.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user, profile?.district_id, statusFilter]);

  const filteredBills = useMemo(() => {
    let result = [...bills];

    // Status filter
    if (statusFilter === 'active') result = result.filter(b => b.status === 'active');
    else if (statusFilter === 'passed') result = result.filter(b => b.status === 'passed');

    // Vote filter
    if (voteFilter === 'not-voted') result = result.filter(b => !userVotes.has(b.bill_id));
    else if (voteFilter === 'voted') result = result.filter(b => userVotes.has(b.bill_id));
    else if (voteFilter === 'matched-majority') result = result.filter(b => {
      const uv = userVotes.get(b.bill_id);
      if (!uv) return false;
      const t = districtTallies.find(v => v.bill_id === b.bill_id);
      const ds = t?.support_count ?? 0;
      const dop = t?.oppose_count ?? 0;
      if (ds + dop < 2 || ds === dop) return false;
      const maj = ds > dop ? 'support' : 'oppose';
      return uv.vote === maj;
    });

    // Topic filter
    if (topicFilter !== 'all') result = result.filter(b => getTopicTag(b.title, b.summary).label === topicFilter);

    // Sort
    if (sortBy === 'newest') result.sort((a, b) => new Date(b.introduced_date ?? b.created_at).getTime() - new Date(a.introduced_date ?? a.created_at).getTime());
    else if (sortBy === 'oldest') result.sort((a, b) => new Date(a.introduced_date ?? a.created_at).getTime() - new Date(b.introduced_date ?? b.created_at).getTime());
    else if (sortBy === 'most-votes') result.sort((a, b) => b.total_votes - a.total_votes);
    else if (sortBy === 'topic') result.sort((a, b) => getTopicTag(a.title, a.summary).label.localeCompare(getTopicTag(b.title, b.summary).label));
    else if (sortBy === 'highest-support') result.sort((a, b) => {
      const aPct = a.total_votes > 0 ? a.support_count / a.total_votes : -1;
      const bPct = b.total_votes > 0 ? b.support_count / b.total_votes : -1;
      return bPct - aPct;
    });

    return result;
  }, [bills, statusFilter, voteFilter, topicFilter, sortBy, userVotes, districtTallies]);

  const activeFilterCount = [
    statusFilter !== 'active',
    voteFilter !== 'all',
    topicFilter !== 'all',
    sortBy !== 'newest',
  ].filter(Boolean).length;

  const SORT_LABELS: Record<string, string> = {
    'newest': 'Newest first',
    'oldest': 'Oldest first',
    'most-votes': 'Most votes',
    'topic': 'Topic',
    'highest-support': 'Highest support',
  };

  const TOPIC_OPTIONS = ['Housing', 'Public Safety', 'Budget', 'Education', 'Infrastructure', 'Other'];

  function clearAllFilters() {
    setStatusFilter('active');
    setVoteFilter('all');
    setTopicFilter('all');
    setSortBy('newest');
    setDrawerOpen(false);
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center" style={{ minHeight: '50vh' }}>
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
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center text-center" style={{ minHeight: '50vh', padding: '0 20px' }}>
        <i className="fa-solid fa-triangle-exclamation" style={{ fontSize: 28, color: '#F0455A', marginBottom: 10 }} />
        <p style={{ fontSize: 13, fontWeight: 700, color: '#0f1724', marginBottom: 4 }}>Something went wrong</p>
        <p style={{ fontSize: 13, color: '#64748b' }}>{error}</p>
      </div>
    );
  }

  const unvotedCount = filteredBills.filter((b) => !userVotes.has(b.bill_id)).length;
  const isFirstTimeUser = userVotes.size === 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Bills waiting bar */}
      {bills.length > 0 && (
        unvotedCount > 0 ? (
          <div style={{
            background: '#1B4332', borderRadius: 8, padding: '9px 12px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>
              {unvotedCount} bill{unvotedCount !== 1 ? 's' : ''} waiting for your vote
            </span>
            <span style={{
              background: 'rgba(255,255,255,0.2)', color: 'white',
              fontSize: 13, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
            }}>
              {unvotedCount}
            </span>
          </div>
        ) : (
          <div style={{
            background: '#E6F5EE', borderRadius: 8, padding: '9px 12px',
            textAlign: 'center',
          }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#0e6b4a' }}>
              You're all caught up.
            </span>
          </div>
        )
      )}

      {/* Filter summary bar + drawer */}
      {bills.length > 0 && (
        <div>
          {/* Summary bar */}
          <div
            onClick={() => setDrawerOpen(v => !v)}
            style={{
              background: 'white',
              borderRadius: 8,
              border: '1px solid #E2E8E4',
              padding: '7px 10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            {/* Left */}
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', alignItems: 'center', gap: 6 }}>
              <i className="fa-solid fa-sliders" style={{ fontSize: 13, color: '#1B4332', flexShrink: 0 }} />
              {activeFilterCount === 0 ? (
                <span style={{ fontSize: 13, fontWeight: 600, color: '#94a3b8', whiteSpace: 'nowrap' }}>
                  All bills · Newest first
                </span>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden' }}>
                  {statusFilter !== 'active' && (
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 10, background: '#E8F0EB', color: '#1B4332', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {statusFilter === 'passed' ? 'Passed' : 'All statuses'}
                    </span>
                  )}
                  {voteFilter !== 'all' && (
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 10, background: '#FFF3D6', color: '#7A4F00', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {voteFilter === 'not-voted' ? 'Not Voted' : voteFilter === 'voted' ? 'Voted' : 'Matched Majority'}
                    </span>
                  )}
                  {topicFilter !== 'all' && (
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 10, background: '#EEF3FF', color: '#1A56DB', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {topicFilter}
                    </span>
                  )}
                  {sortBy !== 'newest' && (
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 10, background: '#F1F5F9', color: '#475569', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {SORT_LABELS[sortBy]}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Right */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <span style={{ fontSize: 12, color: '#94a3b8' }}>
                {filteredBills.length} {filteredBills.length === 1 ? 'bill' : 'bills'}
              </span>
              <i
                className="fa-solid fa-chevron-down"
                style={{
                  fontSize: 11,
                  color: '#94a3b8',
                  transform: drawerOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s',
                }}
              />
            </div>
          </div>

          {/* Drawer */}
          {drawerOpen && (
            <div style={{
              background: 'white',
              borderRadius: 10,
              border: '2px solid #1B4332',
              overflow: 'hidden',
              marginTop: 6,
            }}>
              {/* Drawer header */}
              <div style={{
                background: '#1B4332',
                padding: '9px 12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>Filter &amp; Sort</span>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  {activeFilterCount > 0 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); clearAllFilters(); }}
                      style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.65)', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                    >
                      Clear all
                    </button>
                  )}
                  <i
                    className="fa-solid fa-xmark"
                    onClick={(e) => { e.stopPropagation(); setDrawerOpen(false); }}
                    style={{ fontSize: 13, color: 'white', cursor: 'pointer' }}
                  />
                </div>
              </div>

              {/* Sort */}
              <div style={{ padding: '9px 12px', borderBottom: '1px solid #F4F6F0' }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: '#94a3b8', marginBottom: 7 }}>Sort</div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {(['newest', 'oldest', 'most-votes', 'highest-support', 'topic'] as const).map((val) => {
                    const active = sortBy === val;
                    return (
                      <button key={val} onClick={() => setSortBy(val)} style={{
                        fontSize: 12, fontWeight: 700, padding: '4px 9px', borderRadius: 20, cursor: 'pointer', flexShrink: 0,
                        background: active ? '#1B4332' : 'white',
                        color: active ? 'white' : '#64748b',
                        border: `1px solid ${active ? '#1B4332' : '#E2E8E4'}`,
                      }}>
                        {SORT_LABELS[val]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Status */}
              <div style={{ padding: '9px 12px', borderBottom: '1px solid #F4F6F0' }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: '#94a3b8', marginBottom: 7 }}>Status</div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {([['active', 'Active'], ['passed', 'Passed'], ['all', 'All']] as const).map(([val, label]) => {
                    const active = statusFilter === val;
                    return (
                      <button key={val} onClick={() => setStatusFilter(val)} style={{
                        fontSize: 12, fontWeight: 700, padding: '4px 9px', borderRadius: 20, cursor: 'pointer', flexShrink: 0,
                        background: active ? '#1B4332' : 'white',
                        color: active ? 'white' : '#64748b',
                        border: `1px solid ${active ? '#1B4332' : '#E2E8E4'}`,
                      }}>
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Your votes */}
              <div style={{ padding: '9px 12px', borderBottom: '1px solid #F4F6F0' }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: '#94a3b8', marginBottom: 7 }}>Your votes</div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {([['all', 'All'], ['not-voted', 'Not Voted'], ['voted', 'Voted'], ['matched-majority', 'Matched Majority']] as const).map(([val, label]) => {
                    const active = voteFilter === val;
                    return (
                      <button key={val} onClick={() => setVoteFilter(val)} style={{
                        fontSize: 12, fontWeight: 700, padding: '4px 9px', borderRadius: 20, cursor: 'pointer', flexShrink: 0,
                        background: active ? '#1B4332' : 'white',
                        color: active ? 'white' : '#64748b',
                        border: `1px solid ${active ? '#1B4332' : '#E2E8E4'}`,
                      }}>
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Topic */}
              <div style={{ padding: '9px 12px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: '#94a3b8', marginBottom: 7 }}>Topic</div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {(['all', ...TOPIC_OPTIONS] as const).map((val) => {
                    const active = topicFilter === val;
                    const isAll = val === 'all';
                    return (
                      <button key={val} onClick={() => setTopicFilter(val)} style={{
                        fontSize: 12, fontWeight: 700, padding: '4px 9px', borderRadius: 20, cursor: 'pointer', flexShrink: 0,
                        background: active ? (isAll ? '#1B4332' : '#FFF3D6') : 'white',
                        color: active ? (isAll ? 'white' : '#7A4F00') : '#64748b',
                        border: `1px solid ${active ? (isAll ? '#1B4332' : '#F5A623') : '#E2E8E4'}`,
                      }}>
                        {isAll ? 'All Topics' : val}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bill cards */}
      {bills.length === 0 ? (
        !isFirstTimeUser && (
          <div className="flex flex-col items-center justify-center text-center" style={{ minHeight: '40vh', gap: 0 }}>
            <i className="fa-solid fa-hand" style={{ fontSize: 32, color: '#1B4332', marginBottom: 10 }} />
            <p style={{ fontSize: 14, fontWeight: 700, color: '#0f1724', marginBottom: 6 }}>No active bills right now.</p>
            <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.5, maxWidth: 260, textAlign: 'center' }}>
              Check back soon — bills are added as Philadelphia City Council introduces new legislation.
            </p>
          </div>
        )
      ) : filteredBills.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center" style={{ minHeight: '30vh', gap: 0, padding: '0 20px' }}>
          <i className="fa-solid fa-filter-circle-xmark" style={{ fontSize: 24, color: '#94a3b8', display: 'block', marginBottom: 8 }} />
          <p style={{ fontSize: 13, fontWeight: 700, color: '#0f1724', marginBottom: 4 }}>No bills match your filters.</p>
          <p style={{ fontSize: 13, color: '#64748b', marginBottom: 10 }}>Try adjusting or clearing your filters.</p>
          <button
            onClick={clearAllFilters}
            style={{
              background: '#1B4332', color: 'white', borderRadius: 8,
              padding: '8px 16px', fontSize: 13, fontWeight: 700,
              border: 'none', cursor: 'pointer',
            }}
          >
            Clear filters
          </button>
        </div>
      ) : (
        filteredBills.map((bill) => {
          const uv = userVotes.get(bill.bill_id) ?? null;
          return (
            <BillCard
              key={bill.bill_id}
              bill={bill}
              userVote={uv}
              isLoggedIn={!!user}
              onTap={() => onNavigateToBill(bill.bill_id)}
            />
          );
        })
      )}
    </div>
  );
}

// ─── WELCOME CARD (kept for reference, no longer rendered) ──────────────────

const WELCOME_STEPS = [
  {
    action: 'Vote on a bill',
    rest: ' — tap Support or Oppose on any bill below. Your vote is anonymous to other users.',
  },
  {
    action: "See your rep's position",
    rest: ' — after you vote, find out how your council member voted and whether it matched your district\'s majority.',
  },
  {
    action: 'Track alignment',
    rest: " — your rep's alignment score updates as more constituents vote. The more people participate, the more meaningful the data becomes.",
  },
];

function WelcomeCard({ onNavigateToAbout }: { onNavigateToAbout: () => void }) {
  return (
    <div style={{
      background: 'white',
      borderRadius: 12,
      border: '1px solid #E2E8E4',
      borderLeft: '3px solid #1B4332',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '14px 14px 10px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <i className="fa-solid fa-hand" style={{ fontSize: 22, color: '#1B4332', flexShrink: 0 }} />
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <p style={{ fontSize: 14, fontWeight: 800, color: '#0f1724', lineHeight: 1.2, margin: '0 0 2px' }}>
            Welcome to UVote
          </p>
          <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.4, margin: 0 }}>
            Your civic voice between elections.
          </p>
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: '#F4F6F0', margin: '0 14px' }} />

      {/* Steps */}
      <div style={{ padding: '10px 14px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {WELCOME_STEPS.map((step, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div style={{
              width: 20, height: 20, borderRadius: '50%',
              background: '#1B4332', color: 'white',
              fontSize: 12, fontWeight: 800,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, marginTop: 1,
            }}>
              {i + 1}
            </div>
            <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.5, margin: 0 }}>
              <span style={{ fontWeight: 700, color: '#0f1724' }}>{step.action}</span>
              {step.rest}
            </p>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{
        padding: '10px 14px 12px',
        borderTop: '1px solid #F4F6F0',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <button
          onClick={onNavigateToAbout}
          style={{
            fontSize: 13, fontWeight: 700, color: '#1B4332',
            background: 'none', border: 'none', padding: 0,
            cursor: 'pointer', minHeight: 'unset',
          }}
        >
          About UVote →
        </button>
      </div>
    </div>
  );
}
