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
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#FBF7EC',
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
