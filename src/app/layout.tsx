import type { Metadata } from 'next';
import '@/styles/globals.css';
import { Nav } from '@/components/nav';

export const metadata: Metadata = {
  title: 'TradingSwarm',
  description: 'Autonomous AI trading agent swarm platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-surface min-h-screen">
        <Nav />
        {children}
      </body>
    </html>
  );
}
