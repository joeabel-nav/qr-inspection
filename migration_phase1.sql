-- ============================================================
-- QR Inspection Module — Phase 1 Migration
-- Run on BOTH dev (fbtgrrpwwtfkiwwmzjcr) and prod (qsafhkovhmwbutkqnocv)
-- via Supabase Dashboard → SQL Editor
-- All changes are SAFE: adding columns/tables only. No drops/renames.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Add inspection_pin to technicians
--    (coordinate change — touches shared table)
-- ------------------------------------------------------------
ALTER TABLE public.technicians
  ADD COLUMN IF NOT EXISTS inspection_pin text;

-- ------------------------------------------------------------
-- 2. Extend inspections table for QR inspection rows
--    All new columns are nullable — existing SiteDocs rows unaffected
-- ------------------------------------------------------------
ALTER TABLE public.inspections
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'sitedocs',
  ADD COLUMN IF NOT EXISTS template_id uuid,
  ADD COLUMN IF NOT EXISTS inspector_technician_id uuid,
  ADD COLUMN IF NOT EXISTS inspector_qr_id uuid,
  ADD COLUMN IF NOT EXISTS inspector_employee_number text,
  ADD COLUMN IF NOT EXISTS quality_score numeric,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'submitted',
  ADD COLUMN IF NOT EXISTS offline_submitted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS device_hint text,
  ADD COLUMN IF NOT EXISTS device_flag boolean NOT NULL DEFAULT false;

-- Backfill source on existing SiteDocs rows
UPDATE public.inspections SET source = 'sitedocs' WHERE source IS NULL;

-- ------------------------------------------------------------
-- 3. qr_inspectors — lightweight identity for non-technician inspectors
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.qr_inspectors (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  employee_number text NOT NULL UNIQUE,
  full_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz,
  CONSTRAINT qr_inspectors_pkey PRIMARY KEY (id)
);
ALTER TABLE public.qr_inspectors DISABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 4. Now add FKs to inspections that depend on qr_inspectors
-- ------------------------------------------------------------
ALTER TABLE public.inspections
  ADD CONSTRAINT IF NOT EXISTS inspections_template_id_fkey
    FOREIGN KEY (template_id) REFERENCES public.inspection_templates(id),
  ADD CONSTRAINT IF NOT EXISTS inspections_inspector_technician_id_fkey
    FOREIGN KEY (inspector_technician_id) REFERENCES public.technicians(id),
  ADD CONSTRAINT IF NOT EXISTS inspections_inspector_qr_id_fkey
    FOREIGN KEY (inspector_qr_id) REFERENCES public.qr_inspectors(id);

-- ------------------------------------------------------------
-- 5. inspection_templates
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inspection_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  machine_type text,
  asset_tag text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inspection_templates_pkey PRIMARY KEY (id),
  CONSTRAINT inspection_templates_asset_tag_fkey
    FOREIGN KEY (asset_tag) REFERENCES public.equipment(asset_tag)
);
ALTER TABLE public.inspection_templates DISABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 6. inspection_groups
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inspection_groups (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  CONSTRAINT inspection_groups_pkey PRIMARY KEY (id),
  CONSTRAINT inspection_groups_template_id_fkey
    FOREIGN KEY (template_id) REFERENCES public.inspection_templates(id)
);
ALTER TABLE public.inspection_groups DISABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 7. inspection_questions
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inspection_questions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,
  question_text text NOT NULL,
  question_type text NOT NULL CHECK (question_type = ANY (
    ARRAY['pass_fail','condition','defect_status','text','photo']
  )),
  photo_required boolean NOT NULL DEFAULT false,
  expected_min_seconds integer,
  notes_prompt text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inspection_questions_pkey PRIMARY KEY (id),
  CONSTRAINT inspection_questions_group_id_fkey
    FOREIGN KEY (group_id) REFERENCES public.inspection_groups(id)
);
ALTER TABLE public.inspection_questions DISABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 8. qr_attention_traps
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.qr_attention_traps (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  instruction text NOT NULL,
  correct_action text NOT NULL,
  trap_type text NOT NULL CHECK (trap_type = ANY (
    ARRAY['button_choice','scroll_action','wait_timer']
  )),
  config jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT qr_attention_traps_pkey PRIMARY KEY (id)
);
ALTER TABLE public.qr_attention_traps DISABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 9. qr_inspection_responses
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.qr_inspection_responses (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  inspection_id uuid NOT NULL,
  question_id uuid,
  defect_id uuid,
  question_text text NOT NULL,
  question_type text NOT NULL,
  response text,
  time_spent_seconds integer,
  attention_trap_id uuid,
  attention_trap_correct boolean,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT qr_inspection_responses_pkey PRIMARY KEY (id),
  CONSTRAINT qr_inspection_responses_inspection_id_fkey
    FOREIGN KEY (inspection_id) REFERENCES public.inspections(id),
  CONSTRAINT qr_inspection_responses_question_id_fkey
    FOREIGN KEY (question_id) REFERENCES public.inspection_questions(id),
  CONSTRAINT qr_inspection_responses_defect_id_fkey
    FOREIGN KEY (defect_id) REFERENCES public.defects(id),
  CONSTRAINT qr_inspection_responses_trap_id_fkey
    FOREIGN KEY (attention_trap_id) REFERENCES public.qr_attention_traps(id)
);
ALTER TABLE public.qr_inspection_responses DISABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 10. qr_inspection_photos
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.qr_inspection_photos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  inspection_id uuid NOT NULL,
  response_id uuid,
  storage_path text NOT NULL,
  file_size_kb integer,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  purged_at timestamptz,
  CONSTRAINT qr_inspection_photos_pkey PRIMARY KEY (id),
  CONSTRAINT qr_inspection_photos_inspection_id_fkey
    FOREIGN KEY (inspection_id) REFERENCES public.inspections(id),
  CONSTRAINT qr_inspection_photos_response_id_fkey
    FOREIGN KEY (response_id) REFERENCES public.qr_inspection_responses(id)
);
ALTER TABLE public.qr_inspection_photos DISABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 11. Seed a few starter attention traps
-- ------------------------------------------------------------
INSERT INTO public.qr_attention_traps (instruction, correct_action, trap_type, config) VALUES
(
  'Read carefully before tapping. Tap the button on the LEFT to continue.',
  'Tap the left button. Right button is a decoy.',
  'button_choice',
  '{"buttons": [{"label": "Continue", "correct": true, "side": "left"}, {"label": "Continue", "correct": false, "side": "right"}]}'
),
(
  'Do not tap anything. Wait for 4 seconds and the inspection will continue automatically.',
  'Operator must wait without tapping. Any tap within 4 seconds is a fail.',
  'wait_timer',
  '{"wait_seconds": 4}'
),
(
  'Tap the BLUE button to continue.',
  'Only the blue-styled button should be tapped. Other button is a different color.',
  'button_choice',
  '{"buttons": [{"label": "Continue", "correct": true, "style": "blue"}, {"label": "Continue", "correct": false, "style": "green"}]}'
)
ON CONFLICT DO NOTHING;

-- ============================================================
-- Migration complete.
-- Next: run the qr-inspection frontend (Phase 2+3)
-- ============================================================
