import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['onnxruntime-node', 'sharp'],
  images: {
    remotePatterns: [],
  },
};

export default withNextIntl(nextConfig);
