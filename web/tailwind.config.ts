import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: { extend: { fontFamily: { heading: ['var(--font-display)'], body: ['var(--font-body)'], mono: ['var(--font-mono)'] } } },
  plugins: [],
};
export default config;
