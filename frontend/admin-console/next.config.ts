import type { NextConfig } from 'next';
const config:NextConfig={async rewrites(){return [{source:'/api/v1/:path*',destination:`${process.env.API_ORIGIN||'http://localhost:8787'}/api/v1/:path*`}];},async headers(){return [{source:'/:path*',headers:[{key:'X-Robots-Tag',value:'noindex, nofollow'},{key:'Referrer-Policy',value:'no-referrer'},{key:'X-Content-Type-Options',value:'nosniff'},{key:'X-Frame-Options',value:'DENY'}]}];}};
export default config;
