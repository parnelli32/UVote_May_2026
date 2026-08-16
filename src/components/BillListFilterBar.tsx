import { useState } from 'react';
import { formatNumber } from '../lib/formatNumber';

type FilterOption = { label: string; value: string; activeColor?: { bg: string; color: string; border: string } };

type FilterGroup = {
  label: string;
  value: string;
  options: FilterOption[];
  onChange: (v: string) => void;
  activeColor?: { bg: string; color: string; border: string };
};

export type BillListFilterBarProps = {
  sortBy: string;
  onSortChange: (s: string) => void;
  sortOptions: { label: string; value: string }[];
  filters: FilterGroup[];
  resultCount: number;
};

export function BillListFilterBar({
  sortBy,
  onSortChange,
  sortOptions,
  filters,
  resultCount,
}: BillListFilterBarProps) {
  const [open, setOpen] = useState(false);

  const allDefaults =
    filters.every((f) => f.value === f.options[0]?.value) &&
    sortBy === sortOptions[0]?.value;

  const activeSortLabel = sortOptions.find((o) => o.value === sortBy)?.label ?? sortBy;

  const activeFilterLabels = filters
    .filter((f) => f.value !== f.options[0]?.value)
    .map((f) => f.options.find((o) => o.value === f.value)?.label ?? f.value);

  const summaryText = allDefaults
    ? `All · ${activeSortLabel}`
    : [...activeFilterLabels, activeSortLabel].join(' · ');

  function handleClear() {
    filters.forEach((f) => f.onChange(f.options[0]?.value ?? 'all'));
    onSortChange(sortOptions[0]?.value ?? '');
  }

  return (
    <div>
      {/* Control bar */}
      <div
        onClick={() => setOpen((v) => !v)}
        style={{
          background: 'white',
          borderRadius: 8,
          border: '1px solid #E2E8E4',
          padding: '7px 10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        {/* Left: active filter summary */}
        <span style={{
          fontSize: 13,
          fontWeight: 600,
          color: allDefaults ? '#94a3b8' : '#64748b',
          lineHeight: 1.4,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          maxWidth: '60%',
        }}>
          {summaryText}
        </span>

        {/* Right: count + divider + icon */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 12, color: '#94a3b8' }}>
            {formatNumber(resultCount)} {resultCount === 1 ? 'bill' : 'bills'}
          </span>
          <div style={{ width: 1, height: 14, background: '#E2E8E4' }} />
          {!allDefaults && (
            <span
              onClick={(e) => { e.stopPropagation(); handleClear(); }}
              style={{ fontSize: 12, fontWeight: 700, color: '#F0455A', cursor: 'pointer' }}
            >
              Clear
            </span>
          )}
          <i className="fa-solid fa-sliders" style={{ fontSize: 12, color: '#1B4332' }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: '#1B4332' }}>Filters</span>
        </div>
      </div>

      {/* Expanded panel */}
      {open && (
        <div style={{
          background: 'white',
          borderRadius: 8,
          border: '1px solid #E2E8E4',
          overflow: 'hidden',
          marginTop: 6,
        }}>
          {/* Sort group */}
          <div style={{ padding: '8px 12px', borderBottom: '1px solid #F4F6F0' }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: '#94a3b8', marginBottom: 6 }}>
              Sort
            </div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {sortOptions.map((opt) => {
                const active = sortBy === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => onSortChange(opt.value)}
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      padding: '4px 9px',
                      borderRadius: 20,
                      border: `1px solid ${active ? '#1B4332' : '#E2E8E4'}`,
                      background: active ? '#1B4332' : 'white',
                      color: active ? 'white' : '#64748b',
                      cursor: 'pointer',
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Filter groups */}
          {filters.map((group, gi) => {
            const isLast = gi === filters.length - 1;
            return (
              <div
                key={group.label}
                style={{
                  padding: '8px 12px',
                  borderBottom: isLast ? 'none' : '1px solid #F4F6F0',
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: '#94a3b8', marginBottom: 6 }}>
                  {group.label}
                </div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {group.options.map((opt) => {
                    const active = group.value === opt.value;
                    const ac = opt.activeColor ?? group.activeColor;
                    const activeBg = ac ? ac.bg : '#1B4332';
                    const activeColor = ac ? ac.color : 'white';
                    const activeBorder = ac ? ac.border : '#1B4332';
                    return (
                      <button
                        key={opt.value}
                        onClick={() => group.onChange(opt.value)}
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          padding: '4px 9px',
                          borderRadius: 20,
                          border: `1px solid ${active ? activeBorder : '#E2E8E4'}`,
                          background: active ? activeBg : 'white',
                          color: active ? activeColor : '#64748b',
                          cursor: 'pointer',
                        }}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
