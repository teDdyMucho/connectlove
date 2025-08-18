/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: 'var(--color-primary)',
        'primary-dark': 'var(--color-primary-dark)',
        'light-accent': 'var(--color-light-accent)',
        'medium-accent': 'var(--color-medium-accent)',
        background: 'var(--color-background)',
        surface: 'var(--color-surface)',
      },
    },
  },
  plugins: [],
};
