import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';
import './globals.css';

const display = Bricolage_Grotesque({ variable: '--font-display', subsets: ['latin'] });
const body = IBM_Plex_Sans({ variable: '--font-body', subsets: ['latin'] });
const utility = IBM_Plex_Mono({ variable: '--font-utility', subsets: ['latin'], weight: ['400', '500', '600'] });

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'PulseCraft · 在线节拍器与经典节奏',
  description: '支持常见拍号、可读谱经典节奏、精确速度控制和轻重拍编辑的在线节拍练习台。',
  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }],
  },
};

export const viewport: Viewport = {
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4f1e8' },
    { media: '(prefers-color-scheme: dark)', color: '#0b1018' },
  ],
  viewportFit: 'cover',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" className="dark">
      <body className={`${display.variable} ${body.variable} ${utility.variable} antialiased`}>{children}</body>
    </html>
  );
}
