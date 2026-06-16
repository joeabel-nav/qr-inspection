// ScanLanding.jsx
// Entry point for QR scan: ?asset=NVMT005
// Fetches equipment record and hands off to AssetConfirm.

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import Shell from '../components/Shell.jsx'

export default function ScanLanding() {
  const navigate  = useNavigate()
  const params    = new URLSearchParams(window.location.search)
  const assetTag  = params.get('asset')?.toUpperCase().trim()

  const [status, setStatus]   = useState('loading') // loading | found | not_found | error | no_tag
  const [equipment, setEquip] = useState(null)
  const [manualTag, setManual] = useState('')

  useEffect(() => {
    if (assetTag) {
      fetchEquipment(assetTag)
    } else {
      setStatus('no_tag')
    }
  }, [assetTag])

  async function fetchEquipment(tag) {
    setStatus('loading')
    const { data, error } = await supabase
      .from('equipment')
      .select('id, asset_tag, name, make, model, year, machine_type, company, meter_hours, odometer_km')
      .eq('asset_tag', tag)
      .single()

    if (error || !data) {
      setStatus('not_found')
      return
    }
    setEquip(data)
    setStatus('found')
  }

  function handleManualSubmit(e) {
    e.preventDefault()
    if (manualTag.trim()) fetchEquipment(manualTag.trim().toUpperCase())
  }

  function handleContinue() {
    // Pass equipment forward via sessionStorage so pages don't need URL params
    sessionStorage.setItem('nv_insp_equipment', JSON.stringify(equipment))
    navigate('/confirm')
  }

  // ── Loading ──────────────────────────────────────────────
  if (status === 'loading') {
    return (
      <Shell title="Navacon Inspection" subtitle="Loading asset…">
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-10 h-10 border-2 border-[#2B7FC1] border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-400 text-sm">Looking up asset…</p>
        </div>
      </Shell>
    )
  }

  // ── Found ────────────────────────────────────────────────
  if (status === 'found' && equipment) {
    return (
      <Shell title="Asset found" subtitle="Navacon Construction">
        <div className="space-y-4">
          <AssetCard equipment={equipment} />
          <p className="text-sm text-gray-400 leading-relaxed">
            Confirm this is the correct machine before starting the inspection.
          </p>
          <button onClick={handleContinue} className="w-full bg-[#2B7FC1] hover:bg-[#2470AD] text-white font-medium rounded-xl py-4 text-base transition-colors">
            Yes, this is correct — continue
          </button>
          <button
            onClick={() => setStatus('no_tag')}
            className="w-full bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium rounded-xl py-3.5 text-base transition-colors"
          >
            Wrong machine — re-enter tag
          </button>
        </div>
      </Shell>
    )
  }

  // ── Not found / manual entry ─────────────────────────────
  return (
    <Shell title="Enter asset tag" subtitle="Navacon Construction">
      <div className="space-y-5">
        {status === 'not_found' && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
            <p className="text-red-400 text-sm font-medium">Asset not found</p>
            <p className="text-red-300/70 text-xs mt-1">
              "{assetTag || manualTag}" doesn't match any active equipment. Check the tag and try again.
            </p>
          </div>
        )}

        <div className="bg-gray-900 border border-white/[0.06] rounded-2xl p-5 flex flex-col items-center gap-3">
          {/* QR icon placeholder */}
          <div className="w-16 h-16 rounded-xl bg-gray-800 flex items-center justify-center">
            <svg className="w-8 h-8 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M6.75 6.75h.75v.75h-.75v-.75zM6.75 16.5h.75v.75h-.75v-.75zM16.5 6.75h.75v.75h-.75v-.75zM13.5 13.5h.75v.75h-.75v-.75zM13.5 18.75h.75v.75h-.75v-.75zM18.75 13.5h.75v.75h-.75v-.75zM16.5 16.5h.75v.75h-.75v-.75zM18.75 18.75h.75v.75h-.75v-.75z" />
            </svg>
          </div>
          <p className="text-gray-400 text-sm text-center">
            QR scanning not available — enter the asset tag printed on the label
          </p>
        </div>

        <form onSubmit={handleManualSubmit} className="space-y-3">
          <input
            type="text"
            value={manualTag}
            onChange={e => setManual(e.target.value.toUpperCase())}
            placeholder="e.g. NVMT005"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-3.5 text-base placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#2B7FC1] focus:border-transparent text-center tracking-widest text-lg font-mono"
          />
          <button
            type="submit"
            disabled={!manualTag.trim()}
            className="w-full bg-[#2B7FC1] hover:bg-[#2470AD] disabled:opacity-40 text-white font-medium rounded-xl py-4 text-base transition-colors"
          >
            Find Equipment
          </button>
        </form>
      </div>
    </Shell>
  )
}

function AssetCard({ equipment }) {
  const typeLabel = {
    MT: 'Mobile Tracked', MW: 'Mobile Wheeled', DT: 'Dump Truck',
    TW: 'Tri-Axle', FV: 'Fleet Vehicle',
  }[equipment.machine_type] ?? equipment.machine_type ?? 'Equipment'

  return (
    <div className="bg-gray-900 border border-white/[0.06] rounded-2xl p-4 space-y-3">
      <div>
        <span className="inline-block bg-[#2B7FC1]/10 text-[#5AAEE8] text-xs font-medium px-3 py-1 rounded-full tracking-wide">
          {equipment.asset_tag}
        </span>
      </div>
      <div>
        <div className="text-white font-medium text-lg leading-snug">
          {equipment.year} {equipment.make} {equipment.model}
        </div>
        <div className="text-gray-400 text-sm mt-0.5">{typeLabel}</div>
        {equipment.name && equipment.name !== `${equipment.make} ${equipment.model}` && (
          <div className="text-gray-500 text-xs mt-0.5">"{equipment.name}"</div>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {equipment.company && (
          <Pill label="Company" value={equipment.company} />
        )}
        {equipment.meter_hours != null && (
          <Pill label="Hours" value={Number(equipment.meter_hours).toLocaleString()} />
        )}
        {equipment.odometer_km != null && (
          <Pill label="km" value={Number(equipment.odometer_km).toLocaleString()} />
        )}
      </div>
    </div>
  )
}

function Pill({ label, value }) {
  return (
    <div className="bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-1.5 text-xs text-gray-400">
      {label} <span className="text-white font-medium">{value}</span>
    </div>
  )
}
