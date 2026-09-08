/** @type {import('next').NextConfig} */
const nextConfig={
  output:'standalone',
  poweredByHeader:false,
  reactStrictMode:true,
  experimental:{typedRoutes:false},
};
export default nextConfig;
