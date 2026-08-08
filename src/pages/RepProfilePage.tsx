import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { logError } from '../lib/errorLogger';
import { useAuth } from '../context/AuthContext';
import { BottomNav } from '../components/BottomNav';
import { AppHeader } from '../components/AppHeader';
import { BillListFilterBar } from '../components/BillListFilterBar';
import { BillHistoryRow, PassedSponsoredBillRow } from '../components/RepBillRows';
import type { NavTab } from '../components/BottomNav';
import type { Representative, Bill, RepVote } from '../lib/types';

type NavProps = {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  onNavigateToProfile: () => void;
  onNavigateToAdmin: () => void;
};

type RepProfilePageProps = {
  repId: string;
  onBack: () => void;
  onNavigateToBill: (billId: string) => void;
  onNavigateToRep: (repId: string) => void;
  onNavigateToHowItWorks: () => void;
  onNavigateToAbout: () => void;
  onNavigateToRepHistory: (bills: BillWithRepVote[], repName: string) => void;
  navProps?: NavProps;
};

type BillWithRepVote = Bill & {
  rep_vote: RepVote;
  district_support: number;
  district_oppose: number;
  qualifies_for_score: boolean;
  district_majority: 'support' | 'oppose' | null;
  rep_matches_district: boolean | null;
};

type AlignmentScore = {
  score: number;
  qualifying: number;
} | null;

type MyAlignmentScore = {
  score: number;
  total: number;
  matched: number;
  mismatched: number;
} | null;

type AtLargeRep = Pick<Representative, 'representative_id' | 'first_name' | 'last_name' | 'title'>;

