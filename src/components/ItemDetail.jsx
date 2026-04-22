import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { supabase } from '../lib/supabase';

export default function ItemDetail({ itemId, profile, onClose }) {
  const [item, setItem]       = useState(null);
  const [buckets, setBuckets] = useState([]);
  const [members, setMembers] = useState([]);
  const [comments, setComments] = useState([]);
  const [activity, setActivity] = useState([]);
  const [editing, setEditing]   = useState(false);
  const [draft, setDraft]       = useState({});
  const [newComment, setNewComment] = useState('');

  const canWrite = profile.role === 'owner' || profile.role === 'editor';

  useEffect(() => { load(); }, [itemId]);

  const load = async () => {
    const { data: i } = await supabase.from('items').select('*').eq('id', itemId).single();
    setItem(i);
    if (i) {
      const [b, m, c, a] = await Promise.all([
        supabase.from('buckets').select('*').eq('project_id', i.project_id).order('position'),
        supabase.from('profiles').select('id, email, display_name'),
        supabase.from('comments').select('*').eq('item_id', itemId).order('created_at'),
        supabase.from('activity').select('*').eq('item_id', itemId).order('created_at', { ascending: false }),
      ]);
      setBuckets(b.data || []);
      setMembers(m.data || []);
      setComments(c.data || []);
      setActivity(a.data || []);
    }
  };

  const startEdit = () => {
    setDraft({
      title: item.title,
      description: item.description || '',
      type: item.type,
      priority: item.priority,
      bucket_id: item.bucket_id,
      assignee_id: item.assignee_id || '',
      labels: (item.labels || []).join(', '),
      github_ref: item.github_ref || '',
      version_seen: item.version_seen || '',
      version_fixed: item.version_fixed || '',
    });
    setEditing(true);
  };

  const save = async () => {
    const patch = {
      title: draft.title,
      description: draft.description,
      type: draft.type,
      priority: draft.priority,
      bucket_id: draft.bucket_id,
      assignee_id: draft.assignee_id || null,
      labels: draft.labels.split(',').map(s => s.trim()).filter(Boolean),
      github_ref: draft.github_ref || null,
      version_seen: draft.version_seen || null,
      version_fixed: draft.version_fixed || null,
    };
    const bucketChanged = patch.bucket_id !== item.bucket_id;
    const newBucket = buckets.find(b => b.id === patch.bucket_id);
    if (bucketChanged && newBucket?.is_done) patch.closed_at = new Date().toISOString();
    if (bucketChanged && !newBucket?.is_done) patch.closed_at = null;

    await supabase.from('items').update(patch).eq('id', itemId);
    await supabase.from('activity').insert({
      item_id: itemId, project_id: item.project_id, actor_id: profile.id,
      action: bucketChanged ? 'moved' : 'edited', detail: { fields: Object.keys(patch) },
    });
    setEditing(false);
    load();
  };

  const del = async () => {
    if (!confirm('Delete this item? This cannot be undone.')) return;
    await supabase.from('items').delete().eq('id', itemId);
    onClose();
  };

  const addComment = async () => {
    if (!newComment.trim()) return;
    await supabase.from('comments').insert({
      item_id: itemId, author_id: profile.id, body: newComment.trim(),
    });
    await supabase.from('activity').insert({
      item_id: itemId, project_id: item.project_id, actor_id: profile.id, action: 'commented',
    });
    setNewComment('');
    load();
  };

  if (!item) return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center" onClick={onClose}>
      <div className="text-muted text-sm">Loading…</div>
    </div>
  );

  const currentBucket = buckets.find(b => b.id === item.bucket_id);
  const assignee = members.find(m => m.id === item.assignee_id);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex justify-end" onClick={onClose}>
      <div className="w-[640px] max-w-full h-full bg-panel border-l border-bdr flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-bdr flex items-center gap-3">
          <div className="text-xs text-dim font-mono">#{item.id.slice(0,8)}</div>
          <div className="flex-1"/>
          {canWrite && !editing && (
            <button onClick={startEdit} className="px-3 py-1.5 bg-card border border-bdr rounded text-xs text-muted hover:text-text">Edit</button>
          )}
          {canWrite && (
            <button onClick={del} className="px-3 py-1.5 bg-card border border-red-500/30 rounded text-xs text-red-400 hover:bg-red-500/10">Delete</button>
          )}
          <button onClick={onClose} className="text-muted hover:text-text text-lg px-2">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {editing ? (
            <EditForm draft={draft} setDraft={setDraft} buckets={buckets} members={members} onSave={save} onCancel={() => setEditing(false)}/>
          ) : (
            <>
              <div>
                <h1 className="text-xl font-bold text-text mb-3">{item.title}</h1>
                <div className="flex items-center gap-2 flex-wrap text-xs">
                  <Pill>{currentBucket?.name || '—'}</Pill>
                  <Pill>{item.type}</Pill>
                  <Pill>{item.priority}</Pill>
                  {assignee && <Pill>👤 {assignee.display_name || assignee.email}</Pill>}
                  {item.version_seen && <Pill>Seen {item.version_seen}</Pill>}
                  {item.version_fixed && <Pill>Fixed {item.version_fixed}</Pill>}
                  {item.github_ref && <Pill>🔗 {item.github_ref}</Pill>}
                </div>
                {(item.labels||[]).length > 0 && (
                  <div className="mt-2 flex gap-1 flex-wrap">
                    {item.labels.map(l => (
                      <span key={l} className="px-1.5 py-0.5 text-[10px] bg-card border border-bdr rounded text-muted">{l}</span>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-dim mb-2">Description</div>
                <div className="text-sm text-text prose-tight">
                  {item.description ? (
                    <ReactMarkdown>{item.description}</ReactMarkdown>
                  ) : (
                    <div className="text-dim italic">No description yet.</div>
                  )}
                </div>
              </div>

              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-dim mb-2">Comments ({comments.length})</div>
                <div className="space-y-3">
                  {comments.map(c => {
                    const a = members.find(m => m.id === c.author_id);
                    return (
                      <div key={c.id} className="bg-card rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1.5">
                          <div className="w-5 h-5 rounded-full bg-accent text-white text-[10px] font-bold flex items-center justify-center">
                            {(a?.display_name || a?.email || '?')[0].toUpperCase()}
                          </div>
                          <div className="text-xs text-text">{a?.display_name || a?.email || 'Unknown'}</div>
                          <div className="text-xs text-dim">· {timeAgo(c.created_at)}</div>
                        </div>
                        <div className="text-sm text-text prose-tight pl-7">
                          <ReactMarkdown>{c.body}</ReactMarkdown>
                        </div>
                      </div>
                    );
                  })}
                  {canWrite && (
                    <div className="space-y-2">
                      <textarea value={newComment} onChange={e => setNewComment(e.target.value)}
                        rows={3} placeholder="Leave a comment… markdown supported"
                        className="w-full px-3 py-2 bg-card border border-bdr rounded text-sm text-text placeholder-dim focus:outline-none focus:border-accent resize-none"/>
                      <button onClick={addComment} disabled={!newComment.trim()}
                        className="px-3 py-1.5 bg-accent text-white rounded text-xs font-semibold disabled:opacity-50">Post</button>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-dim mb-2">Activity</div>
                <div className="space-y-1.5">
                  {activity.map(a => {
                    const who = members.find(m => m.id === a.actor_id);
                    return (
                      <div key={a.id} className="text-xs text-muted flex gap-2">
                        <span className="text-text">{who?.display_name || who?.email || '?'}</span>
                        <span>{a.action}{a.detail?.bucket_name ? ` → ${a.detail.bucket_name}` : ''}</span>
                        <span className="text-dim ml-auto">{timeAgo(a.created_at)}</span>
                      </div>
                    );
                  })}
                  {activity.length === 0 && <div className="text-xs text-dim italic">No activity yet.</div>}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Pill({ children }) {
  return <span className="px-2 py-0.5 bg-card border border-bdr rounded text-muted text-[10px]">{children}</span>;
}

function timeAgo(ts) {
  const d = (Date.now() - new Date(ts).getTime()) / 1000;
  if (d < 60) return 'just now';
  if (d < 3600) return Math.floor(d/60) + 'm ago';
  if (d < 86400) return Math.floor(d/3600) + 'h ago';
  return Math.floor(d/86400) + 'd ago';
}

function EditForm({ draft, setDraft, buckets, members, onSave, onCancel }) {
  const set = (k, v) => setDraft({ ...draft, [k]: v });
  const input = "w-full px-3 py-2 bg-card border border-bdr rounded text-sm text-text placeholder-dim focus:outline-none focus:border-accent";
  const label = "text-[10px] font-bold uppercase tracking-wider text-dim mb-1 block";
  return (
    <div className="space-y-4">
      <div>
        <label className={label}>Title</label>
        <input className={input} value={draft.title} onChange={e => set('title', e.target.value)}/>
      </div>
      <div>
        <label className={label}>Description (markdown)</label>
        <textarea className={input + ' resize-none font-mono'} rows={8} value={draft.description} onChange={e => set('description', e.target.value)}/>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label}>Bucket</label>
          <select className={input} value={draft.bucket_id} onChange={e => set('bucket_id', e.target.value)}>
            {buckets.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div>
          <label className={label}>Type</label>
          <select className={input} value={draft.type} onChange={e => set('type', e.target.value)}>
            <option value="feature">Feature</option>
            <option value="bug">Bug</option>
            <option value="task">Task</option>
            <option value="chore">Chore</option>
          </select>
        </div>
        <div>
          <label className={label}>Priority</label>
          <select className={input} value={draft.priority} onChange={e => set('priority', e.target.value)}>
            <option value="P0">P0 — critical</option>
            <option value="P1">P1 — high</option>
            <option value="P2">P2 — normal</option>
            <option value="P3">P3 — low</option>
          </select>
        </div>
        <div>
          <label className={label}>Assignee</label>
          <select className={input} value={draft.assignee_id} onChange={e => set('assignee_id', e.target.value)}>
            <option value="">Unassigned</option>
            {members.map(m => <option key={m.id} value={m.id}>{m.display_name || m.email}</option>)}
          </select>
        </div>
        <div>
          <label className={label}>Version seen</label>
          <input className={input} value={draft.version_seen} onChange={e => set('version_seen', e.target.value)} placeholder="e.g. 4.6.25"/>
        </div>
        <div>
          <label className={label}>Version fixed</label>
          <input className={input} value={draft.version_fixed} onChange={e => set('version_fixed', e.target.value)}/>
        </div>
      </div>
      <div>
        <label className={label}>Labels (comma-separated)</label>
        <input className={input} value={draft.labels} onChange={e => set('labels', e.target.value)} placeholder="bug, kds, printing"/>
      </div>
      <div>
        <label className={label}>Github ref</label>
        <input className={input} value={draft.github_ref} onChange={e => set('github_ref', e.target.value)} placeholder="pwar2804aio/possystem#123 or @sha"/>
      </div>
      <div className="flex gap-2 pt-2">
        <button onClick={onSave} className="flex-1 px-4 py-2 bg-accent text-white rounded text-sm font-semibold">Save</button>
        <button onClick={onCancel} className="flex-1 px-4 py-2 bg-card border border-bdr rounded text-sm text-muted">Cancel</button>
      </div>
    </div>
  );
}
