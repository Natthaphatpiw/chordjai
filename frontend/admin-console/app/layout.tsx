import type {Metadata} from 'next';
import { Sarabun } from 'next/font/google';
import '../../shared/portal.css';
const sarabun = Sarabun({ subsets: ['thai', 'latin'], weight: ['400', '500', '600', '700'], display: 'swap', variable: '--font-sarabun' });
export const metadata:Metadata={title:'ชิดใจ · Admin Console',robots:{index:false,follow:false}};
export default function Layout({children}:Readonly<{children:React.ReactNode}> ){return <html lang="th" className={sarabun.variable}><body className={sarabun.className}>{children}</body></html>;}
