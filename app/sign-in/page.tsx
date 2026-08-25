import type { Metadata } from 'next'
import { SignInForm } from '@/app/sign-in/sign-in-form'

export const metadata: Metadata = { title: 'Sign in' }

type SignInPageProps = {
  searchParams: Promise<{ next?: string; error?: string }>
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const { next, error } = await searchParams

  return (
    <main className="mx-auto flex min-h-dvh max-w-content flex-col justify-center px-4 py-12">
      <div className="w-full">
        <p className="text-eyebrow font-display uppercase text-ink-muted">Service logbook</p>
        <h1 className="mt-2 font-display text-display-lg text-ink">Garage</h1>

        <SignInForm next={next?.startsWith('/') ? next : undefined} initialError={error} />
      </div>
    </main>
  )
}
