/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        void: 'var(--void)',
        surface: {
          DEFAULT: 'var(--surface)',
          raised: 'var(--surface-raised)',
        },
        signal: {
          DEFAULT: 'var(--signal)',
          dim: 'var(--signal-dim)',
          ghost: 'var(--signal-ghost)',
        },
        primary: 'var(--text-primary)',
        secondary: 'var(--text-secondary)',
        muted: 'var(--text-muted)',
        ghost: 'var(--text-ghost)',
        danger: {
          DEFAULT: 'var(--danger)',
          dim: 'var(--danger-dim)',
        },
      },
      fontFamily: {
        mono: ['var(--font-mono)'],
      },
      fontSize: {
        body: ['var(--font-size-body)', { lineHeight: 'var(--line-height-body)' }],
        meta: ['var(--font-size-meta)', { lineHeight: 'var(--line-height-meta)', letterSpacing: 'var(--letter-spacing-meta)' }],
        display: ['var(--font-size-display)', { lineHeight: '1.4' }],
        micro: ['var(--font-size-micro)', { lineHeight: '1.4' }],
      },
      maxWidth: {
        content: 'var(--content-max)',
      },
      transitionDuration: {
        resolve: 'var(--duration-resolve)',
        hover: 'var(--duration-hover)',
        focus: 'var(--duration-focus)',
      },
      animation: {
        'fade-in': 'fadeIn var(--duration-fade-in) var(--ease-out) forwards',
        'slide-up': 'slideUp 0.25s ease-in-out',
        'resolve-in': 'resolveIn var(--duration-resolve) var(--ease-resolve) forwards',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        resolveIn: {
          '0%': { opacity: '0', filter: 'blur(4px)', transform: 'translateY(2px)' },
          '40%': { opacity: '0.6', filter: 'blur(1px)' },
          '100%': { opacity: '1', filter: 'blur(0)', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
}