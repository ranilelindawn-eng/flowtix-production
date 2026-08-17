type ErrorAlertProps = {
  title?: string
  message: string
  className?: string
}

export default function ErrorAlert({
  title = 'Action could not be completed',
  message,
  className = '',
}: ErrorAlertProps) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`rounded-2xl border border-red-400/25 bg-red-400/10 px-4 py-4 text-sm leading-6 text-red-100 ${className}`}
    >
      <p className="font-semibold text-red-300">{title}</p>
      <p className="mt-1 text-red-100/90">{message}</p>
    </div>
  )
}
