/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        /* Cor principal (#DEBF95) e variações */
        'vault-primary': '#DEBF95',
        'vault-primary-hover': '#C9A86E',
        'vault-primary-active': '#B8955A',
        'vault-primary-light': '#F0E4C4',
        'vault-primary-lighter': '#FAF4E8',
        'vault-primary-muted': '#C4B08A',
        'vault-primary-dim': '#8B7355',

        'vault-bg': '#0B0F14',
        'vault-card': '#11161D',
        'vault-border': '#1F2937',
        'vault-secondary': '#A855F7',
        'vault-muted': '#9CA3AF',

        /* Alias legado: mesmo tom areia/dourado */
        'neon-blue': '#DEBF95',

        'absolute-black': '#0B0F14',
        'dark-gray': '#11161D',
        'danger-red': '#ff4d4f',
        'cyber-dark': '#0B0F14',
        'purple-800': '#4a0e7a',
        'purple-700': '#6a1a9a',
        'purple-600': '#8a26ba',
        'purple-500': '#9c30cb',
        'purple-400': '#c26ee6',
        'fuchsia-700': '#a2006e',
        'fuchsia-600': '#c20083',
        'fuchsia-500': '#e20098',
        'cyan-700': '#008a9c',
        'cyan-600': '#00a8c2',
        'cyan-500': '#00c6e6',
        'cyan-400': '#DEBF95',
        'red-600': '#cc2936',
        'orange-500': '#f28e3a',
        'emerald-600': '#059669',
        'green-500': '#22c55e',
      },
      animation: {
        'pulse-arrow': 'pulse-arrow 1.5s ease-in-out infinite',
      },
      backgroundColor: {
        'fourmeme-bg': '#0B0F14',
        'fourmeme-surface': '#11161D',
        'fourmeme-surface-2': '#11161D',
      },
      textColor: {
        'fourmeme-text': '#FFFFFF',
        'fourmeme-muted': '#9CA3AF',
      },
      borderColor: {
        'fourmeme-border': '#1F2937',
      },
      boxShadow: {
        'vault-glow': '0 0 20px rgba(222, 191, 149, 0.35)',
        'vault-glow-sm': '0 0 10px rgba(222, 191, 149, 0.25)',
      },
    },
  },
  plugins: [],
};
