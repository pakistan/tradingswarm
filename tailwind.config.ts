import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
        mono: ['Space Mono', 'JetBrains Mono', 'monospace'],
      },
      colors: {
        primary: { DEFAULT: '#7c3aed', light: '#a78bfa', dark: '#6d28d9' },
        teal: { DEFAULT: '#0d9488', light: '#2dd4bf' },
        accent: { DEFAULT: '#ea580c', light: '#fb923c' },
        surface: '#faf9f7',
      },
    },
  },
  plugins: [],
};

export default config;
