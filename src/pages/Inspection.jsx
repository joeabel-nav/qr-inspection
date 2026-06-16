// Inspection.jsx
// Runs the inspection: loads template, sequences questions,
// renders one at a time, tracks timing.

import { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import Shell from '../components/Shell.jsx'

// ── Tap timing constants (ms) ─────────────────────────────────
const PRESS_DELAY   = 150   // min hold before registering as intentional
const CONFIRM_DELAY = 300   // visual feedback window before advancing

export default function Inspection() {
  const navigate   = useNavigate()
  const equipment  = JSON.parse(sessionStorage.getItem('nv_insp_equipment') || 'null')
  const inspector  = JSON.parse(sessionStorage.getItem('nv_insp_inspector') || 'null')
  const defects    = JSON.parse(sessionStorage.getItem(`nv_defects_${equipment?.id}`) || '[]')

  const [loading,   setLoading]   = useState(true)
  const [questions, setQuestions] = useState([])
  const [current,   setCurrent]   = useState(0)
  const [responses, setResponses] = useState([])
  const [selected,  setSelected]  = useState(null)
  const [advancing, setAdvancing] = useState(false)
  const questionStart = useRef(Date.now())

  useEffect(() => {
    if (!equipment || !inspector) { navigate('/inspect'); return }
    loadTemplate()
  }, [])

  // ── Template loading ───────────────────────────────────────
  async function loadTemplate() {
    let template = null
    const { data: specific } = await supabase
      .from('inspection_templates')
      .select('id')
      .eq('asset_tag', equipment.asset_tag)
      .eq('is_active', true)
      .maybeSingle()

    if (specific) {
      template = specific
    } else {
      const { data: typed } = await supabase
        .from('inspection_templates')
        .select('id')
        .eq('machine_type', equipment.machine_type)
        .is('asset_tag', null)
        .eq('is_active', true)
        .maybeSingle()

      if (typed) {
        template = typed
      } else {
        const { data: generic } = await supabase
          .from('inspection_templates')
          .select('id')
          .is('machine_type', null)
          .is('asset_tag', null)
          .eq('is_active', true)
          .maybeSingle()
        template = generic
      }
    }

    let builtQuestions = []

    if (template) {
      sessionStorage.setItem('nv_insp_template_id', template.id)

      const { data: groups } = await supabase
        .from('inspection_groups')
        .select(`
          id, name, sort_order,
          inspection_questions (
            id, question_text, question_type, photo_required,
            expected_min_seconds, notes_prompt
          )
        `)
        .eq('template_id', template.id)
        .order('sort_order', { ascending: true })

      if (groups) {
        for (const group of groups) {
          const qs = shuffle(group.inspection_questions || [])
          for (const q of qs) {
            builtQuestions.push({ ...q, group_name: group.name, source: 'template' })
          }
        }
      }
    }

    for (const defect of defects) {
      builtQuestions.push({
        id: `defect_${defect.id}`,
        defect_id: defect.id,
        question_text: defect.description,
        question_type: 'defect_status',
        photo_required: false,
        expected_min_seconds: 5,
        notes_prompt: `First noted: ${new Date(defect.created_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}`,
        group_name: 'Open Defects',
        source: 'defect',
      })
    }

    const { data: traps } = await supabase
      .from('qr_attention_traps')
      .select('*')
      .eq('is_active', true)

    if (traps && traps.length > 0 && builtQuestions.length > 1) {
      const trap = traps[Math.floor(Math.random() * traps.length)]
      const insertAt = Math.floor(Math.random() * (builtQuestions.length - 1)) + 1
      builtQuestions.splice(insertAt, 0, {
        id: `trap_${trap.id}`,
        trap_id: trap.id,
        trap_data: trap,
        question_text: trap.instruction,
        question_type: 'attention_trap',
        photo_required: false,
        expected_min_seconds: trap.trap_type === 'wait_timer' ? (trap.config?.wait_seconds || 4) : 3,
        notes_prompt: null,
        group_name: 'Attention Check',
        source: 'trap',
      })
    }

    sessionStorage.setItem('nv_insp_questions', JSON.stringify(builtQuestions))
    setQuestions(builtQuestions)
    setLoading(false)
    questionStart.current = Date.now()
  }

  // ── Core tap handler — called by every answer button ──────
  // Registers the answer, shows visual confirmation, then advances.
  // Skippable questions pass value='na'; text questions use a Done button.
  const handleTap = useCallback((value) => {
    if (advancing) return  // prevent double-tap during transition

    setSelected(value)
    setAdvancing(true)

    setTimeout(() => {
      const q = questions[current]
      const timeSpent = Math.round((Date.now() - questionStart.current) / 1000)
      const response = {
        question_id:            q.source === 'template' ? q.id : null,
        defect_id:              q.defect_id || null,
        attention_trap_id:      q.trap_id || null,
        question_text:          q.question_text,
        question_type:          q.question_type,
        response:               value,
        time_spent_seconds:     timeSpent,
        attention_trap_correct: q.source === 'trap' ? evaluateTrap(q, value) : null,
      }

      setResponses(prev => {
        const updated = [...prev]
        // If going back then re-answering, overwrite the existing response
        updated[current] = response
        return updated
      })

      setSelected(null)
      setAdvancing(false)
      questionStart.current = Date.now()

      if (current + 1 >= questions.length) {
        const finalResponses = [...responses]
        finalResponses[current] = response
        sessionStorage.setItem('nv_insp_responses', JSON.stringify(finalResponses))
        navigate('/complete')
      } else {
        setCurrent(c => c + 1)
      }
    }, CONFIRM_DELAY)
  }, [advancing, current, questions, responses, navigate])

  // ── Back navigation ────────────────────────────────────────
  function handleBack() {
    if (current === 0) return
    setSelected(responses[current - 1]?.response ?? null)
    setCurrent(c => c - 1)
    questionStart.current = Date.now()
  }

  // ── Rendering ──────────────────────────────────────────────
  if (loading) {
    return (
      <Shell title={`${equipment.asset_tag} inspection`} subtitle="Loading questions…">
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-10 h-10 border-2 border-[#2B7FC1] border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-400 text-sm">Building your inspection…</p>
        </div>
      </Shell>
    )
  }

  if (questions.length === 0) {
    return (
      <Shell title={`${equipment.asset_tag} inspection`}>
        <div className="space-y-4">
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
            <p className="text-amber-400 text-sm font-medium">No inspection template found</p>
            <p className="text-amber-300/70 text-xs mt-1">
              An inspection template needs to be set up for {equipment.machine_type ?? 'this machine type'} before inspections can be run. Contact your administrator.
            </p>
          </div>
          <button onClick={() => navigate('/inspect')} className="w-full bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium rounded-xl py-3.5 text-base transition-colors">
            Back to start
          </button>
        </div>
      </Shell>
    )
  }

  const q        = questions[current]
  const progress = ((current) / questions.length) * 100

  return (
    <Shell
      title={`${equipment.asset_tag} inspection`}
      subtitle={`${inspector.name} · Q${current + 1} of ${questions.length}`}
      onBack={() => navigate('/inspect')}
      footer={
        current > 0 ? (
          <button
            onClick={handleBack}
            disabled={advancing}
            className="w-full bg-transparent border border-gray-700 text-gray-400 font-medium rounded-xl py-3.5 text-base transition-colors disabled:opacity-40"
          >
            ← Back
          </button>
        ) : null
      }
    >
      {/* Progress */}
      <div className="mb-5">
        <div className="w-full bg-gray-800 rounded-full h-1 mb-2">
          <div
            className="bg-[#2B7FC1] h-1 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex justify-between text-[11px] text-gray-500">
          <span>Question {current + 1} of {questions.length}</span>
          <span>{q.group_name}</span>
        </div>
      </div>

      <QuestionRenderer
        question={q}
        selected={selected}
        advancing={advancing}
        onTap={handleTap}
      />
    </Shell>
  )
}

// ── Question renderer ──────────────────────────────────────────
function QuestionRenderer({ question: q, selected, advancing, onTap }) {

  if (q.question_type === 'defect_status') {
    return (
      <div className="space-y-4">
        <div className="bg-amber-500/[0.08] border border-amber-500/20 rounded-xl p-4">
          <p className="text-amber-400 text-[10px] font-medium uppercase tracking-wide mb-1">Open defect</p>
          <p className="text-white text-base font-medium leading-snug">{q.question_text}</p>
          {q.notes_prompt && <p className="text-gray-500 text-xs mt-1.5">{q.notes_prompt}</p>}
        </div>
        <p className="text-gray-300 text-base font-medium">How is this defect today?</p>
        <p className="text-gray-500 text-sm">This answer will update the defect record.</p>
        <div className="grid grid-cols-2 gap-3">
          {[
            { value: 'noted',     label: 'Noted',     activeStyle: 'border-[#2B7FC1] text-[#5AAEE8] bg-[#2B7FC1]/10' },
            { value: 'unchanged', label: 'Unchanged',  activeStyle: 'border-gray-400 text-gray-200 bg-gray-700' },
            { value: 'worsened',  label: 'Worsened',   activeStyle: 'border-amber-500 text-amber-400 bg-amber-500/10' },
            { value: 'resolved',  label: 'Resolved',   activeStyle: 'border-green-500 text-green-400 bg-green-500/10' },
          ].map(opt => (
            <TapButton
              key={opt.value}
              value={opt.value}
              label={opt.label}
              selected={selected}
              advancing={advancing}
              activeStyle={opt.activeStyle}
              onTap={onTap}
              pressDelay={PRESS_DELAY}
            />
          ))}
        </div>
      </div>
    )
  }

  if (q.question_type === 'attention_trap') {
    return <AttentionTrap question={q} advancing={advancing} onTap={onTap} />
  }

  if (q.question_type === 'pass_fail') {
    return (
      <div className="space-y-4">
        <GroupLabel name={q.group_name} />
        <p className="text-white text-lg font-medium leading-snug">{q.question_text}</p>
        {q.notes_prompt && <p className="text-gray-400 text-sm leading-relaxed">{q.notes_prompt}</p>}
        <div className="grid grid-cols-2 gap-3 mt-2">
          <TapButton
            value="pass" label="Pass" icon="✓"
            selected={selected} advancing={advancing}
            activeStyle="border-green-500 bg-green-500/10 text-green-400"
            onTap={onTap} pressDelay={PRESS_DELAY} tall
          />
          <TapButton
            value="fail" label="Fail" icon="✗"
            selected={selected} advancing={advancing}
            activeStyle="border-red-500 bg-red-500/10 text-red-400"
            onTap={onTap} pressDelay={PRESS_DELAY} tall
          />
        </div>
        <NAButton selected={selected} advancing={advancing} onTap={onTap} />
      </div>
    )
  }

  if (q.question_type === 'condition') {
    return (
      <div className="space-y-4">
        <GroupLabel name={q.group_name} />
        <p className="text-white text-lg font-medium leading-snug">{q.question_text}</p>
        {q.notes_prompt && <p className="text-gray-400 text-sm leading-relaxed">{q.notes_prompt}</p>}
        <div className="grid grid-cols-2 gap-3 mt-2">
          {[
            { value: 'good', label: 'Good', activeStyle: 'border-green-500 text-green-400 bg-green-500/10' },
            { value: 'fair', label: 'Fair', activeStyle: 'border-amber-500 text-amber-400 bg-amber-500/10' },
            { value: 'poor', label: 'Poor', activeStyle: 'border-red-500 text-red-400 bg-red-500/10' },
          ].map(opt => (
            <TapButton
              key={opt.value}
              value={opt.value} label={opt.label}
              selected={selected} advancing={advancing}
              activeStyle={opt.activeStyle}
              onTap={onTap} pressDelay={PRESS_DELAY}
            />
          ))}
          <TapButton
            value="na" label="N/A"
            selected={selected} advancing={advancing}
            activeStyle="border-gray-500 text-gray-300 bg-gray-700/50"
            onTap={onTap} pressDelay={PRESS_DELAY}
          />
        </div>
      </div>
    )
  }

  if (q.question_type === 'text') {
    return <TextQuestion question={q} selected={selected} advancing={advancing} onTap={onTap} />
  }

  return (
    <div className="space-y-4">
      <GroupLabel name={q.group_name} />
      <p className="text-white text-lg font-medium">{q.question_text}</p>
      {q.notes_prompt && <p className="text-gray-400 text-sm">{q.notes_prompt}</p>}
    </div>
  )
}

// ── TapButton ──────────────────────────────────────────────────
// Colour sequence:
//   idle      → border-gray-700 bg-gray-900 text-gray-300
//   pressing  → dimmed: border-gray-600 bg-gray-800/50 text-gray-500 scale-95
//   confirmed → full activeStyle (press delay elapsed, haptic fires here)
//   selected  → full activeStyle (held through CONFIRM_DELAY)
//   other selected → faded out
function TapButton({ value, label, icon, selected, advancing, activeStyle, onTap, pressDelay, tall }) {
  const pressTimer  = useRef(null)
  // 'idle' | 'pressing' | 'confirmed'
  const [pressState, setPressState] = useState('idle')
  const isSelected   = selected === value
  const otherSelected = selected !== null && !isSelected

  function haptic() {
    try { navigator.vibrate?.(30) } catch { /* not supported */ }
  }

  function onPressStart() {
    if (advancing) return
    setPressState('pressing')
    pressTimer.current = setTimeout(() => {
      setPressState('confirmed')
      haptic()
      onTap(value)
    }, pressDelay)
  }

  function onPressEnd() {
    // Only cancel if still in pressing state — don't interrupt confirmed
    if (pressState === 'pressing') {
      clearTimeout(pressTimer.current)
      setPressState('idle')
    }
  }

  // Reset local state when question advances
  useEffect(() => {
    setPressState('idle')
  }, [selected])

  const colorClass = isSelected || pressState === 'confirmed'
    ? activeStyle
    : otherSelected
      ? 'border-gray-800 bg-gray-900/50 text-gray-600'
      : pressState === 'pressing'
        ? 'border-gray-600 bg-gray-800/50 text-gray-500 scale-95'
        : 'border-gray-700 bg-gray-900 text-gray-300'

  return (
    <button
      onPointerDown={onPressStart}
      onPointerUp={onPressEnd}
      onPointerLeave={onPressEnd}
      onPointerCancel={onPressEnd}
      disabled={advancing}
      className={`
        ${tall ? 'py-6' : 'py-4'} rounded-2xl border-2 text-base font-medium
        transition-all duration-150 select-none
        flex flex-col items-center gap-1
        ${colorClass}
        ${advancing ? 'cursor-default' : 'cursor-pointer'}
      `}
    >
      {icon && <span className="text-2xl">{icon}</span>}
      {label}
    </button>
  )
}

// ── NAButton — small muted skip option ────────────────────────
function NAButton({ selected, advancing, onTap }) {
  if (selected !== null) return null
  return (
    <button
      onClick={() => !advancing && onTap('na')}
      disabled={advancing}
      className="w-full py-2.5 text-gray-600 text-sm border border-gray-800 rounded-xl hover:text-gray-400 hover:border-gray-700 transition-colors"
    >
      N/A — not applicable
    </button>
  )
}

// ── TextQuestion — textarea with Done button ───────────────────
function TextQuestion({ question: q, selected, advancing, onTap }) {
  const [text, setText] = useState(selected || '')

  return (
    <div className="space-y-4">
      <GroupLabel name={q.group_name} />
      <p className="text-white text-lg font-medium leading-snug">{q.question_text}</p>
      {q.notes_prompt && <p className="text-gray-400 text-sm leading-relaxed">{q.notes_prompt}</p>}
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Enter your notes… (or leave blank)"
        rows={4}
        className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-3 text-base placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#2B7FC1] focus:border-transparent resize-none"
      />
      <button
        onClick={() => onTap(text.trim() || 'na')}
        disabled={advancing}
        className="w-full bg-[#2B7FC1] hover:bg-[#2470AD] disabled:opacity-40 text-white font-medium rounded-xl py-4 text-base transition-colors"
      >
        {text.trim() ? 'Save & continue' : 'Skip — no notes'}
      </button>
    </div>
  )
}

// ── Attention trap ─────────────────────────────────────────────
function AttentionTrap({ question: q, advancing, onTap }) {
  const [waited, setWaited] = useState(false)
  const config = q.trap_data?.config || {}

  if (q.trap_data?.trap_type === 'wait_timer') {
    const secs = config.wait_seconds || 4
    return (
      <div className="space-y-4">
        <div className="bg-purple-500/[0.08] border border-purple-500/20 rounded-2xl p-5 text-center space-y-3">
          <div className="text-3xl">👁</div>
          <p className="text-white text-base font-medium leading-snug">{q.question_text}</p>
        </div>
        {!waited ? (
          <WaitTimer
            seconds={secs}
            onComplete={() => {
              setWaited(true)
              onTap('waited')
            }}
          />
        ) : (
          <div className="text-center text-green-400 text-sm font-medium py-2">✓ Continuing…</div>
        )}
      </div>
    )
  }

  const buttons = config.buttons || [
    { label: 'Continue', correct: true,  side: 'left'  },
    { label: 'Continue', correct: false, side: 'right' },
  ]

  return (
    <div className="space-y-4">
      <div className="bg-purple-500/[0.08] border border-purple-500/20 rounded-2xl p-5 text-center space-y-3">
        <div className="text-3xl">👁</div>
        <p className="text-white text-base font-medium leading-snug">{q.question_text}</p>
        <p className="text-gray-500 text-xs">Read carefully before tapping.</p>
      </div>
      <div className="flex gap-3">
        {buttons.map((btn, i) => (
          <TapButton
            key={i}
            value={btn.correct ? 'correct' : 'wrong'}
            label={btn.label}
            selected={null}
            advancing={advancing}
            activeStyle={btn.style === 'blue' || btn.correct
              ? 'border-[#2B7FC1] bg-[#2B7FC1]/15 text-[#5AAEE8]'
              : 'border-gray-600 bg-gray-800 text-gray-300'
            }
            onTap={onTap}
            pressDelay={PRESS_DELAY}
          />
        ))}
      </div>
    </div>
  )
}

// ── Wait timer ─────────────────────────────────────────────────
function WaitTimer({ seconds, onComplete }) {
  const [remaining, setRemaining] = useState(seconds)

  useEffect(() => {
    if (remaining <= 0) { onComplete(); return }
    const t = setTimeout(() => setRemaining(r => r - 1), 1000)
    return () => clearTimeout(t)
  }, [remaining])

  return (
    <div className="flex flex-col items-center gap-2 py-4">
      <div className="text-4xl font-light text-[#5AAEE8]">{remaining}</div>
      <div className="text-gray-500 text-sm">seconds remaining</div>
      <div className="w-full bg-gray-800 rounded-full h-1.5 mt-1">
        <div
          className="bg-[#2B7FC1] h-1.5 rounded-full transition-all duration-1000"
          style={{ width: `${((seconds - remaining) / seconds) * 100}%` }}
        />
      </div>
    </div>
  )
}

// ── Group label ────────────────────────────────────────────────
function GroupLabel({ name }) {
  if (!name) return null
  return <p className="text-[#5AAEE8] text-xs font-medium uppercase tracking-wide">{name}</p>
}

// ── Helpers ────────────────────────────────────────────────────
function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function evaluateTrap(question, value) {
  if (question.trap_data?.trap_type === 'wait_timer') return value === 'waited'
  return value === 'correct'
}
