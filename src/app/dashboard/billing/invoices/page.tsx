import Link from 'next/link'

import { getInvoices, getUsageBillingStatements } from '@/lib/billing/platform'

const money = (value: number, currency: string) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency }).format(value / 100)

export default async function BillingInvoicesPage() {
  const [invoices, statements] = await Promise.all([getInvoices(), getUsageBillingStatements()])
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div><h1 className="text-3xl font-bold text-white">Invoices and usage billing</h1><p className="mt-2 text-slate-400">Payment-backed invoices and provider-neutral usage statements.</p></div>
        <Link href="/dashboard/billing" className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">Back to billing</Link>
      </div>
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="text-xl font-bold text-white">Invoices</h2>
        <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-slate-400"><tr><th className="py-3">Invoice</th><th>Status</th><th>Total</th><th>Period</th><th>Created</th></tr></thead><tbody className="divide-y divide-slate-800">{invoices.map((invoice)=><tr key={invoice.id}><td className="py-4 font-medium text-white">{invoice.invoice_number}</td><td className="capitalize text-slate-300">{invoice.status}</td><td className="text-slate-300">{money(invoice.total,invoice.currency)}</td><td className="text-slate-400">{invoice.period_start ? new Date(invoice.period_start).toLocaleDateString() : '—'} – {invoice.period_end ? new Date(invoice.period_end).toLocaleDateString() : '—'}</td><td className="text-slate-400">{new Date(invoice.created_at).toLocaleDateString()}</td></tr>)}{invoices.length===0?<tr><td colSpan={5} className="py-8 text-center text-slate-500">No invoices yet.</td></tr>:null}</tbody></table></div>
      </section>
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="text-xl font-bold text-white">Usage statements</h2>
        <div className="mt-4 space-y-3">{statements.map((statement)=><div key={statement.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 p-4"><div><p className="font-medium text-white">{statement.period_start} to {statement.period_end}</p><p className="text-sm capitalize text-slate-400">{statement.status}</p></div><p className="font-semibold text-white">{money(statement.subtotal,statement.currency)}</p></div>)}{statements.length===0?<p className="py-6 text-center text-slate-500">No usage statements yet.</p>:null}</div>
      </section>
    </div>
  )
}
