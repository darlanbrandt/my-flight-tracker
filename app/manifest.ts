import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Flight Price Tracker',
    short_name: 'Flights',
    description: 'Acompanhamento diário de tarifas aéreas',
    start_url: '/',
    display: 'standalone',
    background_color: '#faf7f2',
    theme_color: '#e8433a',
    orientation: 'any',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
