// ── Navacon Construction Inc. — Brand colour tokens ───────────
// Copied from maintenance-admin. Each module owns its own copy.

export const brand = {
  blue: {
    hex:        '#2B7FC1',
    bg:         'bg-[#2B7FC1]',
    bgHover:    'hover:bg-[#2470AD]',
    bgSubtle:   'bg-[#2B7FC1]/10',
    text:       'text-[#5AAEE8]',
    textStrong: 'text-[#2B7FC1]',
    border:     'border-[#2B7FC1]/20',
    ring:       'focus:ring-[#2B7FC1]',
  },
  green: {
    hex:        '#6ABF3A',
    bg:         'bg-[#6ABF3A]',
    bgHover:    'hover:bg-[#5CAF2E]',
    bgSubtle:   'bg-[#6ABF3A]/10',
    text:       'text-[#7DD44A]',
    textStrong: 'text-[#6ABF3A]',
    border:     'border-[#6ABF3A]/20',
  },
  grey: {
    hex:    '#555E6B',
    text:   'text-[#555E6B]',
    border: 'border-[#555E6B]/30',
  },
}

export const btnPrimary =
  `${brand.blue.bg} ${brand.blue.bgHover} text-white font-medium rounded-xl px-4 py-3.5 text-base transition-colors`

export const btnSecondary =
  `bg-gray-800 hover:bg-gray-700 text-white font-medium rounded-xl px-4 py-3.5 text-base transition-colors`

export const btnDanger =
  `bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 font-medium rounded-xl px-4 py-3.5 text-base transition-colors`

export const inputBase =
  `bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-3 text-base placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#2B7FC1] focus:border-transparent`

export const cardBase =
  `bg-gray-900 border border-white/[0.06] rounded-2xl`
