/** @type {import('tailwindcss').Config} */
import plugin from 'tailwindcss/plugin.js'

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Indigo — distinctive, trustworthy, not default Tailwind blue
        brand: {
          50:  '#EEF2FF',
          100: '#E0E7FF',
          200: '#C7D2FE',
          300: '#A5B4FC',
          400: '#818CF8',
          500: '#6366F1',
          600: '#4F46E5',
          700: '#4338CA',
          800: '#3730A3',
          900: '#312E81',
          950: '#1E1B4B',
        },
      },
    },
  },
  plugins: [
    // Register shadow-card / shadow-card-md as proper utilities so they work
    // in both className strings and @apply inside CSS files.
    plugin(({ addUtilities }) => {
      addUtilities({
        '.shadow-card': {
          boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.04)',
        },
        '.shadow-card-md': {
          boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.07), 0 2px 4px -2px rgb(0 0 0 / 0.05)',
        },
      })
    }),
  ],
}
