interface Props {
  /** Fill the entire viewport — only use BEFORE the layout shell is mounted (e.g. auth check) */
  fullScreen?: boolean
  /** Size in Tailwind units, default 8 (32 px) */
  size?: number
}

export default function LoadingSpinner({ fullScreen, size = 8 }: Props) {
  const spinner = (
    <div className="flex items-center justify-center">
      <div
        className={`animate-spin rounded-full border-b-2 border-brand-500`}
        style={{ width: `${size * 4}px`, height: `${size * 4}px` }}
      />
    </div>
  )

  if (fullScreen) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        {spinner}
      </div>
    )
  }

  // Default: fill the content area only, not the entire viewport
  return (
    <div className="flex items-center justify-center py-24">
      {spinner}
    </div>
  )
}
