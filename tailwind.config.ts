import type { Config } from 'tailwindcss'

/**
 * A design token that can still take an opacity modifier.
 *
 * Tailwind can only apply `/95` to a colour it is able to decompose into
 * channels, and every colour in this file is a bare `var(--x)`. Given one of
 * those it does not warn, and it does not fall back — it simply declines to
 * emit the class. `bg-bg/95` on the app header was therefore not a rule at all,
 * which is why the sticky header had no background and the page scrolled
 * visibly through the title.
 *
 * `color-mix` keeps the value a CSS variable while letting the alpha through.
 * The `calc` form matters: Tailwind passes a literal like `0.95` for `/95` and
 * a `var(--tw-bg-opacity)` for the older `bg-opacity-*` utilities, and `calc`
 * is what accepts both.
 */
function token(name: string): string {
  const resolve = ({ opacityValue }: { opacityValue?: string }) =>
    opacityValue === undefined
      ? `var(${name})`
      : `color-mix(in srgb, var(${name}) calc(${opacityValue} * 100%), transparent)`

  // Tailwind has accepted a function per colour since v3 and resolves it while
  // generating utilities, but its published types only describe the string
  // form. One cast, here, rather than one at each of the twenty-two colours.
  return resolve as unknown as string
}

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
        green: token('--fire-green'),
        cream: token('--fire-cream'),
        amber: token('--fire-amber'),
        brick: token('--fire-brick'),
        ember: token('--fire-ember'),
      },

      // Semantic surfaces and ink.
      bg: token('--bg'),
      surface: token('--surface'),
      'surface-sunken': token('--surface-sunken'),
      border: token('--border'),
      'border-strong': token('--border-strong'),
      ink: token('--text'),
      'ink-muted': token('--text-muted'),
      'ink-faint': token('--text-faint'),

      // Semantic states.
      accent: token('--accent'),
      'accent-ink': token('--accent-ink'),
      positive: token('--positive'),
      attention: token('--attention'),
      critical: token('--critical'),
      highlight: token('--highlight'),

      // Buckets. Consistent everywhere; this is the app's core vocabulary.
      'bucket-life': token('--bucket-life'),
      'bucket-car-running': token('--bucket-car-running'),
      'bucket-car-project': token('--bucket-car-project'),
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
      gutter: 'var(--gutter)',
      touch: 'var(--touch-min)',
      nav: 'var(--nav-height)',
      fab: 'var(--fab-size)',
      // A list thumbnail and a numeric field that must not stretch. Both are
      // objects with a size rather than gaps between things, which is why they
      // are here and not on the 4/8/12/16/20/24/32/48 scale.
      thumb: 'var(--thumb-size)',
      amount: 'var(--amount-field)',
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
      // The 16px floor every form control sits on. See --text-input.
      input: ['var(--text-input)', { lineHeight: '1.4', fontWeight: '400' }],
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
