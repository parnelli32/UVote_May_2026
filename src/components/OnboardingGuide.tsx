import { useState } from 'react';

type OnboardingGuideProps = {
  onComplete: () => void;
};

const STAGES = [
  {
    number: 1,
    title: 'Bill introduction',
    actionPhrase: 'Get on record early',
  },
  {
    number: 2,
    title: 'Committee hearing',
    badge: 'Highest impact',
    badgeBg: '#FFF3D6',
    badgeColor: '#412402',
    actionPhrase:
      'Bills get shaped in committee' +
      ' — your voice carries the most' +
      ' weight here',
  },
  {
    number: 3,
    title: 'First reading',
    actionPhrase:
      'Bill cleared committee' +
      ' — still time to get on record',
  },
  {
    number: 4,
    title: 'Public comment',
    badge: 'UVote advantage',
    badgeBg: '#E8F0EB',
    badgeColor: '#1B4332',
    actionPhrase:
      'Council vote is imminent' +
      ' — get your position on' +
      ' record now',
  },
  {
    number: 5,
    title: 'Final vote',
    badge: 'Accountability moment',
    badgeBg: '#E8F0EB',
    badgeColor: '#1B4332',
    actionPhrase:
      'Did your rep vote with' +
      ' your district?',
  },
  {
    number: 6,
    title: "Mayor's desk",
    actionPhrase:
      'Last stop before it' +
      ' becomes law',
  },
];

const FEATURE_CARDS = [
  {
    icon: 'fa-solid fa-chart-bar',
    iconColor: '#1B4332',
    bg: '#E8F0EB',
    title: 'District tally',
    desc: 'Every vote in your district is tallied in real time. Your rep can see exactly where constituents stand.',
  },
  {
    icon: 'fa-solid fa-align-left',
    iconColor: '#7A4F00',
    bg: '#FFF3D6',
    title: 'Public statements',
    desc: 'Add a short statement with your vote. It becomes permanent digital testimony — visible to your rep.',
  },
  {
    icon: 'fa-solid fa-circle-check',
    iconColor: '#1B4332',
    bg: '#E8F0EB',
    title: 'Alignment score',
    desc: "After the final vote, your rep's alignment score updates. Mismatches get flagged publicly.",
  },
];

type GiftState = 'idle' | 'animating' | 'hiding' | 'hidden';

