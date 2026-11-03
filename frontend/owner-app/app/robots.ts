import type {MetadataRoute} from 'next';
import {BLOG_ORIGIN} from '../lib/blog-seo';
export default function robots():MetadataRoute.Robots{return {rules:{userAgent:'*',allow:['/','/api/v1/analytics/blog/images/'],disallow:['/app','/api/','/s/','/passport/','/invite/','/lost/']},sitemap:BLOG_ORIGIN+'/sitemap.xml'};}
