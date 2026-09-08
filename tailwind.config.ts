import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        ok: '#16a34a',
        ng: '#dc2626',
        warn: '#d97706',
      },
    },
  },
  plugins: [],
};

export default config;
