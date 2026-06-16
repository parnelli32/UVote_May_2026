import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { BottomNav } from '../components/BottomNav';
import { AppHeader } from '../components/AppHeader';
import { BillHistoryRow } from '../components/RepBillRows';
import { logError } from '../lib/errorLogger';
import type { NavTab } from '../components/BottomNav';

type RepBillHistoryPageProps = {
  repId: string;
  onBack: () => void;
  onNavigateToBill: (billId: string) => void;
  onNavigateToHowItWorks: () => void;
  onNavigateToAbout: () => void;
  navProps?: {
    activeTab: NavTab;
    onTabChange: (tab: NavTab) => void;
    onNavigateToProfile: () => void;
    onNavigateToAdmin: () => void;
  };
};

type EnrichedBill = {
  bill_id: string;
  title: string;
  bill_number: string | null;
  status: string;
  created_at: string;
  passed_by_suspension?: boolean;
  rep_vote: {
    vote: string;
    explanation: string | null;
    created_at: string;
  };
  district_support: number;
  district_oppose: number;
  qualifies_for_score: boolean;
  district_majority: 'support' | 'oppose' | null;
  rep_matches_district: boolean | null;
};

export function RepBillHistoryPage({
  repId,
  onNavigateToBill,
  onNavigateToHowItWorks,
  onNavigateToAbout,
  navProps,
}: RepBillHistoryPageProps) {
  const { profile, districtUserIds: cachedDistrictUserIds } = useAuth();

  const [rep, setRep] = useState<{ first_name: string; last_name: string; title: string | null; district_id: string | null; legislative_body_id: string | null } | null>(null);
  const [bills, setBills] = useState<EnrichedBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [billNumberSearch, setBillNumberSearch] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'match-first' | 'mismatch-first'>('newest');
  const [voteFilter, setVoteFilter] = useState<'all' | 'supported' | 'opposed'>('all');
  const [alignFilter, setAlignFilter] = useState<'all' | 'match' | 'mismatch' | 'no-data'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'passed' | 'failed'>('all');

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        // Step 1 — Fetch rep info
        const { data: repData, error: repErr } = await supabase
          .from('representatives')
          .select('first_name, last_name, title, district_id, legislative_body_id')
          .eq('representative_id', repId)
          .maybeSingle();
        if (repErr) throw repErr;
        if (!repData) throw new Error('Representative not found');
        setRep(repData);

        // Step 2 — Fetch all rep votes
        const { data: repVotes, error: rvErr } = await supabase
          .from('rep_votes')
          .select('bill_id, vote, explanation, created_at')
          .eq('representative_id', repId);
        if (rvErr) throw rvErr;

        const billIds = (repVotes ?? []).map((rv) => rv.bill_id).filter(Boolean) as string[];
        if (billIds.length === 0) {
          setBills([]);
          return;
        }

        // Step 3 — Fetch bills
        const { data: billsData, error: billsErr } = await supabase
          .from('bills')
          .select('bill_id, title, bill_number, status, created_at, passed_by_suspension')
          .in('bill_id', billIds);
        if (billsErr) throw billsErr;

        // Step 4 — Determine district user IDs
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
              logError({ action: 'load_district_users_history', userId: null, errorMessage: duErr.message, errorCode: duErr.code ?? null });
            }
            districtUserIds = new Set((districtUsers ?? []).map((u: { user_id: string }) => u.user_id));
          }
        } else if (repData.legislative_body_id) {
          const { data: bodyDistricts, error: bdErr } = await supabase
            .from('districts')
            .select('district_id')
            .eq('legislative_body_id', repData.legislative_body_id);
          if (bdErr) {
            logError({ action: 'load_body_districts_history', userId: null, errorMessage: bdErr.message, errorCode: bdErr.code ?? null });
          }
          const bodyDistrictIds = (bodyDistricts ?? []).map((d) => d.district_id);
          if (bodyDistrictIds.length > 0) {
            const { data: bodyUsers, error: buErr } = await supabase
              .from('users')
              .select('user_id')
              .in('district_id', bodyDistrictIds);
            if (buErr) {
              logError({ action: 'load_body_users_history', userId: null, errorMessage: buErr.message, errorCode: buErr.code ?? null });
            }
            districtUserIds = new Set((bodyUsers ?? []).map((u) => u.user_id));
          }
        }

        // Step 5 — Fetch district votes
        const { data: userVotesData, error: uvErr } = await supabase
          .from('user_votes')
          .select('bill_id, vote, user_id')
          .in('bill_id', billIds);
        if (uvErr) throw uvErr;

        // Step 6 — Build enriched list
        const repVoteMap = new Map(
          (repVotes ?? []).map((rv) => [rv.bill_id!, rv])
        );

        const enriched: EnrichedBill[] = [];
        for (const bill of (billsData ?? [])) {
          if (bill.passed_by_suspension) continue;
          const rv = repVoteMap.get(bill.bill_id);
          if (!rv) continue;

          const allVotes = (userVotesData ?? []).filter((uv) => uv.bill_id === bill.bill_id);
          const districtVotes = districtUserIds.size > 0
            ? allVotes.filter((uv) => districtUserIds.has(uv.user_id!))
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
            bill_id: bill.bill_id,
            title: bill.title,
            bill_number: bill.bill_number ?? null,
            status: bill.status,
            created_at: bill.created_at,
            passed_by_suspension: bill.passed_by_suspension,
            rep_vote: {
              vote: rv.vote,
              explanation: rv.explanation,
              created_at: rv.created_at,
            },
            district_support: districtSupport,
            district_oppose: districtOppose,
            qualifies_for_score: qualifiesForScore,
            district_majority: districtMajority,
            rep_matches_district: repMatchesDistrict,
          });
        }

        enriched.sort((a, b) => new Date(b.rep_vote.created_at).getTime() - new Date(a.rep_vote.created_at).getTime());
        setBills(enriched);
      } catch (err) {
        const msg = (err as { message?: string })?.message ?? String(err);
        const code = (err as { code?: string }).code ?? null;
        logError({ action: 'load_rep_bill_history_page', userId: null, errorMessage: msg, errorCode: code });
        setError("We couldn't load this representative's bill history.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [repId, profile?.district_id, cachedDistrictUserIds]);

  // Filtering logic
  let filtered = bills;

  if (billNumberSearch.trim()) {
    const q = billNumberSearch.toLowerCase();
    filtered = filtered.filter((b) => b.bill_number?.toLowerCase().includes(q));
  }

  if (voteFilter === 'supported') filtered = filtered.filter((b) => b.rep_vote.vote === 'support');
  else if (voteFilter === 'opposed') filtered = filtered.filter((b) => b.rep_vote.vote === 'oppose');

  if (alignFilter === 'match') filtered = filtered.filter((b) => b.rep_matches_district === true);
  else if (alignFilter === 'mismatch') filtered = filtered.filter((b) => b.rep_matches_district === false);
  else if (alignFilter === 'no-data') filtered = filtered.filter((b) => b.qualifies_for_score === false);

  if (statusFilter === 'active') filtered = filtered.filter((b) => b.status === 'active');
  else if (statusFilter === 'passed') filtered = filtered.filter((b) => b.status === 'passed');
  else if (statusFilter === 'failed') filtered = filtered.filter((b) => b.status === 'failed');

  if (sortBy === 'newest') filtered = [...filtered].sort((a, b) => new Date(b.rep_vote.created_at).getTime() - new Date(a.rep_vote.created_at).getTime());
  else if (sortBy === 'oldest') filtered = [...filtered].sort((a, b) => new Date(a.rep_vote.created_at).getTime() - new Date(b.rep_vote.created_at).getTime());
  else if (sortBy === 'match-first') filtered = [...filtered].sort((a, b) => (b.rep_matches_district === true ? 1 : 0) - (a.rep_matches_district === true ? 1 : 0));
  else if (sortBy === 'mismatch-first') filtered = [...filtered].sort((a, b) => (b.rep_matches_district === false ? 1 : 0) - (a.rep_matches_district === false ? 1 : 0));

  const resultCount = filtered.length;

  const hasActiveFilters =
    billNumberSearch.trim() !== '' ||
    sortBy !== 'newest' ||
    voteFilter !== 'all' ||
    alignFilter !== 'all' ||
    statusFilter !== 'all';

  return (
    <div style={{
      height: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      background: '#F4F6F0',
      maxWidth: 480,
      margin: '0 auto',
    }}>
      <AppHeader onNavigateToHowItWorks={onNavigateToHowItWorks} onNavigateToAbout={onNavigateToAbout} />

      {/* Summary band */}
      <div style={{
        background: 'white',
        borderBottom: '1px solid #E2E8E4',
        padding: '10px 14px',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
      }}>
        {rep ? (
          <>
            <p style={{ fontSize: 14, fontWeight: 700, color: '#0f1724', margin: 0, lineHeight: 1.3 }}>
              {rep.first_name} {rep.last_name}
            </p>
            <p style={{ fontSize: 11, color: '#94a3b8', margin: 0, marginTop: 2 }}>
              {bills.length} vote{bills.length !== 1 ? 's' : ''} on record
            </p>
          </>
        ) : (
          <div style={{ height: 34 }} />
        )}
      </div>

      {/* Filter area */}
      <div style={{
        background: 'white',
        borderBottom: '1px solid #E2E8E4',
        padding: '8px 10px',
        flexShrink: 0,
      }}>
        {/* Row 1 — bill number search */}
        <input
          type="text"
          placeholder="Search by bill number..."
          value={billNumberSearch}
          onChange={(e) => setBillNumberSearch(e.target.value)}
          style={{
            width: '100%',
            padding: '7px 12px',
            border: '1px solid #E2E8E4',
            borderRadius: 20,
            fontSize: 12,
            color: '#374151',
            background: '#F4F6F0',
            outline: 'none',
            marginBottom: 6,
            boxSizing: 'border-box',
          }}
        />

        {/* Row 2 — filter pills */}
        <div className="scrollbar-hide" style={{
          display: 'flex',
          gap: 6,
          overflowX: 'auto',
          paddingBottom: 2,
          alignItems: 'center',
        }}>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            style={{
              fontSize: 11,
              padding: '4px 10px',
              border: '1px solid #E2E8E4',
              borderRadius: 20,
              background: 'white',
              color: '#374151',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              appearance: 'none',
              flexShrink: 0,
            }}
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="match-first">Match first</option>
            <option value="mismatch-first">Mismatch first</option>
          </select>

          <select
            value={voteFilter}
            onChange={(e) => setVoteFilter(e.target.value as typeof voteFilter)}
            style={{
              fontSize: 11,
              padding: '4px 10px',
              border: '1px solid #E2E8E4',
              borderRadius: 20,
              background: 'white',
              color: '#374151',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              appearance: 'none',
              flexShrink: 0,
            }}
          >
            <option value="all">All votes</option>
            <option value="supported">Supported</option>
            <option value="opposed">Opposed</option>
          </select>

          <select
            value={alignFilter}
            onChange={(e) => setAlignFilter(e.target.value as typeof alignFilter)}
            style={{
              fontSize: 11,
              padding: '4px 10px',
              border: '1px solid #E2E8E4',
              borderRadius: 20,
              background: 'white',
              color: '#374151',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              appearance: 'none',
              flexShrink: 0,
            }}
          >
            <option value="all">All alignment</option>
            <option value="match">Match ✓</option>
            <option value="mismatch">Mismatch ✗</option>
            <option value="no-data">Not enough votes</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            style={{
              fontSize: 11,
              padding: '4px 10px',
              border: '1px solid #E2E8E4',
              borderRadius: 20,
              background: 'white',
              color: '#374151',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              appearance: 'none',
              flexShrink: 0,
            }}
          >
            <option value="all">All status</option>
            <option value="active">Active</option>
            <option value="passed">Passed</option>
            <option value="failed">Failed</option>
          </select>

          <span style={{
            fontSize: 11,
            color: '#94a3b8',
            whiteSpace: 'nowrap',
            marginLeft: 'auto',
            paddingLeft: 8,
            flexShrink: 0,
          }}>
            {resultCount} bills
          </span>
        </div>
      </div>

      {/* Scrollable list */}
      <div className="scrollbar-hide" style={{ flex: 1, overflowY: 'auto' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
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
        ) : error ? (
          <div style={{ padding: '32px 16px', textAlign: 'center' }}>
            <p style={{ fontSize: 13, color: '#0f1724', fontWeight: 700, marginBottom: 4 }}>Something went wrong</p>
            <p style={{ fontSize: 11, color: '#64748b' }}>{error}</p>
          </div>
        ) : filtered.length === 0 && hasActiveFilters ? (
          <div style={{ padding: '32px 16px', textAlign: 'center' }}>
            <i className="fa-solid fa-filter-circle-xmark" style={{ fontSize: 24, color: '#94a3b8', display: 'block', marginBottom: 8 }} />
            <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>No bills match these filters.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '32px 16px', textAlign: 'center' }}>
            <i className="fa-solid fa-file-lines" style={{ fontSize: 24, color: '#94a3b8', display: 'block', marginBottom: 8 }} />
            <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>No votes recorded yet.</p>
          </div>
        ) : (
          <div style={{ background: 'white', borderRadius: 12, margin: 10, border: '1px solid #E2E8E4', overflow: 'hidden' }}>
            {filtered.map((b, i) => (
              <BillHistoryRow
                key={b.bill_id}
                bill={b as Parameters<typeof BillHistoryRow>[0]['bill']}
                isLast={i === filtered.length - 1}
                onNavigateToBill={onNavigateToBill}
              />
            ))}
          </div>
        )}
      </div>

      {navProps && <BottomNav {...navProps} />}
    </div>
  );
}
