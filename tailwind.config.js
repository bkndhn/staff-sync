/** @type {import('tailwindcss').Config} */
export default {
  // Class-based dark mode: `dark:` utilities must NOT follow the device OS
  // setting, otherwise light-theme dialogs render faint text on phones.
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      colors: {
        // Admin-selectable brand theme: every blue-* utility follows --brand-* vars.
        blue: {
          50: 'rgb(var(--brand-50) / <alpha-value>)',
          100: 'rgb(var(--brand-100) / <alpha-value>)',
          200: 'rgb(var(--brand-200) / <alpha-value>)',
          300: 'rgb(var(--brand-300) / <alpha-value>)',
          400: 'rgb(var(--brand-400) / <alpha-value>)',
          500: 'rgb(var(--brand-500) / <alpha-value>)',
          600: 'rgb(var(--brand-600) / <alpha-value>)',
          700: 'rgb(var(--brand-700) / <alpha-value>)',
          800: 'rgb(var(--brand-800) / <alpha-value>)',
          900: 'rgb(var(--brand-900) / <alpha-value>)',
          950: 'rgb(var(--brand-950) / <alpha-value>)',
        },
        // Premium Blue/White Theme
        dark: {
          primary: '#0B1220',
          secondary: '#111a2e',
          tertiary: '#17223b',
        },
        accent: {
          primary: '#3B82F6',
          secondary: '#2563EB',
          success: '#22C55E',
          warning: '#F59E0B',
          danger: '#EF4444',
          info: '#60A5FA',
          purple: '#3B82F6',
        },
      },
      animation: {
        'fade-in': 'fade-in 200ms ease-out',
        'slide-up': 'slide-up 300ms cubic-bezier(0.34, 1.56, 0.64, 1)',
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'spin-slow': 'spin 2s linear infinite',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(20px) scale(0.98)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 4px 20px rgba(102, 126, 234, 0.4)' },
          '50%': { boxShadow: '0 4px 28px rgba(102, 126, 234, 0.6)' },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
      boxShadow: {
        'glow-primary': '0 0 40px rgba(102, 126, 234, 0.3)',
        'glow-success': '0 0 40px rgba(56, 239, 125, 0.3)',
      },
    },
  },
  plugins: [],
};
