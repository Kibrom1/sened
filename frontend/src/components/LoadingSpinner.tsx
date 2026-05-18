interface Props {
  fullScreen?: boolean
}

export default function LoadingSpinner({ fullScreen }: Props) {
  const spinner = (
    <div className="flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
    </div>
  )

  if (fullScreen) {
    return <div className="min-h-screen flex items-center justify-center">{spinner}</div>
  }
  return spinner
}
