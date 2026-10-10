import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Git Happens | Next Best Action',
  description: 'Agente que interpreta eventos de propuestas comerciales y recomienda la siguiente mejor accion (o inaccion).',
}

export const viewport: Viewport = {
  colorScheme: 'light',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body className="antialiased">{children}</body>
    </html>
  )
}
