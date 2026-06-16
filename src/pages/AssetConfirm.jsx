// AssetConfirm.jsx
// Shows asset identity card + open defect summary.
// User confirms or goes back to re-enter tag.

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { isOnline } from '../lib/connectivity.js'
import Shell from '../components/Shell.jsx'

export default function AssetConfirm() {
  const navigate   = useNavigate()
  const equipment  = JSON.parse(sessionStorage.getItem('nv_insp_equipment') || 'null')

  const [defects,  setDefects]  = useState([])
  const [online,   setOnline]   = useState(true)
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    if (!equipment) { navigate('/inspect'); return }
    init()
  }, [])

  async function init() {
    const online = await isOnline()
    setOnline(online)

    if (online) {
      const { data } = await supabase
        .from('defects')
        .select('id, description, status, created_at')
        .eq('equipment_id', equipment.id)
        .neq('status', 'resolved')
        .order('created_at', { ascending: true })
      setDefects(data || [])
    } else {
      // Try to use cached defects
      const cached = sessionStorage.getItem(`nv_defects_${equipment.id}`)
      if (cached) setDefects(JSON.parse(cached))
    }

    setLoading(false)
  }

  function handleContinue() {
    // Persist defects for use during inspection
    sessionStorage.setItem(`nv_defects_${equipment.id}`, JSON.stringify(defects))
    navigate('/pin')
  }

  if (!equipment) return null

  const typeLabel = {
    MT: 'Mobile Tracked', MW: 'Mobile Wheeled', DT: 'Dump Truck',
    TW: 'Tri-Axle', FV: 'Fleet Vehicle',
  }[equipment.machine_type] ?? equipment.machine_type ?? 'Equipment'

  return (
    <Shell title="Confirm machine" subtitle="Navacon Construction">
      <div className="space-y-4">

        {/* Offline banner */}
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

        {/* Open defects summary */}
        {!loading && (
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
            {defects.length > 0 ? (
              <p className="text-sm text-gray-400">
                {defects.length} open {defects.length === 1 ? 'defect' : 'defects'} will appear during the inspection for you to update.
              </p>
            ) : (
              <p className="text-sm text-gray-400">No open defects on record for this machine.</p>
            )}
          </div>
        )}

        <p className="text-sm text-gray-400 leading-relaxed">
          Is this the correct machine?
        </p>

        <button onClick={handleContinue} className="w-full bg-[#2B7FC1] hover:bg-[#2470AD] text-white font-medium rounded-xl py-4 text-base transition-colors">
          Yes — begin inspection
        </button>
        <button
          onClick={() => navigate('/inspect')}
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
