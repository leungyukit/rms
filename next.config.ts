import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  // 不让 webpack 打包 native 包（仅保留 better-sqlite3 和 mysql2 防误打包）
  serverExternalPackages: ['better-sqlite3', 'mysql2'],
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
