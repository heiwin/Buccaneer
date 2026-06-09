/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: '#000000',
        surface: '#0a0a0a',
        'surface-elevated': '#121212',
        // Grey-scale accent palette
        primary: '#a1a1aa',        // zinc-400 — main accent
        'primary-dim': '#52525b',  // zinc-600 — dimmed / borders
        'primary-glow': '#d4d4d8', // zinc-300 — highlights / hover
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
