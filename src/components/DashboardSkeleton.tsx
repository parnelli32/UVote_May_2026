import React from 'react';

export function SkeletonPulse({ width, height, style }: { width?: number | string; height?: number | string; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: '#F4F6F0',
      borderRadius: 4,
      width: width ?? '100%',
      height: height ?? 12,
      animation: 'pulse 1.5s ease-in-out infinite',
      ...style,
    }} />
  );
}

export function DashboardSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <style>{`@keyframes pulse { 0%,100%{opacity:0.5} 50%{opacity:1} }`}</style>
      {/* Greeting card skeleton */}
      <div style={{ background: '#1B4332', borderRadius: 12, padding: '14px 14px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <SkeletonPulse width={160} height={14} style={{ background: 'rgba(255,255,255,0.2)' }} />
        <SkeletonPulse width={120} height={10} style={{ background: 'rgba(255,255,255,0.12)' }} />
        <div style={{ marginTop: 6, background: 'rgba(255,255,255,0.1)', borderRadius: 8, padding: '6px 10px', display: 'flex', gap: 6, alignItems: 'center' }}>
          <SkeletonPulse width={11} height={11} style={{ background: 'rgba(255,255,255,0.2)', borderRadius: '50%', flexShrink: 0 }} />
          <SkeletonPulse width={180} height={10} style={{ background: 'rgba(255,255,255,0.2)' }} />
        </div>
      </div>
      {/* Rep card skeleton */}
      <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E2E8E4', overflow: 'hidden' }}>
        <div style={{ background: '#1B4332', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <SkeletonPulse width={100} height={9} style={{ background: 'rgba(255,255,255,0.2)' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
            <SkeletonPulse width={36} height={36} style={{ background: 'rgba(255,255,255,0.2)', borderRadius: '50%', flexShrink: 0 }} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
              <SkeletonPulse width={120} height={11} style={{ background: 'rgba(255,255,255,0.2)' }} />
              <SkeletonPulse width={80} height={9} style={{ background: 'rgba(255,255,255,0.15)' }} />
            </div>
          </div>
        </div>
        <div style={{ padding: '8px 12px' }}>
          <SkeletonPulse width="100%" height={10} />
        </div>
      </div>
      {/* Stat cells skeleton */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {[0, 1].map(i => (
          <div key={i} style={{ background: 'white', borderRadius: 8, border: '1px solid #E2E8E4', padding: '10px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
            <SkeletonPulse width={30} height={18} />
            <SkeletonPulse width={50} height={8} />
          </div>
        ))}
      </div>
      {/* Spotlight skeleton */}
      <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E2E8E4', overflow: 'hidden' }}>
        <div style={{ padding: '10px 12px 6px', borderBottom: '1px solid #F4F6F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <SkeletonPulse width={90} height={9} />
          <SkeletonPulse width={70} height={9} />
        </div>
        {[0, 1, 2].map(i => (
          <div key={i} style={{ padding: '10px 12px', borderBottom: i < 2 ? '1px solid #F4F6F0' : 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <SkeletonPulse width={50} height={9} />
            <SkeletonPulse width="90%" height={11} />
            <SkeletonPulse width="100%" height={5} />
          </div>
        ))}
      </div>
    </div>
  );
}
