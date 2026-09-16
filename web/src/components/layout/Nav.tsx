'use client';
import Link from 'next/link';
import { useState } from 'react';

/** Renders the transparent responsive navigation. */
export default function Nav() {
  const [open, setOpen] = useState(false);
  return <nav className="group fixed top-0 inset-x-0 z-[var(--z-nav)] h-16 md:h-20 px-6 md:px-10 lg:px-16 flex items-center justify-between" aria-label="Main navigation">
    {/* Logo slot: replace with public/logo.svg once provided */}<Link href="/" className="font-heading text-[1.35rem] md:text-[1.5rem] tracking-tight leading-none">Latch</Link>
    <div className="hidden md:flex items-center gap-8 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity duration-200"><Link className="nav-link" href="/app">Console</Link><a className="nav-link" href="https://github.com/dr4ken-soul/Latch">GitHub</a><a className="nav-link" href="https://docs.terminal3.io/developers/adk/get-started/quickstart">Docs</a></div>
    <button className="md:hidden w-11 h-11 flex flex-col items-center justify-center gap-1.5" aria-label="Open menu" onClick={() => setOpen(true)}><span className="w-5 h-0.5 bg-[var(--text-primary)]" /><span className="w-5 h-0.5 bg-[var(--text-primary)]" /><span className="w-5 h-0.5 bg-[var(--text-primary)]" /></button>
    {open && <div className="fixed inset-0 z-[var(--z-overlay)] bg-[var(--bg-primary)] p-6"><button className="absolute top-5 right-6 w-11 h-11 text-3xl" aria-label="Close menu" onClick={() => setOpen(false)}>×</button><div className="mt-24 flex flex-col gap-6 font-heading text-4xl tracking-tight"><Link href="/app" onClick={() => setOpen(false)}>Console</Link><a href="https://github.com/dr4ken-soul/Latch">GitHub</a><a href="https://docs.terminal3.io/developers/adk/get-started/quickstart">Docs</a></div></div>}
  </nav>;
}
