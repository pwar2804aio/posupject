import { useState } from 'react';
import { supabase, APP_URL } from '../lib/supabase';

export default function Auth() {
  const [email, setEmail]     = useState('');
  const [sent, setSent]       = useState(false);
  const [error, setError]     = useState('');
  const [sending, setSending] = useState(false);

  const send = async (e) => {
    e.preventDefault();
    setSending(true); setError('');
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: APP_URL },
    });
    setSending(false);
    if (error) setError(error.message); else setSent(true);
  };

  return (
    <div className="h-full flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-4xl mb-3">🎯</div>
          <div className="text-2xl font-bold text-text mb-1">Posupject</div>
          <div className="text-sm text-muted">Sign in to continue</div>
        </div>

        {sent ? (
          <div className="bg-panel border border-bdr rounded-xl p-6 text-center">
            <div className="text-2xl mb-3">✉️</div>
            <div className="text-sm text-text font-semibold mb-1">Check your email</div>
            <div className="text-xs text-muted">We sent a magic link to <span className="text-text">{email}</span></div>
          </div>
        ) : (
          <form onSubmit={send} className="space-y-3">
            <input
              type="email" required autoFocus
              value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full px-4 py-3 bg-panel border border-bdr rounded-lg text-text placeholder-dim text-sm focus:outline-none focus:border-accent"
            />
            <button
              type="submit" disabled={sending || !email}
              className="w-full px-4 py-3 bg-accent text-white font-semibold rounded-lg text-sm disabled:opacity-50 hover:bg-indigo-500 transition"
            >
              {sending ? 'Sending…' : 'Send magic link'}
            </button>
            {error && <div className="text-xs text-red-400 text-center">{error}</div>}
            <div className="text-xs text-dim text-center pt-2">
              First user becomes owner. Subsequent users must be invited by an owner.
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
