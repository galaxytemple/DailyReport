import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@daily/db'],
  output: 'standalone',
};

export default nextConfig;
