import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Click-to-Call | 3C Plus',
  description: 'Criado por: Eduardo Wosiak',
  generator: 'wosiak',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-br">
      <body>{children}</body>
    </html>
  )
}
