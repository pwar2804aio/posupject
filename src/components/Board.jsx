import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

const PRIORITY_STYLES = {
  P0: 'bg-red-500/20 text-red-300 border-red-500/30',
  P1: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  P2: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  P3: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
};
const TYPE_ICON = { feature:'✨', bug:'🐛', task:'📋', chore:'🧹' };

export default function Board({ project, profile, onOpenItem }) {
  const [buckets, setBuckets] = useState([]);
  const [items, setItems]     = useState([]);
  const [members, setMembers] = useState([]);
  const [filter, setFilter]   = useState({ priority:'all', type:'all', assignee:'all', search:'' });
  const [adding, setAdding]   = useState(null);
  const [dragItem, setDragItem] = useState(null);

  const canWrite = profile.role === 'owner' || profile.role === 'editor';

  useEffect(() => { load(); }, [project.id]);

  useEffect(() => {
    const ch = supabase.channel('board-' + project.id)
      .on('postgres_changes', { event:'*', schema:'public', table:'items',   filter:`project_id=eq.${project.id}` }, load)
      .on('postgres_changes', { event:'*', schema:'public', table:'buckets', filter:`project_id=eq.${project.id}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [project.id]);

  const load = async () => {
    const [b, i, m] = await Promise.all([
      supabase.from('buckets').select('*').eq('project_id', project.id).order('position'),
      supabase.from('items').select('*').eq('project_id', project.id).order('position'),
      supabase.from('profiles').select('id, email, display_name'),
    ]);
    setBuckets(b.data || []);
    setItems(i.data || []);
    setMembers(m.data || []);
  };

  const filtered = useMemo(() => items.filter(i => {
    if (filter.priority !== 'all' && i.priority !== filter.priority) return false;
    if (filter.type     !== 'all' && i.type     !== filter.type)     return false;
    if (filter.assignee === 'me'  && i.assignee_id !== profile.id)   return false;
    if (filter.assignee === 'unassigned' && i.assignee_id)           return false;
    if (filter.search && !i.title.toLowerCase().includes(filter.search.toLowerCase())) return false;
    return true;
  }), [items, filter, profile.id]);

  const itemsByBucket = useMemo(() => {
    const map = {};
    buckets.forEach(b => { map[b.id] = []; });
    filtered.forEach(i => { if (map[i.bucket_id]) map[i.bucket_id].push(i); });
    return map;
  }, [buckets, filtered]);

  const addItem = async (bucketId, title) => {
    if (!title.trim()) return;
    const pos = (itemsByBucket[bucketId]?.length || 0);
    const { data: item } = await supabase.from('items').insert({
      project_id: project.id, bucket_id: bucketId, title: title.trim(), position: pos, created_by: profile.id,
    }).select().single();
    if (item) {
      await supabase.from('activity').insert({
        item_id: item.id, project_id: project.id, actor_id: profile.id, action: 'created',
        detail: { title: item.title },
      });
    }
    setAdding(null);
    load();
  };

  const onDragStart = (e, item) => {
    setDragItem(item);
    e.dataTransfer.effectAllowed = 'move';
  };
  const onDragOver = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; };
  const onDrop = async (e, bucketId) => {
    e.preventDefault();
    if (!dragItem || dragItem.bucket_id === bucketId) { setDragItem(null); return; }
    const bucket = buckets.find(b => b.id === bucketId);
    await supabase.from('items').update({
      bucket_id: bucketId,
      closed_at: bucket?.is_done ? new Date().toISOString() : null,
    }).eq('id', dragItem.id);
    await supabase.from('activity').insert({
      item_id: dragItem.id, project_id: project.id, actor_id: profile.id, action: 'moved',
      detail: { from: dragItem.bucket_id, to: bucketId, bucket_name: bucket?.name },
    });
    setDragItem(null);
    load();
  };

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 py-4 border-b border-bdr flex items-center gap-3">
        <div className="text-2xl">{project.icon}</div>
        <div className="flex-1 min-w-0">
          <div className="text-lg font-bold text-text truncate">{project.name}</div>
          <div className="text-xs text-dim">{items.length} items · {buckets.length} buckets</div>
        </div>
      </div>

      <div className="px-6 py-3 border-b border-bdr flex items-center gap-2 flex-wrap">
        <input value={filter.search} onChange={e => setFilter({ ...filter, search: e.target.value })}
          placeholder="Search items…"
          className="px-3 py-1.5 bg-card border border-bdr rounded text-sm text-text placeholder-dim focus:outline-none focus:border-accent w-48"/>
        <Select value={filter.priority} onChange={v => setFilter({ ...filter, priority: v })}
          options={[['all','All priorities'],['P0','P0'],['P1','P1'],['P2','P2'],['P3','P3']]}/>
        <Select value={filter.type} onChange={v => setFilter({ ...filter, type: v })}
          options={[['all','All types'],['feature','Features'],['bug','Bugs'],['task','Tasks'],['chore','Chores']]}/>
        <Select value={filter.assignee} onChange={v => setFilter({ ...filter, assignee: v })}
          options={[['all','Everyone'],['me','Mine only'],['unassigned','Unassigned']]}/>
        {(filter.priority!=='all' || filter.type!=='all' || filter.assignee!=='all' || filter.search) && (
          <button onClick={() => setFilter({ priority:'all', type:'all', assignee:'all', search:'' })}
            className="px-2 py-1.5 text-xs text-muted hover:text-text">clear</button>
        )}
      </div>

      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <div className="h-full flex gap-3 px-6 py-4 min-w-max">
          {buckets.map(b => (
            <div key={b.id} className="w-72 shrink-0 flex flex-col bg-card/50 border border-bdr rounded-xl overflow-hidden"
              onDragOver={onDragOver} onDrop={e => onDrop(e, b.id)}>
              <div className="px-3 py-2.5 border-b border-bdr flex items-center gap-2" style={{ borderLeft: `3px solid ${b.color}` }}>
                <div className="text-xs font-bold uppercase tracking-wide text-text">{b.name}</div>
                <div className="text-xs text-dim">{itemsByBucket[b.id]?.length || 0}</div>
                {canWrite && (
                  <button onClick={() => setAdding(b.id)} className="ml-auto text-muted hover:text-text text-sm" title="Add item">+</button>
                )}
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {adding === b.id && (
                  <InlineAdd onAdd={t => addItem(b.id, t)} onCancel={() => setAdding(null)}/>
                )}
                {(itemsByBucket[b.id] || []).map(i => (
                  <Card key={i.id} item={i} members={members}
                    onClick={() => onOpenItem(i.id)}
                    onDragStart={e => onDragStart(e, i)}
                    draggable={canWrite}/>
                ))}
                {!(itemsByBucket[b.id] || []).length && !adding && (
                  <div className="text-xs text-dim italic px-2 py-4 text-center">Empty</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Card({ item, members, onClick, onDragStart, draggable }) {
  const assignee = members.find(m => m.id === item.assignee_id);
  return (
    <div draggable={draggable} onDragStart={onDragStart} onClick={onClick}
      className="bg-panel border border-bdr rounded-lg p-3 cursor-pointer hover:border-dim transition">
      <div className="flex items-start gap-2 mb-2">
        <span className="text-sm">{TYPE_ICON[item.type] || TYPE_ICON.task}</span>
        <div className="text-sm text-text flex-1 min-w-0 leading-snug">{item.title}</div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded border ${PRIORITY_STYLES[item.priority]}`}>{item.priority}</span>
        {(item.labels || []).slice(0,3).map(l => (
          <span key={l} className="px-1.5 py-0.5 text-[9px] bg-card border border-bdr rounded text-muted">{l}</span>
        ))}
        {assignee && (
          <span className="ml-auto w-5 h-5 rounded-full bg-accent text-white text-[10px] font-bold flex items-center justify-center" title={assignee.display_name || assignee.email}>
            {(assignee.display_name || assignee.email)[0].toUpperCase()}
          </span>
        )}
      </div>
    </div>
  );
}

function InlineAdd({ onAdd, onCancel }) {
  const [t, setT] = useState('');
  return (
    <form onSubmit={e => { e.preventDefault(); onAdd(t); setT(''); }}>
      <input value={t} onChange={e => setT(e.target.value)} autoFocus
        onKeyDown={e => { if (e.key === 'Escape') onCancel(); }}
        placeholder="New item title…"
        className="w-full px-2 py-1.5 bg-panel border border-accent rounded text-sm text-text placeholder-dim focus:outline-none"/>
    </form>
  );
}

function Select({ value, onChange, options }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="px-2 py-1.5 bg-card border border-bdr rounded text-sm text-text focus:outline-none focus:border-accent">
      {options.map(([v,l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}
