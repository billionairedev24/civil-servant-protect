/**
 * Palette lifted from the design bundle. Light paper + ink + deep civic green,
 * with two semantic colours added because the green has to stay reserved for
 * money and confirmation: clay for accident and error, ochre for "needs
 * attention".
 *
 * These are the same values as the CSS custom properties in tokens.css. The TS
 * copy exists because a lot of the design is data-driven — a row's border and
 * icon colour are chosen in a map() — and threading var() strings through that
 * is worse than a constant.
 */
export const C = {
  // ground
  paper: '#EDEBE4',
  surface: '#F7F6F2',
  white: '#FFFFFF',

  // ink
  //
  // The design drew three tiers below `ink` — #8A928C and #A9A69B for tertiary
  // text and eyebrow labels — but both fail the 4.5:1 the spec calls
  // non-negotiable (3.2:1 and 2.4:1 on white, worse on paper). On this cream
  // ground the passing band is only #5C6560 … #636C67, so a third tier in
  // lightness cannot exist and still be legible in sunlight.
  //
  // `faint` and `ghost` therefore collapse to one value, and the hierarchy is
  // carried by type instead — mono, 9px and .12em tracking already read as an
  // eyebrow without being pale. They stay separate tokens because they mean
  // different things and would diverge again on a darker ground.
  ink: '#14181B',
  mut: '#5C6560',
  faint: '#636C67',
  ghost: '#636C67',
  /** Decorative only — carets, unselected marks, disabled controls. Never text. */
  ghost2: '#B9B6AB',

  // civic green — money, confirmation, the brand
  g: '#046A38',
  gd: '#03502A',
  gdd: '#023F21',
  gTint: '#F1F6F3',
  gTint2: '#E8F1EC',
  gTint3: '#DCEAE2',
  gTint4: '#E4EFE9',
  gSoft: '#8ABBA1',
  gBorder: '#C9DDD2',
  gBorder2: '#A9C5B6',
  gBorder3: '#C3D9CD',
  gBright: '#5FBF8C',
  gBright2: '#5FA383',
  gInk: '#3C5A4B',
  gInk2: '#456055',
  gInk3: '#3F4A45',

  // rules and hairlines, lightest last
  line: '#E2E1DA',
  line2: '#DAD8CE',
  line3: '#D7D5CC',
  line4: '#D3D1C6',
  line5: '#E7E5DE',
  line6: '#F0EFE9',
  line7: '#EFEDE6',
  line8: '#EAE8E0',
  line9: '#C9C6BA',
  hover: '#E3E1D8',
  hover2: '#F1F0EA',

  // clay — accident, error, hard exception
  clay: '#B4451F',
  clayBg: '#FBEFEA',
  clayBg2: '#F8E5DC',
  clayInk: '#8A3416',
  clayBorder: '#E7C8B8',
  clayBorder2: '#EDD9CE',

  // ochre — needs attention, pending, soft exception
  ochre: '#8A5A00',
  ochreBg: '#FBF4E4',
  ochreBg2: '#F7EDD8',
  ochreInk: '#6B4C08',
  ochreBorder: '#E0CFA6',
  ochreBorder2: '#E4D3AB',
} as const

export const MONO = "'IBM Plex Mono', monospace"

/** Phone frame, straight from the prototype. */
export const PHONE = { w: 390, h: 844, bezel: 10, radius: 44 } as const
