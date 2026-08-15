import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { LEGISLATIVE_GUIDES } from '../data/legislativeGuides';

type HeaderDropdownProps = {
  onNavigateToHowItWorks: () => void;
  onNavigateToAbout: () => void;
  onNavigateToElectionCenter: () => void;
};

export function HeaderDropdown({
  onNavigateToHowItWorks,
  onNavigateToAbout,
  onNavigateToElectionCenter,
}: HeaderDropdownProps) {
  const { user, legislativeBodies, currentBodyId, currentBody, currentDistrict, districtsByBody, setCurrentBodyId } = useAuth();
  const [open, setOpen] = useState(false);
  const [bodyBillCounts, setBodyBillCounts] = useState<Map<string, number>>(new Map());
  const [countsLoading, setCountsLoading] = useState(false);

  useEffect(() => {
    if (!open || !user || legislativeBodies.length === 0) return;
    let cancelled = false;

    async function loadCounts() {
      setCountsLoading(true);
      try {
        const bodyIds = legislativeBodies.map((b) => b.legislative_body_id);
        // Active-bill totals use head:true exact counts rather than fetching rows —
        // some bodies (e.g. PA House) have well over PostgREST's default 1000-row
        // page size, so counting fetched rows client-side would silently undercount.
        const [totalCountsRes, votedActiveRes] = await Promise.all([
          Promise.all(
            bodyIds.map((bodyId) =>
              supabase
                .from('bills')
                .select('bill_id', { count: 'exact', head: true })
                .eq('status', 'active')
                .eq('legislative_body_id', bodyId)
                .then((res) => [bodyId, res.count ?? 0] as const)
            )
          ),
          supabase
            .from('user_votes')
            .select('bill_id, bills!inner(legislative_body_id)')
            .eq('user_id', user!.id)
            .eq('bills.status', 'active')
            .in('bills.legislative_body_id', bodyIds),
        ]);

        const votedActiveCounts = new Map<string, number>();
        for (const row of (votedActiveRes.data ?? []) as { bills: { legislative_body_id: string } | null }[]) {
          const bodyId = row.bills?.legislative_body_id;
          if (!bodyId) continue;
          votedActiveCounts.set(bodyId, (votedActiveCounts.get(bodyId) ?? 0) + 1);
        }

        const counts = new Map<string, number>();
        for (const [bodyId, total] of totalCountsRes) {
          counts.set(bodyId, Math.max(0, total - (votedActiveCounts.get(bodyId) ?? 0)));
        }
        if (!cancelled) setBodyBillCounts(counts);
      } finally {
        if (!cancelled) setCountsLoading(false);
      }
    }
    loadCounts();
    return () => { cancelled = true; };
  }, [open, user, legislativeBodies]);

  if (!user) return null;

  const pillLabel = currentBody
    ? currentDistrict
      ? `${currentBody.name} · ${currentDistrict.districtName}`
      : currentBody.name
    : 'Your District';

  const guide = LEGISLATIVE_GUIDES[currentBodyId];
  const guideTitle = guide ? `How ${guide.bodyName} works` : 'How it works';
  const guideSubtitle = guide
    ? `${guide.bodyName} · ${guide.stages.length} stages`
    : currentBody?.name ?? 'Legislative process guide';

  function handleSelectBody(bodyId: string) {
    setCurrentBodyId(bodyId);
    setOpen(false);
  }

  function handleHowItWorks() {
    setOpen(false);
    onNavigateToHowItWorks();
  }

  function handleAbout() {
    setOpen(false);
    onNavigateToAbout();
  }

  function handleElectionCenter() {
    setOpen(false);
    onNavigateToElectionCenter();
  }

  return (
    <>
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10,
          }}
        />
      )}

      <div style={{ position: 'relative', zIndex: 11 }}>
        <button
          onClick={() => setOpen((o) => !o)}
          style={{
            background: '#FFF3D6',
            color: '#7A4F00',
            fontSize: 12,
            fontWeight: 700,
            padding: '4px 8px 4px 10px',
            borderRadius: 20,
            border: '1px solid rgba(245,166,35,0.4)',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            minHeight: 'unset',
            cursor: 'pointer',
          }}
        >
          {pillLabel}
          <i
            className={open ? 'fa-solid fa-chevron-up' : 'fa-solid fa-chevron-down'}
            style={{ fontSize: 11 }}
          />
        </button>

        {open && (
          <div style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 8px)',
            background: 'white',
            border: '1px solid #E2E8E4',
            borderRadius: 12,
            minWidth: 240,
            overflow: 'hidden',
            paddingBottom: 6,
          }}>
            <p style={{
              padding: '8px 14px 2px',
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.8px',
              color: '#94a3b8',
              margin: 0,
            }}>
              Legislative Bodies
            </p>

            {legislativeBodies.map((body) => {
              const isCurrent = body.legislative_body_id === currentBodyId;
              const billsLeft = bodyBillCounts.get(body.legislative_body_id) ?? 0;
              const hasDistrict = districtsByBody.has(body.legislative_body_id);
              return (
                <button
                  key={body.legislative_body_id}
                  onClick={() => handleSelectBody(body.legislative_body_id)}
                  style={{
                    width: '100%',
                    background: isCurrent ? '#F4F6F0' : 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '9px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 11,
                    textAlign: 'left',
                    minHeight: 'unset',
                  }}
                >
                  <div style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: isCurrent ? '#1B4332' : '#E8F0EB',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <i className="fa-solid fa-landmark" style={{ fontSize: 14, color: isCurrent ? 'white' : '#1B4332' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0f1724' }}>
                      {body.name}
                      {!hasDistrict && (
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8' }}> · no district yet</span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                      {countsLoading
                        ? 'Loading…'
                        : `${billsLeft} bill${billsLeft === 1 ? '' : 's'} left to vote on`}
                    </div>
                  </div>
                  {isCurrent && (
                    <i className="fa-solid fa-circle-check" style={{ fontSize: 15, color: '#1B4332' }} />
                  )}
                </button>
              );
            })}

            <div style={{ height: 1, background: '#F4F6F0', margin: '2px 14px' }} />

            <p style={{
              padding: '6px 14px 2px',
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.8px',
              color: '#94a3b8',
              margin: 0,
            }}>
              Guides
            </p>

            <button
              onClick={handleHowItWorks}
              style={{
                width: '100%',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '9px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: 11,
                textAlign: 'left',
                minHeight: 'unset',
              }}
            >
              <div style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: '#E8F0EB',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}>
                <i className="fa-solid fa-book" style={{ fontSize: 14, color: '#1B4332' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0f1724' }}>
                  {guideTitle}
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                  {guideSubtitle}
                </div>
              </div>
              <i className="fa-solid fa-chevron-right" style={{ fontSize: 12, color: '#94a3b8' }} />
            </button>

            <div style={{ height: 1, background: '#F4F6F0', margin: '2px 14px' }} />

            <p style={{
              padding: '6px 14px 2px',
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.8px',
              color: '#94a3b8',
              margin: 0,
            }}>
              Elections
            </p>

            <button
              onClick={handleElectionCenter}
              style={{
                width: '100%',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '9px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: 11,
                textAlign: 'left',
                minHeight: 'unset',
              }}
            >
              <div style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: '#E8F0EB',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}>
                <i className="fa-solid fa-check-to-slot" style={{ fontSize: 14, color: '#1B4332' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0f1724' }}>
                  Election Center
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                  Registration, polling places, key dates
                </div>
              </div>
              <i className="fa-solid fa-chevron-right" style={{ fontSize: 12, color: '#94a3b8' }} />
            </button>

            <div style={{ height: 1, background: '#F4F6F0', margin: '2px 14px' }} />

            <p style={{
              padding: '6px 14px 2px',
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.8px',
              color: '#94a3b8',
              margin: 0,
            }}>
              Platform
            </p>

            <button
              onClick={handleAbout}
              style={{
                width: '100%',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '9px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: 11,
                textAlign: 'left',
                minHeight: 'unset',
              }}
            >
              <div style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: '#E8F0EB',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}>
                <i className="fa-solid fa-circle-info" style={{ fontSize: 14, color: '#1B4332' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0f1724' }}>
                  About UVote
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                  Mission and platform overview
                </div>
              </div>
              <i className="fa-solid fa-chevron-right" style={{ fontSize: 12, color: '#94a3b8' }} />
            </button>
          </div>
        )}
      </div>
    </>
  );
}
