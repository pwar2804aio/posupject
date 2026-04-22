import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export default function UsersPanel({ profile }) {
  const [users, setUsers] = useState([]);

  useEffect(() => { load(); }, []);

  const load = async () => {
    const { data } = await supabase.from('profiles').select('*').order('created_at');
    setUsers(data || []);
  };

  const changeRole = async (id, role) => {
    await supabase.from('profiles').update({ role }).eq('id', id);
    load();
  };

  if (profile.role !== 'owner') {
    return <div className="p-8 text-muted text-sm">Only owners can manage users.</div>;
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 py-4 border-b border-bdr">
        <div className="text-lg font-bold text-text">Users</div>
        <div className="text-xs text-dim">Manage who can access Posupject and what they can do.</div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl space-y-4">
          <div className="bg-card border border-bdr rounded-xl p-4">
            <div className="text-sm font-semibold text-text mb-2">➕ Invite a new user</div>
            <div className="text-xs text-muted leading-relaxed">
              New users sign themselves in via magic link on the login page. They'll get a default role of <span className="text-text">editor</span>, which lets them create and edit items.
              After they sign in, change their role below if needed.
            </div>
            <div className="text-xs text-dim mt-2">
              Share this URL with people you want to invite: <span className="text-text font-mono">{window.location.origin}</span>
            </div>
          </div>

          <div className="bg-card border border-bdr rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-bdr grid grid-cols-12 gap-3 text-[10px] font-bold uppercase tracking-wider text-dim">
              <div className="col-span-5">User</div>
              <div className="col-span-3">Role</div>
              <div className="col-span-4">Joined</div>
            </div>
            {users.map(u => (
              <div key={u.id} className="px-4 py-3 border-b border-bdr last:border-b-0 grid grid-cols-12 gap-3 items-center">
                <div className="col-span-5 flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 rounded-full bg-accent text-white text-xs font-bold flex items-center justify-center shrink-0">
                    {(u.display_name || u.email)[0].toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm text-text truncate">{u.display_name || u.email.split('@')[0]}</div>
                    <div className="text-xs text-dim truncate">{u.email}</div>
                  </div>
                </div>
                <div className="col-span-3">
                  {u.id === profile.id ? (
                    <span className="px-2 py-0.5 bg-accent/20 text-accent text-[10px] font-bold uppercase rounded">{u.role} (you)</span>
                  ) : (
                    <select value={u.role} onChange={e => changeRole(u.id, e.target.value)}
                      className="px-2 py-1 bg-panel border border-bdr rounded text-xs text-text">
                      <option value="owner">Owner</option>
                      <option value="editor">Editor</option>
                      <option value="viewer">Viewer</option>
                    </select>
                  )}
                </div>
                <div className="col-span-4 text-xs text-dim">
                  {new Date(u.created_at).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })}
                </div>
              </div>
            ))}
            {users.length === 0 && (
              <div className="px-4 py-8 text-center text-dim text-sm">No users yet.</div>
            )}
          </div>

          <div className="bg-card border border-bdr rounded-xl p-4 text-xs text-muted leading-relaxed">
            <div className="text-sm font-semibold text-text mb-2">Role permissions</div>
            <ul className="space-y-1 ml-4 list-disc">
              <li><span className="text-text">Owner:</span> manage users and roles + all editor permissions</li>
              <li><span className="text-text">Editor:</span> create/edit/delete projects, buckets, items, comments</li>
              <li><span className="text-text">Viewer:</span> read-only</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
