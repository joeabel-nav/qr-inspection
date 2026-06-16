// Complete.jsx
// Calculates quality score, submits inspection to Supabase,
// handles online vs offline paths.

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { isOnline } from '../lib/connectivity.js'
import Shell from '../components/Shell.jsx'

export default function Complete() {
  const navigate   = useNavigate()
  const equipment  = JSON.parse(sessionStorage.getItem('nv_insp_equipment') || 'null')
  const inspector  = JSON.parse(sessionStorage.getItem('nv_insp_inspector') || 'null')
  const responses  = JSON.parse(sessionStorage.getItem('nv_insp_responses') || '[]')
  const templateId = sessionStorage.getItem('nv_insp_template_id') || null

  // Score is calculated immediately via initialiser — never null
  const [score,  setScore]  = useState(() => calculateScore(responses))
  // If session data is missing, go straight to redirect phase
  const [phase,  setPhase]  = useState(!equipment || !inspector ? 'redirect' : 'confirm')
  const [online, setOnline] = useState(true)
  const [errMsg, setErrMsg] = useState('')

  useEffect(() => {
    if (!equipment || !inspector) { navigate('/inspect'); return }
    isOnline().then(setOnline)
  }, [])

  async function handleSubmit() {
    setPhase('submitting')

    const inspectionPayload = {
      equipment_id:              equipment.id,
      template_id:               templateId,
      inspector_technician_id:   inspector.type === 'technician' ? inspector.id : null,
      inspector_qr_id:           inspector.type === 'qr_inspector' ? inspector.id : null,
      inspector_employee_number: inspector.employee_number,
      inspected_at:              new Date().toISOString(),
      quality_score:             score.total,
      status:                    'submitted',
      source:                    'qr-inspection',
      offline_submitted:         false,
      device_hint:               inspector.device_hint,
      device_flag:               inspector.device_flag || false,
    }

    if (!online) {
      const queue = JSON.parse(localStorage.getItem('nv_insp_queue') || '[]')
      queue.push({ inspection: inspectionPayload, responses, queued_at: new Date().toISOString() })
      localStorage.setItem('nv_insp_queue', JSON.stringify(queue))
      setPhase('offline_saved')
      return
    }

    const { data: insp, error: inspErr } = await supabase
      .from('inspections')
      .insert(inspectionPayload)
      .select('id')
      .single()

    if (inspErr || !insp) {
      setErrMsg(inspErr?.message || 'Unknown error')
      setPhase('error')
      return
    }

    const responseRows = responses.map(r => ({
      inspection_id:          insp.id,
      question_id:            r.question_id,
      defect_id:              r.defect_id,
      attention_trap_id:      r.attention_trap_id,
      question_text:          r.question_text,
      question_type:          r.question_type,
      response:               r.response,
      time_spent_seconds:     r.time_spent_seconds,
      attention_trap_correct: r.attention_trap_correct,
    }))

    if (responseRows.length > 0) {
      await supabase.from('qr_inspection_responses').insert(responseRows)
    }

    const defectUpdates = responses.filter(r => r.defect_id && r.response)
    for (const r of defectUpdates) {
      const update = {
        status:       r.response,
        source:       'qr-inspection',
        last_seen_at: new Date().toISOString(),
        updated_at:   new Date().toISOString(),
      }
      if (r.response === 'resolved') update.resolved_at = new Date().toISOString()
      await supabase.from('defects').update(update).eq('id', r.defect_id)
    }

    clearSession(equipment.id)
    setPhase('done')
  }

  function handleStartAnother() {
    navigate('/inspect')
  }

  // ── Screens ───────────────────────────────────────────────

  // Waiting for useEffect redirect — render nothing
  if (phase === 'redirect') return null

  if (phase === 'submitting') {
    return (
      <Shell title="Submitting…" subtitle={equipment?.asset_tag}>
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-10 h-10 border-2 border-[#2B7FC1] border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-400 text-sm">Saving inspection…</p>
        </div>
      </Shell>
    )
  }

  if (phase === 'error') {
    return (
      <Shell title="Submission failed" subtitle={equipment?.asset_tag}>
        <div className="space-y-4">
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
            <p className="text-red-400 text-sm font-medium">Could not save inspection</p>
            <p className="text-red-300/70 text-xs mt-1">{errMsg}</p>
          </div>
          <button onClick={handleSubmit} className="w-full bg-[#2B7FC1] hover:bg-[#2470AD] text-white font-medium rounded-xl py-4 text-base transition-colors">
            Try again
          </button>
        </div>
      </Shell>
    )
  }

  if (phase === 'done') {
    return (
      <Shell title="Inspection logged ✓" subtitle={equipment?.asset_tag}>
        <div className="space-y-5">
          <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-5 text-center">
            <div className="text-4xl mb-2">✓</div>
            <p className="text-green-400 font-medium text-base">Inspection submitted</p>
            <p className="text-gray-400 text-sm mt-1">
              {equipment?.asset_tag} · {inspector?.name}
            </p>
          </div>
          <ScoreSummary score={score} responses={responses} />
          <button onClick={handleStartAnother} className="w-full bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium rounded-xl py-3.5 text-base transition-colors">
            Inspect another machine
          </button>
        </div>
      </Shell>
    )
  }

  if (phase === 'offline_saved') {
    return (
      <Shell title="Saved locally" subtitle={equipment?.asset_tag}>
        <div className="space-y-5">
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-5">
            <p className="text-amber-400 font-medium text-base mb-2">Inspection saved offline</p>
            <p className="text-amber-300/70 text-sm leading-relaxed">
              You are offline. Your inspection has been saved on this device and will need to be synced before it is officially recorded. Return to this page when you have signal.
            </p>
          </div>
          <ScoreSummary score={score} responses={responses} />
          <button onClick={handleStartAnother} className="w-full bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium rounded-xl py-3.5 text-base transition-colors">
            Done
          </button>
        </div>
      </Shell>
    )
  }

  // phase === 'confirm'
  const defectResponses = responses.filter(r => r.defect_id && r.response)

  return (
    <Shell title="Inspection complete" subtitle={`${equipment?.asset_tag} · ${inspector?.name}`}>
      <div className="space-y-5">

        <ScoreRing value={score.total} />
        {score.feedback && (
          <p className="text-center text-gray-400 text-sm px-4">{score.feedback}</p>
        )}

        <ScoreSummary score={score} responses={responses} />

        {defectResponses.length > 0 && (
          <div className="bg-gray-900 border border-white/[0.06] rounded-2xl p-4 space-y-2">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-3">Defect updates</p>
            {defectResponses.map((r, i) => (
              <div key={i} className="flex items-center justify-between">
                <span className="text-gray-400 text-sm truncate flex-1 mr-3">{r.question_text}</span>
                <DefectStatusBadge status={r.response} />
              </div>
            ))}
          </div>
        )}

        <div className="text-center text-xs text-gray-600">
          {online ? '● Connected — will submit immediately' : '○ Offline — will save locally'}
        </div>

        <button
          onClick={handleSubmit}
          className="w-full bg-[#2B7FC1] hover:bg-[#2470AD] text-white font-medium rounded-xl py-4 text-base transition-colors"
        >
          {online ? 'Submit inspection' : 'Save locally'}
        </button>
      </div>
    </Shell>
  )
}

// ── Score calculation ─────────────────────────────────────────
function calculateScore(responses) {
  if (!responses || responses.length === 0) {
    return { total: 0, timing: 0, trap: 0, answered: 0, feedback: '', fastCount: 0, trapCorrect: null }
  }

  const answered  = responses.filter(r => r.response !== null && r.response !== undefined && r.response !== 'na')
  const skipped   = responses.length - answered.length
  const trapResp  = responses.find(r => r.question_type === 'attention_trap')
  const nonTrap   = responses.filter(r => r.question_type !== 'attention_trap')

  let timingScore = 100
  let fastCount   = 0
  for (const r of nonTrap) {
    if (r.time_spent_seconds !== null && r.time_spent_seconds < 2) fastCount++
  }
  if (nonTrap.length > 0) {
    timingScore = Math.max(0, 100 - Math.round((fastCount / nonTrap.length) * 100))
  }

  let trapScore   = 100
  let trapCorrect = null
  if (trapResp) {
    trapCorrect = trapResp.attention_trap_correct
    trapScore   = trapCorrect ? 100 : 20
  }

  const answeredScore = responses.length > 0
    ? Math.round(((responses.length - skipped) / responses.length) * 100)
    : 100

  const total = Math.round(
    timingScore   * 0.30 +
    trapScore     * 0.30 +
    answeredScore * 0.40
  )

  let feedback = ''
  if (total >= 90)      feedback = 'Excellent inspection — thorough and attentive.'
  else if (total >= 75) feedback = 'Good inspection. ' + (fastCount > 0 ? `${fastCount} question${fastCount > 1 ? 's' : ''} answered very quickly — take a moment on each item.` : '')
  else if (total >= 50) feedback = 'Inspection recorded. Take more time reading each question next time.'
  else                  feedback = 'Low quality score. Please slow down and read each question carefully.'

  return { total, timing: timingScore, trap: trapScore, answered: answeredScore, feedback, fastCount, trapCorrect }
}

// ── Sub-components ────────────────────────────────────────────
function ScoreRing({ value }) {
  const radius = 46
  const circ   = 2 * Math.PI * radius
  const offset = circ - (value / 100) * circ
  const color  = value >= 75 ? '#22c575' : value >= 50 ? '#EF9F27' : '#e24b4a'

  return (
    <div className="flex justify-center">
      <div className="relative w-28 h-28">
        <svg className="absolute inset-0" width="112" height="112" viewBox="0 0 112 112">
          <circle cx="56" cy="56" r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8"/>
          <circle cx="56" cy="56" r={radius} fill="none" stroke={color} strokeWidth="8"
            strokeDasharray={circ} strokeDashoffset={offset}
            strokeLinecap="round" transform="rotate(-90 56 56)"
            style={{ transition: 'stroke-dashoffset 1s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-light" style={{ color }}>{value}</span>
          <span className="text-gray-500 text-xs">/ 100</span>
        </div>
      </div>
    </div>
  )
}

function ScoreSummary({ score, responses }) {
  const answered = responses.filter(r => r.response !== null && r.response !== 'na').length
  return (
    <div className="grid grid-cols-2 gap-3">
      <ScoreCard label="Questions answered" value={`${answered} / ${responses.length}`} good={answered === responses.length} />
      <ScoreCard label="Attention check"    value={score.trapCorrect === null ? 'N/A' : score.trapCorrect ? 'Passed' : 'Failed'} good={score.trapCorrect !== false} />
      <ScoreCard label="Read time"          value={score.fastCount > 0 ? `${score.fastCount} rushed` : 'Good'} good={score.fastCount === 0} />
      <ScoreCard label="Quality score"      value={score.total + ' / 100'} good={score.total >= 75} />
    </div>
  )
}

function ScoreCard({ label, value, good }) {
  return (
    <div className="bg-gray-900 border border-white/[0.06] rounded-xl p-3">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-base font-medium ${good ? 'text-green-400' : 'text-amber-400'}`}>{value}</p>
    </div>
  )
}

function DefectStatusBadge({ status }) {
  const styles = {
    noted:     'bg-[#2B7FC1]/10 text-[#5AAEE8] border-[#2B7FC1]/20',
    unchanged: 'bg-gray-700/30 text-gray-400 border-gray-600',
    worsened:  'bg-amber-500/10 text-amber-400 border-amber-500/20',
    resolved:  'bg-green-500/10 text-green-400 border-green-500/20',
  }
  return (
    <span className={`text-xs border px-2.5 py-1 rounded-full flex-shrink-0 ${styles[status] || styles.noted}`}>
      {status?.charAt(0).toUpperCase() + status?.slice(1)}
    </span>
  )
}

function clearSession(equipmentId) {
  sessionStorage.removeItem('nv_insp_equipment')
  sessionStorage.removeItem('nv_insp_inspector')
  sessionStorage.removeItem('nv_insp_responses')
  sessionStorage.removeItem('nv_insp_template_id')
  sessionStorage.removeItem('nv_insp_questions')
  sessionStorage.removeItem(`nv_defects_${equipmentId}`)
}
