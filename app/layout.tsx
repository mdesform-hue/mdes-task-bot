import './globals.css';

import { Analytics } from '@vercel/analytics/react';

export const metadata = {
  title: 'Mdes-Task',
  description:
    'Mdes-Task-Tracker'
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="flex min-h-screen w-full flex-col">{children}</body>
      <Analytics />
    </html>
  );
}
