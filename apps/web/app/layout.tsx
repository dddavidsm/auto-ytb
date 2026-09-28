import type { Metadata } from 'next';
import './globals.css';
import './overrides.css';
import GlobalNav from '../components/global-nav';

export const metadata:Metadata={title:'AUTO-YTB Control Plane',description:'Autonomous YouTube portfolio operations, QA, economics, series continuity and creative learning.'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="es"><body><GlobalNav/>{children}</body></html>;}
