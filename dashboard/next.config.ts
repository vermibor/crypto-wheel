import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  basePath: '/crypto-wheel',
  assetPrefix: '/crypto-wheel/',
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
  env: {
    NEXT_PUBLIC_BASE_PATH: '/crypto-wheel',
  },
};

export default nextConfig;
