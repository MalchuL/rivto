/**
 * Compiles the shared application stylesheet through Tailwind's PostCSS plugin.
 * Next.js owns stylesheet bundling for both hosts, so desktop uses the same
 * compiled CSS as the browser without a separate style pipeline.
 */
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
