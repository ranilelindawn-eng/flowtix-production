import Link from 'next/link'
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  LockKeyhole,
  ShieldCheck,
  UserRoundCheck,
} from 'lucide-react'

import { getProductionAcceptanceReport } from '@/lib/platform/production-acceptance'

function roleLabel(value: string): string {
  return value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

export default async function PlatformProductionAcceptancePage() {
  const report = await getProductionAcceptanceReport()

  return (
    <div className="space-y-8">
      <section>
        <p className="text-sm font-medium text-blue-300">
          Phase 2.10 — final acceptance
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">
          Production Readiness & Role Acceptance
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
          Final Platform Owner acceptance dashboard combining the automated
          security/consistency reports with the role-by-role sign-in tests that
          must be completed using real Flowtix accounts before production
          acceptance.
        </p>
      </section>

      <section
        className={`rounded-2xl border p-6 ${
          report.automatedHealthy
            ? 'border-emerald-400/20 bg-emerald-400/[0.06]'
            : 'border-amber-400/20 bg-amber-400/[0.06]'
        }`}
      >
        <div className="flex items-start gap-4">
          {report.automatedHealthy ? (
            <CheckCircle2 className="mt-0.5 h-7 w-7 shrink-0 text-emerald-300" />
          ) : (
            <AlertTriangle className="mt-0.5 h-7 w-7 shrink-0 text-amber-300" />
          )}
          <div>
            <h2 className="text-lg font-semibold text-white">
              {report.automatedHealthy
                ? 'Automated acceptance checks are healthy'
                : 'One or more automated acceptance checks require review'}
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Automated readiness score: {report.automatedScore}/100. Manual
              role sign-in acceptance is still required before declaring the
              platform production-ready.
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {report.sections.map((section) => (
          <Link
            key={section.key}
            href={section.href}
            className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-blue-400/30 hover:bg-white/[0.05]"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="rounded-xl bg-blue-500/10 p-2.5 text-blue-300">
                <ClipboardCheck className="h-5 w-5" />
              </div>
              <span
                className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                  section.healthy
                    ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200'
                    : 'border-amber-400/20 bg-amber-400/10 text-amber-200'
                }`}
              >
                {section.score}/100
              </span>
            </div>
            <h2 className="mt-4 font-semibold text-white">{section.label}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              {section.detail}
            </p>
          </Link>
        ))}
      </section>

      <section className="rounded-2xl border border-blue-400/15 bg-blue-400/[0.04] p-5">
        <div className="flex gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-300" />
          <div>
            <h2 className="font-semibold text-blue-100">
              Tenant isolation checkpoint
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Unguarded customer membership policies:{' '}
              {report.tenantIsolation.unguardedCustomerMembershipPolicies}.
              Historical active Platform/customer membership rows:{' '}
              {report.tenantIsolation.overlappingActiveMembershipRows}. Those
              historical rows are informational when the customer helper,
              active-organization selector, and new-membership activation
              guards are all enabled.
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <article className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]">
          <div className="border-b border-white/10 px-6 py-5">
            <div className="flex items-center gap-3">
              <LockKeyhole className="h-5 w-5 text-blue-300" />
              <div>
                <h2 className="font-semibold text-white">
                  Platform staff role matrix
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Expected server-side permissions for internal Flowtix roles.
                </p>
              </div>
            </div>
          </div>

          <div className="divide-y divide-white/10">
            {report.platformRoles.map((item) => (
              <div key={item.role} className="px-6 py-5">
                <p className="font-semibold text-white">
                  {roleLabel(item.role)}
                </p>
                <p className="mt-2 text-xs leading-6 text-slate-500">
                  {item.permissions.join(' · ')}
                </p>
              </div>
            ))}
          </div>
        </article>

        <article className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]">
          <div className="border-b border-white/10 px-6 py-5">
            <div className="flex items-center gap-3">
              <UserRoundCheck className="h-5 w-5 text-blue-300" />
              <div>
                <h2 className="font-semibold text-white">
                  Customer workspace role matrix
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Expected customer permissions inside one isolated organization.
                </p>
              </div>
            </div>
          </div>

          <div className="divide-y divide-white/10">
            {report.customerRoles.map((item) => (
              <div key={item.role} className="px-6 py-5">
                <p className="font-semibold text-white">
                  {roleLabel(item.role)}
                </p>
                <p className="mt-2 text-xs leading-6 text-slate-500">
                  {item.permissions.join(' · ')}
                </p>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]">
        <div className="border-b border-white/10 px-6 py-5">
          <h2 className="font-semibold text-white">
            Required manual role acceptance
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            These tests require actual accounts/sessions. The application cannot
            truthfully mark them passed without signing in as each role.
          </p>
        </div>

        <div className="grid gap-0 md:grid-cols-2 xl:grid-cols-3">
          {report.manualRoles.map((item) => (
            <div
              key={item.role}
              className="border-b border-white/10 px-6 py-5 md:border-r"
            >
              <p className="font-medium text-white">{item.role}</p>
              <p className="mt-1 text-xs capitalize text-slate-500">
                {item.area} account · manual sign-in test required
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-amber-400/15 bg-amber-400/[0.04] p-5">
        <p className="text-sm leading-6 text-slate-400">
          Production acceptance should be declared only after `npm run lint`,
          `npm run type-check`, and `npm run build` are clean, the automated
          sections above are healthy, one PayMongo test-mode transaction has
          completed end-to-end, at least one customer integration still works
          after Phase 2.8 secret hardening, and all nine role sign-in tests have
          been manually completed.
        </p>
      </section>
    </div>
  )
}
