import '../styles/globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Latch | Let the agent pay. Never let it see.', description: 'A Terminal 3 MCP sidecar for protected agent actions.' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><head><link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet" /></head><body>{children}<div className="grain" aria-hidden="true" /></body></html>;
}
