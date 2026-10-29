export default function manifest() {
  return {
    name: 'Pig Farm Ledger',
    short_name: 'PigLedger',
    description: 'Piggery accounting — expenses, sales, profit. Works offline.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f8fafc',
    theme_color: '#059669',
    icons: [
      { src: '/icons/icon-512.svg', sizes: '512x512', type: 'image/svg+xml' },
      { src: '/icons/icon-512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'maskable' }
    ]
  };
}