export function RepProfilePage({ repId, onBack, onNavigateToBill, onNavigateToRep, onNavigateToHowItWorks, onNavigateToAbout, onNavigateToRepHistory, navProps }: RepProfilePageProps) {
  const { user } = useAuth();

  const [rep, setRep] = useState<Representative | null>(null);
  const [districtScore, setDistrictScore] = useState<AlignmentScore>(undefined as unknown as AlignmentScore);
  const [cityScore, setCityScore] = useState<AlignmentScore>(undefined as unknown as AlignmentScore);
  const [myAlignmentScore, setMyAlignmentScore] = useState<MyAlignmentScore>(undefined as unknown as MyAlignmentScore);
  const [suspensionCount, setSuspensionCount] = useState(0);
  const [billHistory, setBillHistory] = useState<BillWithRepVote[]>([]);
  const [passedSponsoredBills, setPassedSponsoredBills] = useState<Bill[]>([]);
  const [sponsoredBillIds, setSponsoredBillIds] = useState<Map<string, 'primary' | 'cosponsor'>>(new Map());
  const [atLargeReps, setAtLargeReps] = useState<AtLargeRep[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scoresLoading, setScoresLoading] = useState(true);

  // Sponsored bills filter state
  const [sponsoredSortBy, setSponsoredSortBy] = useState<'newest' | 'oldest' | 'passed-first'>('passed-first');
  const [sponsoredTypeFilter, setSponsoredTypeFilter] = useState<'all' | 'primary' | 'cosponsor'>('all');
  const [sponsoredStatusFilter, setSponsoredStatusFilter] = useState<'all' | 'active' | 'passed'>('all');

  const isAtLarge = !rep?.district_id;

  const loadRep = useCallback(async () => {
    try {
      const { data, error: err } = await supabase
        .from('representatives')
        .select('*')
        .eq('representative_id', repId)
        .maybeSingle();
      if (err) throw err;
      if (!data) throw new Error('Representative not found');
      setRep(data);
      return data;
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? (err instanceof Error ? err.message : null) ?? String(err);
      const code = (err as { code?: string }).code ?? null;
      logError({ action: 'load_rep_profile', userId: user?.id ?? null, errorMessage: msg, errorCode: code });
      setError("We couldn't load this representative's profile. Please try again.");
      return null;
    }
  }, [repId, user?.id]);

  const calculateScores = useCallback(async () => {
    setScoresLoading(true);
    try {
      // Fetch all rep_votes for this rep
      const { data: repVotes, error: rvErr } = await supabase
        .from('rep_votes')
        .select('bill_id, vote, explanation, rep_vote_id, created_at, representative_id')
        .eq('representative_id', repId);
      if (rvErr) throw rvErr;

      const billIds = (repVotes ?? []).map((rv) => rv.bill_id).filter(Boolean) as string[];

      if (billIds.length === 0) {
        setDistrictScore(null);
        setCityScore(null);
        setMyAlignmentScore(null);
        setSuspensionCount(0);
        setBillHistory([]);
        return;
      }

      // Fetch bills
      const { data: billsData, error: billsErr } = await supabase
        .from('bills')
        .select('*')
        .in('bill_id', billIds);
      if (billsErr) throw billsErr;

      const suspensionBillCount = (billsData ?? []).filter(b => b.passed_by_suspension).length;
      setSuspensionCount(suspensionBillCount);

      // Per-bill district tallies — aggregated server-side via SECURITY DEFINER RPC
      // (bill_ids the rep voted on are resolved from repId inside the function itself,
      // so this call needs no bill_id argument).
      const { data: historyRows, error: historyErr } = await supabase
        .rpc('rep_district_bill_history', { p_representative_id: repId });
      if (historyErr) throw historyErr;

      const billsMap = new Map((billsData ?? []).map((b) => [b.bill_id, b]));
      const repVoteMap = new Map<string, RepVote>(
        (repVotes ?? []).map((rv) => [rv.bill_id!, rv as RepVote])
      );

      // Build bill history with per-bill tallies (suspended bills are already
      // excluded by rep_district_bill_history, same as the prior client-side logic)
      const enriched: BillWithRepVote[] = [];

      for (const h of (historyRows ?? [])) {
        const bill = billsMap.get(h.bill_id);
        const rv = repVoteMap.get(h.bill_id);
        if (!bill || !rv) continue;

        const repMatchesDistrict = h.qualifies_for_score
          ? (rv.vote === 'support' || rv.vote === 'oppose') && rv.vote === h.district_majority
          : null;

        enriched.push({
          ...bill,
          rep_vote: rv,
          district_support: h.district_support,
          district_oppose: h.district_oppose,
          qualifies_for_score: h.qualifies_for_score,
          district_majority: h.district_majority,
          rep_matches_district: repMatchesDistrict,
        });
      }

      enriched.sort((a, b) => new Date(b.rep_vote.created_at).getTime() - new Date(a.rep_vote.created_at).getTime());
      setBillHistory(enriched);

      // Fetch sponsor data in parallel
      try {
        const [sponsorRes, passedRes] = await Promise.all([
          supabase.from('bill_sponsors').select('bill_id, sponsor_type').eq('representative_id', repId),
          supabase
            .from('bill_sponsors')
            .select('bill_id, bills!inner(*)')
            .eq('representative_id', repId)
            .eq('bills.status', 'passed'),
        ]);

        const sponsorRows = sponsorRes.data;
        const passedData = passedRes.data;

        if (sponsorRes.error) throw sponsorRes.error;
        setSponsoredBillIds(new Map((sponsorRows ?? []).map((r) => [r.bill_id, r.sponsor_type as 'primary' | 'cosponsor'])));

        if (passedRes.error) throw passedRes.error;
        const existingIds = new Set(enriched.map((b) => b.bill_id));
        const passedBills = (passedData ?? [])
          .map((row) => (row as unknown as { bills: Bill }).bills)
          .filter((b) => b && !existingIds.has(b.bill_id));
        setPassedSponsoredBills(passedBills);
      } catch (err) {
        const msg = (err as { message?: string })?.message ?? (err instanceof Error ? err.message : null) ?? String(err);
        logError({ action: 'load_sponsored_bills', userId: user?.id ?? null, errorMessage: msg });
        setSponsoredBillIds(new Map());
        setPassedSponsoredBills([]);
      }

      // District (Constituent) alignment score — canonical SQL implementation via RPC
      try {
        const { data, error: csErr } = await supabase.rpc('constituent_score', { p_representative_id: repId });
        if (csErr) throw csErr;
        const row = data?.[0];
        setDistrictScore(
          row && row.score !== null && row.qualifying_bills !== null
            ? { score: row.score, qualifying: row.qualifying_bills }
            : null
        );
      } catch (err) {
        const msg = (err as { message?: string })?.message ?? (err instanceof Error ? err.message : null) ?? String(err);
        logError({ action: 'calculate_district_alignment', userId: user?.id ?? null, errorMessage: msg });
        setDistrictScore(null);
      }

      // City alignment score — canonical SQL implementation via RPC
      try {
        const { data, error: ccErr } = await supabase.rpc('city_constituent_score', { p_representative_id: repId });
        if (ccErr) throw ccErr;
        const row = data?.[0];
        setCityScore(
          row && row.score !== null && row.qualifying_bills !== null
            ? { score: row.score, qualifying: row.qualifying_bills }
            : null
        );
      } catch (err) {
        const msg = (err as { message?: string })?.message ?? (err instanceof Error ? err.message : null) ?? String(err);
        logError({ action: 'calculate_city_alignment', userId: user?.id ?? null, errorMessage: msg });
        setCityScore(null);
      }

      // Personal alignment score (logged-in user vs. this rep) — canonical SQL implementation via RPC
      try {
        if (user?.id) {
          const { data, error: rsErr } = await supabase.rpc('representation_score', { p_representative_id: repId });
          if (rsErr) throw rsErr;
          const row = data?.[0];
          setMyAlignmentScore(
            row && row.total > 0
              ? { score: row.score ?? 0, total: row.total, matched: row.matched, mismatched: row.mismatched }
              : null
          );
        } else {
          setMyAlignmentScore(null);
        }
      } catch (err) {
        const msg = (err as { message?: string })?.message ?? (err instanceof Error ? err.message : null) ?? String(err);
        logError({ action: 'calculate_my_alignment', userId: user?.id ?? null, errorMessage: msg });
        setMyAlignmentScore(null);
      }

    } catch (err) {
      const msg = (err as { message?: string })?.message ?? (err instanceof Error ? err.message : null) ?? String(err);
      const code = (err as { code?: string }).code ?? null;
      logError({ action: 'load_rep_bill_history', userId: user?.id ?? null, errorMessage: msg, errorCode: code });
      setDistrictScore(null);
      setCityScore(null);
      setMyAlignmentScore(null);
    } finally {
      setScoresLoading(false);
    }
  }, [repId, user?.id]);

  const loadAtLargeReps = useCallback(async (repData: Representative) => {
    if (!repData.district_id || !repData.legislative_body_id) return;
    try {
      const { data } = await supabase
        .from('representatives')
        .select('representative_id, first_name, last_name, title')
        .is('district_id', null)
        .eq('legislative_body_id', repData.legislative_body_id)
        .neq('representative_id', repId);
      setAtLargeReps((data ?? []) as AtLargeRep[]);
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? (err instanceof Error ? err.message : null) ?? String(err);
      logError({ action: 'load_rep_profile', userId: user?.id ?? null, errorMessage: msg });
    }
  }, [repId, user?.id]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const repData = await loadRep();
      setLoading(false);
      if (!repData) return;
      await Promise.all([
        calculateScores(),
        loadAtLargeReps(repData),
      ]);
    }
    load();
  }, [loadRep, calculateScores, loadAtLargeReps]);

  const initials = rep
    ? `${rep.first_name.charAt(0)}${rep.last_name.charAt(0)}`.toUpperCase()
    : '';

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100dvh', background: '#F4F6F0', overflow: 'hidden' }}>
        <div style={{ width: '100%', maxWidth: 600, display: 'flex', flexDirection: 'column', height: '100%' }}>
          <AppHeader onNavigateToHowItWorks={onNavigateToHowItWorks} onNavigateToAbout={onNavigateToAbout} />
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

  if (error || !rep) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100dvh', background: '#F4F6F0', overflow: 'hidden' }}>
        <div style={{ width: '100%', maxWidth: 600, display: 'flex', flexDirection: 'column', height: '100%' }}>
          <AppHeader onNavigateToHowItWorks={onNavigateToHowItWorks} onNavigateToAbout={onNavigateToAbout} />
          <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
            <p style={{ fontSize: 13, color: '#0f1724', fontWeight: 700, marginBottom: 4 }}>Something went wrong</p>
            <p style={{ fontSize: 13, color: '#64748b' }}>{error ?? "We couldn't load this representative's profile."}</p>
          </div>
          {navProps && <BottomNav {...navProps} />}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100dvh', background: '#F4F6F0', overflow: 'hidden' }}>
      <div style={{ width: '100%', maxWidth: 600, display: 'flex', flexDirection: 'column', height: '100%' }}>
        <AppHeader onNavigateToHowItWorks={onNavigateToHowItWorks} onNavigateToAbout={onNavigateToAbout} />

        <main
          className="scrollbar-hide"
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: 10,
            paddingBottom: navProps ? 10 : 24,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >

          {/* ── SECTION 1: HEADER CARD ── */}
          <div style={{ background: '#1B4332', borderRadius: 12, padding: '16px 14px 14px' }}>
            {/* Avatar */}
            <div style={{
              width: 44, height: 44, borderRadius: '50%',
              background: '#F5A623', color: '#7A4F00',
              fontSize: 16, fontWeight: 900,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: 10,
            }}>
              {initials}
            </div>

            {/* Name */}
            <p style={{ fontSize: 16, fontWeight: 900, color: 'white', lineHeight: 1.2, marginBottom: 4, display: 'block' }}>
              {rep.first_name} {rep.last_name}
            </p>

            {/* Title */}
            {rep.title && (
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 8, display: 'block' }}>
                {rep.title}
              </p>
            )}

            {/* Party badge */}
            {rep.party && (
              <div>
                <span style={{
                  display: 'inline-block',
                  background: 'rgba(245,166,35,0.2)', color: '#F5A623',
                  fontSize: 12, fontWeight: 700,
                  padding: '3px 9px', borderRadius: 10,
                }}>
                  {rep.party}
                </span>
              </div>
            )}
          </div>

          {/* ── BIO CARD ── */}
          {rep.bio && (
            <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E2E8E4', padding: '12px 14px' }}>
              <span style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: '#94a3b8', marginBottom: 6 }}>
                About
              </span>
              <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, margin: 0 }}>
                {rep.bio}
              </p>
            </div>
          )}

          {/* ── SECTION 2: ALIGNMENT SCORES ── */}
          <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E2E8E4', overflow: 'visible' }}>
            {/* District alignment (primary for geographic, secondary for at-large) */}
            {!isAtLarge && (
              <div style={{ padding: '14px 14px 12px', borderBottom: '1px solid #E2E8E4' }}>
                <span style={{
                  display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '0.8px', color: '#94a3b8', marginBottom: 8,
                }}>
                  Constituent Score
                </span>
                {scoresLoading ? (
                  <ScoreLoading />
                ) : districtScore ? (
                  <ScoreDisplay score={districtScore} size="large" explainer="How often this representative's recorded votes matched the majority position of their district's constituents on UVote. Only bills with individual vote records are included." suspensionCount={suspensionCount} />
                ) : (
                  <p style={{ background: '#F4F6F0', border: '1px solid #E2E8E4', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#64748b', lineHeight: 1.5, margin: 0 }}>
                    District Alignment Score will appear once more constituents have voted on bills in this district.
                  </p>
                )}
              </div>
            )}

            {/* City alignment */}
            <div style={{ padding: isAtLarge ? '14px 14px 12px' : '12px 14px', borderBottom: user ? '1px solid #E2E8E4' : 'none' }}>
              <span style={{
                display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.8px', color: '#94a3b8', marginBottom: 8,
              }}>
                {isAtLarge ? 'At-Large Seat Alignment' : 'City Constituent Score'}
              </span>
              {scoresLoading ? (
                <ScoreLoading />
              ) : cityScore ? (
                <ScoreDisplay score={cityScore} size={isAtLarge ? 'large' : 'small'} explainer="How often this representative's votes matched the majority position of all UVote users across Philadelphia." />
              ) : (
                <p style={{ background: '#F4F6F0', border: '1px solid #E2E8E4', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#64748b', lineHeight: 1.5, margin: 0 }}>
                  City Alignment Score will appear once more Philadelphia constituents have voted.
                </p>
              )}
            </div>

            {/* Personal alignment (only shown when logged in) */}
            {user && (
              <div style={{ padding: '14px 14px 14px' }}>
                <span style={{
                  display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '0.8px', color: '#94a3b8', marginBottom: 8,
                }}>
                  Representation Score
                </span>
                {scoresLoading ? (
                  <ScoreLoading />
                ) : myAlignmentScore ? (
                  <div>
                    {/* Score row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <span style={{ fontSize: 28, fontWeight: 900, color: '#0f1724', letterSpacing: '-0.5px', lineHeight: 1 }}>
                        {myAlignmentScore.score}%
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{
                          width: 10, height: 10, borderRadius: '50%',
                          background: alignmentLabel(myAlignmentScore.score).dot,
                          display: 'inline-block', flexShrink: 0,
                        }} />
                        <span style={{ fontSize: 13, fontWeight: 700, color: alignmentLabel(myAlignmentScore.score).labelColor }}>
                          {alignmentLabel(myAlignmentScore.score).label}
                        </span>
                      </div>
                    </div>

                    {/* Stat grid */}
                    <div style={{
                      display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: 6, marginBottom: 10,
                    }}>
                      <div style={{
                        background: '#F4F6F0', border: '1px solid #E2E8E4',
                        borderRadius: 8, padding: '8px 10px', textAlign: 'center',
                      }}>
                        <span style={{ display: 'block', fontSize: 16, fontWeight: 900, color: '#0f1724', lineHeight: 1 }}>
                          {myAlignmentScore.total}
                        </span>
                        <span style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#94a3b8', marginTop: 3, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          Bills Compared
                        </span>
                      </div>
                      <div style={{
                        background: '#E6F5EE', border: '1px solid #b7e4cc',
                        borderRadius: 8, padding: '8px 10px', textAlign: 'center',
                      }}>
                        <span style={{ display: 'block', fontSize: 16, fontWeight: 900, color: '#0e6b4a', lineHeight: 1 }}>
                          {myAlignmentScore.matched}
                        </span>
                        <span style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#0e6b4a', marginTop: 3, textTransform: 'uppercase', letterSpacing: '0.5px', opacity: 0.7 }}>
                          Aligned
                        </span>
                      </div>
                      <div style={{
                        background: '#FEF0EF', border: '1px solid #fbc8c4',
                        borderRadius: 8, padding: '8px 10px', textAlign: 'center',
                      }}>
                        <span style={{ display: 'block', fontSize: 16, fontWeight: 900, color: '#c0392b', lineHeight: 1 }}>
                          {myAlignmentScore.mismatched}
                        </span>
                        <span style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#c0392b', marginTop: 3, textTransform: 'uppercase', letterSpacing: '0.5px', opacity: 0.7 }}>
                          Not Aligned
                        </span>
                      </div>
                    </div>

                    <p style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.5, margin: 0 }}>
                      How often your votes matched your rep's official votes.
                    </p>
                  </div>
                ) : (
                  <p style={{ background: '#F4F6F0', border: '1px solid #E2E8E4', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#64748b', lineHeight: 1.5, margin: 0 }}>
                    Vote on more bills to see your personal alignment with this representative.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* ── SECTION 3A: SPONSORED BILLS ── */}
          {(() => {
            // Base groups (unfiltered)
            const passedFromHistory = billHistory.filter(b => sponsoredBillIds.has(b.bill_id) && b.status === 'passed');
            const passedIds = new Set(passedFromHistory.map(b => b.bill_id));
            const passedOnlyExtra = passedSponsoredBills.filter(b => !passedIds.has(b.bill_id));
            let allPassedSponsored: (BillWithRepVote | Bill)[] = [...passedFromHistory, ...passedOnlyExtra];
            let activeSponsored = billHistory.filter(b => sponsoredBillIds.has(b.bill_id) && b.status !== 'passed');

            const otherBills = billHistory.filter(b => !sponsoredBillIds.has(b.bill_id));

            // Apply type filter to both groups
            if (sponsoredTypeFilter !== 'all') {
              allPassedSponsored = allPassedSponsored.filter(b => sponsoredBillIds.get(b.bill_id) === sponsoredTypeFilter);
              activeSponsored = activeSponsored.filter(b => sponsoredBillIds.get(b.bill_id) === sponsoredTypeFilter);
            }

            // Apply status filter
            if (sponsoredStatusFilter === 'passed') {
              activeSponsored = [];
            } else if (sponsoredStatusFilter === 'active') {
              allPassedSponsored = [];
            }

            // Apply sort
            if (sponsoredSortBy === 'passed-first') {
              allPassedSponsored = [...allPassedSponsored].sort((a, b) => {
                const aDate = (a as Bill).introduced_date ?? '';
                const bDate = (b as Bill).introduced_date ?? '';
                return bDate.localeCompare(aDate);
              });
              activeSponsored = [...activeSponsored].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
            } else if (sponsoredSortBy === 'newest') {
              const combined = [...allPassedSponsored, ...activeSponsored].sort((a, b) => {
                const aDate = (a as Bill).introduced_date ?? '';
                const bDate = (b as Bill).introduced_date ?? '';
                return bDate.localeCompare(aDate);
              });
              allPassedSponsored = combined.filter(b => (b as Bill).status === 'passed');
              activeSponsored = combined.filter(b => (b as Bill).status !== 'passed') as BillWithRepVote[];
            } else if (sponsoredSortBy === 'oldest') {
              const combined = [...allPassedSponsored, ...activeSponsored].sort((a, b) => {
                const aDate = (a as Bill).introduced_date ?? '';
                const bDate = (b as Bill).introduced_date ?? '';
                return aDate.localeCompare(bDate);
              });
              allPassedSponsored = combined.filter(b => (b as Bill).status === 'passed');
              activeSponsored = combined.filter(b => (b as Bill).status !== 'passed') as BillWithRepVote[];
            }

            const hasSponsoredSection = allPassedSponsored.length > 0 || activeSponsored.length > 0
              || billHistory.some(b => sponsoredBillIds.has(b.bill_id))
              || passedSponsoredBills.length > 0;

            const totalSponsoredCount = allPassedSponsored.length + activeSponsored.length;

            return (
              <>
                {hasSponsoredSection && (
                  <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E2E8E4', overflow: 'visible' }}>
                    <div style={{ padding: '12px 14px 6px', borderBottom: '1px solid #F4F6F0', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: '#94a3b8' }}>
                        Sponsored Bills
                      </span>
                      {allPassedSponsored.length > 0 && (
                        <span style={{
                          background: '#FFF3D6', color: '#7A4F00',
                          fontSize: 11, fontWeight: 700,
                          padding: '2px 7px', borderRadius: 10,
                          marginLeft: 6,
                        }}>
                          {allPassedSponsored.length} passed
                        </span>
                      )}
                    </div>
                    <div style={{ padding: '8px 10px 6px' }}>
                      <BillListFilterBar
                        sortBy={sponsoredSortBy}
                        onSortChange={(v) => setSponsoredSortBy(v as typeof sponsoredSortBy)}
                        sortOptions={[
                          { label: 'Passed first', value: 'passed-first' },
                          { label: 'Newest', value: 'newest' },
                          { label: 'Oldest', value: 'oldest' },
                        ]}
                        filters={[
                          {
                            label: 'Sponsor Role',
                            value: sponsoredTypeFilter,
                            options: [
                              { label: 'All', value: 'all' },
                              { label: 'Lead Sponsor', value: 'primary' },
                              { label: 'Co-Sponsor', value: 'cosponsor' },
                            ],
                            onChange: (v) => setSponsoredTypeFilter(v as typeof sponsoredTypeFilter),
                          },
                          {
                            label: 'Status',
                            value: sponsoredStatusFilter,
                            options: [
                              { label: 'All', value: 'all' },
                              { label: 'Active', value: 'active' },
                              { label: 'Passed', value: 'passed' },
                            ],
                            onChange: (v) => setSponsoredStatusFilter(v as typeof sponsoredStatusFilter),
                          },
                        ]}
                        resultCount={totalSponsoredCount}
                      />
                    </div>
                    {allPassedSponsored.map((b, i) => (
                      <PassedSponsoredBillRow
                        key={b.bill_id}
                        bill={b as BillWithRepVote}
                        isLast={i === allPassedSponsored.length - 1 && activeSponsored.length === 0}
                        onNavigateToBill={onNavigateToBill}
                        sponsorType={sponsoredBillIds.get(b.bill_id) ?? 'cosponsor'}
                      />
                    ))}
                    {activeSponsored.map((b, i) => (
                      <BillHistoryRow
                        key={b.bill_id}
                        bill={b}
                        isLast={i === activeSponsored.length - 1}
                        onNavigateToBill={onNavigateToBill}
                      />
                    ))}
                    {totalSponsoredCount === 0 && (
                      <div style={{ padding: '16px 14px', textAlign: 'center' }}>
                        <i className="fa-solid fa-filter-circle-xmark" style={{ fontSize: 20, color: '#94a3b8', display: 'block', marginBottom: 6 }} />
                        <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>No bills match these filters.</p>
                      </div>
                    )}
                  </div>
                )}

                {/* ── SECTION 3B: BILL HISTORY ── */}
                <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E2E8E4', overflow: 'visible' }}>
                  <div style={{ padding: '12px 14px 6px', borderBottom: '1px solid #F4F6F0', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: '#94a3b8' }}>
                      Bill History
                    </span>
                    {(() => {
                      const suspensionInHistory = billHistory.filter(b => b.passed_by_suspension).length;
                      return suspensionInHistory > 0 ? (
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', marginLeft: 8 }}>
                          {suspensionInHistory} by suspension
                        </span>
                      ) : null;
                    })()}
                  </div>
                  {scoresLoading ? (
                    <div style={{ padding: 20, display: 'flex', justifyContent: 'center' }}>
                      <div className="flex gap-1.5">
                        {[0, 150, 300].map((delay) => (
                          <span key={delay} className="w-1.5 h-1.5 rounded-full animate-bounce"
                            style={{ background: '#94a3b8', animationDelay: `${delay}ms` }} />
                        ))}
                      </div>
                    </div>
                  ) : otherBills.length === 0 ? (
                    <div style={{ padding: 16, textAlign: 'center' }}>
                      <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>
                        No votes recorded yet.
                      </p>
                    </div>
                  ) : (
                    <>
                      {otherBills.slice(0, 3).map((b) => (
                        <div key={b.bill_id} style={{
                          padding: '10px 14px',
                          borderBottom: '1px solid #F4F6F0',
                          display: 'flex',
                          alignItems: 'flex-start',
                          justifyContent: 'space-between',
                          gap: 10,
                        }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            {b.bill_number && (
                              <span style={{
                                display: 'block',
                                fontSize: 11,
                                fontWeight: 700,
                                color: '#94a3b8',
                                marginBottom: 3,
                              }}>
                                Bill {b.bill_number}
                              </span>
                            )}
                            <button
                              onClick={() => onNavigateToBill(b.bill_id)}
                              style={{
                                background: 'none',
                                border: 'none',
                                padding: 0,
                                textAlign: 'left',
                                fontSize: 13,
                                fontWeight: 600,
                                color: '#0f1724',
                                lineHeight: 1.35,
                                cursor: 'pointer',
                                minHeight: 'unset',
                                whiteSpace: 'normal',
                                wordWrap: 'break-word',
                                display: 'block',
                                width: '100%',
                              }}
                            >
                              {b.title}
                            </button>
                          </div>
                          {b.rep_vote?.vote &&
                          (b.rep_vote.vote === 'support' || b.rep_vote.vote === 'oppose') && (
                            <span style={{
                              fontSize: 12,
                              fontWeight: 700,
                              padding: '3px 8px',
                              borderRadius: 6,
                              flexShrink: 0,
                              background: b.rep_vote.vote === 'support' ? '#E6F5EE' : '#FEF0EF',
                              color: b.rep_vote.vote === 'support' ? '#0e6b4a' : '#c0392b',
                              whiteSpace: 'nowrap',
                            }}>
                              {b.rep_vote.vote === 'support' ? 'Supported' : 'Opposed'}
                            </span>
                          )}
                        </div>
                      ))}
                      <div style={{
                        padding: '10px 14px',
                        borderTop: '1px solid #F4F6F0',
                      }}>
                        <button
                          onClick={() => onNavigateToRepHistory(billHistory, `${rep.first_name} ${rep.last_name}`)}
                          style={{
                            width: '100%',
                            background: 'none',
                            border: 'none',
                            padding: '6px 0',
                            fontSize: 13,
                            fontWeight: 700,
                            color: '#1B4332',
                            cursor: 'pointer',
                            textAlign: 'center',
                          }}
                        >
                          View full voting record →
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </>
            );
          })()}

          {/* ── SECTION 4: AT-LARGE REPS (geographic reps only) ── */}
          {!isAtLarge && atLargeReps.length > 0 && (
            <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E2E8E4', overflow: 'visible' }}>
              <div style={{ padding: '12px 14px 6px' }}>
                <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: '#94a3b8' }}>
                  Your At-Large Representatives
                </span>
              </div>
              {atLargeReps.map((alRep, i) => (
                <div
                  key={alRep.representative_id}
                  style={{
                    padding: '12px 14px',
                    borderBottom: i < atLargeReps.length - 1 ? '1px solid #F4F6F0' : 'none',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#0f1724', lineHeight: 1.3 }}>
                      {alRep.first_name} {alRep.last_name}
                    </span>
                    {alRep.title && (
                      <span style={{ fontSize: 13, fontWeight: 400, color: '#64748b', lineHeight: 1.4, marginTop: 2 }}>
                        {alRep.title}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => onNavigateToRep(alRep.representative_id)}
                    style={{
                      background: 'none', border: 'none', padding: 0,
                      fontSize: 13, fontWeight: 700, color: '#1B4332',
                      minHeight: 'unset', flexShrink: 0, cursor: 'pointer',
                    }}
                  >
                    View Profile
                  </button>
                </div>
              ))}
            </div>
          )}
        </main>
        {navProps && <BottomNav {...navProps} />}
      </div>
    </div>
  );
}

function ScoreLoading() {
  return (
    <div className="flex gap-1">
      {[0, 100, 200].map((d) => (
        <span key={d} className="w-1 h-1 rounded-full animate-bounce"
          style={{ background: '#94a3b8', animationDelay: `${d}ms` }} />
      ))}
    </div>
  );
}

function alignmentLabel(score: number): { dot: string; label: string; labelColor: string } {
  if (score >= 75) return { dot: '#1DB97A', label: 'High', labelColor: '#0e6b4a' };
  if (score >= 40) return { dot: '#F5A623', label: 'Moderate', labelColor: '#7A4F00' };
  return { dot: '#F0455A', label: 'Low', labelColor: '#c0392b' };
}

function ScoreDisplay({
  score,
  size,
  explainer,
  suspensionCount,
}: {
  score: { score: number; qualifying: number };
  size: 'large' | 'small';
  explainer: string;
  suspensionCount?: number;
}) {
  const { dot, label, labelColor } = alignmentLabel(score.score);
  const numSize = size === 'large' ? 28 : 22;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
        <span style={{ fontSize: numSize, fontWeight: 900, color: '#0f1724', letterSpacing: '-0.5px', lineHeight: 1 }}>
          {score.score}%
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: dot, display: 'inline-block', flexShrink: 0 }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: labelColor }}>{label}</span>
        </div>
      </div>
      <p style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginTop: 4, marginBottom: 6 }}>
        Based on {score.qualifying} qualifying bill{score.qualifying !== 1 ? 's' : ''}
      </p>
      {suspensionCount !== undefined && suspensionCount > 0 && (
        <p style={{
          display: 'block',
          fontSize: 12,
          color: '#94a3b8',
          lineHeight: 1.5,
          marginTop: 4,
          marginBottom: 0,
        }}>
          {suspensionCount} bill{suspensionCount !== 1 ? 's' : ''} in this record passed by suspension of rules — individual votes were not recorded for those bills.
        </p>
      )}
      <p style={{ display: 'block', fontSize: 12, color: '#94a3b8', lineHeight: 1.5, marginTop: suspensionCount !== undefined && suspensionCount > 0 ? 4 : 0, marginBottom: 0 }}>
        {explainer}
      </p>
    </div>
  );
}
