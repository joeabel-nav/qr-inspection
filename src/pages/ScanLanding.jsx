// ScanLanding.jsx
// Entry point — reads token from URL and redirects to PIN screen.
// No UI shown unless the token is missing entirely.

import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Shell from '../components/Shell.jsx'

export default function ScanLanding() {
  const navigate = useNavigate()
  const token    = new URLSearchParams(window.location.search).get('t')

  useEffect(() => {
    if (token) {
      navigate('/pin', { state: { token }, replace: true })
    }
  }, [])

  if (token) return null

  // No token — show manual entry fallback
  return (
    <Shell title="Navacon Inspection" subtitle="Navacon Construction">
      <div className="space-y-5 py-4">
        <div className="bg-gray-900 border border-white/[0.06] rounded-2xl p-5 flex flex-col items-center gap-3 text-center">
          <svg className="w-10 h-10 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
          </svg>
          <p className="text-gray-400 text-sm">
            Scan the QR code on the machine to begin an inspection.
          </p>
          <p className="text-gray-600 text-xs">
            If the camera won't scan, ask your supervisor for the direct link.
          </p>
        </div>
      </div>
    </Shell>
  )
}
