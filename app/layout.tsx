import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Flight Price Tracker',
  description: 'Arajet & Avianca — acompanhamento de preços',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  )
}
