import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Daily Report' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 960, margin: '0 auto', padding: '1rem' }}>
        <nav style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem', borderBottom: '1px solid #ddd', paddingBottom: '0.75rem' }}>
          <a href="/topics">Topics</a>
          <a href="/dashboard">Dashboard</a>
          <a href="/reports">Reports</a>
        </nav>
        {children}
      </body>
    </html>
  );
}
