/** @type {import('next').NextConfig} */
const nextConfig={
  output:'standalone',
  poweredByHeader:false,
  reactStrictMode:true,
  ...(process.env.NODE_ENV==='development'?{distDir:`.next-control-${process.env.CONTROL_PLANE_PORT||process.env.PORT||3000}`}:{ }),
  async headers(){return[{source:'/:path*',headers:[
    {key:'X-Content-Type-Options',value:'nosniff'},
    {key:'X-Frame-Options',value:'DENY'},
    {key:'Referrer-Policy',value:'no-referrer'},
    {key:'Permissions-Policy',value:'camera=(), microphone=(), geolocation=(), payment=()'},
    {key:'Cross-Origin-Opener-Policy',value:'same-origin'},
    {key:'X-Robots-Tag',value:'noindex, nofollow, noarchive'}
  ]}]}
};
export default nextConfig;
