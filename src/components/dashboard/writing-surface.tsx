"use client";

import { useState } from 'react';

export function WritingSurface(props: { readonly username: string }) {
  const [value, setValue] = useState('');

  return (
    <section className="flex min-h-[70vh] flex-col rounded-2xl border border-zinc-900 bg-zinc-950/60">
      <header className="flex items-center justify-between gap-3 border-b border-zinc-900 px-5 py-4">
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Writing</div>
          <div className="mt-1 truncate text-sm text-zinc-300">
            Signed in as <span className="text-zinc-100">{props.username}</span>
          </div>
        </div>
        <div className="text-xs text-zinc-500">Autosave: not wired yet</div>
      </header>

      <div className="flex-1 p-4">
        <textarea
          className="h-full min-h-[60vh] w-full resize-none rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-sm leading-6 text-zinc-50 outline-none placeholder:text-zinc-600 focus:border-zinc-600"
          onChange={(e) => setValue(e.target.value)}
          placeholder="Start typing…"
          spellCheck
          value={value}
        />
      </div>
    </section>
  );
}

