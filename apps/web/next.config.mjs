/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // the workspace packages ship TypeScript source, not a build artifact
  transpilePackages: ['@hoardbreak/engine', '@hoardbreak/shared'],
  webpack: (config) => {
    // Those packages use standards-correct ESM specifiers (`./defs.js`) that
    // resolve to `.ts` on disk — the same trick the Fastify API will need when
    // it imports the engine in Phase 2. Vite/vitest does this by default;
    // webpack needs telling.
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    };
    return config;
  },
};

export default nextConfig;
