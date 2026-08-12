/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  /*
   * In production nginx maps /api to the board service. There is no nginx in
   * front of `next dev`, so the same path is rewritten here — the client code
   * then has one URL in every environment and never needs to know which.
   */
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${process.env.DJ_BOARD ?? 'http://127.0.0.1:3100'}/:path*` }];
  },
  // the workspace packages ship TypeScript source, not a build artifact
  transpilePackages: ['@dragonjob/engine', '@dragonjob/shared'],
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
