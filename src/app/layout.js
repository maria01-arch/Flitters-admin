import { Plus_Jakarta_Sans } from 'next/font/google'
import './globals.css'

const font = Plus_Jakarta_Sans({ subsets: ['latin'], display: 'swap', variable: '--font-sans' })

export const metadata = {
  title: 'Flitters Ads',
  description: 'Advertise on Flitters',
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={font.variable}>{children}</body>
    </html>
  )
}
