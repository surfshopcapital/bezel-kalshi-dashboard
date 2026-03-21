import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'markets.getbezel.com',
      },
      {
        protocol: 'https',
        hostname: '*.getbezel.com',
      },
    ],
  },
  // Allow server-side usage of playwright (mark as external)
  serverExternalPackages: ['playwright', 'winston'],
  output: 'standalone',
};

export default nextConfig;
