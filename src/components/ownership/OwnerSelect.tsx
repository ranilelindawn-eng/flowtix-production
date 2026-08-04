import type { AssignableMember } from '@/lib/ownership'

type OwnerSelectProps = {
  members: AssignableMember[]
  defaultMembershipId?: string | null
  name?: string
  label?: string
  className?: string
  allowUnassigned?: boolean
}

export default function OwnerSelect({
  members,
  defaultMembershipId,
  name = 'owner_membership_id',
  label = 'Assigned owner',
  className = 'min-h-11 w-full rounded-xl border border-white/10 bg-[#07111F] px-3 text-sm text-white outline-none focus:border-blue-500',
  allowUnassigned = false,
}: OwnerSelectProps) {
  const defaultValue =
    defaultMembershipId ?? members[0]?.membershipId ?? ''

  return (
    <label className="text-sm text-slate-300">
      {label}
      <select
        name={name}
        defaultValue={defaultValue}
        className={`${className} mt-2`}
      >
        {allowUnassigned ? <option value="">Unassigned</option> : null}
        {members.map((member) => (
          <option key={member.membershipId} value={member.membershipId}>
            {member.name}
            {member.email ? ` — ${member.email}` : ''}
          </option>
        ))}
      </select>
    </label>
  )
}
