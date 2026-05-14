import type { Metadata } from 'next';
import { auth } from '@/auth';
import './globals.css';

export const metadata: Metadata = { title: 'Daily Report' };

function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
    >
      {label}
    </a>
  );
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  return (
    <html lang="en">
      <body>
        {session && (
          <header className="border-b border-[var(--color-border)] bg-white">
            <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-8">
              <a href="/themes" className="font-semibold text-gray-900">Daily Report</a>
              <nav className="flex gap-6">
                <NavLink href="/themes" label="Themes" />
                <NavLink href="/topics" label="Topics" />
                <NavLink href="/dashboard" label="Dashboard" />
                <NavLink href="/reports" label="Reports" />
              </nav>
            </div>
          </header>
        )}
        <main className="max-w-5xl mx-auto px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
