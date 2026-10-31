'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createBrowserClientApp } from '@/lib/supabase/client';
import { loadLocalLedger, setActiveFarmScope } from '@/lib/local-store';

type FarmOption = {
  id: string;
  name: string;
  ownerUserId: string | null;
  role: string;
};

type Member = {
  user_id: string;
  role: 'owner' | 'manager' | 'staff' | 'viewer';
};

const ROLES = ['manager', 'staff', 'viewer'] as const;

export default function FarmSwitcher() {
  const [farms, setFarms] = useState<FarmOption[]>([]);
  const [activeId, setActiveId] = useState('');
  const [userId, setUserId] = useState('');
  const [members, setMembers] = useState<Member[]>([]);
  const [farmName, setFarmName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<(typeof ROLES)[number]>('staff');
  const [inviteCode, setInviteCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const activeFarm = useMemo(() => farms.find((farm) => farm.id === activeId) ?? farms[0] ?? null, [farms, activeId]);
  const canManage = activeFarm?.role === 'owner' || activeFarm?.role === 'manager';
  const isOwner = activeFarm?.role === 'owner';

  const refresh = useCallback(async () => {
    const sb = createBrowserClientApp();
    const { data: auth } = await sb.auth.getUser();
    const user = auth.user;
    if (!user) return;
    setUserId(user.id);

    // Load once so the local-store remembers which account owns its farm key.
    await loadLocalLedger().catch(() => null);

    const { data: farmRows, error: farmError } = await sb
      .from('farms')
      .select('id, name, user_id, created_at')
      .order('created_at', { ascending: true });
    if (farmError) throw new Error('Could not load your available farms: ' + farmError.message);

    const { data: memberships, error: membershipError } = await sb
      .from('farm_memberships')
      .select('farm_id, user_id, role')
      .eq('user_id', user.id);

    const nextFarms = (farmRows ?? []).map((farm) => {
      const membership = (memberships ?? []).find((item) => item.farm_id === farm.id && item.user_id === user.id);
      const fallbackRole = farm.user_id === user.id ? 'owner' : 'viewer';
      return {
        id: String(farm.id),
        name: String(farm.name || 'My Piggery'),
        ownerUserId: farm.user_id ? String(farm.user_id) : null,
        role: String(membership?.role ?? fallbackRole)
      };
    });
    setFarms(nextFarms);

    const storedActive = window.localStorage.getItem('pig-ledger-active-farm:' + user.id);
    const selected = nextFarms.find((farm) => farm.id === storedActive) ?? nextFarms[0] ?? null;
    if (selected) {
      setActiveId(selected.id);
      setActiveFarmScope(selected.id);
      const { data: farmMembers } = await sb
        .from('farm_memberships')
        .select('user_id, role')
        .eq('farm_id', selected.id)
        .order('created_at', { ascending: true });
      if (!membershipError && farmMembers) setMembers(farmMembers as Member[]);
      else setMembers([]);
    } else {
      setActiveId('');
      setMembers([]);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    refresh().catch((err) => {
      if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load farms.');
    });
    return () => { cancelled = true; };
  }, [refresh]);

  async function switchFarm(farmId: string) {
    if (!farmId || farmId === activeId) return;
    await loadLocalLedger().catch(() => null);
    setActiveFarmScope(farmId);
    setActiveId(farmId);
    window.location.reload();
  }

  async function createFarm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = farmName.trim();
    if (!name || !userId) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const sb = createBrowserClientApp();
      const { data, error: createError } = await sb.from('farms')
        .insert({ name, pig_count: 0, user_id: userId })
        .select('id')
        .single();
      if (createError) throw createError;
      await loadLocalLedger().catch(() => null);
      setActiveFarmScope(String(data.id));
      setFarmName('');
      setNotice('Farm created. Switching to it…');
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create this farm.');
    } finally {
      setBusy(false);
    }
  }

  async function createInvitation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeFarm || !userId || !inviteEmail.trim()) return;
    setBusy(true);
    setError('');
    setNotice('');
    setInviteCode('');
    try {
      const sb = createBrowserClientApp();
      const { data, error: inviteError } = await sb.from('farm_invitations').insert({
        farm_id: activeFarm.id,
        invite_email: inviteEmail.trim().toLowerCase(),
        role: inviteRole,
        invited_by: userId
      }).select('invite_code').single();
      if (inviteError) throw inviteError;
      setInviteCode(String(data.invite_code));
      setNotice('Invitation created. Share this code only with the invited email address.');
      setInviteEmail('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the invitation. Check the database migration and your role.');
    } finally {
      setBusy(false);
    }
  }

  async function acceptInvitation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = joinCode.trim();
    if (!code) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const sb = createBrowserClientApp();
      const { data, error: joinError } = await sb.rpc('accept_farm_invitation', { p_invite_code: code });
      if (joinError) throw joinError;
      const farmId = String(data ?? '');
      if (!farmId) throw new Error('The invitation did not return a farm.');
      await loadLocalLedger().catch(() => null);
      setActiveFarmScope(farmId);
      setNotice('Invitation accepted. Switching to the new farm…');
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not accept the invitation.');
    } finally {
      setBusy(false);
    }
  }

  async function updateRole(memberUserId: string, role: (typeof ROLES)[number]) {
    if (!activeFarm || !isOwner || memberUserId === userId) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const sb = createBrowserClientApp();
      const { error: roleError } = await sb.rpc('update_farm_member_role', {
        p_farm_id: activeFarm.id,
        p_member_user_id: memberUserId,
        p_role: role
      });
      if (roleError) throw roleError;
      setNotice('Member role updated.');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update member role.');
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(memberUserId: string) {
    if (!activeFarm || !isOwner || memberUserId === userId) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const sb = createBrowserClientApp();
      const { error: removeError } = await sb.rpc('remove_farm_member', {
        p_farm_id: activeFarm.id,
        p_member_user_id: memberUserId
      });
      if (removeError) throw removeError;
      setMembers((current) => current.filter((member) => member.user_id !== memberUserId));
      setNotice('Member removed from this farm.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove this member.');
    } finally {
      setBusy(false);
    }
  }

  if (!userId) return null;

  return (
    <details className="relative" open={expanded} onToggle={(event) => setExpanded((event.currentTarget as HTMLDetailsElement).open)}>
      <summary className="flex max-w-[150px] cursor-pointer list-none flex-col items-start rounded-lg border border-slate-200 px-2 py-1.5 text-left hover:bg-slate-50">
        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Active farm</span>
        <span className="w-full truncate text-xs font-semibold text-slate-800">{activeFarm?.name ?? 'Choose farm'}</span>
      </summary>
      <div className="absolute right-0 z-50 mt-2 max-h-[75vh] w-[min(92vw,360px)] overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
        {error ? <p role="alert" className="mb-2 rounded-lg bg-rose-50 p-2 text-xs text-rose-700">{error}</p> : null}
        {notice ? <p role="status" className="mb-2 rounded-lg bg-emerald-50 p-2 text-xs text-emerald-800">{notice}</p> : null}

        <div className="space-y-2">
          <label className="block"><span className="label">Switch farm</span>
            <select className="input" value={activeFarm?.id ?? ''} onChange={(event) => switchFarm(event.target.value)} disabled={busy || farms.length === 0}>
              {farms.map((farm) => <option key={farm.id} value={farm.id}>{farm.name} · {farm.role}</option>)}
            </select>
          </label>
          <form onSubmit={createFarm} className="flex gap-2">
            <input className="input min-w-0 flex-1" value={farmName} onChange={(event) => setFarmName(event.target.value)} placeholder="New farm name" aria-label="New farm name" />
            <button className="btn-secondary shrink-0" type="submit" disabled={busy || !farmName.trim()}>Create</button>
          </form>
        </div>

        <form onSubmit={acceptInvitation} className="mt-3 space-y-2 border-t border-slate-100 pt-3">
          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600">Join a farm</h3>
          <div className="flex gap-2">
            <input className="input min-w-0 flex-1" value={joinCode} onChange={(event) => setJoinCode(event.target.value)} placeholder="Invitation code" aria-label="Invitation code" />
            <button type="submit" className="btn-secondary shrink-0" disabled={busy || !joinCode.trim()}>Join</button>
          </div>
        </form>

        {canManage && activeFarm ? (
          <form onSubmit={createInvitation} className="mt-3 space-y-2 border-t border-slate-100 pt-3">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600">Invite a member</h3>
            <input className="input" type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="Their account email" required />
            <div className="flex gap-2">
              <select className="input min-w-0 flex-1" value={inviteRole} onChange={(event) => setInviteRole(event.target.value as (typeof ROLES)[number])}>
                {(isOwner ? ROLES : ['staff', 'viewer'] as const).map((role) => <option key={role} value={role}>{role}</option>)}
              </select>
              <button type="submit" className="btn-secondary shrink-0" disabled={busy || !inviteEmail.trim()}>Create code</button>
            </div>
            {inviteCode ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Share with the invited email address</p>
                <div className="mt-1 flex items-center gap-2">
                  <code className="min-w-0 flex-1 break-all text-xs">{inviteCode}</code>
                  <button type="button" className="text-xs font-semibold underline" onClick={() => navigator.clipboard?.writeText(inviteCode)}>Copy</button>
                </div>
              </div>
            ) : null}
          </form>
        ) : null}

        {isOwner && members.length > 0 ? (
          <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600">Farm members</h3>
            {members.map((member) => (
              <div key={member.user_id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-2 py-2">
                <div className="min-w-0">
                  <p className="truncate text-[11px] text-slate-600">Member · {member.user_id.slice(-8)}</p>
                  <p className="text-[10px] font-semibold uppercase text-slate-400">{member.role}{member.user_id === userId ? ' · You' : ''}</p>
                </div>
                {member.role !== 'owner' && member.user_id !== userId ? (
                  <div className="flex shrink-0 items-center gap-1">
                    <select aria-label="Member role" className="input !w-auto !py-1 text-xs" value={member.role} onChange={(event) => updateRole(member.user_id, event.target.value as (typeof ROLES)[number])} disabled={busy}>
                      {ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
                    </select>
                    <button type="button" className="text-xs font-semibold text-rose-700 underline" onClick={() => removeMember(member.user_id)} disabled={busy}>Remove</button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </details>
  );
}
