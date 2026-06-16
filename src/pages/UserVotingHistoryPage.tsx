import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { BottomNav } from '../components/BottomNav';
import { AppHeader } from '../components/AppHeader';
import { logError } from '../lib/errorLogger';
import type { NavTab } from '../components/BottomNav';

type UserVotingHistoryPageProps = {
  onBack: () => void;
  onNavigateToBill: (billId: string) => void;
  onNavigateToHowItWorks: () => void;
  onNavigateToAbout: () => void;
  navProps: {
    activeTab: NavTab;
    onTabChange: (tab: NavTab) => void;
    onNavigateToProfile: () => void;
    onNavigateToAdmin: () => void;
  };
};

type HistoryRow = {
  user_vote_id: string;
  bill_id: string | null;
  vote: string;
  created_at: string;
  title: string;
  bill_number: string | null;
  status: string | null;
  district_majority: 'support' | 'oppose' | null;
  rep_vote: 'support' | 'oppose' | null;
};

function VoteRow({
  row,
  isLast,
  onNavigateToBill,
}: {
  row: HistoryRow;
  isLast: boolean;
  onNavigateToBill: (billId: string) => void;
}) {
  return (
    <div style={{
      padding: '11px 14px',
      borderBottom: isLast ? 'none' : '1px solid #F4F6F0',
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 10,
    }}>
      {/* Left */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {row.bill_number && (
          <span style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', display: 'block', marginBottom: 3 }}>
            Bill {row.bill_number}
          </span>
        )}
        <button
          onClick={() => row.bill_id && onNavigateToBill(row.bill_id)}
          style={{
            background: 'none', border: 'none', padding: 0, textAlign: 'left',
            fontSize: 12, fontWeight: 600, color: '#0f1724', lineHeight: 1.35,
            display: 'block', minHeight: 'unset',
            whiteSpace: 'normal', wordWrap: 'break-word', width: '100%',
          }}
        >
          {row.title}
        </button>
      </div>

      {/* Right */}
      <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
        <span style={{
          fontSize: 10, fontWeight: 700,
          padding: '3px 8px', borderRadius: 6,
          background: row.vote === 'support' ? '#E6F5EE' : '#FEF0EF',
          color: row.vote === 'support' ? '#0e6b4a' : '#c0392b',
          whiteSpace: 'nowrap',
        }}>
          {row.vote === 'support' ? 'Supported' : 'Opposed'}
        </span>

        {row.district_majority !== null && (
          <span style={{
            fontSize: 9, fontWeight: 600,
            padding: '2px 7px', borderRadius: 6,
            background: '#FFF3D6', color: '#7A4F00',
            whiteSpace: 'nowrap',
          }}>
            Majority: {row.district_majority === 'support' ? 'Support' : 'Oppose'}
          </span>
        )}

        {row.rep_vote !== null && (
          <span style={{
            fontSize: 9, fontWeight: 600,
            padding: '2px 7px', borderRadius: 6,
            background: row.rep_vote === row.vote ? '#F1F5F9' : '#FEF0EF',
            color: row.rep_vote === row.vote ? '#475569' : '#c0392b',
            whiteSpace: 'nowrap',
          }}>
            Rep: {row.rep_vote === 'support' ? 'Supported' : 'Opposed'}
          </span>
        )}
      </div>
    </div>
  );
}

export function UserVotingHistoryPage({
  onNavigateToBill,
  onNavigateToHowItWorks,
  onNavigateToAbout,
  navProps,
}: UserVotingHistoryPageProps) {
  const { user, profile, districtUserIds } = useAuth();

  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [billNumberSearch, setBillNumberSearch] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest'>('newest');
  const [voteFilter, setVoteFilter] = useState<'all' | 'support' | 'oppose'>('all');
  const [majorityFilter, setMajorityFilter] = useState<'all' | 'with' | 'against'>('all');
  const [repFilter, setRepFilter] = useState<'all' | 'agreed' | 'disagreed'>('all');

  useEffect(() => {
    if (!user) return;

    async function load() {
      setLoading(true);
      try {
        // Step 1 — Fetch user votes with bill data
        const { data: userVotes, error: uvErr } = await supabase
          .from('user_votes')
          .select('user_vote_id, bill_id, vote, created_at, bills(title, bill_number, status)')
          .eq('user_id', user!.id)
          .order('created_at', { ascending: false });
        if (uvErr) throw uvErr;

        const billIds = (userVotes ?? []).map((r) => r.bill_id).filter(Boolean) as string[];

        if (billIds.length === 0) {
          setRows([]);
          return;
        }

        // Steps 2 & 3 — parallel
        const [districtVotesResult, repResult] = await Promise.all([
          // Step 2 — district votes for majority
          (async () => {
            const majorityMap = new Map<string, { support: number; oppose: number }>();
            if (profile?.district_id && districtUserIds.size > 0) {
              const { data: dvData, error: dvErr } = await supabase
                .from('user_votes')
                .select('bill_id, vote')
                .in('user_id', [...districtUserIds])
                .in('bill_id', billIds);
              if (dvErr) {
                logError({ action: 'load_district_votes_history', userId: user!.id, errorMessage: dvErr.message, errorCode: dvErr.code ?? null });
              }
              for (const dv of (dvData ?? [])) {
                if (!dv.bill_id) continue;
                const entry = majorityMap.get(dv.bill_id) ?? { support: 0, oppose: 0 };
                if (dv.vote === 'support') entry.support++;
                else if (dv.vote === 'oppose') entry.oppose++;
                majorityMap.set(dv.bill_id, entry);
              }
            }
            return majorityMap;
          })(),

          // Step 3 — rep votes
          (async () => {
            const repVoteMap = new Map<string, 'support' | 'oppose'>();
            if (!profile?.district_id) return repVoteMap;
            const { data: repData, error: repErr } = await supabase
              .from('representatives')
              .select('representative_id')
              .eq('district_id', profile.district_id)
              .maybeSingle();
            if (repErr) {
              logError({ action: 'load_rep_for_district_history', userId: user!.id, errorMessage: repErr.message, errorCode: repErr.code ?? null });
              return repVoteMap;
            }
            if (!repData) return repVoteMap;
            const { data: rvData, error: rvErr } = await supabase
              .from('rep_votes')
              .select('bill_id, vote')
              .eq('representative_id', repData.representative_id)
              .in('bill_id', billIds);
            if (rvErr) {
              logError({ action: 'load_rep_votes_history', userId: user!.id, errorMessage: rvErr.message, errorCode: rvErr.code ?? null });
              return repVoteMap;
            }
            for (const rv of (rvData ?? [])) {
              if (rv.bill_id && (rv.vote === 'support' || rv.vote === 'oppose')) {
                repVoteMap.set(rv.bill_id, rv.vote);
              }
            }
            return repVoteMap;
          })(),
        ]);

        const majorityMap = districtVotesResult;
        const repVoteMap = repResult;

        // Step 4 — Build enriched rows
        const enriched: HistoryRow[] = (userVotes ?? []).map((uv) => {
          const billData = (uv.bills as unknown as { title: string; bill_number: string | null; status: string | null } | null);
          const title = billData?.title ?? '';
          const bill_number = billData?.bill_number ?? null;
          const status = billData?.status ?? null;

          let district_majority: 'support' | 'oppose' | null = null;
          if (uv.bill_id) {
            const tally = majorityMap.get(uv.bill_id);
            if (tally) {
              const total = tally.support + tally.oppose;
              if (total >= 2 && tally.support !== tally.oppose) {
                district_majority = tally.support > tally.oppose ? 'support' : 'oppose';
              }
            }
          }

          const rep_vote = uv.bill_id ? (repVoteMap.get(uv.bill_id) ?? null) : null;

          return {
            user_vote_id: uv.user_vote_id,
            bill_id: uv.bill_id,
            vote: uv.vote,
            created_at: uv.created_at,
            title,
            bill_number,
            status,
            district_majority,
            rep_vote,
          };
        });

        setRows(enriched);
      } catch (err) {
        const msg = (err as { message?: string })?.message ?? String(err);
        const code = (err as { code?: string }).code ?? null;
        logError({ action: 'load_user_voting_history', userId: user!.id, errorMessage: msg, errorCode: code });
        setError("We couldn't load your voting history.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [user, profile?.district_id, districtUserIds]);

  // Filtering logic
  let filtered = rows;

  if (billNumberSearch.trim()) {
    const q = billNumberSearch.toLowerCase();
    filtered = filtered.filter((r) => r.bill_number?.toLowerCase().includes(q));
  }

  if (voteFilter !== 'all') filtered = filtered.filter((r) => r.vote === voteFilter);

  if (majorityFilter === 'with') filtered = filtered.filter((r) => r.vote === r.district_majority);
  else if (majorityFilter === 'against') filtered = filtered.filter((r) => r.district_majority !== null && r.vote !== r.district_majority);

  if (repFilter === 'agreed') filtered = filtered.filter((r) => r.rep_vote !== null && r.vote === r.rep_vote);
  else if (repFilter === 'disagreed') filtered = filtered.filter((r) => r.rep_vote !== null && r.vote !== r.rep_vote);

  if (sortBy === 'newest') filtered = [...filtered].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  else filtered = [...filtered].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const resultCount = filtered.length;

  const hasActiveFilters =
    billNumberSearch.trim() !== '' ||
    sortBy !== 'newest' ||
    voteFilter !== 'all' ||
    majorityFilter !== 'all' ||
    repFilter !== 'all';

  const selectStyle: React.CSSProperties = {
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
  };

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
        <p style={{ fontSize: 14, fontWeight: 700, color: '#0f1724', margin: 0, lineHeight: 1.3 }}>
          My Voting Record
        </p>
        <p style={{ fontSize: 11, color: '#94a3b8', margin: 0, marginTop: 2 }}>
          {rows.length} bill{rows.length !== 1 ? 's' : ''} voted on
        </p>
      </div>

      {/* Filter area */}
      <div style={{
        background: 'white',
        borderBottom: '1px solid #E2E8E4',
        padding: '8px 10px',
        flexShrink: 0,
      }}>
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

        <div className="scrollbar-hide" style={{
          display: 'flex',
          gap: 6,
          overflowX: 'auto',
          paddingBottom: 2,
          alignItems: 'center',
        }}>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)} style={selectStyle}>
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
          </select>

          <select value={voteFilter} onChange={(e) => setVoteFilter(e.target.value as typeof voteFilter)} style={selectStyle}>
            <option value="all">All votes</option>
            <option value="support">Supported</option>
            <option value="oppose">Opposed</option>
          </select>

          <select value={majorityFilter} onChange={(e) => setMajorityFilter(e.target.value as typeof majorityFilter)} style={selectStyle}>
            <option value="all">All</option>
            <option value="with">With majority</option>
            <option value="against">Against majority</option>
          </select>

          <select value={repFilter} onChange={(e) => setRepFilter(e.target.value as typeof repFilter)} style={selectStyle}>
            <option value="all">All</option>
            <option value="agreed">Rep agreed</option>
            <option value="disagreed">Rep disagreed</option>
          </select>

          <span style={{
            fontSize: 11,
            color: '#94a3b8',
            whiteSpace: 'nowrap',
            marginLeft: 'auto',
            paddingLeft: 8,
            flexShrink: 0,
          }}>
            {resultCount} votes
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
            <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>No votes match these filters.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '32px 16px', textAlign: 'center' }}>
            <i className="fa-solid fa-file-lines" style={{ fontSize: 24, color: '#94a3b8', display: 'block', marginBottom: 8 }} />
            <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>No votes recorded yet.</p>
          </div>
        ) : (
          <div style={{ background: 'white', borderRadius: 12, margin: 10, border: '1px solid #E2E8E4', overflow: 'hidden' }}>
            {filtered.map((r, i) => (
              <VoteRow
                key={r.user_vote_id}
                row={r}
                isLast={i === filtered.length - 1}
                onNavigateToBill={onNavigateToBill}
              />
            ))}
          </div>
        )}
      </div>

      <BottomNav {...navProps} />
    </div>
  );
}
