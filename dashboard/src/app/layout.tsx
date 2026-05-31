import type { Metadata } from 'next'
import Sidebar from './components/Sidebar'
import './globals.css'

export const metadata: Metadata = {
  title: 'Deribit Dashboard',
  description: 'Trading dashboard inspired by TraderVue',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <div className="app-container">
          <Sidebar />
          <main className="main-content">
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}
