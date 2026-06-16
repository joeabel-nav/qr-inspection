// EmployeePin.jsx
// First screen after QR scan.
// - Token from URL passed as prop via router state
// - 4-digit employee number, always entered manually
// - 3 failed attempts = 2 minute lockout (localStorage, per device)
// - Does NOT create new inspector records — that happens after asset confirm
// - On success: stores inspector identity in session, navigates to /confirm

import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { getDeviceId, getStoredEmployeeNumber, storeEmployeeNumber, isDeviceFlagged } from '../lib/device.js'
import Shell from '../components/Shell.jsx'

const KEYS        = ['1','2','3','4','5','6','7','8','9','','0','⌫']
const MAX_TRIES   = 3
const LOCKOUT_MS  = 2 * 60 * 1000  // 2 minutes
const LOCKOUT_KEY = 'nv_insp_lockout'

export default function EmployeePin() {
  const navigate = useNavigate()
  const location = useLocation()

  // Token comes from ScanLanding via router state
  const token = location.state?.token || new URLSearchParams(window.location.search).get('t')

  const [pin,       setPin]      = useState('')
  const [checking,  setChecking] = useState(false)
  const [errorMsg,  setErrorMsg] = useState('')
  const [tries,     setTries]    = useState(0)
  const [lockout,   setLockout]  = useState(null) // null or Date when lockout expires
  const [countdown, setCountdown] = useState(0)

  // Check for existing lockout on mount
  useEffect(() => {
    const stored = localStorage.getItem(LOCKOUT_KEY)
    if (stored) {
      const expiry = new Date(stored)
      if (expiry > new Date()) {
        setLockout(expiry)
      } else {
        localStorage.removeItem(LOCKOUT_KEY)
      }
    }
  }, [])

  // Countdown timer during lockout
  useEffect(() => {
    if (!lockout) return
    const interval = setInterval(() => {
      const remaining = Math.ceil((lockout - new Date()) / 1000)
      if (remaining <= 0) {
        setLockout(null)
        setTries(0)
        setCountdown(0)
        localStorage.removeItem(LOCKOUT_KEY)
        clearInterval(interval)
      } else {
        setCountdown(remaining)
      }
    }, 500)
    return () => clearInterval(interval)
  }, [lockout])

  if (!token) {
    return (
      <Shell title="Invalid QR code" subtitle="Navacon Inspection">
        <div className="space-y-4 py-8 text-center">
          <p className="text-gray-400 text-sm">This QR code is not valid. Please scan the code printed on the machine.</p>
        </div>
      </Shell>
    )
  }

  function pressKey(key) {
    if (lockout || checking) return
    if (key === '⌫') { setPin(p => p.slice(0, -1)); setErrorMsg(''); return }
    if (key === '') return
    if (pin.length >= 4) return
    const next = pin + key
    setPin(next)
    if (next.length === 4) handlePinComplete(next)
  }

  async function handlePinComplete(empNumber) {
    setChecking(true)
    setErrorMsg('')

    const flagged  = isDeviceFlagged(empNumber)
    const deviceId = getDeviceId()

    // 1. Check technicians
    const { data: tech } = await supabase
      .from('technicians')
      .select('id, full_name, inspection_pin')
      .eq('inspection_pin', empNumber)
      .eq('is_active', true)
      .maybeSingle()

    if (tech) {
      storeEmployeeNumber(empNumber)
      sessionStorage.setItem('nv_insp_inspector', JSON.stringify({
        type:            'technician',
        id:              tech.id,
        name:            tech.full_name,
        employee_number: empNumber,
        device_flag:     flagged,
        device_hint:     deviceId,
        needs_name:      false,
      }))
      setChecking(false)
      navigate('/confirm', { state: { token } })
      return
    }

    // 2. Check qr_inspectors
    const { data: qrInsp } = await supabase
      .from('qr_inspectors')
      .select('id, full_name')
      .eq('employee_number', empNumber)
      .maybeSingle()

    if (qrInsp) {
      await supabase
        .from('qr_inspectors')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('id', qrInsp.id)

      storeEmployeeNumber(empNumber)
      sessionStorage.setItem('nv_insp_inspector', JSON.stringify({
        type:            'qr_inspector',
        id:              qrInsp.id,
        name:            qrInsp.full_name,
        employee_number: empNumber,
        device_flag:     flagged,
        device_hint:     deviceId,
        needs_name:      false,
      }))
      setChecking(false)
      navigate('/confirm', { state: { token } })
      return
    }

    // 3. Unknown number — store partial identity, name collected after asset confirm
    storeEmployeeNumber(empNumber)
    sessionStorage.setItem('nv_insp_inspector', JSON.stringify({
      type:            'qr_inspector',
      id:              null,
      name:            null,
      employee_number: empNumber,
      device_flag:     flagged,
      device_hint:     deviceId,
      needs_name:      true,   // AssetConfirm will prompt for name
    }))
    setChecking(false)
    navigate('/confirm', { state: { token } })
  }

  function handleBadPin() {
    const newTries = tries + 1
    setTries(newTries)
    setPin('')
    if (newTries >= MAX_TRIES) {
      const expiry = new Date(Date.now() + LOCKOUT_MS)
      setLockout(expiry)
      localStorage.setItem(LOCKOUT_KEY, expiry.toISOString())
      setErrorMsg('')
    } else {
      setErrorMsg(`Incorrect number. ${MAX_TRIES - newTries} attempt${MAX_TRIES - newTries !== 1 ? 's' : ''} remaining.`)
    }
  }

  // ── Lockout screen ────────────────────────────────────────
  if (lockout) {
    const mins = Math.floor(countdown / 60)
    const secs = countdown % 60
    return (
      <Shell title="Too many attempts" subtitle="Navacon Inspection">
        <div className="space-y-6 py-8">
          <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-6 text-center space-y-3">
            <div className="text-4xl">🔒</div>
            <p className="text-red-400 font-medium">Entry locked</p>
            <p className="text-gray-400 text-sm leading-relaxed">
              Too many incorrect attempts. Please wait before trying again.
            </p>
            <div className="text-3xl font-light text-white pt-2">
              {mins > 0 ? `${mins}:${secs.toString().padStart(2,'0')}` : `${secs}s`}
            </div>
          </div>
        </div>
      </Shell>
    )
  }

  // ── PIN entry ─────────────────────────────────────────────
  return (
    <Shell title="Navacon Inspection" subtitle="Enter your employee number">
      <div className="space-y-6">
        <p className="text-sm text-gray-400">
          Enter your 4-digit employee number to begin.
        </p>

        {/* PIN dots */}
        <div className="flex justify-center gap-4 py-2">
          {[0,1,2,3].map(i => (
            <div
              key={i}
              className={`w-5 h-5 rounded-full border-2 transition-all duration-100 ${
                i < pin.length
                  ? 'bg-[#2B7FC1] border-[#2B7FC1] scale-110'
                  : 'bg-transparent border-gray-600'
              }`}
            />
          ))}
        </div>

        {errorMsg && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-center">
            <p className="text-red-400 text-sm">{errorMsg}</p>
          </div>
        )}

        {/* Keypad */}
        <div className="grid grid-cols-3 gap-3">
          {KEYS.map((key, idx) => (
            <button
              key={idx}
              onPointerDown={() => pressKey(key)}
              disabled={checking || !key}
              className={`
                py-5 rounded-2xl text-xl font-medium transition-colors select-none
                ${key === ''
                  ? 'bg-transparent cursor-default'
                  : key === '⌫'
                    ? 'bg-gray-800 hover:bg-gray-700 active:bg-gray-600 text-gray-400 text-base'
                    : 'bg-gray-900 hover:bg-gray-800 active:bg-gray-700 text-white border border-white/[0.06]'
                }
              `}
            >
              {key}
            </button>
          ))}
        </div>

        {checking && (
          <div className="flex items-center justify-center gap-2 text-gray-400 text-sm">
            <div className="w-4 h-4 border-2 border-[#2B7FC1] border-t-transparent rounded-full animate-spin" />
            Checking…
          </div>
        )}

        {tries > 0 && !errorMsg && (
          <p className="text-center text-gray-600 text-xs">
            {MAX_TRIES - tries} attempt{MAX_TRIES - tries !== 1 ? 's' : ''} remaining before lockout
          </p>
        )}
      </div>
    </Shell>
  )
}
