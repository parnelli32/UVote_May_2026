import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { logError } from '../lib/errorLogger';
import { getCache, setCache, TTL } from '../lib/cache';
import { BillCard } from '../components/BillCard';
import { formatNumber } from '../lib/formatNumber';
import type { Database } from '../lib/types';

const PAGE_SIZE = 20;

type FeedBill = Database['public']['Views']['my_bill_feed']['Row'];

type StatusFilter = 'active' | 'passed' | 'all';
type VoteFilter = 'all' | 'not-voted' | 'voted' | 'matched-majority';
type SortBy = 'newest' | 'oldest' | 'most-votes' | 'topic' | 'highest-support';

export function HomeTab({ onNavigateToBill }: { onNavigateToBill: (billId: string) => void; onNavigateToAbout: () => void }) {
  const { user, currentBodyId, currentBody } = useAuth();
  const [bills, setBills] = useState<FeedBill[]>([]);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [statusOnlyCount, setStatusOnlyCount] = useState<number | null>(null);
  const [unvotedActiveCount, setUnvotedActiveCount] = useState(0);
  const [hasEverVoted, setHasEverVoted] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter & sort state
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [voteFilter, setVoteFilter] = useState<VoteFilter>('all');
  const [topicFilter, setTopicFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortBy>('newest');
  const [drawerOpen, setDrawerOpen] = useState(false);

  const requiresCommitteeReport = currentBody?.requires_committee_report ?? false;

  const buildQuery = useCallback((offset: number, withCount: boolean = true) => {
    let q = withCount
      ? supabase.from('my_bill_feed').select('*', { count: 'exact' })
      : supabase.from('my_bill_feed').select('*');

    if (currentBodyId) q = q.eq('legislative_body_id', currentBodyId);

    if (statusFilter === 'active') {
      q = q.eq('status', 'active');
      if (requiresCommitteeReport) q = q.not('reported_from_committee_at', 'is', null);
    } else if (statusFilter === 'passed') {
      q = q.eq('status', 'passed');
    }

    if (voteFilter === 'not-voted') q = q.is('my_vote', null);
    else if (voteFilter === 'voted') q = q.not('my_vote', 'is', null);
    else if (voteFilter === 'matched-majority') q = q.eq('matched_district_majority', true);

    if (topicFilter !== 'all') q = q.eq('topic', topicFilter);

    if (sortBy === 'newest') q = q.order('effective_sort_date', { ascending: false });
    else if (sortBy === 'oldest') q = q.order('effective_sort_date', { ascending: true });
    else if (sortBy === 'most-votes') q = q.order('total_votes', { ascending: false });
    else if (sortBy === 'highest-support') q = q.order('support_pct', { ascending: false });
    else if (sortBy === 'topic') q = q.order('topic', { ascending: true });
    // Stable tie-breaker so .range() pagination can't skip or repeat rows across pages.
    q = q.order('bill_id', { ascending: true });

    return q.range(offset, offset + PAGE_SIZE - 1);
  }, [currentBodyId, statusFilter, voteFilter, topicFilter, sortBy, requiresCommitteeReport]);

  // Initial load / reset to page 1 whenever the user, body, or any filter changes.
  const loadGenerationRef = useRef(0);
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    loadGenerationRef.current += 1;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const cacheKey = `bills_${user!.id}_${currentBodyId}_${statusFilter}_${voteFilter}_${topicFilter}_${sortBy}`;
        type BillsCache = { bills: FeedBill[]; totalCount: number | null; hasMore: boolean };
        const cached = getCache<BillsCache>(cacheKey, TTL.SHORT);
        if (cached) {
          setBills(cached.bills);
          setTotalCount(cached.totalCount);
          setHasMore(cached.hasMore);
          setLoading(false);
          return;
        }

        const { data, error: err, count } = await buildQuery(0);
        if (err) throw err;
        if (cancelled) return;

        const rows = data ?? [];
        const computedHasMore = rows.length === PAGE_SIZE && (count === null || rows.length < count);
        setBills(rows);
        setTotalCount(count ?? null);
        setHasMore(computedHasMore);
        setCache(cacheKey, { bills: rows, totalCount: count ?? null, hasMore: computedHasMore });
      } catch (err) {
        if (cancelled) return;
        const msg = (err as { message?: string })?.message ?? (err instanceof Error ? err.message : null) ?? String(err);
        logError({ action: 'load_bill_feed', userId: user?.id ?? null, errorMessage: msg });
        setError("We couldn't load bills right now. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [user, currentBodyId, statusFilter, voteFilter, topicFilter, sortBy, buildQuery]);

  // Count of bills matching body+status alone (ignoring the vote/topic filters) —
  // distinguishes "this body/status has zero bills" (generic empty state) from
  // "bills exist, but none match the current vote/topic filter" (Clear filters state).
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    async function loadStatusOnlyCount() {
      let q = supabase.from('my_bill_feed').select('bill_id', { count: 'exact', head: true });
      if (currentBodyId) q = q.eq('legislative_body_id', currentBodyId);
      if (statusFilter === 'active') {
        q = q.eq('status', 'active');
        if (requiresCommitteeReport) q = q.not('reported_from_committee_at', 'is', null);
      } else if (statusFilter === 'passed') {
        q = q.eq('status', 'passed');
      }
      const { count } = await q;
      if (!cancelled) setStatusOnlyCount(count ?? 0);
    }
    loadStatusOnlyCount();
    return () => { cancelled = true; };
  }, [user, currentBodyId, statusFilter, requiresCommitteeReport]);

  // "Bills waiting for your vote" — scoped to active/votable bills in the current
  // body, independent of the vote/topic filter currently on screen.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    async function loadUnvoted() {
      let q = supabase.from('my_bill_feed').select('bill_id', { count: 'exact', head: true }).is('my_vote', null);
      if (currentBodyId) q = q.eq('legislative_body_id', currentBodyId);
      q = q.eq('status', 'active');
      if (requiresCommitteeReport) q = q.not('reported_from_committee_at', 'is', null);
      const { count } = await q;
      if (!cancelled) setUnvotedActiveCount(count ?? 0);
    }
    loadUnvoted();
    return () => { cancelled = true; };
  }, [user, currentBodyId, requiresCommitteeReport]);

  // Has this user ever cast a vote on anything — governs whether the "No active
  // bills right now" empty state shows for a brand-new user.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    async function checkEverVoted() {
      const { count } = await supabase.from('user_votes').select('user_vote_id', { count: 'exact', head: true }).eq('user_id', user!.id);
      if (!cancelled) setHasEverVoted((count ?? 0) > 0);
    }
    checkEverVoted();
    return () => { cancelled = true; };
  }, [user]);

  async function loadMore() {
    if (loadingMore || !hasMore || !user) return;
    setLoadingMore(true);
    const generation = loadGenerationRef.current;
    try {
      const { data, error: err } = await buildQuery(bills.length, false);
      if (err) throw err;
      if (generation !== loadGenerationRef.current) return;
      const rows = data ?? [];
      setBills((prev) => [...prev, ...rows]);
      setHasMore(rows.length === PAGE_SIZE);
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? (err instanceof Error ? err.message : null) ?? String(err);
      logError({ action: 'load_bill_feed_more', userId: user?.id ?? null, errorMessage: msg });
    } finally {
      setLoadingMore(false);
    }
  }

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadMoreRef = useRef(loadMore);
  loadMoreRef.current = loadMore;

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) loadMoreRef.current();
    }, { rootMargin: '200px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, [bills.length]);

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

  // "Some bills exist for this body/status" — gates the top bar/drawer and
  // distinguishes the two empty states below. Defaults to bills.length>0 while
  // the (separately fetched) status-only count hasn't resolved yet.
  const hasAnyForStatus = (statusOnlyCount ?? bills.length) > 0;
  const isFirstTimeUser = !hasEverVoted;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Bills waiting bar */}
      {hasAnyForStatus && (
        unvotedActiveCount > 0 ? (
          <div style={{
            background: '#1B4332', borderRadius: 8, padding: '9px 12px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>
              {formatNumber(unvotedActiveCount)} bill{unvotedActiveCount !== 1 ? 's' : ''} waiting for your vote
            </span>
            <span style={{
              background: 'rgba(255,255,255,0.2)', color: 'white',
              fontSize: 13, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
            }}>
              {formatNumber(unvotedActiveCount)}
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
      {hasAnyForStatus && (
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
                {formatNumber(totalCount ?? bills.length)} {(totalCount ?? bills.length) === 1 ? 'bill' : 'bills'}
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
      {bills.length === 0 && !hasAnyForStatus ? (
        !isFirstTimeUser && (
          <div className="flex flex-col items-center justify-center text-center" style={{ minHeight: '40vh', gap: 0 }}>
            <i className="fa-solid fa-hand" style={{ fontSize: 32, color: '#1B4332', marginBottom: 10 }} />
            <p style={{ fontSize: 14, fontWeight: 700, color: '#0f1724', marginBottom: 6 }}>No active bills right now.</p>
            <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.5, maxWidth: 260, textAlign: 'center' }}>
              Check back soon — bills are added as {currentBody?.name ?? 'your legislative body'} introduces new legislation.
            </p>
          </div>
        )
      ) : bills.length === 0 ? (
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
        bills.map((bill) => (
          <BillCard
            key={bill.bill_id}
            bill={bill}
            userVote={bill.my_vote ? { vote: bill.my_vote } : null}
            isLoggedIn={!!user}
            onTap={() => onNavigateToBill(bill.bill_id)}
          />
        ))
      )}

      {bills.length > 0 && (
        <div ref={sentinelRef} style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
          {loadingMore && (
            <div className="flex gap-1.5">
              {[0, 150, 300].map((delay) => (
                <span
                  key={delay}
                  className="w-1.5 h-1.5 rounded-full animate-bounce"
                  style={{ background: '#1B4332', animationDelay: `${delay}ms` }}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