export function OnboardingGuide({ onComplete }: OnboardingGuideProps) {
  const [giftState, setGiftState] = useState<GiftState>('idle');
  const [lidOpen, setLidOpen] = useState(false);
  const [bowBounce, setBowBounce] = useState(false);
  const [sparkles, setSparkles] = useState(false);
  const [slide, setSlide] = useState<1 | 2 | 3>(1);
  const [slideDir, setSlideDir] = useState<'forward' | 'back'>('forward');
  const [transitioning, setTransitioning] = useState(false);

  function handleUnwrap() {
    if (giftState !== 'idle') return;
    setGiftState('animating');
    setBowBounce(true);
    setTimeout(() => {
      setLidOpen(true);
    }, 380);
    setTimeout(() => {
      setSparkles(true);
    }, 600);
    setTimeout(() => {
      setGiftState('hiding');
    }, 1050);
    setTimeout(() => {
      setGiftState('hidden');
    }, 1650);
  }

  function handleSkipAnimation() {
    setGiftState('hiding');
    setTimeout(() => setGiftState('hidden'), 300);
  }

  function goToSlide(n: 1 | 2 | 3) {
    if (transitioning) return;
    setSlideDir(n > slide ? 'forward' : 'back');
    setTransitioning(true);
    setTimeout(() => {
      setSlide(n);
      setTransitioning(false);
    }, 320);
  }

  const giftVisible = giftState !== 'hidden';
  const giftHiding = giftState === 'hiding';

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 100,
      background: '#1B4332',
      display: 'flex',
      justifyContent: 'center',
    }}>
    <div style={{
      width: '100%',
      maxWidth: 600,
      background: '#F4F6F0',
      overflow: 'hidden',
      position: 'relative',
      height: '100%',
    }}>
      {/* ── SLIDE 1 (intro) ── */}
      <div style={{
        position: 'absolute',
        inset: 0,
        opacity: giftState === 'hidden' && slide === 1 ? 1 : 0,
        pointerEvents: giftState === 'hidden' && slide === 1 ? 'auto' : 'none',
        transform: slide === 1
          ? 'translateX(0)'
          : slide > 1
            ? 'translateX(-100%)'
            : 'translateX(100%)',
        transition: 'opacity 0.3s ease, transform 0.32s ease',
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
      }}>
        <IntroSlide onNext={() => goToSlide(2)} onSkip={onComplete} />
      </div>

      {/* ── SLIDE 2 (stage overview) ── */}
      <div style={{
        position: 'absolute',
        inset: 0,
        opacity: giftState === 'hidden' && slide === 2 ? 1 : 0,
        pointerEvents: giftState === 'hidden' && slide === 2 ? 'auto' : 'none',
        transform: slide === 2
          ? 'translateX(0)'
          : slide > 2
            ? 'translateX(-100%)'
            : 'translateX(100%)',
        transition: 'opacity 0.3s ease, transform 0.32s ease',
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
      }}>
        <StageSlide onNext={() => goToSlide(3)} onSkip={onComplete} />
      </div>

      {/* ── SLIDE 3 (features) ── */}
      <div style={{
        position: 'absolute',
        inset: 0,
        opacity: giftState === 'hidden' && slide === 3 ? 1 : 0,
        pointerEvents: giftState === 'hidden' && slide === 3 ? 'auto' : 'none',
        transform: slide === 3
          ? 'translateX(0)'
          : slide > 3
            ? 'translateX(-100%)'
            : 'translateX(100%)',
        transition: 'opacity 0.3s ease, transform 0.32s ease',
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
      }}>
        <FeaturesSlide onBack={() => goToSlide(2)} onComplete={onComplete} />
      </div>

      {/* ── GIFT OVERLAY (on top) ── */}
      {giftVisible && (
        <div style={{
          position: 'absolute',
          inset: 0,
          zIndex: 20,
          background: '#1B4332',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: giftHiding ? 0 : 1,
          transform: giftHiding ? 'scale(0.88)' : 'scale(1)',
          transition: giftHiding ? 'opacity 0.55s ease, transform 0.55s ease' : 'none',
        }}>
          <GiftGraphic lidOpen={lidOpen} bowBounce={bowBounce} sparkles={sparkles} />

          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, marginTop: 12, marginBottom: 24, textAlign: 'center', padding: '0 32px', lineHeight: 1.5 }}>
            You've unlocked your legislative guide — see exactly where your vote matters most.
          </p>

          <button
            onClick={handleUnwrap}
            style={{
              background: '#F5A623',
              color: '#412402',
              border: 'none',
              borderRadius: 12,
              padding: '14px 40px',
              fontSize: 14,
              fontWeight: 800,
              cursor: 'pointer',
              letterSpacing: '0.3px',
            }}
          >
            Unwrap →
          </button>

          <button
            onClick={handleSkipAnimation}
            style={{
              background: 'none',
              border: 'none',
              color: 'rgba(255,255,255,0.45)',
              fontSize: 11,
              cursor: 'pointer',
              marginTop: 16,
              padding: '4px 8px',
            }}
          >
            Skip animation
          </button>
        </div>
      )}

      <style>{`
        @keyframes bowBounce {
          0%   { transform: scale(1); }
          30%  { transform: scale(1.25) rotate(-8deg); }
          55%  { transform: scale(0.9) rotate(5deg); }
          75%  { transform: scale(1.1) rotate(-3deg); }
          100% { transform: scale(1) rotate(0deg); }
        }
        @keyframes sparkle {
          0%   { opacity: 1; transform: translate(0,0) scale(1); }
          100% { opacity: 0; transform: translate(var(--sx), var(--sy)) scale(0); }
        }
        .bow-bounce { animation: bowBounce 0.45s ease forwards; }
        .sparkle-dot { animation: sparkle 0.7s ease forwards; }
      `}</style>
    </div>
    </div>
  );
}

