// EmployeePin.jsx
// 4-digit employee number entry. Always requires manual entry.
// Looks up technicians.inspection_pin first, falls back to qr_inspectors.
// On first use: prompts for name, creates qr_inspectors row.
// Device flag logged silently if number differs from stored value.

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { getDeviceId, getStoredEmployeeNumber, storeEmployeeNumber, isDeviceFlagged } from '../lib/device.js'
import Shell from '../components/Shell.jsx'

const KEYS = ['1','2','3','4','5','6','7','8','9','','0','⌫']

export default function EmployeePin() {
  const navigate   = useNavigate()
  const equipment  = JSON.parse(sessionStorage.getItem('nv_insp_equipment') || 'null')

  const [pin,       setPin]       = useState('')
  const [phase,     setPhase]     = useState('pin')   // pin | name | checking | error
  const [name,      setName]      = useState('')
  const [errorMsg,  setErrorMsg]  = useState('')
  const [checking,  setChecking]  = useState(false)

  if (!equipment) { navigate('/inspect'); return null }

  function pressKey(key) {
    if (key === '⌫') { setPin(p => p.slice(0, -1)); return }
    if (key === '')   return
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

    // 1. Check technicians table
    const { data: tech } = await supabase
      .from('technicians')
      .select('id, full_name, inspection_pin')
      .eq('inspection_pin', empNumber)
      .eq('is_active', true)
      .maybeSingle()

    if (tech) {
      // Found in technicians
      storeEmployeeNumber(empNumber)
      sessionStorage.setItem('nv_insp_inspector', JSON.stringify({
        type: 'technician',
        id: tech.id,
        name: tech.full_name,
        employee_number: empNumber,
        device_flag: flagged,
        device_hint: deviceId,
      }))
      setChecking(false)
      navigate('/run')
      return
    }

    // 2. Check qr_inspectors
    const { data: qrInsp } = await supabase
      .from('qr_inspectors')
      .select('id, full_name')
      .eq('employee_number', empNumber)
      .maybeSingle()

    if (qrInsp) {
      // Update last_seen_at
      await supabase
        .from('qr_inspectors')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('id', qrInsp.id)

      storeEmployeeNumber(empNumber)
      sessionStorage.setItem('nv_insp_inspector', JSON.stringify({
        type: 'qr_inspector',
        id: qrInsp.id,
        name: qrInsp.full_name,
        employee_number: empNumber,
        device_flag: flagged,
        device_hint: deviceId,
      }))
      setChecking(false)
      navigate('/run')
      return
    }

    // 3. Unknown number — ask for name
    setChecking(false)
    setPhase('name')
  }

  async function handleNameSubmit() {
    if (!name.trim()) return
    setChecking(true)
    setErrorMsg('')

    const empNumber = pin
    const flagged   = isDeviceFlagged(empNumber)
    const deviceId  = getDeviceId()

    const { data: newInsp, error } = await supabase
      .from('qr_inspectors')
      .insert({ employee_number: empNumber, full_name: name.trim() })
      .select('id')
      .single()

    if (error || !newInsp) {
      setChecking(false)
      setErrorMsg('Could not create your profile. Please try again.')
      return
    }

    storeEmployeeNumber(empNumber)
    sessionStorage.setItem('nv_insp_inspector', JSON.stringify({
      type: 'qr_inspector',
      id: newInsp.id,
      name: name.trim(),
      employee_number: empNumber,
      device_flag: flagged,
      device_hint: deviceId,
    }))
    setChecking(false)
    navigate('/run')
  }

  // ── Name entry phase ─────────────────────────────────────
  if (phase === 'name') {
    return (
      <Shell title="First time on this device" subtitle={`${equipment.asset_tag} · Employee #${pin}`}>
        <div className="space-y-5">
          <p className="text-sm text-gray-400 leading-relaxed">
            Employee number <span className="text-white font-medium">{pin}</span> hasn't been used on this device before. Enter your name so your inspection can be recorded.
          </p>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Your full name"
            autoFocus
            className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-3.5 text-base placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#2B7FC1] focus:border-transparent"
          />
          {errorMsg && (
            <p className="text-red-400 text-sm">{errorMsg}</p>
          )}
          <button
            onClick={handleNameSubmit}
            disabled={!name.trim() || checking}
            className="w-full bg-[#2B7FC1] hover:bg-[#2470AD] disabled:opacity-40 text-white font-medium rounded-xl py-4 text-base transition-colors"
          >
            {checking ? 'Saving…' : 'Continue'}
          </button>
          <button
            onClick={() => { setPin(''); setPhase('pin') }}
            className="w-full bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium rounded-xl py-3.5 text-base transition-colors"
          >
            Back — re-enter number
          </button>
        </div>
      </Shell>
    )
  }

  // ── PIN entry phase ──────────────────────────────────────
  return (
    <Shell title="Employee number" subtitle={`${equipment.asset_tag} · ${equipment.make} ${equipment.model}`}>
      <div className="space-y-6">
        <p className="text-sm text-gray-400">
          Enter your 4-digit employee number to begin the inspection.
        </p>

        {/* PIN dots */}
        <div className="flex justify-center gap-4 py-2">
          {[0,1,2,3].map(i => (
            <div
              key={i}
              className={`w-5 h-5 rounded-full border-2 transition-colors ${
                i < pin.length
                  ? 'bg-[#2B7FC1] border-[#2B7FC1]'
                  : 'bg-transparent border-gray-600'
              }`}
            />
          ))}
        </div>

        {/* Keypad */}
        <div className="grid grid-cols-3 gap-3">
          {KEYS.map((key, idx) => (
            <button
              key={idx}
              onClick={() => pressKey(key)}
              disabled={checking || key === ''}
              className={`
                py-5 rounded-2xl text-xl font-medium transition-colors
                ${key === ''
                  ? 'bg-transparent cursor-default'
                  : key === '⌫'
                    ? 'bg-gray-800 hover:bg-gray-700 text-gray-400 text-base'
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
            Verifying…
          </div>
        )}
      </div>
    </Shell>
  )
}
