import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { logError } from '../lib/errorLogger';
import { useAuth } from '../context/AuthContext';
import { BottomNav } from '../components/BottomNav';
import { AppHeader } from '../components/AppHeader';
import { BillListFilterBar } from '../components/BillListFilterBar';
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

export function RepProfilePage({ repId, onBack, onNavigateToBill, onNavigateToRep, onNavigateToHowItWorks, onNavigateToAbout, navProps }: RepProfilePageProps) {
  const { user, profile, districtUserIds: cachedDistrictUserIds } = useAuth();

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

  // Bill history filter state
  const [historySortBy, setHistorySortBy] = useState<'newest' | 'oldest' | 'match-first' | 'mismatch-first'>('newest');
  const [historyVoteFilter, setHistoryVoteFilter] = useState<'all' | 'supported' | 'opposed'>('all');
  const [historyMatchFilter, setHistoryMatchFilter] = useState<'all' | 'match' | 'mismatch'>('all');

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

  const calculateScores = useCallback(async (repData: Representative) => {
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

      // Fetch user_votes for all bills voted on by this rep
      const userVotesRes = await supabase
        .from('user_votes')
        .select('bill_id, vote, user_id')
        .in('bill_id', billIds);

      if (userVotesRes.error) throw userVotesRes.error;

      const userVotesData = userVotesRes.data;

      // Fetch user district_ids — for district reps use their district directly;
      // for at-large reps (null district_id) use all districts in the legislative body.
      let districtUserIds = new Set<string>();
      if (repData.district_id) {
        if (
          repData.district_id === profile?.district_id &&
          cachedDistrictUserIds.size > 0
        ) {
          districtUserIds = cachedDistrictUserIds;
        } else {
          const { data: districtUsers, error: duErr } = await supabase
            .from('users')
            .select('user_id')
            .eq('district_id', repData.district_id);
          if (duErr) {
            logError({
              action: 'load_district_users',
              userId: user?.id ?? null,
              errorMessage: duErr.message,
              errorCode: duErr.code ?? null,
            });
          }
          districtUserIds = new Set(
            (districtUsers ?? []).map(
              (u: { user_id: string }) => u.user_id
            )
          );
        }
      } else if (repData.legislative_body_id) {
        // At-large: fetch all districts in this legislative body, then all users in those districts
        const { data: bodyDistricts, error: bdErr } = await supabase
          .from('districts')
          .select('district_id')
          .eq('legislative_body_id', repData.legislative_body_id);
        if (bdErr) {
          logError({
            action: 'load_body_districts',
            userId: user?.id ?? null,
            errorMessage: bdErr.message,
            errorCode: bdErr.code ?? null,
          });
        }
        const bodyDistrictIds = (bodyDistricts ?? []).map((d) => d.district_id);
        if (bodyDistrictIds.length > 0) {
          const { data: bodyUsers, error: buErr } = await supabase
            .from('users')
            .select('user_id')
            .in('district_id', bodyDistrictIds);
          if (buErr) {
            logError({
              action: 'load_body_users',
              userId: user?.id ?? null,
              errorMessage: buErr.message,
              errorCode: buErr.code ?? null,
            });
          }
          districtUserIds = new Set((bodyUsers ?? []).map((u) => u.user_id));
        }
      }

      const repVoteMap = new Map<string, RepVote>(
        (repVotes ?? []).map((rv) => [rv.bill_id!, rv as RepVote])
      );

      // Build bill history with per-bill tallies
      const enriched: BillWithRepVote[] = [];

      for (const bill of (billsData ?? [])) {
        const rv = repVoteMap.get(bill.bill_id);
        if (!rv) continue;
        if (bill.passed_by_suspension) continue;

        const allVotesForBill = (userVotesData ?? []).filter((uv) => uv.bill_id === bill.bill_id);

        // District tallies — districtUserIds is populated for both district and at-large reps
        const districtVotes = districtUserIds.size > 0
          ? allVotesForBill.filter((uv) => districtUserIds.has(uv.user_id!))
          : [];
        const districtSupport = districtVotes.filter((uv) => uv.vote === 'support').length;
        const districtOppose = districtVotes.filter((uv) => uv.vote === 'oppose').length;
        const districtTotal = districtSupport + districtOppose;
        const qualifiesForScore = districtTotal >= 2 && districtSupport !== districtOppose;
        const districtMajority: 'support' | 'oppose' | null = qualifiesForScore
          ? districtSupport > districtOppose ? 'support' : 'oppose'
          : null;
        const repMatchesDistrict = qualifiesForScore
          ? (rv.vote === 'support' || rv.vote === 'oppose') && rv.vote === districtMajority
          : null;

        enriched.push({
          ...bill,
          rep_vote: rv,
          district_support: districtSupport,
          district_oppose: districtOppose,
          qualifies_for_score: qualifiesForScore,
          district_majority: districtMajority,
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

      // District alignment score
      try {
        const qualifyingBills = enriched.filter((b) => b.qualifies_for_score);
        if (qualifyingBills.length >= 2) {
          const matched = qualifyingBills.filter((b) => b.rep_matches_district === true).length;
          setDistrictScore({ score: Math.round((matched / qualifyingBills.length) * 100), qualifying: qualifyingBills.length });
        } else {
          setDistrictScore(null);
        }
      } catch (err) {
        const msg = (err as { message?: string })?.message ?? (err instanceof Error ? err.message : null) ?? String(err);
        logError({ action: 'calculate_district_alignment', userId: user?.id ?? null, errorMessage: msg });
        setDistrictScore(null);
      }

      // City alignment score
      try {
        const cityQualifying: { matches: boolean }[] = [];
        for (const b of enriched) {
          const allVotes = (userVotesData ?? []).filter((uv) => uv.bill_id === b.bill_id);
          const citySupport = allVotes.filter((uv) => uv.vote === 'support').length;
          const cityOppose = allVotes.filter((uv) => uv.vote === 'oppose').length;
          if (citySupport + cityOppose < 10) continue;
          if (citySupport === cityOppose) continue;
          const cityMajority = citySupport > cityOppose ? 'support' : 'oppose';
          const repVote = b.rep_vote.vote;
          if (repVote !== 'support' && repVote !== 'oppose') continue;
          cityQualifying.push({ matches: repVote === cityMajority });
        }
        if (cityQualifying.length >= 2) {
          const matched = cityQualifying.filter((q) => q.matches).length;
          setCityScore({ score: Math.round((matched / cityQualifying.length) * 100), qualifying: cityQualifying.length });
        } else {
          setCityScore(null);
        }
      } catch (err) {
        const msg = (err as { message?: string })?.message ?? (err instanceof Error ? err.message : null) ?? String(err);
        logError({ action: 'calculate_city_alignment', userId: user?.id ?? null, errorMessage: msg });
        setCityScore(null);
      }

      // Personal alignment score (logged-in user vs. this rep)
      try {
        if (user?.id) {
          const myVotes = (userVotesData ?? []).filter((uv) => uv.user_id === user.id);
          const repVoteMap = new Map<string, string>(
            (repVotes ?? []).map((rv) => [rv.bill_id!, rv.vote])
          );
          let matched = 0;
          let mismatched = 0;
          for (const uv of myVotes) {
            if (!uv.bill_id) continue;
            const rv = repVoteMap.get(uv.bill_id);
            if (!rv || (rv !== 'support' && rv !== 'oppose')) continue;
            if (uv.vote !== 'support' && uv.vote !== 'oppose') continue;
            if (uv.vote === rv) matched++;
            else mismatched++;
          }
          const total = matched + mismatched;
          if (total > 0) {
            setMyAlignmentScore({ score: Math.round((matched / total) * 100), total, matched, mismatched });
          } else {
            setMyAlignmentScore(null);
          }
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
        calculateScores(repData),
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
        <div style={{ width: '100%', maxWidth: 480, display: 'flex', flexDirection: 'column', height: '100%' }}>
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
        <div style={{ width: '100%', maxWidth: 480, display: 'flex', flexDirection: 'column', height: '100%' }}>
          <AppHeader onNavigateToHowItWorks={onNavigateToHowItWorks} onNavigateToAbout={onNavigateToAbout} />
          <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
            <p style={{ fontSize: 13, color: '#0f1724', fontWeight: 700, marginBottom: 4 }}>Something went wrong</p>
            <p style={{ fontSize: 11, color: '#64748b' }}>{error ?? "We couldn't load this representative's profile."}</p>
          </div>
          {navProps && <BottomNav {...navProps} />}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100dvh', background: '#F4F6F0', overflow: 'hidden' }}>
      <div style={{ width: '100%', maxWidth: 480, display: 'flex', flexDirection: 'column', height: '100%' }}>
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
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginBottom: 8, display: 'block' }}>
                {rep.title}
              </p>
            )}

            {/* Party badge */}
            {rep.party && (
              <div>
                <span style={{
                  display: 'inline-block',
                  background: 'rgba(245,166,35,0.2)', color: '#F5A623',
                  fontSize: 10, fontWeight: 700,
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
              <span style={{ display: 'block', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: '#94a3b8', marginBottom: 6 }}>
                About
              </span>
              <p style={{ fontSize: 12, color: '#374151', lineHeight: 1.6, margin: 0 }}>
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
                  display: 'block', fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '0.8px', color: '#94a3b8', marginBottom: 8,
                }}>
                  District Alignment Score
                </span>
                {scoresLoading ? (
                  <ScoreLoading />
                ) : districtScore ? (
                  <ScoreDisplay score={districtScore} size="large" explainer="How often this representative's recorded votes matched the majority position of their district's constituents on UVote. Only bills with individual vote records are included." suspensionCount={suspensionCount} />
                ) : (
                  <p style={{ background: '#F4F6F0', border: '1px solid #E2E8E4', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#64748b', lineHeight: 1.5, margin: 0 }}>
                    District Alignment Score will appear once more constituents have voted on bills in this district.
                  </p>
                )}
              </div>
            )}

            {/* City alignment */}
            <div style={{ padding: isAtLarge ? '14px 14px 12px' : '12px 14px', borderBottom: user ? '1px solid #E2E8E4' : 'none' }}>
              <span style={{
                display: 'block', fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.8px', color: '#94a3b8', marginBottom: 8,
              }}>
                {isAtLarge ? 'At-Large Seat Alignment' : 'City Alignment Score'}
              </span>
              {scoresLoading ? (
                <ScoreLoading />
              ) : cityScore ? (
                <ScoreDisplay score={cityScore} size={isAtLarge ? 'large' : 'small'} explainer="How often this representative's votes matched the majority position of all UVote users across Philadelphia." />
              ) : (
                <p style={{ background: '#F4F6F0', border: '1px solid #E2E8E4', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#64748b', lineHeight: 1.5, margin: 0 }}>
                  City Alignment Score will appear once more Philadelphia constituents have voted.
                </p>
              )}
            </div>

            {/* Personal alignment (only shown when logged in) */}
            {user && (
              <div style={{ padding: '14px 14px 14px' }}>
                <span style={{
                  display: 'block', fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '0.8px', color: '#94a3b8', marginBottom: 8,
                }}>
                  Your Alignment
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
                        <span style={{ fontSize: 12, fontWeight: 700, color: alignmentLabel(myAlignmentScore.score).labelColor }}>
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
                        <span style={{ display: 'block', fontSize: 9, fontWeight: 600, color: '#94a3b8', marginTop: 3, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
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
                        <span style={{ display: 'block', fontSize: 9, fontWeight: 600, color: '#0e6b4a', marginTop: 3, textTransform: 'uppercase', letterSpacing: '0.5px', opacity: 0.7 }}>
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
                        <span style={{ display: 'block', fontSize: 9, fontWeight: 600, color: '#c0392b', marginTop: 3, textTransform: 'uppercase', letterSpacing: '0.5px', opacity: 0.7 }}>
                          Not Aligned
                        </span>
                      </div>
                    </div>

                    <p style={{ fontSize: 10, color: '#94a3b8', lineHeight: 1.5, margin: 0 }}>
                      How often your votes matched this representative's votes on bills you both voted on.
                    </p>
                  </div>
                ) : (
                  <p style={{ background: '#F4F6F0', border: '1px solid #E2E8E4', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#64748b', lineHeight: 1.5, margin: 0 }}>
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

            // Bill history filters
            let filteredOtherBills = otherBills;
            if (historyVoteFilter === 'supported') filteredOtherBills = filteredOtherBills.filter(b => b.rep_vote?.vote === 'support');
            else if (historyVoteFilter === 'opposed') filteredOtherBills = filteredOtherBills.filter(b => b.rep_vote?.vote === 'oppose');
            if (historyMatchFilter === 'match') filteredOtherBills = filteredOtherBills.filter(b => b.rep_matches_district === true);
            else if (historyMatchFilter === 'mismatch') filteredOtherBills = filteredOtherBills.filter(b => b.rep_matches_district === false);
            if (historySortBy === 'newest') filteredOtherBills = [...filteredOtherBills].sort((a, b) => new Date(b.rep_vote.created_at).getTime() - new Date(a.rep_vote.created_at).getTime());
            else if (historySortBy === 'oldest') filteredOtherBills = [...filteredOtherBills].sort((a, b) => new Date(a.rep_vote.created_at).getTime() - new Date(b.rep_vote.created_at).getTime());
            else if (historySortBy === 'match-first') filteredOtherBills = [...filteredOtherBills].sort((a, b) => (b.rep_matches_district === true ? 1 : 0) - (a.rep_matches_district === true ? 1 : 0));
            else if (historySortBy === 'mismatch-first') filteredOtherBills = [...filteredOtherBills].sort((a, b) => (b.rep_matches_district === false ? 1 : 0) - (a.rep_matches_district === false ? 1 : 0));

            const hasBillHistoryFilters = historyVoteFilter !== 'all' || historyMatchFilter !== 'all' || historySortBy !== 'newest';

            return (
              <>
                {hasSponsoredSection && (
                  <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E2E8E4', overflow: 'visible' }}>
                    <div style={{ padding: '12px 14px 6px', borderBottom: '1px solid #F4F6F0', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: '#94a3b8' }}>
                        Sponsored Bills
                      </span>
                      {allPassedSponsored.length > 0 && (
                        <span style={{
                          background: '#FFF3D6', color: '#7A4F00',
                          fontSize: 9, fontWeight: 700,
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
                        <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>No bills match these filters.</p>
                      </div>
                    )}
                  </div>
                )}

                {/* ── SECTION 3B: BILL HISTORY ── */}
                <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E2E8E4', overflow: 'visible' }}>
                  <div style={{ padding: '12px 14px 6px', borderBottom: '1px solid #F4F6F0', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: '#94a3b8' }}>
                      Bill History
                    </span>
                    {(() => {
                      const suspensionInHistory = billHistory.filter(b => b.passed_by_suspension).length;
                      return suspensionInHistory > 0 ? (
                        <span style={{ fontSize: 9, fontWeight: 600, color: '#94a3b8', marginLeft: 8 }}>
                          {suspensionInHistory} by suspension
                        </span>
                      ) : null;
                    })()}
                  </div>
                  {!scoresLoading && otherBills.length > 0 && (
                    <div style={{ padding: '8px 10px 6px' }}>
                      <BillListFilterBar
                        sortBy={historySortBy}
                        onSortChange={(v) => setHistorySortBy(v as typeof historySortBy)}
                        sortOptions={[
                          { label: 'Newest', value: 'newest' },
                          { label: 'Oldest', value: 'oldest' },
                          { label: 'Match first', value: 'match-first' },
                          { label: 'Mismatch first', value: 'mismatch-first' },
                        ]}
                        filters={[
                          {
                            label: 'Rep Vote',
                            value: historyVoteFilter,
                            options: [
                              { label: 'All', value: 'all' },
                              { label: 'Supported', value: 'supported', activeColor: { bg: '#E6F5EE', color: '#0e6b4a', border: '#0e6b4a' } },
                              { label: 'Opposed', value: 'opposed', activeColor: { bg: '#FEF0EF', color: '#c0392b', border: '#c0392b' } },
                            ],
                            onChange: (v) => setHistoryVoteFilter(v as typeof historyVoteFilter),
                          },
                          {
                            label: 'Alignment',
                            value: historyMatchFilter,
                            options: [
                              { label: 'All', value: 'all' },
                              { label: 'Match ✓', value: 'match', activeColor: { bg: '#E6F5EE', color: '#0e6b4a', border: '#0e6b4a' } },
                              { label: 'Mismatch ✗', value: 'mismatch', activeColor: { bg: '#FEF0EF', color: '#c0392b', border: '#c0392b' } },
                            ],
                            onChange: (v) => setHistoryMatchFilter(v as typeof historyMatchFilter),
                          },
                        ]}
                        resultCount={filteredOtherBills.length}
                      />
                    </div>
                  )}
                  {scoresLoading ? (
                    <div style={{ padding: 20, display: 'flex', justifyContent: 'center' }}>
                      <div className="flex gap-1.5">
                        {[0, 150, 300].map((delay) => (
                          <span key={delay} className="w-1.5 h-1.5 rounded-full animate-bounce"
                            style={{ background: '#94a3b8', animationDelay: `${delay}ms` }} />
                        ))}
                      </div>
                    </div>
                  ) : otherBills.length === 0 && hasSponsoredSection ? (
                    <div style={{ padding: 16, textAlign: 'center' }}>
                      <i className="fa-solid fa-check-circle" style={{ fontSize: 20, color: '#94a3b8', display: 'block', marginBottom: 6 }} />
                      <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>All recorded votes are on sponsored bills above.</p>
                    </div>
                  ) : otherBills.length === 0 ? (
                    <div style={{ padding: 20, textAlign: 'center' }}>
                      <i className="fa-solid fa-file-lines" style={{ fontSize: 24, color: '#94a3b8', display: 'block', marginBottom: 6 }} />
                      <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>No votes recorded yet.</p>
                    </div>
                  ) : filteredOtherBills.length === 0 && hasBillHistoryFilters ? (
                    <div style={{ padding: '16px 14px', textAlign: 'center' }}>
                      <i className="fa-solid fa-filter-circle-xmark" style={{ fontSize: 20, color: '#94a3b8', display: 'block', marginBottom: 6 }} />
                      <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>No bills match these filters.</p>
                    </div>
                  ) : (
                    filteredOtherBills.map((b, i) => (
                      <BillHistoryRow
                        key={b.bill_id}
                        bill={b}
                        isLast={i === filteredOtherBills.length - 1}
                        onNavigateToBill={onNavigateToBill}
                      />
                    ))
                  )}
                </div>
              </>
            );
          })()}

          {/* ── SECTION 4: AT-LARGE REPS (geographic reps only) ── */}
          {!isAtLarge && atLargeReps.length > 0 && (
            <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E2E8E4', overflow: 'visible' }}>
              <div style={{ padding: '12px 14px 6px' }}>
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: '#94a3b8' }}>
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
                      <span style={{ fontSize: 11, fontWeight: 400, color: '#64748b', lineHeight: 1.4, marginTop: 2 }}>
                        {alRep.title}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => onNavigateToRep(alRep.representative_id)}
                    style={{
                      background: 'none', border: 'none', padding: 0,
                      fontSize: 11, fontWeight: 700, color: '#1B4332',
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
  if (score >= 75) return { dot: '#1DB97A', label: 'High Alignment', labelColor: '#0e6b4a' };
  if (score >= 40) return { dot: '#F5A623', label: 'Moderate Alignment', labelColor: '#7A4F00' };
  return { dot: '#F0455A', label: 'Low Alignment', labelColor: '#c0392b' };
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
          <span style={{ fontSize: 12, fontWeight: 700, color: labelColor }}>{label}</span>
        </div>
      </div>
      <p style={{ display: 'block', fontSize: 10, color: '#94a3b8', marginTop: 4, marginBottom: 6 }}>
        Based on {score.qualifying} qualifying bill{score.qualifying !== 1 ? 's' : ''}
      </p>
      {suspensionCount !== undefined && suspensionCount > 0 && (
        <p style={{
          display: 'block',
          fontSize: 10,
          color: '#94a3b8',
          lineHeight: 1.5,
          marginTop: 4,
          marginBottom: 0,
        }}>
          {suspensionCount} bill{suspensionCount !== 1 ? 's' : ''} in this record passed by suspension of rules — individual votes were not recorded for those bills.
        </p>
      )}
      <p style={{ display: 'block', fontSize: 10, color: '#94a3b8', lineHeight: 1.5, marginTop: suspensionCount !== undefined && suspensionCount > 0 ? 4 : 0, marginBottom: 0 }}>
        {explainer}
      </p>
    </div>
  );
}

function PassedSponsoredBillRow({
  bill,
  isLast,
  onNavigateToBill,
  sponsorType,
}: {
  bill: BillWithRepVote;
  isLast: boolean;
  onNavigateToBill: (billId: string) => void;
  sponsorType: 'primary' | 'cosponsor';
}) {
  const rv = (bill as BillWithRepVote).rep_vote;
  const hasRepVote = rv && (rv.vote === 'support' || rv.vote === 'oppose');
  const districtTotal = (bill as BillWithRepVote).district_support + (bill as BillWithRepVote).district_oppose;
  const showDistrictMajority = districtTotal >= 2;
  const showExplanation = (bill as BillWithRepVote).rep_matches_district === false && rv?.explanation;

  const isPrimary = sponsorType === 'primary';

  return (
    <div style={{
      padding: '11px 14px',
      borderBottom: isLast ? 'none' : '1px solid #F4F6F0',
      borderLeft: isPrimary ? '3px solid #F5A623' : '3px solid #6BAE8C',
      background: isPrimary ? '#FFFDF7' : '#F4FBF7',
      display: 'flex', alignItems: 'flex-start',
      justifyContent: 'space-between', gap: 10,
    }}>
      {/* Left */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6, flexWrap: 'wrap' }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: isPrimary ? '#FFF3D6' : '#E6F5EE',
            color: isPrimary ? '#7A4F00' : '#0e6b4a',
            fontSize: 9, fontWeight: 700,
            padding: '2px 8px', borderRadius: 10,
          }}>
            <i className="fa-solid fa-scale-balanced" style={{ fontSize: 9 }} />
            Became Law
          </span>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            background: isPrimary ? '#FEF9EC' : '#EBF7F2',
            color: isPrimary ? '#92570A' : '#1B7A52',
            fontSize: 9, fontWeight: 600,
            padding: '2px 7px', borderRadius: 10,
            border: isPrimary ? '1px solid #F5D78E' : '1px solid #A8DBC4',
          }}>
            {isPrimary ? 'Lead Sponsor' : 'Co-Sponsor'}
          </span>
        </div>
        <button
          onClick={() => onNavigateToBill(bill.bill_id)}
          style={{
            background: 'none', border: 'none', padding: 0, textAlign: 'left',
            fontSize: 12, fontWeight: 600, color: '#0f1724', lineHeight: 1.35,
            marginBottom: 5, display: 'block', minHeight: 'unset',
            whiteSpace: 'normal', wordWrap: 'break-word', width: '100%',
          }}
        >
          {bill.title}
        </button>
        <span style={{ display: 'block', fontSize: 11, color: isPrimary ? '#7A4F00' : '#1B7A52', fontWeight: 600, lineHeight: 1.4, marginBottom: showDistrictMajority || showExplanation ? 4 : 0 }}>
          This legislation is now law.
        </span>
        {showDistrictMajority && (bill as BillWithRepVote).district_majority && (
          <span style={{ display: 'block', fontSize: 10, color: '#64748b', marginBottom: showExplanation ? 4 : 0 }}>
            District: Majority {(bill as BillWithRepVote).district_majority === 'support' ? 'Support' : 'Oppose'}
          </span>
        )}
        {showExplanation && (
          <div style={{ marginTop: 4 }}>
            <span style={{ display: 'block', fontSize: 9, color: '#94a3b8', fontWeight: 600, marginBottom: 2 }}>
              Why they voted this way:
            </span>
            <p style={{ fontSize: 10, color: '#64748b', fontStyle: 'italic', lineHeight: 1.4, margin: 0 }}>
              {rv.explanation}
            </p>
          </div>
        )}
      </div>

      {/* Right */}
      <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
        {(bill as BillWithRepVote).passed_by_suspension ? (
          <span style={{
            fontSize: 9, fontWeight: 700,
            padding: '2px 7px', borderRadius: 10,
            background: '#F1F5F9', color: '#475569',
            whiteSpace: 'nowrap',
          }}>
            Passed by suspension
          </span>
        ) : (
          <>
            {hasRepVote && (
              <span style={{
                fontSize: 10, fontWeight: 700,
                padding: '3px 8px', borderRadius: 6,
                background: rv.vote === 'support' ? '#E6F5EE' : '#FEF0EF',
                color: rv.vote === 'support' ? '#0e6b4a' : '#c0392b',
                whiteSpace: 'nowrap',
              }}>
                {rv.vote === 'support' ? 'Supported' : 'Opposed'}
              </span>
            )}
            {(bill as BillWithRepVote).qualifies_for_score && (
              <span style={{
                fontSize: 9, fontWeight: 700,
                padding: '2px 7px', borderRadius: 10,
                background: (bill as BillWithRepVote).rep_matches_district ? '#E6F5EE' : '#FEF0EF',
                color: (bill as BillWithRepVote).rep_matches_district ? '#0e6b4a' : '#c0392b',
                whiteSpace: 'nowrap',
              }}>
                {(bill as BillWithRepVote).rep_matches_district ? 'Match ✓' : 'Mismatch ✗'}
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function BillHistoryRow({
  bill,
  isLast,
  onNavigateToBill,
}: {
  bill: BillWithRepVote;
  isLast: boolean;
  onNavigateToBill: (billId: string) => void;
}) {
  const rv = bill.rep_vote;
  const hasRepVote = rv.vote === 'support' || rv.vote === 'oppose';
  const districtTotal = bill.district_support + bill.district_oppose;
  const showDistrictMajority = districtTotal >= 2;
  const showExplanation =
    bill.rep_matches_district === false && rv.explanation;

  return (
    <div style={{
      padding: '11px 14px',
      borderBottom: isLast ? 'none' : '1px solid #F4F6F0',
      display: 'flex', alignItems: 'flex-start',
      justifyContent: 'space-between', gap: 10,
    }}>
      {/* Left */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <button
          onClick={() => onNavigateToBill(bill.bill_id)}
          style={{
            background: 'none', border: 'none', padding: 0, textAlign: 'left',
            fontSize: 12, fontWeight: 600, color: '#0f1724', lineHeight: 1.35,
            marginBottom: 4, display: 'block', minHeight: 'unset',
            whiteSpace: 'normal', wordWrap: 'break-word', width: '100%',
          }}
        >
          {bill.title}
        </button>

        {showDistrictMajority && bill.district_majority && (
          <span style={{ display: 'block', fontSize: 10, color: '#64748b', marginBottom: showExplanation ? 4 : 0 }}>
            District: Majority {bill.district_majority === 'support' ? 'Support' : 'Oppose'}
          </span>
        )}

        {showExplanation && (
          <div style={{ marginTop: 4 }}>
            <span style={{ display: 'block', fontSize: 9, color: '#94a3b8', fontWeight: 600, marginBottom: 2 }}>
              Why they voted this way:
            </span>
            <p style={{ fontSize: 10, color: '#64748b', fontStyle: 'italic', lineHeight: 1.4, margin: 0 }}>
              {rv.explanation}
            </p>
          </div>
        )}
      </div>

      {/* Right */}
      <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
        {bill.passed_by_suspension ? (
          <span style={{
            fontSize: 9, fontWeight: 700,
            padding: '2px 7px', borderRadius: 10,
            background: '#F1F5F9', color: '#475569',
            whiteSpace: 'nowrap',
          }}>
            Passed by suspension
          </span>
        ) : (
          <>
            {hasRepVote && (
              <span style={{
                fontSize: 10, fontWeight: 700,
                padding: '3px 8px', borderRadius: 6,
                background: rv.vote === 'support' ? '#E6F5EE' : '#FEF0EF',
                color: rv.vote === 'support' ? '#0e6b4a' : '#c0392b',
                whiteSpace: 'nowrap',
              }}>
                {rv.vote === 'support' ? 'Supported' : 'Opposed'}
              </span>
            )}

            {bill.qualifies_for_score ? (
              <span style={{
                fontSize: 9, fontWeight: 700,
                padding: '2px 7px', borderRadius: 10,
                background: bill.rep_matches_district ? '#E6F5EE' : '#FEF0EF',
                color: bill.rep_matches_district ? '#0e6b4a' : '#c0392b',
                whiteSpace: 'nowrap',
              }}>
                {bill.rep_matches_district ? 'Match ✓' : 'Mismatch ✗'}
              </span>
            ) : (
              <span style={{
                fontSize: 9, fontWeight: 700,
                padding: '2px 7px', borderRadius: 10,
                background: '#F1F5F9', color: '#94a3b8',
                whiteSpace: 'nowrap',
              }}>
                Not enough votes
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}
