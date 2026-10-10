import type { NextConfig } from 'next';
const config: NextConfig = {
  async rewrites() { return [{ source: '/api/v1/:path*', destination: `${process.env.API_ORIGIN || (process.env.NODE_ENV === 'production' ? 'https://api.chordjai.life' : 'http://localhost:8787')}/api/v1/:path*` }]; },
  async headers() { return [
    { source: '/:path*', headers: [{ key: 'X-Content-Type-Options', value: 'nosniff' }, { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' }, { key: 'X-Frame-Options', value: 'SAMEORIGIN' }] },
    { source: '/s/:token', headers: [{ key: 'Cache-Control', value: 'private, no-store' }, { key: 'Referrer-Policy', value: 'no-referrer' }, { key: 'X-Robots-Tag', value: 'noindex, nofollow' }] }
  ]; }
};
export default config;
