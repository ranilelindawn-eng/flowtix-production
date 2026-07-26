type ContactCardProps = {
  label: string
  value: string
}

export default function ContactCard({ label, value }: ContactCardProps) {
  return (
    <div className="rounded-3xl border border-white/10 bg-[#0B1726]/90 p-5">
      <p className="text-sm text-slate-400">{label}</p>
      <p className="mt-2 text-lg font-semibold text-white">{value}</p>
    </div>
  )
}
