import type { NextConfig } from 'next';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  transpilePackages: ['@daily/db'],
  output: 'standalone',
  // Monorepo: tracing must walk up to the workspace root so the standalone
  // bundle picks up @daily/db (workspace dep) and oracledb (native module
  // hoisted at the root). Without this, server.js starts but lazy imports
  // crash on first request — and on some setups crash at startup.
  outputFileTracingRoot: path.resolve(here, '../../'),
};

export default nextConfig;
