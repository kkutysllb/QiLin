/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['reactflow'],
  experimental: {
    serverActions: { bodySizeLimit: '10mb' }
  }
};
export default nextConfig;
