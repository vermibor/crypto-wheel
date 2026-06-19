import type { Metadata } from 'next'
import Sidebar from './components/Sidebar'
import { DashboardProvider } from '@/lib/DashboardContext'
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
        <DashboardProvider>
          <div className="app-container">
            <Sidebar />
            <main className="main-content">
              {children}
            </main>
          </div>
        </DashboardProvider>
      </body>
    </html>
  )
}

