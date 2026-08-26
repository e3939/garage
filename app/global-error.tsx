// The last boundary. Replaces the whole document, so it renders its own.
'use client'

/**
 * When the layout itself fails.
 *
 * This one replaces `<html>` and `<body>`, which means none of the app's
 * providers, fonts or tokens are around it — so the styles here are inline and
 * the palette is written out. That is the one place in this codebase where a hex
 * literal is correct: a stylesheet that has not loaded is exactly the failure
 * this screen exists for.
 *
 * Both modes, because the token that would have handled it is in the stylesheet
 * that is missing.
 */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <head>
        <style>{`
          :root { color-scheme: light dark; --paper: #FBF7EC; --ink: #2A2620; --brick: #A95031; }
          @media (prefers-color-scheme: dark) {
            :root { --paper: #211E1A; --ink: #F2EBD9; --brick: #CC795A; }
          }
          body {
            margin: 0; min-height: 100dvh; display: flex; align-items: center;
            justify-content: center; padding: 24px;
            background: var(--paper); color: var(--ink);
            font-family: ui-sans-serif, system-ui, sans-serif; line-height: 1.5;
          }
          main { max-width: 32rem; }
          h1 { font-size: 1.125rem; margin: 0 0 8px; }
          p { margin: 0 0 16px; }
          button {
            min-height: 44px; padding: 0 16px; border-radius: 10px;
            border: 1px solid var(--brick); background: var(--brick); color: #FFFDF7;
            font: inherit; font-weight: 500;
          }
        `}</style>
      </head>
      <body>
        <main>
          <h1>Garage did not start</h1>
          <p>Nothing has been lost. Reload, and if it keeps happening check the connection.</p>
          <button type="button" onClick={reset}>
            Reload
          </button>
        </main>
      </body>
    </html>
  )
}