/* ── Gift graphic sub-component ── */
function GiftGraphic({ lidOpen, bowBounce, sparkles }: { lidOpen: boolean; bowBounce: boolean; sparkles: boolean }) {
  const SPARKLE_POS = [
    { sx: '-55px', sy: '-45px' }, { sx: '55px', sy: '-50px' },
    { sx: '-70px', sy: '-10px' }, { sx: '70px', sy: '-8px' },
    { sx: '-40px', sy: '-70px' }, { sx: '40px', sy: '-65px' },
    { sx: '0px',   sy: '-80px' },
  ];
  const SPARKLE_COLORS = ['#F5A623', '#FFD93D', '#ffffff', '#1DB97A', '#F5A623', '#FFD93D', '#ffffff'];

  return (
    <div style={{ position: 'relative', width: 140, height: 170 }}>
      {/* Sparkles */}
      {sparkles && SPARKLE_POS.map((pos, i) => (
        <div
          key={i}
          className="sparkle-dot"
          style={{
            position: 'absolute',
            top: 30,
            left: '50%',
            marginLeft: -5,
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: SPARKLE_COLORS[i % SPARKLE_COLORS.length],
            '--sx': pos.sx,
            '--sy': pos.sy,
            animationDelay: `${i * 0.04}s`,
          } as React.CSSProperties}
        />
      ))}

      {/* Lid */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 52,
        zIndex: 2,
        transformOrigin: 'top center',
        transform: lidOpen ? 'rotateX(-145deg)' : 'rotateX(0deg)',
        transition: 'transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
        perspective: 600,
      }}>
        <div style={{
          width: '100%',
          height: '100%',
          background: '#E8F0EB',
          borderRadius: '10px 10px 0 0',
          position: 'relative',
          overflow: 'visible',
        }}>
          {/* Ribbon on lid */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 22,
            height: '100%',
            background: '#1DB97A',
          }} />

          {/* Bow */}
          <div
            className={bowBounce ? 'bow-bounce' : ''}
            style={{
              position: 'absolute',
              top: -18,
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              gap: 3,
            }}
          >
            <div style={{
              width: 28,
              height: 20,
              background: '#1DB97A',
              borderRadius: '50% 50% 50% 0',
              transform: 'rotate(-30deg)',
            }} />
            <div style={{
              width: 28,
              height: 20,
              background: '#1DB97A',
              borderRadius: '50% 50% 0 50%',
              transform: 'rotate(30deg)',
            }} />
          </div>
        </div>
      </div>

      {/* Box body */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 110,
        background: '#E8F0EB',
        borderRadius: '0 0 10px 10px',
        overflow: 'hidden',
      }}>
        {/* Vertical ribbon */}
        <div style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 22,
          background: '#1DB97A',
        }} />
      </div>
    </div>
  );
}

