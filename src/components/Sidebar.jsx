import { useState } from 'react';
import { supabase } from '../lib/supabase';

export default function Sidebar({ profile, projects, activeProject, setActiveProject, view, setView, onSignOut, onRefresh }) {
  const [adding, setAdding] = useState(false);
  const [name, setName]     = useState('');
  const [icon, setIcon]     = useState('📦');
  const isOwner  = profile.role === 'owner';
  const canWrite = profile.role === 'owner' || profile.role === 'editor';

  const create = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'') + '-' + Math.random().toString(36).slice(2,6);
    const { data: p } = await supabase.from('projects').insert({
      name: name.trim(),
      slug, icon,
      created_by: profile.id,
    }).select().single();
    if (p) {
      // Seed default buckets
      const defaults = [
        { name: 'Backlog',     position: 0, color: '#64748b', is_done: false },
        { name: 'In Progress', position: 1, color: '#eab308', is_done: false },
        { name: 'Testing',     position: 2, color: '#3b82f6', is_done: false },
        { name: 'Shipped',     position: 3, color: '#10b981', is_done: true  },
      ];
      await supabase.from('buckets').insert(defaults.map(b => ({ ...b, project_id: p.id })));
      setActiveProject(p);
    }
    setName(''); setIcon('📦'); setAdding(false); onRefresh?.();
  };

  return (
    <aside className="w-64 shrink-0 bg-panel border-r border-bdr flex flex-col">
      <div className="px-4 py-4 border-b border-bdr">
        <div className="flex items-center gap-2">
          <div className="text-xl">🎯</div>
          <div className="font-bold text-text">Posupject</div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-3">
        <div className="flex items-center justify-between px-2 mb-2">
          <div className="text-[10px] font-bold uppercase tracking-wider text-dim">Projects</div>
          {canWrite && !adding && (
            <button onClick={() => setAdding(true)} className="text-muted hover:text-text text-sm" title="New project">+</button>
          )}
        </div>

        {adding && (
          <form onSubmit={create} className="mb-2 space-y-2 px-2">
            <div className="flex gap-2">
              <input value={icon} onChange={e => setIcon(e.target.value)} maxLength={2}
                className="w-10 px-2 py-1.5 bg-card border border-bdr rounded text-sm text-center"/>
              <input value={name} onChange={e => setName(e.target.value)} autoFocus placeholder="Project name"
                className="flex-1 px-2 py-1.5 bg-card border border-bdr rounded text-sm text-text"/>
            </div>
            <div className="flex gap-2">
              <button type="submit" className="flex-1 px-2 py-1.5 bg-accent text-white rounded text-xs font-semibold">Create</button>
              <button type="button" onClick={() => { setAdding(false); setName(''); }} className="flex-1 px-2 py-1.5 bg-card border border-bdr rounded text-xs text-muted">Cancel</button>
            </div>
          </form>
        )}

        <div className="space-y-0.5">
          {projects.map(p => {
            const active = activeProject?.id === p.id && view === 'board';
            return (
              <button key={p.id} onClick={() => setActiveProject(p)}
                className={`w-full px-3 py-2 text-left rounded-lg text-sm flex items-center gap-2 transition ${
                  active ? 'bg-card text-text' : 'text-muted hover:bg-card hover:text-text'
                }`}>
                <span>{p.icon}</span>
                <span className="truncate flex-1">{p.name}</span>
              </button>
            );
          })}
        </div>

        {isOwner && (
          <>
            <div className="border-t border-bdr my-4"/>
            <button onClick={() => setView('users')}
              className={`w-full px-3 py-2 text-left rounded-lg text-sm flex items-center gap-2 ${
                view === 'users' ? 'bg-card text-text' : 'text-muted hover:bg-card hover:text-text'
              }`}>
              <span>👥</span>
              <span>Users</span>
            </button>
          </>
        )}
      </div>

      <div className="px-3 py-3 border-t border-bdr">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-7 h-7 rounded-full bg-accent flex items-center justify-center text-white text-xs font-bold">
            {(profile.display_name || profile.email)[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs text-text truncate">{profile.display_name || profile.email}</div>
            <div className="text-[10px] text-dim uppercase">{profile.role}</div>
          </div>
        </div>
        <button onClick={onSignOut} className="w-full px-2 py-1.5 text-xs text-muted hover:text-text border border-bdr rounded hover:bg-card transition">
          Sign out
        </button>
      </div>
    </aside>
  );
}
