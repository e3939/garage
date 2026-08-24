/**
 * The names of the icons a category may carry, and nothing else.
 *
 * Kept apart from `catalog.tsx` on purpose: this module holds no components, so
 * the icon picker can import the list of names without dragging ninety Phosphor
 * modules into the client bundle. The glyphs themselves are rendered on the
 * server and handed over as elements.
 */

/** Grouped so the picker reads as a list rather than a wall of glyphs. */
export const ICON_GROUPS: readonly { label: string; names: readonly string[] }[] = [
  {
    label: 'Car',
    names: [
      'GasPump',
      'ChargingStation',
      'Wrench',
      'Screwdriver',
      'Hammer',
      'Toolbox',
      'Nut',
      'Engine',
      'Tire',
      'SteeringWheel',
      'Gauge',
      'Path',
      'RoadHorizon',
      'Car',
      'CarProfile',
      'Motorcycle',
      'Scooter',
      'Truck',
      'Garage',
      'Flag',
      'Trophy',
      'Timer',
      'Snowflake',
      'Drop',
    ],
  },
  {
    label: 'Money',
    names: [
      'Receipt',
      'Invoice',
      'CreditCard',
      'Coins',
      'HandCoins',
      'Wallet',
      'Bank',
      'PiggyBank',
      'ChartDonut',
      'Ticket',
      'Package',
      'Storefront',
    ],
  },
  {
    label: 'Life',
    names: [
      'ShoppingCart',
      'Basket',
      'ShoppingBagOpen',
      'ForkKnife',
      'Coffee',
      'CookingPot',
      'Wine',
      'Cake',
      'House',
      'Buildings',
      'Bed',
      'Broom',
      'WashingMachine',
      'Lightning',
      'Lightbulb',
      'Phone',
      'TShirt',
      'Handbag',
      'Key',
      'Gift',
      'Confetti',
    ],
  },
  {
    label: 'Getting about',
    names: ['Bus', 'Train', 'Bicycle', 'Airplane', 'Suitcase', 'MapPin'],
  },
  {
    label: 'Health and people',
    names: [
      'Heartbeat',
      'FirstAidKit',
      'Bandaids',
      'Pill',
      'Eyeglasses',
      'Barbell',
      'Dog',
      'PawPrint',
      'Plant',
      'Leaf',
      'Tree',
      'Umbrella',
    ],
  },
  {
    label: 'Everything else',
    names: [
      'Book',
      'GraduationCap',
      'Briefcase',
      'MusicNotes',
      'Headphones',
      'GameController',
      'FilmSlate',
      'Camera',
      'Scissors',
      'Sparkle',
      'SealCheck',
      'ClockCounterClockwise',
      'WarningCircle',
      'DotsThree',
    ],
  },
]

/** Every name the picker can produce, flattened. */
export const ICON_NAMES: readonly string[] = ICON_GROUPS.flatMap((group) => group.names)

/** The fallback when a stored name is not in the catalogue. */
export const FALLBACK_ICON_NAME = 'Receipt'
