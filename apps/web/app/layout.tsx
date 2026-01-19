import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Audio Retrieval SRS',
  description: 'Audio-first spaced repetition system for language learning',
  icons: {
    icon: '/favicon.ico.svg',
    shortcut: '/favicon.ico.svg',
    apple: '/favicon.ico.svg',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
