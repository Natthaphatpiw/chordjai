import type {Metadata} from 'next';
import BlogWorkspace from '../../components/blog-workspace';
export const metadata:Metadata={title:'ChordJai · Blog studio',robots:{index:false,follow:false}};
export default function Page(){return <BlogWorkspace/>;}
