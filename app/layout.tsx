import type { Metadata, Viewport } from 'next'
import { fontVariables } from '@/app/fonts'
import { RegisterServiceWorker } from '@/components/pwa/register-service-worker'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'Garage',
    template: '%s · Garage',
  },
  description: 'An expense tracker where the car is the main event.',
  applicationName: 'Garage',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Garage',
    statusBarStyle: 'default',
  },
  formatDetection: {
    telephone: false,
    date: false,
    address: false,
    email: false,
  },
  other: {
    // Next 16 emits `mobile-web-app-capable` and has dropped the legacy
    // Apple spelling. iOS 16.4 and up read the manifest instead, but older
    // iOS still wants this one to open standalone rather than in Safari.
    'apple-mobile-web-app-capable': 'yes',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  // The browser chrome follows the app rather than the other way round. Both
  // values are the `--paper` token in each mode; if one moves, move the other.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FBF7EC' },
    { media: '(prefers-color-scheme: dark)', color: '#211E1A' },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={fontVariables}>
      <body className="min-h-dvh bg-bg text-ink antialiased">
        {children}
        <RegisterServiceWorker />
      </body>
    </html>
  )
}
