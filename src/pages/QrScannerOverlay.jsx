// QrScannerOverlay.jsx — adapted from maintenance-admin v2
// Full-screen camera overlay for scanning asset QR codes.
//
// Decode strategy:
//   1. Native BarcodeDetector (Chrome Android, iOS Safari 17+)
//   2. jsQR pixel analysis via canvas (universal fallback)
//   3. Manual token entry
//
// QR format: URL containing ?t=TOKENVALUE
// onFound(token) — returns the raw token string to the caller

import { useEffect, useRef, useState, useCallback } from 'react'
import { X, QrCode, Keyboard } from 'lucide-react'

const SCAN_INTERVAL_MS = 250

let jsQRPromise = null
function loadJsQR() {
  if (jsQRPromise) return jsQRPromise
  jsQRPromise = new Promise((resolve, reject) => {
    if (window.jsQR) { resolve(window.jsQR); return }
    const s = document.createElement('script')
    s.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js'
    s.onload  = () => resolve(window.jsQR)
    s.onerror = () => reject(new Error('jsQR load failed'))
    document.head.appendChild(s)
  })
  return jsQRPromise
}

// Extract token from a scanned string.
// Handles: full URL (?t=TOKEN), bare token (10 chars), or any string containing ?t=
function extractToken(raw) {
  if (!raw) return null
  const trimmed = raw.trim()
  // Try URL param
  try {
    const url = new URL(trimmed)
    const t = url.searchParams.get('t')
    if (t) return t
  } catch {}
  // Try ?t= anywhere in string
  const match = trimmed.match(/[?&]t=([A-Za-z0-9]+)/)
  if (match) return match[1]
  // Bare token — 8-12 alphanumeric chars
  if (/^[A-Za-z0-9]{6,16}$/.test(trimmed)) return trimmed
  return null
}

