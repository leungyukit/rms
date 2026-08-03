import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  // 不让 webpack 打包 native 包（仅保留 better-sqlite3 和 mysql2 防误打包）
  serverExternalPackages: ['better-sqlite3', 'mysql2'],
  // 2026-08-03: 原为 ignoreBuildErrors: true —— 类型错误全部被吞，
  // 生产构建照过，运行时才炸（ChartRenderer 那个就是这么漏到线上的）。
  // 现改为默认严格；紧急发版可用 NEXT_IGNORE_BUILD_ERRORS=1 临时放行。
  typescript: {
    ignoreBuildErrors: process.env.NEXT_IGNORE_BUILD_ERRORS === '1',
  },
};

export default nextConfig;
