import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { logError } from '../../lib/errorLogger';
import { useAuth } from '../../context/AuthContext';
import { extractMsg, FormField, inputStyle } from './AdminShared';
import type { District, Representative, LegislativeBody } from '../../lib/types';

type DistrictForm = { name: string; district_number: string; legislative_body_id: string };
type RepForm = { first_name: string; last_name: string; title: string; party: string; bio: string; photo_url: string; district_id: string; legislative_body_id: string };

const EMPTY_DISTRICT_FORM: DistrictForm = { name: '', district_number: '', legislative_body_id: '' };
const EMPTY_REP_FORM: RepForm = { first_name: '', last_name: '', title: '', party: '', bio: '', photo_url: '', district_id: '', legislative_body_id: '' };

export function DistrictsRepsTab({
  bodies,
  districts,
  reps,
  onDistrictsChange,
  onRepsChange,
  onToast,
}: {
  bodies: LegislativeBody[];
  districts: District[];
  reps: Representative[];
  onDistrictsChange: () => void;
  onRepsChange: () => void;
  onToast: (m: string) => void;
}) {
  const { user } = useAuth();
  const [subTab, setSubTab] = useState<'districts' | 'reps'>('districts');

  // Districts
  const [districtFormOpen, setDistrictFormOpen] = useState(false);
  const [editingDistrictId, setEditingDistrictId] = useState<string | null>(null);
  const [districtForm, setDistrictForm] = useState<DistrictForm>(EMPTY_DISTRICT_FORM);
  const [districtSaving, setDistrictSaving] = useState(false);
  const [districtError, setDistrictError] = useState<string | null>(null);

  // Reps
  const [repFormOpen, setRepFormOpen] = useState(false);
  const [editingRepId, setEditingRepId] = useState<string | null>(null);
  const [repForm, setRepForm] = useState<RepForm>(EMPTY_REP_FORM);
  const [repSaving, setRepSaving] = useState(false);
  const [repError, setRepError] = useState<string | null>(null);

  const bodyMap = new Map(bodies.map((b) => [b.legislative_body_id, b.name]));
  const districtMap = new Map(districts.map((d) => [d.district_id, d.name]));
  const repDistrictMap = new Map(reps.map((r) => [r.representative_id, r.district_id ?? '']));

  function openAddDistrict() {
    setEditingDistrictId(null);
    setDistrictForm(EMPTY_DISTRICT_FORM);
    setDistrictError(null);
    setDistrictFormOpen(true);
  }

  function openEditDistrict(d: District) {
    setEditingDistrictId(d.district_id);
    setDistrictForm({ name: d.name, district_number: d.district_number ?? '', legislative_body_id: d.legislative_body_id ?? '' });
    setDistrictError(null);
    setDistrictFormOpen(true);
  }

  async function saveDistrict() {
    if (!districtForm.name.trim() || !districtForm.district_number.trim() || !districtForm.legislative_body_id) {
      setDistrictError('Please fill in all required fields.');
      return;
    }
    setDistrictSaving(true);
    setDistrictError(null);
    try {
      const payload = { name: districtForm.name.trim(), district_number: districtForm.district_number.trim(), legislative_body_id: districtForm.legislative_body_id };
      if (editingDistrictId) {
        const { error } = await supabase.from('districts').update(payload).eq('district_id', editingDistrictId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('districts').insert(payload);
        if (error) throw error;
      }
      setDistrictFormOpen(false);
      setEditingDistrictId(null);
      onDistrictsChange();
      onToast('District saved.');
    } catch (err) {
      const msg = extractMsg(err);
      await logError({ action: 'admin_district_save', userId: user?.id, errorMessage: msg });
      setDistrictError(msg);
    } finally {
      setDistrictSaving(false);
    }
  }

  function openAddRep() {
    setEditingRepId(null);
    setRepForm(EMPTY_REP_FORM);
    setRepError(null);
    setRepFormOpen(true);
  }

  function openEditRep(r: Representative) {
    setEditingRepId(r.representative_id);
    setRepForm({
      first_name: r.first_name, last_name: r.last_name, title: r.title ?? '', party: r.party ?? '',
      bio: r.bio ?? '', photo_url: r.photo_url ?? '', district_id: r.district_id ?? '', legislative_body_id: r.legislative_body_id ?? '',
    });
    setRepError(null);
    setRepFormOpen(true);
  }

  async function saveRep() {
    if (!repForm.first_name.trim() || !repForm.last_name.trim() || !repForm.title.trim() || !repForm.party.trim() || !repForm.legislative_body_id) {
      setRepError('Please fill in all required fields.');
      return;
    }
    setRepSaving(true);
    setRepError(null);
    try {
      const payload = {
        first_name: repForm.first_name.trim(), last_name: repForm.last_name.trim(), title: repForm.title.trim(),
        party: repForm.party.trim(), bio: repForm.bio.trim() || null, photo_url: repForm.photo_url.trim() || null,
        district_id: repForm.district_id || null, legislative_body_id: repForm.legislative_body_id,
      };
      if (editingRepId) {
        const { error } = await supabase.from('representatives').update(payload).eq('representative_id', editingRepId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('representatives').insert(payload);
        if (error) throw error;
      }
      setRepFormOpen(false);
      setEditingRepId(null);
      onRepsChange();
      onToast('Representative saved.');
    } catch (err) {
      const msg = extractMsg(err);
      await logError({ action: 'admin_rep_save', userId: user?.id, errorMessage: msg });
      setRepError(msg);
    } finally {
      setRepSaving(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Sub-tabs */}
      <div style={{ display: 'flex', background: 'white', borderRadius: 10, border: '1px solid #E2E8E4', overflow: 'hidden' }}>
        {(['districts', 'reps'] as const).map((t) => (
          <button key={t} onClick={() => setSubTab(t)}
            style={{
              flex: 1, padding: '10px 0', textAlign: 'center', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer',
              background: subTab === t ? '#E8F0EB' : 'white',
              color: subTab === t ? '#1B4332' : '#94a3b8',
              borderBottom: subTab === t ? '2px solid #1B4332' : 'none',
            }}>
            {t === 'districts' ? 'Districts' : 'Representatives'}
          </button>
        ))}
      </div>

      {subTab === 'districts' && (
        <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E2E8E4', overflow: 'hidden' }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid #F4F6F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.6px', color: '#94a3b8' }}>Districts</span>
            <button onClick={openAddDistrict}
              style={{ background: '#1B4332', color: 'white', border: 'none', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              Add District
            </button>
          </div>
          {districtFormOpen && (
            <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid #F4F6F0', background: '#FAFCFB' }}>
              <FormField label="Name *">
                <input value={districtForm.name} onChange={(e) => setDistrictForm((f) => ({ ...f, name: e.target.value }))} style={inputStyle} placeholder="District name" />
              </FormField>
              <FormField label="District Number *">
                <input value={districtForm.district_number} onChange={(e) => setDistrictForm((f) => ({ ...f, district_number: e.target.value }))} style={inputStyle} placeholder="e.g. 1" />
              </FormField>
              <FormField label="Legislative Body *">
                <select value={districtForm.legislative_body_id} onChange={(e) => setDistrictForm((f) => ({ ...f, legislative_body_id: e.target.value }))} style={inputStyle}>
                  <option value="">Select body…</option>
                  {bodies.map((b) => <option key={b.legislative_body_id} value={b.legislative_body_id}>{b.name}</option>)}
                </select>
              </FormField>
              {districtError && <p style={{ fontSize: 11, color: '#F0455A', marginBottom: 8 }}>{districtError}</p>}
              <button onClick={saveDistrict} disabled={districtSaving}
                style={{ width: '100%', background: '#1B4332', color: 'white', border: 'none', borderRadius: 10, padding: 13, fontSize: 13, fontWeight: 700, cursor: 'pointer', marginBottom: 8 }}>
                {districtSaving ? 'Saving…' : 'Save District'}
              </button>
              <button onClick={() => { setDistrictFormOpen(false); setDistrictError(null); }}
                style={{ width: '100%', background: 'white', color: '#64748b', border: '1px solid #E2E8E4', borderRadius: 10, padding: 13, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          )}
          {districts.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', fontSize: 12, color: '#94a3b8' }}>No districts yet.</div>
          ) : (
            districts.map((d, i) => (
              <div key={d.district_id} style={{ padding: '10px 14px', borderBottom: i < districts.length - 1 ? '1px solid #F4F6F0' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#0f1724' }}>{d.name}</span>
                  <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 8 }}>#{d.district_number}</span>
                  <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 8 }}>{bodyMap.get(d.legislative_body_id ?? '') ?? '—'}</span>
                  <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
                    {reps.find((r) => r.district_id === d.district_id) ? `${reps.find((r) => r.district_id === d.district_id)!.first_name} ${reps.find((r) => r.district_id === d.district_id)!.last_name}` : 'No rep assigned'}
                  </div>
                </div>
                <button onClick={() => openEditDistrict(d)}
                  style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer', color: '#1B4332', minHeight: 'unset' }}>
                  <i className="fa-solid fa-pen" style={{ fontSize: 14 }} />
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {subTab === 'reps' && (
        <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E2E8E4', overflow: 'hidden' }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid #F4F6F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.6px', color: '#94a3b8' }}>Representatives</span>
            <button onClick={openAddRep}
              style={{ background: '#1B4332', color: 'white', border: 'none', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              Add Representative
            </button>
          </div>
          {repFormOpen && (
            <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid #F4F6F0', background: '#FAFCFB' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <FormField label="First Name *">
                  <input value={repForm.first_name} onChange={(e) => setRepForm((f) => ({ ...f, first_name: e.target.value }))} style={inputStyle} placeholder="First" />
                </FormField>
                <FormField label="Last Name *">
                  <input value={repForm.last_name} onChange={(e) => setRepForm((f) => ({ ...f, last_name: e.target.value }))} style={inputStyle} placeholder="Last" />
                </FormField>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <FormField label="Title *">
                  <input value={repForm.title} onChange={(e) => setRepForm((f) => ({ ...f, title: e.target.value }))} style={inputStyle} placeholder="e.g. Councilmember" />
                </FormField>
                <FormField label="Party *">
                  <input value={repForm.party} onChange={(e) => setRepForm((f) => ({ ...f, party: e.target.value }))} style={inputStyle} placeholder="e.g. Democrat" />
                </FormField>
              </div>
              <FormField label="Bio (optional)">
                <textarea value={repForm.bio} onChange={(e) => setRepForm((f) => ({ ...f, bio: e.target.value }))} rows={3} style={{ ...inputStyle, resize: 'vertical' }} placeholder="Bio…" />
              </FormField>
              <FormField label="Photo URL (optional)">
                <input value={repForm.photo_url} onChange={(e) => setRepForm((f) => ({ ...f, photo_url: e.target.value }))} style={inputStyle} placeholder="https://…" />
                {repForm.photo_url.trim() && (
                  <img
                    src={repForm.photo_url.trim()}
                    alt="Photo preview"
                    style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', marginTop: 8, border: '1px solid #E2E8E4' }}
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }}
                    onLoad={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'visible'; }}
                  />
                )}
              </FormField>
              <FormField label="District">
                <select value={repForm.district_id} onChange={(e) => setRepForm((f) => ({ ...f, district_id: e.target.value }))} style={inputStyle}>
                  <option value="">No district</option>
                  {districts.map((d) => <option key={d.district_id} value={d.district_id}>{d.name}</option>)}
                </select>
              </FormField>
              <FormField label="Legislative Body *">
                <select value={repForm.legislative_body_id} onChange={(e) => setRepForm((f) => ({ ...f, legislative_body_id: e.target.value }))} style={inputStyle}>
                  <option value="">Select body…</option>
                  {bodies.map((b) => <option key={b.legislative_body_id} value={b.legislative_body_id}>{b.name}</option>)}
                </select>
              </FormField>
              {repError && <p style={{ fontSize: 11, color: '#F0455A', marginBottom: 8 }}>{repError}</p>}
              <button onClick={saveRep} disabled={repSaving}
                style={{ width: '100%', background: '#1B4332', color: 'white', border: 'none', borderRadius: 10, padding: 13, fontSize: 13, fontWeight: 700, cursor: 'pointer', marginBottom: 8 }}>
                {repSaving ? 'Saving…' : 'Save Representative'}
              </button>
              <button onClick={() => { setRepFormOpen(false); setRepError(null); }}
                style={{ width: '100%', background: 'white', color: '#64748b', border: '1px solid #E2E8E4', borderRadius: 10, padding: 13, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          )}
          {reps.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', fontSize: 12, color: '#94a3b8' }}>No representatives yet.</div>
          ) : (
            reps.map((r, i) => (
              <div key={r.representative_id} style={{ padding: '10px 14px', borderBottom: i < reps.length - 1 ? '1px solid #F4F6F0' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#0f1724' }}>{r.first_name} {r.last_name}</span>
                  <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 8 }}>{r.title}</span>
                  <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 6 }}>· {r.party}</span>
                  <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
                    {repDistrictMap.get(r.representative_id) ? districtMap.get(repDistrictMap.get(r.representative_id)!) ?? 'No district' : 'No district'}
                  </div>
                </div>
                <button onClick={() => openEditRep(r)}
                  style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer', color: '#1B4332', minHeight: 'unset' }}>
                  <i className="fa-solid fa-pen" style={{ fontSize: 14 }} />
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
