import { useState } from 'react';
import { BottomNav } from '../components/BottomNav';
import { AppHeader } from '../components/AppHeader';
import type { NavTab } from '../components/BottomNav';
import {
  LEGISLATIVE_GUIDES,
  PHILLY_COUNCIL_BODY_ID,
} from '../data/legislativeGuides';

type HowItWorksPageProps = {
  onBack: () => void;
  onNavigateToAbout: () => void;
  bodyId?: string;
  navProps?: {
    activeTab: NavTab;
    onTabChange: (tab: NavTab) => void;
    onNavigateToProfile: () => void;
    onNavigateToAdmin: () => void;
  };
};

const SUMMARY_STAGE_INDICES = [1, 3, 4]; // stages 2, 4, 5 (0-based)

export function HowItWorksPage({ onBack, onNavigateToAbout, bodyId, navProps }: HowItWorksPageProps) {
  const guide =
    LEGISLATIVE_GUIDES[bodyId ?? PHILLY_COUNCIL_BODY_ID] ??
    LEGISLATIVE_GUIDES[PHILLY_COUNCIL_BODY_ID];

  const [step, setStep] = useState(1);
  const totalSteps = guide.stages.length;
  const isSummary = step === totalSteps + 1;
  const currentStage = isSummary ? guide.stages[totalSteps - 1] : guide.stages[step - 1];
  const isLastStep = step === totalSteps;

  return (
    <div style={{
      height: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      background: '#F4F6F0',
      maxWidth: 600,
      margin: '0 auto',
    }}>
      <AppHeader onNavigateToHowItWorks={onBack} onNavigateToAbout={onNavigateToAbout} />

      {/* SCROLLABLE MAIN */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: 10,
        paddingBottom: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
      }}>
        {/* WHITE CARD */}
        <div style={{
          background: 'white',
          borderRadius: 12,
          border: '1px solid #E2E8E4',
          overflow: 'hidden',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
        }}>

          {isSummary ? (
            /* ── SUMMARY SCREEN ── */
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: 16, flex: 1 }}>
                <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 16 }}>
                  <p style={{ fontSize: 16, fontWeight: 700, color: '#0f1724', margin: '0 0 4px' }}>
                    Your civic power
                  </p>
                  <p style={{ fontSize: 12, color: '#64748b', margin: 0, lineHeight: 1.5 }}>
                    Three moments where your voice has the most weight.
                  </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {SUMMARY_STAGE_INDICES.map((idx) => {
                    const stage = guide.stages[idx];
                    const isGreen = idx === 4;
                    const bg = isGreen ? '#E8F0EB' : '#FFF3D6';
                    const numBg = isGreen ? '#1B4332' : '#F5A623';
                    const numColor = isGreen ? 'white' : '#412402';
                    const titleColor = isGreen ? '#1B4332' : '#412402';
                    const subColor = isGreen ? '#0e6b4a' : '#7A4F00';
                    const subTexts: Record<number, string> = {
                      1: 'The bill is still being shaped — your district position matters most here.',
                      3: 'Permanent digital testimony vs. a 3-minute comment that disappears.',
                      4: 'Your rep\'s alignment score updates the moment they vote.',
                    };
                    return (
                      <div key={stage.number} style={{
                        background: bg,
                        borderRadius: 10,
                        padding: '12px 14px',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 12,
                      }}>
                        <div style={{
                          width: 28,
                          height: 28,
                          borderRadius: '50%',
                          background: numBg,
                          color: numColor,
                          fontSize: 11,
                          fontWeight: 900,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}>
                          {stage.number}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <p style={{ fontSize: 12, fontWeight: 700, color: titleColor, margin: '0 0 3px' }}>
                            {stage.title}
                          </p>
                          <p style={{ fontSize: 11, color: subColor, lineHeight: 1.5, margin: 0 }}>
                            {subTexts[idx]}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div style={{
                  background: '#1B4332',
                  borderRadius: 10,
                  padding: '12px 14px',
                  marginTop: 14,
                  display: 'flex',
                  flexDirection: 'column',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
                    <i className="fa-solid fa-hand" style={{ fontSize: 11, color: '#F5A623', marginRight: 6 }} />
                    <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.8px', color: '#F5A623' }}>
                      UVote tip
                    </span>
                  </div>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', lineHeight: 1.55 }}>
                    The earlier you vote on a bill, the longer your district's position has been on record.
                  </span>
                </div>
              </div>

              {/* NAVIGATION ROW */}
              <div style={{ padding: '12px 16px 16px', display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setStep(s => s - 1)}
                  style={{
                    flex: 1,
                    border: '1.5px solid #1B4332',
                    background: 'white',
                    color: '#1B4332',
                    borderRadius: 10,
                    padding: 11,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  ← Back
                </button>
                <button
                  onClick={() => setStep(1)}
                  style={{
                    flex: 2,
                    background: '#1B4332',
                    color: 'white',
                    border: 'none',
                    borderRadius: 10,
                    padding: 12,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Back to guide
                </button>
              </div>
            </div>
          ) : (
            /* ── STAGE CONTENT ── */
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>

              {/* STAGE HEADER BAND */}
              <div style={{
                padding: '14px 16px 12px',
                background: '#1B4332',
                borderBottom: '1px solid #E2E8E4',
              }}>
                <p style={{
                  fontSize: 9,
                  fontWeight: 700,
                  textTransform: 'uppercase' as const,
                  letterSpacing: '0.8px',
                  color: 'rgba(255,255,255,0.5)',
                  margin: 0,
                }}>
                  Stage {step} of {totalSteps} · {guide.bodyName}
                </p>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' as const }}>
                  <div style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: currentStage.iconBg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <i className={currentStage.icon} style={{ fontSize: 20, color: currentStage.iconColor }} />
                  </div>

                  <p style={{
                    fontSize: 17,
                    fontWeight: 700,
                    color: 'white',
                    margin: 0,
                    flex: 1,
                    minWidth: 0,
                  }}>
                    {currentStage.title}
                  </p>

                  {currentStage.badgeLabel && (
                    <span style={{
                      background: currentStage.badgeBg,
                      color: currentStage.badgeColor,
                      fontSize: 9,
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 20,
                      flexShrink: 0,
                    }}>
                      {currentStage.badgeLabel}
                    </span>
                  )}
                </div>

                {currentStage.actionPhrase && (
                  <p style={{
                    fontSize: 11,
                    color: 'rgba(255,255,255,0.6)',
                    margin: '10px 0 0',
                    lineHeight: 1.45,
                  }}>
                    {currentStage.actionPhrase}
                  </p>
                )}
              </div>

              {/* DESCRIPTION */}
              <div style={{ padding: '14px 16px', fontSize: 13, color: '#374151', lineHeight: 1.7 }}>
                {currentStage.description}
              </div>

              {/* UVOTE BADGE */}
              {currentStage.uvoteMessage && (
                <div style={{
                  margin: '0 16px 14px',
                  background: '#FFF3D6',
                  borderRadius: 8,
                  padding: '10px 12px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <i className="fa-solid fa-hand" style={{ fontSize: 11, color: '#F5A623', marginRight: 5 }} />
                    <span style={{
                      fontSize: 9,
                      fontWeight: 700,
                      textTransform: 'uppercase' as const,
                      letterSpacing: '0.8px',
                      color: '#F5A623',
                    }}>
                      UVote moment
                    </span>
                  </div>
                  <p style={{ fontSize: 11, color: '#7A4F00', lineHeight: 1.55, marginTop: 4, marginBottom: 0 }}>
                    {currentStage.uvoteMessage}
                  </p>
                </div>
              )}

              {/* PROGRESS DOTS */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: 6, padding: '8px 0', marginTop: 'auto' }}>
                {Array.from({ length: totalSteps }, (_, i) => {
                  const dotStep = i + 1;
                  const isActive = dotStep === step;
                  const isPast = dotStep < step;
                  return (
                    <span
                      key={dotStep}
                      onClick={() => setStep(dotStep)}
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: '50%',
                        display: 'inline-block',
                        flexShrink: 0,
                        cursor: 'pointer',
                        background: isActive
                          ? '#1B4332'
                          : isPast
                            ? '#1DB97A'
                            : '#E2E8E4',
                      }}
                    />
                  );
                })}
              </div>

              {/* NAVIGATION ROW */}
              <div style={{ padding: '12px 16px 16px', display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setStep(s => s - 1)}
                  disabled={step === 1}
                  style={{
                    flex: 1,
                    border: '1.5px solid #1B4332',
                    background: 'white',
                    color: '#1B4332',
                    borderRadius: 10,
                    padding: 11,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: step === 1 ? 'default' : 'pointer',
                    opacity: step === 1 ? 0.3 : 1,
                  }}
                >
                  ← Back
                </button>
                <button
                  onClick={() => setStep(s => s + 1)}
                  style={{
                    flex: 2,
                    background: '#1B4332',
                    color: 'white',
                    border: 'none',
                    borderRadius: 10,
                    padding: 12,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {isLastStep ? 'See your impact →' : 'Next →'}
                </button>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* BOTTOM NAV */}
      {navProps && (
        <BottomNav
          activeTab={navProps.activeTab}
          onTabChange={navProps.onTabChange}
          onNavigateToProfile={navProps.onNavigateToProfile}
          onNavigateToAdmin={navProps.onNavigateToAdmin}
        />
      )}
    </div>
  );
}