/* ── Slide 1: Intro ── */
function IntroSlide({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Header row */}
      <div style={{
        padding: '16px 16px 0',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <i className="fa-solid fa-hand" style={{ fontSize: 15, color: '#1B4332' }} />
          <span style={{ fontSize: 13, fontWeight: 900, color: '#0f1724' }}>UVote</span>
        </div>
        <button
          onClick={onSkip}
          style={{ background: 'none', border: 'none', fontSize: 11, color: '#94a3b8', cursor: 'pointer', padding: '4px 0' }}
        >
          Skip
        </button>
      </div>

      {/* Hook card */}
      <div style={{
        margin: '14px 16px 0',
        background: '#1B4332',
        borderRadius: 10,
        padding: '14px 14px 12px',
      }}>
        <span style={{
          fontSize: 9,
          fontWeight: 700,
          textTransform: 'uppercase' as const,
          letterSpacing: '0.8px',
          color: 'rgba(245,166,35,0.8)',
          display: 'block',
          marginBottom: 6,
        }}>
          Why you're here
        </span>
        <div style={{
          fontSize: 17,
          fontWeight: 700,
          color: 'white',
          lineHeight: 1.25,
          marginBottom: 8,
        }}>
          Democracy doesn't pause between elections
        </div>
        <p style={{
          fontSize: 11,
          color: 'rgba(255,255,255,0.6)',
          lineHeight: 1.55,
          margin: 0,
        }}>
          City Council meets year-round. Decisions about your neighborhood are made whether you're paying attention or not.
        </p>
      </div>

      {/* Scrollable content */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '12px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}>
        {/* Row 1 */}
        <div style={{
          background: 'white',
          borderRadius: 10,
          border: '1px solid #E2E8E4',
          padding: '11px 12px',
          display: 'flex',
          gap: 11,
          alignItems: 'flex-start',
        }}>
          <div style={{
            width: 34,
            height: 34,
            borderRadius: 8,
            background: '#E8F0EB',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            <i className="fa-solid fa-calendar" style={{ fontSize: 14, color: '#1B4332' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#0f1724', margin: '0 0 3px' }}>
              Bills are voted on every month
            </p>
            <p style={{ fontSize: 11, color: '#64748b', lineHeight: 1.5, margin: 0 }}>
              Housing, safety, infrastructure, and budget — Council acts on these year-round, not just in election season.
            </p>
          </div>
        </div>

        {/* Row 2 */}
        <div style={{
          background: 'white',
          borderRadius: 10,
          border: '1px solid #E2E8E4',
          padding: '11px 12px',
          display: 'flex',
          gap: 11,
          alignItems: 'flex-start',
        }}>
          <div style={{
            width: 34,
            height: 34,
            borderRadius: 8,
            background: '#E8F0EB',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            <i className="fa-solid fa-user-check" style={{ fontSize: 14, color: '#1B4332' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#0f1724', margin: '0 0 3px' }}>
              Your rep votes with or without you
            </p>
            <p style={{ fontSize: 11, color: '#64748b', lineHeight: 1.5, margin: 0 }}>
              Every bill gets a vote. Without a public record of where your district stands, your rep votes in the dark.
            </p>
          </div>
        </div>

        {/* Row 3 */}
        <div style={{
          background: 'white',
          borderRadius: 10,
          border: '1px solid #E2E8E4',
          padding: '11px 12px',
          display: 'flex',
          gap: 11,
          alignItems: 'flex-start',
        }}>
          <div style={{
            width: 34,
            height: 34,
            borderRadius: 8,
            background: '#FFF3D6',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            <i className="fa-solid fa-hand" style={{ fontSize: 14, color: '#7A4F00' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#7A4F00', margin: '0 0 3px' }}>
              UVote closes the gap
            </p>
            <p style={{ fontSize: 11, color: '#92600E', lineHeight: 1.5, margin: 0 }}>
              Vote on bills, track your rep's record, and build a public position your representative can't ignore.
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: '10px 16px 20px', flexShrink: 0 }}>
        <button
          onClick={onNext}
          style={{
            width: '100%',
            background: '#1B4332',
            color: 'white',
            border: 'none',
            borderRadius: 10,
            padding: 13,
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Next →
        </button>
      </div>
    </div>
  );
}

/* ── Slide 2: 6-stage overview ── */
function StageSlide({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 16px 0',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <i className="fa-solid fa-hand" style={{ fontSize: 15, color: '#1B4332' }} />
          <span style={{ fontSize: 13, fontWeight: 900, color: '#0f1724' }}>UVote</span>
        </div>
        <button
          onClick={onSkip}
          style={{ background: 'none', border: 'none', fontSize: 11, color: '#94a3b8', cursor: 'pointer', padding: '4px 0' }}
        >
          Skip
        </button>
      </div>

      <div style={{ padding: '12px 16px 0', flexShrink: 0 }}>
        <div style={{
          fontSize: 16,
          fontWeight: 700,
          color: '#0f1724',
          marginBottom: 5,
          lineHeight: 1.3,
        }}>
          How a bill becomes law
        </div>
        <div style={{
          fontSize: 11,
          color: '#64748b',
          lineHeight: 1.5,
        }}>
          Philadelphia City Council · 6 stages
        </div>
      </div>

      {/* Stage rows */}
      <div className="scrollbar-hide" style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {STAGES.map((stage) => (
          <div key={stage.number} style={{
            background: 'white',
            borderRadius: 10,
            border: '1px solid #E2E8E4',
            padding: '10px 12px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  background: '#F1F5F9',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 9,
                  fontWeight: 800,
                  color: '#475569',
                  flexShrink: 0,
                }}>
                  {stage.number}
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#0f1724' }}>{stage.title}</span>
              </div>
              {stage.badge && (
                <span style={{
                  fontSize: 8,
                  fontWeight: 700,
                  background: stage.badgeBg,
                  color: stage.badgeColor,
                  padding: '2px 7px',
                  borderRadius: 20,
                  whiteSpace: 'nowrap' as const,
                }}>
                  {stage.badge}
                </span>
              )}
            </div>
            <p style={{
              fontSize: 10,
              color: '#94a3b8',
              margin: '3px 0 0',
              lineHeight: 1.4,
              paddingLeft: 28,
            }}>
              {stage.actionPhrase}
            </p>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{ padding: '10px 16px 20px', flexShrink: 0 }}>
        <button
          onClick={onNext}
          style={{
            width: '100%',
            background: '#1B4332',
            color: 'white',
            border: 'none',
            borderRadius: 10,
            padding: 13,
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Next →
        </button>
      </div>
    </div>
  );
}

/* ── Slide 3: UVote features ── */
function FeaturesSlide({ onBack, onComplete }: { onBack: () => void; onComplete: () => void }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 16px 0',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <i className="fa-solid fa-hand" style={{ fontSize: 15, color: '#1B4332' }} />
          <span style={{ fontSize: 13, fontWeight: 900, color: '#0f1724' }}>UVote</span>
        </div>
        <button
          onClick={onComplete}
          style={{ background: 'none', border: 'none', fontSize: 11, color: '#94a3b8', cursor: 'pointer', padding: '4px 0' }}
        >
          Skip
        </button>
      </div>

      <div style={{ padding: '12px 16px 0', flexShrink: 0 }}>
        <div style={{
          fontSize: 16,
          fontWeight: 700,
          color: '#0f1724',
          marginBottom: 5,
          lineHeight: 1.3,
        }}>
          What UVote gives you
        </div>
        <div style={{
          fontSize: 11,
          color: '#64748b',
          lineHeight: 1.5,
        }}>
          Three tools that make your voice count.
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {FEATURE_CARDS.map((card) => (
          <div key={card.title} style={{
            background: card.bg,
            borderRadius: 10,
            padding: '14px',
            display: 'flex',
            gap: 12,
            alignItems: 'flex-start',
          }}>
            <div style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              <i className={card.icon} style={{ fontSize: 15, color: card.iconColor }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#0f1724', margin: '0 0 4px' }}>{card.title}</p>
              <p style={{ fontSize: 11, color: '#374151', lineHeight: 1.55, margin: 0 }}>{card.desc}</p>
            </div>
          </div>
        ))}

        {/* Tip card */}
        <div style={{
          background: '#1B4332',
          borderRadius: 10,
          padding: '12px 14px',
          marginTop: 2,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 5 }}>
            <i className="fa-solid fa-hand" style={{ fontSize: 11, color: '#F5A623', marginRight: 6 }} />
            <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.8px', color: '#F5A623' }}>
              UVote tip
            </span>
          </div>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', lineHeight: 1.55, margin: 0 }}>
            The earlier you vote on a bill, the longer your district's position has been on record.
          </p>
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: '10px 16px 20px', flexShrink: 0, display: 'flex', gap: 8 }}>
        <button
          onClick={onBack}
          style={{
            flex: 1,
            border: '1.5px solid #1B4332',
            background: 'white',
            color: '#1B4332',
            borderRadius: 10,
            padding: 12,
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          ← Back
        </button>
        <button
          onClick={onComplete}
          style={{
            flex: 2,
            background: '#1B4332',
            color: 'white',
            border: 'none',
            borderRadius: 10,
            padding: 12,
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Start voting →
        </button>
      </div>
    </div>
  );
}
