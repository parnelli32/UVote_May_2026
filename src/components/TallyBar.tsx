import { formatNumber } from '../lib/formatNumber';

type TallyBarProps = {
  supportCount: number;
  opposeCount: number;
  totalVotes: number;
  animate?: boolean;
};

export function TallyBar({ supportCount, opposeCount, totalVotes, animate = false }: TallyBarProps) {
  const supportPct = totalVotes > 0 ? Math.round((supportCount / totalVotes) * 100) : 0;
  const opposePct = totalVotes > 0 ? Math.round((opposeCount / totalVotes) * 100) : 0;

  return (
    <div>
      {/* Bar track */}
      <div style={{ height: 8, borderRadius: 4, background: '#E2E8E4', overflow: 'hidden', display: 'flex' }}>
        {totalVotes > 0 && (
          <>
            <div
              style={{
                width: `${supportPct}%`,
                background: '#1DB97A',
                transition: animate ? 'width 0.5s ease' : undefined,
              }}
            />
            <div
              style={{
                width: `${opposePct}%`,
                background: '#F0455A',
                transition: animate ? 'width 0.5s ease' : undefined,
              }}
            />
          </>
        )}
      </div>

      {/* Labels */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: '#1DB97A' }}>{supportPct}% Support</span>
        <span style={{ fontSize: 10, color: '#94a3b8' }}>{formatNumber(totalVotes)} votes cast</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: '#F0455A' }}>{opposePct}% Oppose</span>
      </div>
    </div>
  );
}
