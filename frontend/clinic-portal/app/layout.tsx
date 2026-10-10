import type {Metadata} from 'next';
import '../../shared/portal.css';
export const metadata:Metadata={title:'ชิดใจ · Clinic Lite',robots:{index:false,follow:false}};
export default function Layout({children}:Readonly<{children:React.ReactNode}> ){return <html lang="th"><body>{children}</body></html>;}
