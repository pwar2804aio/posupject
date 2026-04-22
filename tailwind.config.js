/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg:    '#0b0d10',
        panel: '#111418',
        card:  '#171b20',
        bdr:   '#242933',
        text:  '#e8eaed',
        muted: '#9aa3ad',
        dim:   '#5b6773',
        accent: '#6366f1',
      },
      fontFamily: {
        sans: ['-apple-system','BlinkMacSystemFont','Inter','ui-sans-serif','system-ui','sans-serif'],
        mono: ['"JetBrains Mono"','ui-monospace','SFMono-Regular','Menlo','monospace'],
      },
    },
  },
  plugins: [],
};
