import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ClipboardList } from 'lucide-react'
import { toast } from 'sonner'
import { profilesApi } from '@/api/vendors'
import type { RequirementProfileInput, RequirementLineInput } from '@/api/vendors'
import type { RequirementProfile, RequirementLine } from '@/api/types'

// ── Constants ──────────────────────────────────────────────────────────────────

const COVERAGE_TYPES = [
  { value: 'general_liability',      label: 'General Liability' },
  { value: 'automobile',             label: 'Automobile' },
  { value: 'workers_comp',           label: 'Workers Compensation' },
  { value: 'umbrella',               label: 'Umbrella / Excess' },
  { value: 'professional_liability', label: 'Professional Liability' },
  { value: 'other',                  label: 'Other' },
]

const COVERAGE_LABEL: Record<string, string> = Object.fromEntries(
  COVERAGE_TYPES.map((t) => [t.value, t.label])
)

function fmt(n: number | null): string {
  if (!n) return '—'
  if (n >= 1_000_000) return `$${n % 1_000_000 === 0 ? n / 1_000_000 : (n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${n / 1_000}K`
  return `$${n.toLocaleString()}`
}

// ── Line form types ────────────────────────────────────────────────────────────

type LineForm = {
  _key: string
  id?: string
  coverage_type: string
  is_required: boolean
  min_each_occurrence: string
  min_aggregate: string
  additional_insured_required: boolean
  waiver_required: boolean
}

function newLine(): LineForm {
  return {
    _key: Math.random().toString(36).slice(2),
    coverage_type: 'general_liability',
    is_required: true,
    min_each_occurrence: '',
    min_aggregate: '',
    additional_insured_required: false,
    waiver_required: false,
  }
}

function lineToForm(line: RequirementLine): LineForm {
  return {
    _key: line.id,
    id: line.id,
    coverage_type: line.coverage_type,
    is_required: line.is_required,
    min_each_occurrence: line.min_each_occurrence != null ? String(line.min_each_occurrence) : '',
    min_aggregate: line.min_aggregate != null ? String(line.min_aggregate) : '',
    additional_insured_required: line.additional_insured_required,
    waiver_required: line.waiver_required,
  }
}

function lineToInput(line: LineForm): RequirementLineInput {
  return {
    coverage_type: line.coverage_type,
    is_required: line.is_required,
    min_each_occurrence: line.min_each_occurrence !== '' ? Number(line.min_each_occurrence) : null,
    min_aggregate: line.min_aggregate !== '' ? Number(line.min_aggregate) : null,
    additional_insured_required: line.additional_insured_required,
    waiver_required: line.waiver_required,
  }
}

// ── Lines editor ───────────────────────────────────────────────────────────────

