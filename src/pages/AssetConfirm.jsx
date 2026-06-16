// AssetConfirm.jsx
// Second screen — shown after PIN entry.
// Looks up equipment by qr_token, shows asset card.
// If inspector needs_name (new user), prompts for name here before continuing.

import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { isOnline } from '../lib/connectivity.js'
import Shell from '../components/Shell.jsx'
import QrScannerOverlay from '../components/QrScannerOverlay.jsx'

export default function AssetConfirm() {
  const navigate  = useNavigate()
  const location  = useLocation()
  const token     = location.state?.token || new URLSearchParams(window.location.search).get('t')
  const inspector = JSON.parse(sessionStorage.getItem('nv_insp_inspector') || 'null')

  const [equipment, setEquipment] = useState(null)
  const [defects,   setDefects]   = useState([])
  const [online,    setOnline]    = useState(true)
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState('')
  // Name collection for new inspectors
  const [name,      setName]      = useState('')
  const [savingName, setSavingName] = useState(false)
  const [nameError,  setNameError]  = useState('')
  const [showScanner, setShowScanner] = useState(false)

  useEffect(() => {
    if (!token || !inspector) { navigate('/inspect'); return }
    init()
  }, [])

  async function init() {
    const online = await isOnline()
    setOnline(online)

    // Look up equipment by token
    const { data: equip, error: equipErr } = await supabase
      .from('equipment')
      .select('id, asset_tag, name, make, model, year, machine_type, company, meter_hours, odometer_km')
      .eq('qr_token', token)
      .eq('is_active', true)
      .maybeSingle()

    if (equipErr || !equip) {
      setError('This QR code does not match any active equipment. It may have been regenerated.')
      setLoading(false)
      return
    }

    setEquipment(equip)
    sessionStorage.setItem('nv_insp_equipment', JSON.stringify(equip))

    // Load open defects
    if (online) {
      const { data } = await supabase
        .from('defects')
        .select('id, description, status, created_at')
        .eq('equipment_id', equip.id)
        .neq('status', 'resolved')
        .order('created_at', { ascending: true })
      const defectList = data || []
      setDefects(defectList)
      sessionStorage.setItem(`nv_defects_${equip.id}`, JSON.stringify(defectList))
    } else {
      const cached = sessionStorage.getItem(`nv_defects_${equip.id}`)
      if (cached) setDefects(JSON.parse(cached))
    }

    setLoading(false)
  }

  async function handleNameSubmit() {
    if (!name.trim()) return
    setSavingName(true)
    setNameError('')

    const { data: newInsp, error } = await supabase
      .from('qr_inspectors')
      .insert({
        employee_number: inspector.employee_number,
        full_name:       name.trim(),
      })
      .select('id')
      .single()

    if (error || !newInsp) {
      setSavingName(false)
      setNameError('Could not save your name. Please try again.')
      return
    }

    // Update session with real id and name
    const updated = { ...inspector, id: newInsp.id, name: name.trim(), needs_name: false }
    sessionStorage.setItem('nv_insp_inspector', JSON.stringify(updated))
    setSavingName(false)
    navigate('/run')
  }

  function handleContinue() {
    navigate('/run')
  }

  if (showScanner) {
    return (
      <QrScannerOverlay
        onClose={() => setShowScanner(false)}
        onFound={(scannedToken) => {
          setShowScanner(false)
          navigate('/pin', { state: { token: scannedToken } })
        }}
      />
    )
  }

  // ── Loading ───────────────────────────────────────────────
  if (loading) {
    return (
      <Shell title="Loading…" subtitle="Navacon Inspection">
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-10 h-10 border-2 border-[#2B7FC1] border-t-transparent rounded-full animate-spin" />
        </div>
      </Shell>
    )
  }

  // ── Token error ───────────────────────────────────────────
  if (error) {
    return (
      <Shell title="QR code not recognised" subtitle="Navacon Inspection">
        <div className="space-y-4 py-4">
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
          <button onClick={() => navigate('/inspect')} className="w-full bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium rounded-xl py-3.5 text-base transition-colors">
            Back
          </button>
        </div>
      </Shell>
    )
  }

  // ── Name entry for new inspector ──────────────────────────
  if (inspector?.needs_name) {
    return (
      <Shell title="One more thing" subtitle={equipment?.asset_tag}>
        <div className="space-y-5">
          <p className="text-sm text-gray-400 leading-relaxed">
            Employee number <span className="text-white font-medium">{inspector.employee_number}</span> is new to this system. Enter your name so your inspections can be recorded.
          </p>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Your full name"
            autoFocus
            className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-3.5 text-base placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#2B7FC1] focus:border-transparent"
          />
          {nameError && <p className="text-red-400 text-sm">{nameError}</p>}
          <button
            onClick={handleNameSubmit}
            disabled={!name.trim() || savingName}
            className="w-full bg-[#2B7FC1] hover:bg-[#2470AD] disabled:opacity-40 text-white font-medium rounded-xl py-4 text-base transition-colors"
          >
            {savingName ? 'Saving…' : 'Continue'}
          </button>
          <button
            onClick={() => navigate('/inspect')}
            className="w-full bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium rounded-xl py-3.5 text-base transition-colors"
          >
            Cancel
          </button>
        </div>
      </Shell>
    )
  }

  // ── Asset confirmation ────────────────────────────────────
  const typeLabel = {
    MT: 'Mobile Tracked', MW: 'Mobile Wheeled', DT: 'Dump Truck',
    TW: 'Tri-Axle', FV: 'Fleet Vehicle',
  }[equipment.machine_type] ?? equipment.machine_type ?? 'Equipment'

  return (
    <Shell title="Confirm machine" subtitle={`Employee ${inspector?.employee_number}`}>
      <div className="space-y-4">

        {!online && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex gap-3">
            <svg className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <p className="text-amber-300 text-sm leading-relaxed">
              You appear to be offline. Your inspection will be saved locally and must be synced before it is officially recorded.
            </p>
          </div>
        )}

        {/* Asset card */}
        <div className="bg-gray-900 border border-white/[0.06] rounded-2xl p-4 space-y-3">
          <span className="inline-block bg-[#2B7FC1]/10 text-[#5AAEE8] text-xs font-medium px-3 py-1 rounded-full tracking-wide">
            {equipment.asset_tag}
          </span>
          <div>
            <div className="text-white font-medium text-lg leading-snug">
              {equipment.year} {equipment.make} {equipment.model}
            </div>
            <div className="text-gray-400 text-sm mt-0.5">{typeLabel}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            {equipment.company && <Pill label="Company" value={equipment.company} />}
            {equipment.meter_hours != null && <Pill label="Hours" value={Number(equipment.meter_hours).toLocaleString()} />}
          </div>
        </div>

        {/* Open defects */}
        <div className="bg-gray-900 border border-white/[0.06] rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500 uppercase tracking-wide">Open defects</span>
            {defects.length > 0 ? (
              <span className="bg-red-500/10 text-red-400 border border-red-500/20 text-xs px-2.5 py-1 rounded-full">
                {defects.length} open
              </span>
            ) : (
              <span className="bg-green-500/10 text-green-400 border border-green-500/20 text-xs px-2.5 py-1 rounded-full">
                None
              </span>
            )}
          </div>
          <p className="text-sm text-gray-400">
            {defects.length > 0
              ? `${defects.length} open ${defects.length === 1 ? 'defect' : 'defects'} will appear during the inspection.`
              : 'No open defects on record for this machine.'}
          </p>
        </div>

        <p className="text-sm text-gray-400">Is this the correct machine?</p>

        <button onClick={handleContinue} className="w-full bg-[#2B7FC1] hover:bg-[#2470AD] text-white font-medium rounded-xl py-4 text-base transition-colors">
          Yes — begin inspection
        </button>
        <button
          onClick={() => setShowScanner(true)}
          className="w-full bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium rounded-xl py-3.5 text-base transition-colors"
        >
          Wrong machine — re-scan
        </button>
      </div>
    </Shell>
  )
}

function Pill({ label, value }) {
  return (
    <div className="bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-1.5 text-xs text-gray-400">
      {label} <span className="text-white font-medium">{value}</span>
    </div>
  )
}
