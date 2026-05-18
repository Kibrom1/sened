import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { profilesApi } from '@/api/vendors'
import type { RequirementProfileInput, RequirementLineInput } from '@/api/vendors'
import type { RequirementProfile, RequirementLine } from '@/api/types'
import LoadingSpinner from '@/components/LoadingSpinner'

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
  _key: string       // local React key — not sent to the API
  id?: string        // present for existing lines
  coverage_type: string
  is_required: boolean
  min_each_occurrence: string  // string for controlled input, parsed on save
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

function LinesEditor({
  lines,
  onChange,
}: {
  lines: LineForm[]
  onChange: (lines: LineForm[]) => void
}) {
  const update = (key: string, field: keyof LineForm, value: unknown) =>
    onChange(lines.map((l) => (l._key === key ? { ...l, [field]: value } : l)))

  const remove = (key: string) =>
    onChange(lines.filter((l) => l._key !== key))

  return (
    <div className="mt-2 space-y-2">
      {lines.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-gray-500 text-xs">Coverage type</th>
                <th className="text-center px-3 py-2 font-medium text-gray-500 text-xs w-20">Required</th>
                <th className="text-left px-3 py-2 font-medium text-gray-500 text-xs">Each occurrence</th>
                <th className="text-left px-3 py-2 font-medium text-gray-500 text-xs">Aggregate</th>
                <th className="text-center px-3 py-2 font-medium text-gray-500 text-xs w-24">Add. insured</th>
                <th className="text-center px-3 py-2 font-medium text-gray-500 text-xs w-16">Waiver</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {lines.map((line) => (
                <tr key={line._key}>
                  <td className="px-3 py-2">
                    <select
                      value={line.coverage_type}
                      onChange={(e) => update(line._key, 'coverage_type', e.target.value)}
                      className="w-full border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-brand-500 bg-white"
                    >
                      {COVERAGE_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={line.is_required}
                      onChange={(e) => update(line._key, 'is_required', e.target.checked)}
                      className="w-4 h-4 rounded text-brand-600 cursor-pointer"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      value={line.min_each_occurrence}
                      onChange={(e) => update(line._key, 'min_each_occurrence', e.target.value)}
                      placeholder="e.g. 1000000"
                      className="w-full border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      value={line.min_aggregate}
                      onChange={(e) => update(line._key, 'min_aggregate', e.target.value)}
                      placeholder="e.g. 2000000"
                      className="w-full border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={line.additional_insured_required}
                      onChange={(e) => update(line._key, 'additional_insured_required', e.target.checked)}
                      className="w-4 h-4 rounded text-brand-600 cursor-pointer"
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={line.waiver_required}
                      onChange={(e) => update(line._key, 'waiver_required', e.target.checked)}
                      className="w-4 h-4 rounded text-brand-600 cursor-pointer"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => remove(line._key)}
                      title="Remove"
                      className="text-gray-300 hover:text-red-400 transition-colors text-lg leading-none"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <button
        type="button"
        onClick={() => onChange([...lines, newLine()])}
        className="text-sm text-brand-600 hover:text-brand-700 font-medium"
      >
        + Add coverage type
      </button>
    </div>
  )
}

// ── Profile card (view + inline edit) ─────────────────────────────────────────

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

  // ── Edit mode ────────────────────────────────────────────────────────────────
  if (editing) {
    return (
      <div className="bg-white rounded-lg border border-brand-400 shadow-sm p-5">
        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-500 mb-1">Profile name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Coverage requirements</label>
          <LinesEditor lines={lines} onChange={setLines} />
        </div>
        <div className="flex items-center gap-3 mt-5">
          <button
            onClick={handleSave}
            disabled={!name.trim() || saving}
            className="px-4 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            onClick={handleCancel}
            className="px-4 py-2 text-sm text-gray-500 hover:text-gray-900"
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  // ── View mode ────────────────────────────────────────────────────────────────
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <div className="flex items-start justify-between mb-4">
        <h3 className="font-semibold text-gray-900">{profile.name}</h3>
        <div className="flex items-center gap-3 ml-4 shrink-0">
          <button
            onClick={() => setEditing(true)}
            className="text-xs font-medium text-brand-600 hover:text-brand-700"
          >
            Edit
          </button>
          <button
            onClick={() => onDelete(profile.id)}
            className="text-xs text-gray-400 hover:text-red-500"
          >
            Delete
          </button>
        </div>
      </div>

      {profile.lines.length === 0 ? (
        <p className="text-sm text-gray-400 italic">No coverage requirements defined.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-xs text-gray-400">
              <th className="text-left pb-2 font-medium">Coverage type</th>
              <th className="text-right pb-2 pr-6 font-medium">Each occurrence</th>
              <th className="text-right pb-2 pr-6 font-medium">Aggregate</th>
              <th className="text-center pb-2 font-medium">Add. insured</th>
              <th className="text-center pb-2 font-medium">Waiver</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {profile.lines.map((line) => (
              <tr key={line.id}>
                <td className="py-2 text-gray-900">
                  <span
                    className={`inline-block w-2 h-2 rounded-full mr-2 ${
                      line.is_required ? 'bg-green-400' : 'bg-gray-300'
                    }`}
                  />
                  {COVERAGE_LABEL[line.coverage_type] ?? line.coverage_type}
                  {!line.is_required && (
                    <span className="ml-1 text-gray-400 text-xs">(optional)</span>
                  )}
                </td>
                <td className="py-2 text-right pr-6 text-gray-600">{fmt(line.min_each_occurrence)}</td>
                <td className="py-2 text-right pr-6 text-gray-600">{fmt(line.min_aggregate)}</td>
                <td className="py-2 text-center text-gray-600">
                  {line.additional_insured_required ? '✓' : '—'}
                </td>
                <td className="py-2 text-center text-gray-600">
                  {line.waiver_required ? '✓' : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
    <div className="bg-white rounded-lg border border-brand-400 shadow-sm p-5">
      <h3 className="font-semibold text-gray-900 mb-4">New profile</h3>
      <div className="mb-4">
        <label className="block text-xs font-medium text-gray-500 mb-1">Profile name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Standard subcontractor"
          autoFocus
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Coverage requirements</label>
        <LinesEditor lines={lines} onChange={setLines} />
      </div>
      <div className="flex items-center gap-3 mt-5">
        <button
          onClick={() => onCreate({ name, lines: lines.map(lineToInput) })}
          disabled={!name.trim() || saving}
          className="px-4 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50"
        >
          {saving ? 'Creating…' : 'Create profile'}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm text-gray-500 hover:text-gray-900"
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profiles'] })
      setCreating(false)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: RequirementProfileInput }) =>
      profilesApi.update(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profiles'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => profilesApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profiles'] }),
  })

  const handleDelete = (id: string) => {
    const profile = profiles?.find((p) => p.id === id)
    if (!profile) return
    if (!window.confirm(`Delete "${profile.name}"? This cannot be undone.`)) return
    deleteMutation.mutate(id)
  }

  if (isLoading) return <LoadingSpinner fullScreen />

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Requirement Profiles</h1>
          <p className="text-sm text-gray-500 mt-1">
            Define the insurance coverage vendors must carry. Assign a profile to each vendor.
          </p>
        </div>
        {!creating && (
          <button
            onClick={() => setCreating(true)}
            className="px-4 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 shrink-0 ml-4"
          >
            New profile
          </button>
        )}
      </div>

      <div className="space-y-4">
        {creating && (
          <NewProfileForm
            onCreate={(payload) => createMutation.mutate(payload)}
            onCancel={() => setCreating(false)}
            saving={createMutation.isPending}
          />
        )}

        {!creating && profiles?.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-10 text-center text-gray-400 text-sm">
            No profiles yet.{' '}
            <button
              onClick={() => setCreating(true)}
              className="text-brand-600 hover:underline"
            >
              Create your first profile
            </button>{' '}
            to define insurance requirements for your vendors.
          </div>
        ) : (
          profiles?.map((profile) => (
            <ProfileCard
              key={profile.id}
              profile={profile}
              onSave={(id, payload) => updateMutation.mutate({ id, payload })}
              onDelete={handleDelete}
              saving={updateMutation.isPending}
            />
          ))
        )}
      </div>
    </div>
  )
}