function LinesEditor({ lines, onChange }: { lines: LineForm[]; onChange: (lines: LineForm[]) => void }) {
  const update = (key: string, field: keyof LineForm, value: unknown) =>
    onChange(lines.map((l) => (l._key === key ? { ...l, [field]: value } : l)))
  const remove = (key: string) => onChange(lines.filter((l) => l._key !== key))

  return (
    <div className="mt-3 space-y-3.5">
      {lines.length > 0 && (
        <div>
          <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-1.5 sm:hidden">← Scroll to see all columns →</p>
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-slate-50 border-b border-slate-250">
              <tr>
                <th className="text-left px-4 py-3 font-bold text-slate-500 text-[10px] uppercase tracking-wider">Coverage type</th>
                <th className="text-center px-4 py-3 font-bold text-slate-500 text-[10px] uppercase tracking-wider w-20">Required</th>
                <th className="text-left px-4 py-3 font-bold text-slate-500 text-[10px] uppercase tracking-wider">Each occurrence ($)</th>
                <th className="text-left px-4 py-3 font-bold text-slate-500 text-[10px] uppercase tracking-wider">Aggregate ($)</th>
                <th className="text-center px-4 py-3 font-bold text-slate-500 text-[10px] uppercase tracking-wider w-28">Additional insured</th>
                <th className="text-center px-4 py-3 font-bold text-slate-500 text-[10px] uppercase tracking-wider w-20">Waiver</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {lines.map((line) => (
                <tr key={line._key} className="hover:bg-slate-50/40">
                  <td className="px-4 py-2.5">
                    <select
                      value={line.coverage_type}
                      onChange={(e) => update(line._key, 'coverage_type', e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs outline-none bg-white focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500"
                    >
                      {COVERAGE_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <input
                      type="checkbox"
                      checked={line.is_required}
                      onChange={(e) => update(line._key, 'is_required', e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500/10 cursor-pointer"
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-semibold pointer-events-none">$</span>
                      <input
                        type="number"
                        value={line.min_each_occurrence}
                        onChange={(e) => update(line._key, 'min_each_occurrence', e.target.value)}
                        placeholder="1,000,000"
                        min={0}
                        className="w-full border border-slate-200 rounded-lg pl-6 pr-2.5 py-1.5 text-xs outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500"
                      />
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-semibold pointer-events-none">$</span>
                      <input
                        type="number"
                        value={line.min_aggregate}
                        onChange={(e) => update(line._key, 'min_aggregate', e.target.value)}
                        placeholder="2,000,000"
                        min={0}
                        className="w-full border border-slate-200 rounded-lg pl-6 pr-2.5 py-1.5 text-xs outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500"
                      />
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <input
                      type="checkbox"
                      checked={line.additional_insured_required}
                      onChange={(e) => update(line._key, 'additional_insured_required', e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500/10 cursor-pointer"
                    />
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <input
                      type="checkbox"
                      checked={line.waiver_required}
                      onChange={(e) => update(line._key, 'waiver_required', e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500/10 cursor-pointer"
                    />
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <button
                      type="button"
                      onClick={() => remove(line._key)}
                      title="Remove"
                      className="text-slate-300 hover:text-rose-500 transition-colors text-lg font-bold"
                    >
                      &times;
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </div>
      )}
      <button
        type="button"
        onClick={() => onChange([...lines, newLine()])}
        className="inline-flex items-center gap-1 text-xs font-bold text-brand-600 hover:text-brand-700"
      >
        + Add coverage line
      </button>
    </div>
  )
}

// ── Inline delete confirmation ─────────────────────────────────────────────────

function DeleteButton({ onConfirm }: { onConfirm: () => void }) {
  const [confirming, setConfirming] = useState(false)

  if (confirming) {
    return (
      <div className="flex items-center gap-2 bg-rose-50/50 border border-rose-100 rounded-lg p-1.5 animate-fade-in-up">
        <span className="text-[10px] text-rose-700 font-bold uppercase tracking-wider">Confirm Delete?</span>
        <button
          onClick={() => { setConfirming(false); onConfirm() }}
          className="text-[10px] font-bold text-white bg-rose-600 hover:bg-rose-700 px-2 py-1 rounded transition-colors"
        >
          Yes
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="text-[10px] font-bold text-slate-500 hover:text-slate-700"
        >
          Cancel
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="text-xs font-semibold text-slate-500 hover:text-rose-600 transition-colors"
    >
      Delete
    </button>
  )
}

// ── Profile card ───────────────────────────────────────────────────────────────

function ProfileCard({
  profile,
  onSave,
  onDelete,
  saving,
}: {
  profile: RequirementProfile
  onSave: (id: string, payload: RequirementProfileInput) => void
  onDelete: (id: string) => void
  saving: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(profile.name)
  const [lines, setLines] = useState<LineForm[]>(() => profile.lines.map(lineToForm))

  const handleSave = () => {
    onSave(profile.id, { name, lines: lines.map(lineToInput) })
    setEditing(false)
  }

  const handleCancel = () => {
    setName(profile.name)
    setLines(profile.lines.map(lineToForm))
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="card p-6 border-brand-500/80 bg-white ring-4 ring-brand-500/5 shadow-premium animate-fade-in-up">
        <div className="mb-4">
          <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-wider">Profile name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border border-slate-200 rounded-xl px-3.5 py-2 text-sm outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 text-slate-800 font-medium"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-wider">Coverage requirements</label>
          <LinesEditor lines={lines} onChange={setLines} />
        </div>
        <div className="flex items-center gap-3 mt-6 border-t border-slate-100 pt-4.5">
          <button
            onClick={handleSave}
            disabled={!name.trim() || saving}
            className="px-4 py-2 text-xs font-bold bg-brand-600 text-white rounded-xl hover:bg-brand-700 disabled:opacity-50 transition-all"
          >
            {saving ? 'Saving…' : 'Save profile'}
          </button>
          <button
            onClick={handleCancel}
            className="px-4 py-2 text-xs font-bold border border-slate-200 text-slate-600 bg-white rounded-xl hover:bg-slate-50 transition-all"
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="card p-6 bg-white border border-slate-200/60 shadow-premium">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h3 className="section-heading">{profile.name}</h3>
          <p className="text-xs text-slate-500 mt-1 font-semibold">
            {profile.lines.length} coverage rule{profile.lines.length !== 1 ? 's' : ''} defined
          </p>
        </div>
        <div className="flex items-center gap-3.5 ml-4 shrink-0">
          <button
            onClick={() => setEditing(true)}
            className="text-xs font-bold text-brand-650 hover:text-brand-700"
          >
            Edit rules
          </button>
          <DeleteButton onConfirm={() => onDelete(profile.id)} />
        </div>
      </div>

      {profile.lines.length === 0 ? (
        <p className="text-sm text-slate-400 italic">No coverage requirements defined.</p>
      ) : (
        <div>
          <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-1.5 sm:hidden">← Scroll to see all columns →</p>
        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 font-medium">
                <th className="text-left px-4 py-2.5 font-bold">Coverage type</th>
                <th className="text-right px-4 py-2.5 pr-6 font-bold">Each occurrence</th>
                <th className="text-right px-4 py-2.5 pr-6 font-bold">Aggregate</th>
                <th className="text-center px-4 py-2.5 font-bold w-24">Additional insured</th>
                <th className="text-center px-4 py-2.5 font-bold w-20">Waiver</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {profile.lines.map((line) => (
                <tr key={line.id} className="hover:bg-slate-50/30">
                  <td className="px-4 py-2.5 text-slate-800 font-semibold text-xs">
                    <span
                      className={`inline-block w-1.5 h-1.5 rounded-full mr-2 ${
                        line.is_required ? 'bg-emerald-500' : 'bg-slate-300'
                      }`}
                    />
                    {COVERAGE_LABEL[line.coverage_type] ?? line.coverage_type}
                    {!line.is_required && (
                      <span className="ml-1 text-slate-400 font-normal text-[10px]">(optional)</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right pr-6 text-slate-600 font-medium text-xs">{fmt(line.min_each_occurrence)}</td>
                  <td className="px-4 py-2.5 text-right pr-6 text-slate-600 font-medium text-xs">{fmt(line.min_aggregate)}</td>
                  <td className="px-4 py-2.5 text-center text-slate-600 text-xs font-semibold">
                    {line.additional_insured_required ? (
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-50 border border-emerald-100/60 text-emerald-700 text-[10px]">&check;</span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-center text-slate-600 text-xs font-semibold">
                    {line.waiver_required ? (
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-50 border border-emerald-100/60 text-emerald-700 text-[10px]">&check;</span>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </div>
      )}
    </div>
  )
}

// ── New profile form ───────────────────────────────────────────────────────────

function NewProfileForm({
  onCreate,
  onCancel,
  saving,
}: {
  onCreate: (payload: RequirementProfileInput) => void
  onCancel: () => void
  saving: boolean
}) {
  const [name, setName] = useState('')
  const [lines, setLines] = useState<LineForm[]>([newLine()])

  return (
    <div className="card p-6 border-brand-500/80 bg-white ring-4 ring-brand-500/5 shadow-premium animate-fade-in-up">
      <h3 className="font-bold text-slate-800 text-base mb-4 tracking-tight">New Requirement Profile</h3>
      <div className="mb-4">
        <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-wider">Profile name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Subcontractors (Tier 1)"
          autoFocus
          className="w-full border border-slate-200 rounded-xl px-3.5 py-2 text-sm outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 text-slate-800 font-medium"
        />
      </div>
      <div>
        <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-wider">Coverage requirements</label>
        <LinesEditor lines={lines} onChange={setLines} />
      </div>
      <div className="flex items-center gap-3 mt-6 border-t border-slate-100 pt-4.5">
        <button
          onClick={() => onCreate({ name, lines: lines.map(lineToInput) })}
          disabled={!name.trim() || saving}
          className="px-4 py-2 text-xs font-bold bg-brand-600 text-white rounded-xl hover:bg-brand-700 disabled:opacity-50 transition-all"
        >
          {saving ? 'Creating…' : 'Create profile'}
        </button>
        <button 
          onClick={onCancel} 
          className="px-4 py-2 text-xs font-bold border border-slate-200 text-slate-600 bg-white rounded-xl hover:bg-slate-50 transition-all"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function ProfilesPage() {
  const qc = useQueryClient()
  const [creating, setCreating] = useState(false)

  const { data: profiles, isLoading } = useQuery<RequirementProfile[]>({
    queryKey: ['profiles'],
    queryFn: profilesApi.list,
  })

  const createMutation = useMutation({
    mutationFn: (payload: RequirementProfileInput) => profilesApi.create(payload),
    onSuccess: (profile) => {
      qc.invalidateQueries({ queryKey: ['profiles'] })
      setCreating(false)
      toast.success(`Profile "${profile.name}" created`)
    },
    onError: () => toast.error('Failed to create profile.'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: RequirementProfileInput }) =>
      profilesApi.update(id, payload),
    onSuccess: (profile) => {
      qc.invalidateQueries({ queryKey: ['profiles'] })
      toast.success(`Profile "${profile.name}" saved`)
    },
    onError: () => toast.error('Failed to save profile.'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => profilesApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profiles'] })
      toast.success('Profile deleted')
    },
    onError: () => toast.error('Failed to delete profile.'),
  })

  if (isLoading) {
    return (
      <div className="px-8 py-8 max-w-4xl mx-auto">
        <div className="flex items-start justify-between mb-8">
          <div>
            <div className="animate-pulse bg-slate-200 rounded h-8 w-56 mb-2" />
            <div className="animate-pulse bg-slate-200 rounded h-4 w-80" />
          </div>
          <div className="animate-pulse bg-slate-200 rounded h-9 w-28 ml-4" />
        </div>
        <div className="space-y-5">
          {[1, 2].map((i) => (
            <div key={i} className="bg-white rounded-lg border border-slate-200/60 p-6 animate-pulse">
              <div className="flex items-center justify-between mb-4">
                <div className="bg-slate-200 rounded h-5 w-40" />
                <div className="bg-slate-200 rounded h-5 w-16" />
              </div>
              <div className="overflow-x-auto rounded-xl border border-slate-100">
                <div className="bg-slate-50 h-8 rounded-t-xl" />
                {[1, 2].map((j) => (
                  <div key={j} className="flex gap-4 px-3 py-3 border-t border-slate-100">
                    <div className="bg-slate-200 rounded h-4 w-36 flex-shrink-0" />
                    <div className="bg-slate-200 rounded h-4 w-20 flex-shrink-0" />
                    <div className="bg-slate-200 rounded h-4 w-24 flex-shrink-0" />
                    <div className="bg-slate-200 rounded h-4 w-24 flex-shrink-0" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="px-8 py-8 max-w-4xl mx-auto">
      <div className="flex items-start justify-between mb-8">
        <div>
          <p className="text-slate-500 text-sm">
            Define coverage rules that vendor COIs are evaluated against. Create one profile per vendor
            type and assign it to each vendor.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {[
              { label: 'Subcontractors', hint: 'GL $2M, WC required' },
              { label: 'Suppliers', hint: 'GL $1M only' },
              { label: 'Professional Services', hint: 'Liability $5M, E&O' },
            ].map(({ label, hint }) => (
              <span
                key={label}
                className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-500 bg-slate-50 border border-slate-200/80 px-2.5 py-1 rounded-full"
              >
                <span className="font-bold text-slate-600">{label}</span>
                <span className="text-slate-400">· {hint}</span>
              </span>
            ))}
          </div>
        </div>
        {!creating && (
          <button
            onClick={() => setCreating(true)}
            className="btn-primary shrink-0 ml-4"
          >
            New profile
          </button>
        )}
      </div>

      <div className="space-y-6">
        {creating && (
          <NewProfileForm
            onCreate={(payload) => createMutation.mutate(payload)}
            onCancel={() => setCreating(false)}
            saving={createMutation.isPending}
          />
        )}

        {!creating && profiles?.length === 0 ? (
          /* ── Empty state ── */
          <div className="bg-white rounded-lg border border-slate-200/60 py-20 flex flex-col items-center gap-4 text-center px-6 shadow-sm">
            <div className="w-16 h-16 rounded-lg bg-slate-50 border border-slate-100/60 flex items-center justify-center text-slate-300 shadow-sm">
              <ClipboardList className="w-8 h-8" />
            </div>
            <div>
              <p className="font-bold text-slate-800 text-base">No requirement profiles found</p>
              <p className="text-sm text-slate-400 max-w-xs mt-1 leading-normal">
                Define your first rule profile to start matching vendor coverages against limit templates.
              </p>
            </div>
            <button
              onClick={() => setCreating(true)}
              className="mt-2 btn-primary"
            >
              Create first profile
            </button>
          </div>
        ) : (
          profiles?.map((profile) => (
            <ProfileCard
              key={profile.id}
              profile={profile}
              onSave={(id, payload) => updateMutation.mutate({ id, payload })}
              onDelete={(id) => deleteMutation.mutate(id)}
              saving={updateMutation.isPending}
            />
          ))
        )}
      </div>
    </div>
  );
}
