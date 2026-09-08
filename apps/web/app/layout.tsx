import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata:Metadata={title:'AUTO-YTB Control Plane',description:'Autonomous YouTube portfolio operations, QA, economics, series continuity and creative learning.'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="es"><body>{children}<Link href="/series" className="pill info" style={{position:'fixed',right:16,bottom:18,zIndex:80,boxShadow:'0 8px 28px rgba(0,0,0,.18)'}}>Series</Link></body></html>;}
