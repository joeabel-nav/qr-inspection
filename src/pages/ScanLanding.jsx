// ScanLanding.jsx
// Entry point. Two paths:
//   1. URL has ?t=TOKEN → redirect straight to PIN (QR code was scanned externally)
//   2. No token → show camera scanner UI

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import QrScannerOverlay from '../components/QrScannerOverlay.jsx'
import Shell from '../components/Shell.jsx'

export default function ScanLanding() {
  const navigate = useNavigate()
  const token    = new URLSearchParams(window.location.search).get('t')
  const [showScanner, setShowScanner] = useState(false)

  useEffect(() => {
    if (token) {
      navigate('/pin', { state: { token }, replace: true })
    } else {
      // No token in URL — open scanner automatically
      setShowScanner(true)
    }
  }, [])

  function handleFound(scannedToken) {
    setShowScanner(false)
    navigate('/pin', { state: { token: scannedToken } })
  }

  if (token) return null

  return (
    <>
      {showScanner && (
        <QrScannerOverlay
          onClose={() => setShowScanner(false)}
          onFound={handleFound}
        />
      )}

      {/* Shown briefly if scanner is closed without scanning */}
      {!showScanner && (
        <Shell title="Navacon Inspection" subtitle="Navacon Construction">
          <div className="space-y-5 py-4">
            <div className="bg-gray-900 border border-white/[0.06] rounded-2xl p-5 flex flex-col items-center gap-4 text-center">
              <svg className="w-10 h-10 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
              </svg>
              <p className="text-gray-400 text-sm">
                Scan the QR code on the machine label to begin.
              </p>
            </div>
            <button
              onClick={() => setShowScanner(true)}
              className="w-full bg-[#2B7FC1] hover:bg-[#2470AD] text-white font-medium rounded-xl py-4 text-base transition-colors"
            >
              Open camera
            </button>
          </div>
        </Shell>
      )}
    </>
  )
}
