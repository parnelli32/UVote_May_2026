import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { logError } from '../../lib/errorLogger';
import { useAuth } from '../../context/AuthContext';
import { extractMsg, FormField, inputStyle } from './AdminShared';
import { formatNumber } from '../../lib/formatNumber';
import type { VotingBlock } from '../../lib/types';

type BlockForm = { name: string; visibility: 'public' | 'private'; firstAdminUsername: string };
const EMPTY_BLOCK_FORM: BlockForm = { name: '', visibility: 'public', firstAdminUsername: '' };

type RosterRow = { voting_block_member_id: string; user_id: string; is_admin: boolean; username: string };

export function VotingBlocksTab({ onToast }: { onToast: (m: string) => void }) {
  const { user } = useAuth();
  const [blocks, setBlocks] = useState<VotingBlock[]>([]);
  const [memberCounts, setMemberCounts] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [form, setForm] = useState<BlockForm>(EMPTY_BLOCK_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [expandedBlockId, setExpandedBlockId] = useState<string | null>(null);
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [addAdminUsername, setAddAdminUsername] = useState('');
  const [addAdminError, setAddAdminError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadBlocks = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('voting_blocks').select('*').order('created_at', { ascending: false });
    const list = (data ?? []) as VotingBlock[];
    setBlocks(list);

    if (list.length > 0) {
      const { data: memberRows } = await supabase
        .from('voting_block_members')
        .select('voting_block_id')
        .in('voting_block_id', list.map((b) => b.voting_block_id));
      const counts = new Map<string, number>();
      for (const row of (memberRows ?? []) as { voting_block_id: string }[]) {
        counts.set(row.voting_block_id, (counts.get(row.voting_block_id) ?? 0) + 1);
      }
      setMemberCounts(counts);
    } else {
      setMemberCounts(new Map());
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadBlocks();
  }, [loadBlocks]);

  function openAddBlock() {
    setEditingBlockId(null);
    setForm(EMPTY_BLOCK_FORM);
    setFormError(null);
    setFormOpen(true);
  }

  function openEditBlock(b: VotingBlock) {
    setEditingBlockId(b.voting_block_id);
    setForm({ name: b.name, visibility: b.visibility, firstAdminUsername: '' });
    setFormError(null);
    setFormOpen(true);
  }

  async function saveBlock() {
    if (!form.name.trim()) {
      setFormError('Please enter a name.');
      return;
    }
    if (!editingBlockId && !form.firstAdminUsername.trim()) {
      setFormError("Please enter the username of this block's first admin.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (editingBlockId) {
        const { error } = await supabase
          .from('voting_blocks')
          .update({ name: form.name.trim(), visibility: form.visibility })
          .eq('voting_block_id', editingBlockId);
        if (error) throw error;
      } else {
        const { data: targetUser, error: lookupErr } = await supabase
          .from('users')
          .select('user_id')
          .eq('username', form.firstAdminUsername.trim())
          .maybeSingle();
        if (lookupErr) throw lookupErr;
        if (!targetUser) {
          setFormError(`No user found with username "${form.firstAdminUsername.trim()}".`);
          setSaving(false);
          return;
        }

        const { data: newBlock, error: insertErr } = await supabase
          .from('voting_blocks')
          .insert({ name: form.name.trim(), visibility: form.visibility, created_by: user?.id ?? null })
          .select()
          .single();
        if (insertErr) throw insertErr;

        const { error: memberErr } = await supabase
          .from('voting_block_members')
          .insert({ voting_block_id: newBlock.voting_block_id, user_id: targetUser.user_id, is_admin: true });
        if (memberErr) throw memberErr;
      }
      setFormOpen(false);
      setEditingBlockId(null);
      await loadBlocks();
      onToast('Voting block saved.');
    } catch (err) {
      const msg = extractMsg(err);
      await logError({ action: 'admin_voting_block_save', userId: user?.id, errorMessage: msg });
      setFormError(msg);
    } finally {
      setSaving(false);
    }
  }

  async function loadRoster(blockId: string) {
    setRosterLoading(true);
    try {
      const { data, error } = await supabase
        .from('voting_block_members')
        .select('voting_block_member_id, user_id, is_admin, users(username)')
        .eq('voting_block_id', blockId)
        .order('joined_at', { ascending: true });
      if (error) throw error;
      const rows: RosterRow[] = ((data ?? []) as unknown as { voting_block_member_id: string; user_id: string; is_admin: boolean; users: { username: string } | null }[])
        .map((r) => ({
          voting_block_member_id: r.voting_block_member_id,
          user_id: r.user_id,
          is_admin: r.is_admin,
          username: r.users?.username ?? '(unknown)',
        }));
      setRoster(rows);
    } catch (err) {
      await logError({ action: 'admin_voting_block_roster', userId: user?.id, errorMessage: extractMsg(err) });
      setRoster([]);
    } finally {
      setRosterLoading(false);
    }
  }

  function toggleExpand(blockId: string) {
    if (expandedBlockId === blockId) {
      setExpandedBlockId(null);
      return;
    }
    setExpandedBlockId(blockId);
    setAddAdminUsername('');
    setAddAdminError(null);
    loadRoster(blockId);
  }

  async function toggleMemberAdmin(row: RosterRow) {
    try {
      const { error } = await supabase
        .from('voting_block_members')
        .update({ is_admin: !row.is_admin })
        .eq('voting_block_member_id', row.voting_block_member_id);
      if (error) throw error;
      if (expandedBlockId) await loadRoster(expandedBlockId);
      await loadBlocks();
    } catch (err) {
      await logError({ action: 'admin_voting_block_toggle_admin', userId: user?.id, errorMessage: extractMsg(err) });
      onToast("Couldn't update admin status.");
    }
  }

  async function removeMember(row: RosterRow) {
    try {
      const { error } = await supabase
        .from('voting_block_members')
        .delete()
        .eq('voting_block_member_id', row.voting_block_member_id);
      if (error) throw error;
      if (expandedBlockId) await loadRoster(expandedBlockId);
      await loadBlocks();
      onToast('Member removed.');
    } catch (err) {
      await logError({ action: 'admin_voting_block_remove_member', userId: user?.id, errorMessage: extractMsg(err) });
      onToast("Couldn't remove member.");
    }
  }

  async function addAdminByUsername(blockId: string) {
    if (!addAdminUsername.trim()) return;
    setAddAdminError(null);
    try {
      const { data: targetUser, error: lookupErr } = await supabase
        .from('users')
        .select('user_id')
        .eq('username', addAdminUsername.trim())
        .maybeSingle();
      if (lookupErr) throw lookupErr;
      if (!targetUser) {
        setAddAdminError(`No user found with username "${addAdminUsername.trim()}".`);
        return;
      }
      const { error: upsertErr } = await supabase
        .from('voting_block_members')
        .upsert(
          { voting_block_id: blockId, user_id: targetUser.user_id, is_admin: true },
          { onConflict: 'voting_block_id,user_id' }
        );
      if (upsertErr) throw upsertErr;
      setAddAdminUsername('');
      await loadRoster(blockId);
      await loadBlocks();
      onToast('Admin added.');
    } catch (err) {
      const msg = extractMsg(err);
      await logError({ action: 'admin_voting_block_add_admin', userId: user?.id, errorMessage: msg });
      setAddAdminError(msg);
    }
  }

  async function regenerateCode(blockId: string) {
    setRegenerating(true);
    try {
      const { error } = await supabase.rpc('regenerate_voting_block_join_code' as never, { p_block_id: blockId } as never);
      if (error) throw error;
      await loadBlocks();
      onToast('Join code regenerated.');
    } catch (err) {
      await logError({ action: 'admin_voting_block_regen_code', userId: user?.id, errorMessage: extractMsg(err) });
      onToast("Couldn't regenerate join code.");
    } finally {
      setRegenerating(false);
    }
  }

  function copyCode(code: string, blockId: string) {
    navigator.clipboard.writeText(code).then(() => {
      setCopiedId(blockId);
      setTimeout(() => setCopiedId((cur) => (cur === blockId ? null : cur)), 1500);
    });
  }

  return (
    <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E2E8E4', overflow: 'hidden' }}>
      <div style={{ padding: '12px 14px', borderBottom: '1px solid #F4F6F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.6px', color: '#94a3b8' }}>Voting Blocks</span>
        <button onClick={openAddBlock}
          style={{ background: '#1B4332', color: 'white', border: 'none', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
          Add Voting Block
        </button>
      </div>

      {formOpen && (
        <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid #F4F6F0', background: '#FAFCFB' }}>
          <FormField label="Name *">
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} style={inputStyle} placeholder="e.g. Local 42 Union" />
          </FormField>
          <FormField label="Position visibility *">
            <select value={form.visibility} onChange={(e) => setForm((f) => ({ ...f, visibility: e.target.value as 'public' | 'private' }))} style={inputStyle}>
              <option value="public">Public — anyone can see this block's per-bill positions</option>
              <option value="private">Private — only members can see this block's positions</option>
            </select>
          </FormField>
          {!editingBlockId && (
            <FormField label="First admin's username *">
              <input
                value={form.firstAdminUsername}
                onChange={(e) => setForm((f) => ({ ...f, firstAdminUsername: e.target.value }))}
                style={inputStyle}
                placeholder="Existing UVote username"
              />
            </FormField>
          )}
          {formError && <p style={{ fontSize: 11, color: '#F0455A', marginBottom: 8 }}>{formError}</p>}
          <button onClick={saveBlock} disabled={saving}
            style={{ width: '100%', background: '#1B4332', color: 'white', border: 'none', borderRadius: 10, padding: 13, fontSize: 13, fontWeight: 700, cursor: 'pointer', marginBottom: 8 }}>
            {saving ? 'Saving…' : 'Save Voting Block'}
          </button>
          <button onClick={() => { setFormOpen(false); setFormError(null); }}
            style={{ width: '100%', background: 'white', color: '#64748b', border: '1px solid #E2E8E4', borderRadius: 10, padding: 13, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
      )}

      {loading ? (
        <div style={{ padding: 20, textAlign: 'center', fontSize: 12, color: '#94a3b8' }}>Loading…</div>
      ) : blocks.length === 0 ? (
        <div style={{ padding: 20, textAlign: 'center', fontSize: 12, color: '#94a3b8' }}>No voting blocks yet.</div>
      ) : (
        blocks.map((b, i) => {
          const isExpanded = expandedBlockId === b.voting_block_id;
          const count = memberCounts.get(b.voting_block_id) ?? 0;
          return (
            <div key={b.voting_block_id} style={{ borderBottom: i < blocks.length - 1 || isExpanded ? '1px solid #F4F6F0' : 'none' }}>
              <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <button
                  onClick={() => toggleExpand(b.voting_block_id)}
                  style={{ flex: 1, minWidth: 0, background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', minHeight: 'unset' }}
                >
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#0f1724' }}>{b.name}</span>
                  <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 8 }}>{formatNumber(count)} member{count === 1 ? '' : 's'}</span>
                  <div style={{ display: 'flex', gap: 4, marginTop: 3 }}>
                    <span style={{
                      fontSize: 9, fontWeight: 700, textTransform: 'uppercase', padding: '1px 6px', borderRadius: 8,
                      background: b.visibility === 'public' ? '#E8F0EB' : '#F1F5F9',
                      color: b.visibility === 'public' ? '#1B4332' : '#475569',
                    }}>
                      {b.visibility}
                    </span>
                    {!b.is_active && (
                      <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', padding: '1px 6px', borderRadius: 8, background: '#FEF0EF', color: '#c0392b' }}>
                        Inactive — no admin
                      </span>
                    )}
                  </div>
                </button>
                <button onClick={() => openEditBlock(b)}
                  style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer', color: '#1B4332', minHeight: 'unset' }}>
                  <i className="fa-solid fa-pen" style={{ fontSize: 14 }} />
                </button>
                <button onClick={() => toggleExpand(b.voting_block_id)}
                  style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer', color: '#94a3b8', minHeight: 'unset' }}>
                  <i className={`fa-solid fa-chevron-${isExpanded ? 'up' : 'down'}`} style={{ fontSize: 12 }} />
                </button>
              </div>

              {isExpanded && (
                <div style={{ padding: '4px 14px 14px', background: '#FAFCFB' }}>
                  {/* Join code */}
                  <div style={{ background: 'white', border: '1px solid #E2E8E4', borderRadius: 8, padding: 10, marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div>
                      <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#94a3b8', display: 'block', marginBottom: 2 }}>Join code</span>
                      <span style={{ fontSize: 15, fontWeight: 900, color: '#0f1724', letterSpacing: '1px', fontFamily: 'monospace' }}>{b.join_code}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => copyCode(b.join_code, b.voting_block_id)}
                        style={{ background: '#F4F6F0', color: '#1B4332', border: '1px solid #E2E8E4', borderRadius: 6, padding: '6px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                        {copiedId === b.voting_block_id ? 'Copied' : 'Copy'}
                      </button>
                      <button onClick={() => regenerateCode(b.voting_block_id)} disabled={regenerating}
                        style={{ background: '#F4F6F0', color: '#1B4332', border: '1px solid #E2E8E4', borderRadius: 6, padding: '6px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                        Regenerate
                      </button>
                    </div>
                  </div>

                  {/* Roster */}
                  <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#94a3b8', display: 'block', marginBottom: 6 }}>
                    Members (staff-only view — never shown to other block members)
                  </span>
                  {rosterLoading ? (
                    <p style={{ fontSize: 12, color: '#94a3b8' }}>Loading…</p>
                  ) : roster.length === 0 ? (
                    <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 10 }}>No members yet.</p>
                  ) : (
                    <div style={{ background: 'white', border: '1px solid #E2E8E4', borderRadius: 8, overflow: 'hidden', marginBottom: 10 }}>
                      {roster.map((r, ri) => (
                        <div key={r.voting_block_member_id} style={{
                          padding: '8px 10px', borderBottom: ri < roster.length - 1 ? '1px solid #F4F6F0' : 'none',
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                        }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: '#0f1724' }}>
                            {r.username}
                            {r.is_admin && (
                              <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: '#7A4F00', background: '#FFF3D6', padding: '1px 6px', borderRadius: 8 }}>
                                Admin
                              </span>
                            )}
                          </span>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={() => toggleMemberAdmin(r)}
                              style={{ background: 'none', border: 'none', padding: 0, fontSize: 11, fontWeight: 700, color: '#1B4332', cursor: 'pointer', minHeight: 'unset' }}>
                              {r.is_admin ? 'Remove admin' : 'Make admin'}
                            </button>
                            <button onClick={() => removeMember(r)}
                              style={{ background: 'none', border: 'none', padding: 0, fontSize: 11, fontWeight: 700, color: '#F0455A', cursor: 'pointer', minHeight: 'unset' }}>
                              Remove
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add admin by username */}
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      value={addAdminUsername}
                      onChange={(e) => setAddAdminUsername(e.target.value)}
                      style={{ ...inputStyle, flex: 1 }}
                      placeholder="Add admin by username"
                    />
                    <button onClick={() => addAdminByUsername(b.voting_block_id)}
                      style={{ background: '#1B4332', color: 'white', border: 'none', borderRadius: 8, padding: '9px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                      Add
                    </button>
                  </div>
                  {addAdminError && <p style={{ fontSize: 11, color: '#F0455A', marginTop: 6 }}>{addAdminError}</p>}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
