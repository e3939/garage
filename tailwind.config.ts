import type { Config } from 'tailwindcss'

/**
 * Every value below points at a CSS custom property defined in app/globals.css.
 * Nothing is written twice, and nothing arbitrary gets in: the spacing, radius
 * and type scales are replaced rather than extended, so `p-7` or `rounded-3xl`
 * simply do not exist. See docs/03-DESIGN.md.
 */
const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      inherit: 'inherit',

      // Source palette. Reach for the semantic name below unless you are
      // deliberately naming the ink itself.
      fire: {
        green: 'var(--fire-green)',
        cream: 'var(--fire-cream)',
        amber: 'var(--fire-amber)',
        brick: 'var(--fire-brick)',
        ember: 'var(--fire-ember)',
      },

      // Semantic surfaces and ink.
      bg: 'var(--bg)',
      surface: 'var(--surface)',
      'surface-sunken': 'var(--surface-sunken)',
      border: 'var(--border)',
      'border-strong': 'var(--border-strong)',
      ink: 'var(--text)',
      'ink-muted': 'var(--text-muted)',
      'ink-faint': 'var(--text-faint)',

      // Semantic states.
      accent: 'var(--accent)',
      'accent-ink': 'var(--accent-ink)',
      positive: 'var(--positive)',
      attention: 'var(--attention)',
      critical: 'var(--critical)',
      highlight: 'var(--highlight)',

      // Buckets. Consistent everywhere; this is the app's core vocabulary.
      'bucket-life': 'var(--bucket-life)',
      'bucket-car-running': 'var(--bucket-car-running)',
      'bucket-car-project': 'var(--bucket-car-project)',
    },

    spacing: {
      0: '0px',
      px: '1px',
      1: 'var(--space-1)',
      2: 'var(--space-2)',
      3: 'var(--space-3)',
      4: 'var(--space-4)',
      5: 'var(--space-5)',
      6: 'var(--space-6)',
      8: 'var(--space-8)',
      12: 'var(--space-12)',
      // Structural sizes, not spacing steps.
      touch: 'var(--touch-min)',
      nav: 'var(--nav-height)',
      fab: 'var(--fab-size)',
    },

    borderRadius: {
      none: '0px',
      sm: 'var(--r-sm)',
      md: 'var(--r-md)',
      lg: 'var(--r-lg)',
      full: 'var(--r-full)',
    },

    fontFamily: {
      // Archivo carries a width axis; 125 is its Expanded end.
      display: ['var(--font-display)', { fontVariationSettings: '"wdth" 125' }],
      body: ['var(--font-body)', {}],
      mono: ['var(--font-mono)', { fontFeatureSettings: '"tnum"' }],
    },

    fontSize: {
      'display-lg': [
        'var(--text-display-lg)',
        { lineHeight: '1.1', letterSpacing: '-0.02em', fontWeight: '700' },
      ],
      display: [
        'var(--text-display)',
        { lineHeight: '1.15', letterSpacing: '-0.01em', fontWeight: '600' },
      ],
      title: ['var(--text-title)', { lineHeight: '1.3', fontWeight: '600' }],
      body: ['var(--text-body)', { lineHeight: '1.5', fontWeight: '400' }],
      label: ['var(--text-label)', { lineHeight: '1.35', fontWeight: '500' }],
      caption: ['var(--text-caption)', { lineHeight: '1.4', fontWeight: '400' }],
      eyebrow: [
        'var(--text-eyebrow)',
        { lineHeight: '1.2', letterSpacing: '0.12em', fontWeight: '600' },
      ],
      'odometer-lg': [
        'var(--text-odometer-lg)',
        { lineHeight: '1', fontWeight: '700' },
      ],
      odometer: ['var(--text-odometer)', { lineHeight: '1.2', fontWeight: '500' }],
    },

    boxShadow: {
      none: 'none',
      sheet: 'var(--shadow-sheet)',
    },

    transitionDuration: {
      state: 'var(--duration-state)',
      enter: 'var(--duration-enter)',
      sheet: 'var(--duration-sheet)',
      arc: 'var(--duration-arc)',
    },

    transitionTimingFunction: {
      enter: 'var(--ease-enter)',
      exit: 'var(--ease-exit)',
    },

    extend: {
      maxWidth: {
        content: 'var(--content-max)',
      },
      borderWidth: {
        DEFAULT: '1px',
        0: '0px',
        2: '2px',
      },
    },
  },
  plugins: [],
}

export default config
