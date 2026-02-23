import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Our Schedule',
  description: 'Couple Shared Calendar App',
  themeColor: '#0f1115',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Our Schedule',
  },
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
