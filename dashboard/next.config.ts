import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  basePath: '/crypto-wheel',
  assetPrefix: '/crypto-wheel/',
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
};

export default nextConfig;