export default function QrScannerOverlay({ onClose, onFound }) {
  const videoRef  = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const rafRef    = useRef(null)
  const lastScan  = useRef('')

  const [status,    setStatus]    = useState('starting') // starting | scanning | found | error | manual
  const [error,     setError]     = useState(null)
  const [manualTag, setManualTag] = useState('')
  const [searching, setSearching] = useState(false)
  const [decoder,   setDecoder]   = useState(null)

  const stopCamera = useCallback(() => {
    if (rafRef.current)  { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => { t.stop(); t.enabled = false })
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.pause()
      videoRef.current.srcObject = null
    }
  }, [])

  useEffect(() => () => stopCamera(), [stopCamera])

  const handleScanned = useCallback((raw) => {
    if (raw === lastScan.current) return
    lastScan.current = raw

    const token = extractToken(raw)
    if (!token) {
      setError(`Couldn't read a valid inspection token from this code.`)
      setStatus('error')
      lastScan.current = ''
      return
    }

    setStatus('found')
    stopCamera()
    setTimeout(() => onFound(token), 500)
  }, [onFound, stopCamera])

  // ── Start camera + scan loop ──────────────────────────────
  useEffect(() => {
    let cancelled = false

    async function start() {
      let stream
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
        })
      } catch (e) {
        if (!cancelled) { setError('Camera permission denied or unavailable.'); setStatus('error') }
        return
      }
      if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }

      streamRef.current = stream
      const vid = videoRef.current
      if (vid) { vid.srcObject = stream; try { await vid.play() } catch {} }

      let nativeDetector = null
      let jsQR = null

      if ('BarcodeDetector' in window) {
        try {
          nativeDetector = new window.BarcodeDetector({ formats: ['qr_code'] })
          setDecoder('native')
        } catch { nativeDetector = null }
      }

      if (!nativeDetector) {
        try {
          jsQR = await loadJsQR()
          setDecoder('jsqr')
        } catch {
          if (!cancelled) setStatus('manual')
          return
        }
      }

      if (!cancelled) setStatus('scanning')

      let lastAttempt = 0
      const canvas = canvasRef.current

      const tick = async () => {
        if (cancelled) return
        const now = Date.now()

        if (now - lastAttempt > SCAN_INTERVAL_MS && vid?.readyState === 4) {
          lastAttempt = now
          try {
            if (nativeDetector) {
              const codes = await nativeDetector.detect(vid)
              if (codes.length > 0) { handleScanned(codes[0].rawValue); return }
            } else if (jsQR && canvas) {
              const w = vid.videoWidth, h = vid.videoHeight
              if (w > 0 && h > 0) {
                canvas.width = w; canvas.height = h
                const ctx = canvas.getContext('2d', { willReadFrequently: true })
                ctx.drawImage(vid, 0, 0, w, h)
                const imgData = ctx.getImageData(0, 0, w, h)
                const code = jsQR(imgData.data, w, h, { inversionAttempts: 'dontInvert' })
                if (code?.data) { handleScanned(code.data); return }
              }
            }
          } catch {}
        }
        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    start()
    return () => { cancelled = true; stopCamera() }
  }, [handleScanned, stopCamera])

  const handleManualSubmit = () => {
    if (!manualTag.trim()) return
    setSearching(true)
    const token = extractToken(manualTag.trim())
    if (token) {
      handleScanned(token)
    } else {
      setError(`"${manualTag}" doesn't look like a valid token.`)
      setStatus('error')
    }
    setSearching(false)
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/80 z-10 flex-shrink-0 safe-top">
        <div className="flex items-center gap-2">
          <QrCode size={18} className="text-[#5AAEE8]" />
          <span className="text-white text-sm font-semibold">Scan machine QR code</span>
          {decoder && (
            <span className="text-[10px] text-gray-600 font-mono ml-1">
              {decoder === 'native' ? 'native' : 'jsQR'}
            </span>
          )}
        </div>
        <button
          onClick={() => { stopCamera(); onClose() }}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 text-white"
        >
          <X size={18} />
        </button>
      </div>

      {/* Camera viewfinder */}
      {(status === 'starting' || status === 'scanning') && (
        <div className="flex-1 relative overflow-hidden">
          <video ref={videoRef}
            className="absolute inset-0 w-full h-full object-cover"
            playsInline muted autoPlay />
          <canvas ref={canvasRef} className="hidden" />

          {/* Scan frame */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="relative w-64 h-64">
              {[
                'top-0 left-0 border-t-4 border-l-4 rounded-tl-lg',
                'top-0 right-0 border-t-4 border-r-4 rounded-tr-lg',
                'bottom-0 left-0 border-b-4 border-l-4 rounded-bl-lg',
                'bottom-0 right-0 border-b-4 border-r-4 rounded-br-lg',
              ].map((cls, i) => (
                <span key={i} className={`absolute w-8 h-8 border-[#5AAEE8] ${cls}`} />
              ))}
              {status === 'scanning' && (
                <div className="absolute left-0 right-0 h-0.5 bg-[#5AAEE8]/80"
                  style={{ animation: 'qrscan 2s ease-in-out infinite' }} />
              )}
            </div>
          </div>

          <div className="absolute bottom-8 left-0 right-0 flex flex-col items-center gap-3">
            {status === 'starting' && (
              <div className="flex items-center gap-2 bg-black/50 px-4 py-2 rounded-full">
                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span className="text-white/70 text-sm">Starting camera…</span>
              </div>
            )}
            {status === 'scanning' && (
              <>
                <span className="text-white/70 text-sm bg-black/40 px-3 py-1 rounded-full">
                  Point at the QR code on the machine label
                </span>
                <button
                  onClick={() => setStatus('manual')}
                  className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white/80 transition-colors"
                >
                  <Keyboard size={12} /> Enter token manually
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Found */}
      {status === 'found' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
          <div className="w-16 h-16 rounded-full bg-green-500/20 border-2 border-green-500/50 flex items-center justify-center">
            <QrCode size={28} className="text-green-400" />
          </div>
          <p className="text-white text-lg font-semibold">Code scanned</p>
          <p className="text-gray-400 text-sm">Loading inspection…</p>
        </div>
      )}

      {/* Error */}
      {status === 'error' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
          <div className="w-16 h-16 rounded-full bg-red-500/20 border-2 border-red-500/40 flex items-center justify-center">
            <X size={28} className="text-red-400" />
          </div>
          <p className="text-red-300 text-sm text-center">{error}</p>
          <div className="flex gap-3">
            <button
              onClick={() => { lastScan.current = ''; setStatus('starting') }}
              className="px-4 py-2 rounded-lg bg-gray-800 text-white text-sm"
            >
              Try again
            </button>
            <button
              onClick={() => setStatus('manual')}
              className="px-4 py-2 rounded-lg bg-[#2B7FC1] text-white text-sm"
            >
              Enter manually
            </button>
          </div>
        </div>
      )}

      {/* Manual entry */}
      {status === 'manual' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8">
          <QrCode size={36} className="text-gray-600" />
          <div className="w-full max-w-xs">
            <p className="text-gray-400 text-sm text-center mb-4">
              Enter the token from the machine label
            </p>
            <input
              type="text"
              value={manualTag}
              onChange={e => setManualTag(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleManualSubmit()}
              placeholder="e.g. ac28ef8d"
              autoFocus
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3
                text-white text-center text-lg font-mono tracking-wider
                focus:outline-none focus:border-[#2B7FC1]"
            />
            <button
              onClick={handleManualSubmit}
              disabled={!manualTag.trim() || searching}
              className="w-full mt-3 py-3 rounded-xl bg-[#2B7FC1] hover:bg-[#2470AD]
                disabled:opacity-40 text-white font-semibold transition-colors"
            >
              {searching ? 'Checking…' : 'Continue'}
            </button>
          </div>
          <button
            onClick={() => { lastScan.current = ''; setStatus('starting') }}
            className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
          >
            ← Back to camera
          </button>
        </div>
      )}

      <style>{`
        @keyframes qrscan {
          0%   { top: 0%;  opacity: 1; }
          48%  { opacity: 1; }
          50%  { top: 95%; opacity: 0; }
          52%  { top: 0%;  opacity: 0; }
          54%  { opacity: 1; }
          100% { top: 95%; opacity: 1; }
        }
      `}</style>
    </div>
  )
}
