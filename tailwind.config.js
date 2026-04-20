/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Helvetica',
          'Arial',
          'sans-serif',
        ],
      },
      colors: {
        ink: {
          900: '#0b1220',
          800: '#111827',
          700: '#1f2937',
          500: '#475569',
          400: '#64748b',
          300: '#94a3b8',
          200: '#cbd5e1',
          100: '#e2e8f0',
          50: '#f1f5f9',
        },
        paper: {
          DEFAULT: '#ffffff',
          subtle: '#fafafa',
          muted: '#f7f8fa',
        },
        accent: {
          DEFAULT: '#047857',
          hover: '#065f46',
          soft: '#ecfdf5',
          ring: '#10b981',
        },
        warn: {
          DEFAULT: '#b45309',
          soft: '#fef3c7',
        },
        danger: {
          DEFAULT: '#b91c1c',
          soft: '#fee2e2',
        },
        positive: {
          DEFAULT: '#047857',
          soft: '#ecfdf5',
        },
      },
      boxShadow: {
        row: '0 1px 0 0 rgba(15, 23, 42, 0.04)',
        panel: '0 1px 2px 0 rgba(15, 23, 42, 0.04), 0 0 0 1px rgba(15, 23, 42, 0.04)',
      },
      keyframes: {
        pulseSoft: {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.65', transform: 'scale(1.25)' },
        },
      },
      animation: {
        'pulse-soft': 'pulseSoft 2.2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
