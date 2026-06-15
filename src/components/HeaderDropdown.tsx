import { useState } from 'react';

type HeaderDropdownProps = {
  districtName: string | null;
  onNavigateToHowItWorks: () => void;
  onNavigateToAbout: () => void;
};

export function HeaderDropdown({
  districtName,
  onNavigateToHowItWorks,
  onNavigateToAbout,
}: HeaderDropdownProps) {
  const [open, setOpen] = useState(false);

  if (districtName === null) return null;

  function handleHowItWorks() {
    setOpen(false);
    onNavigateToHowItWorks();
  }

  function handleAbout() {
    setOpen(false);
    onNavigateToAbout();
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
            fontSize: 10,
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
          {districtName}
          <i
            className={open ? 'fa-solid fa-chevron-up' : 'fa-solid fa-chevron-down'}
            style={{ fontSize: 9 }}
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
              fontSize: 9,
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
                <div style={{ fontSize: 12, fontWeight: 700, color: '#0f1724' }}>
                  How City Council works
                </div>
                <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
                  Philadelphia City Council · 6 stages
                </div>
              </div>
              <i className="fa-solid fa-chevron-right" style={{ fontSize: 10, color: '#94a3b8' }} />
            </button>

            <div style={{ height: 1, background: '#F4F6F0', margin: '2px 14px' }} />

            <p style={{
              padding: '6px 14px 2px',
              fontSize: 9,
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
                <div style={{ fontSize: 12, fontWeight: 700, color: '#0f1724' }}>
                  About UVote
                </div>
                <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
                  Mission and platform overview
                </div>
              </div>
              <i className="fa-solid fa-chevron-right" style={{ fontSize: 10, color: '#94a3b8' }} />
            </button>
          </div>
        )}
      </div>
    </>
  );
}
