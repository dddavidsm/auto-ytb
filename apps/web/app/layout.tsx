import type { Metadata } from 'next';
import './globals.css';

export const metadata:Metadata={title:'AUTO-YTB Control Plane',description:'Autonomous YouTube portfolio operations, QA, economics and creative learning.'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="es"><body>{children}</body></html>;}
