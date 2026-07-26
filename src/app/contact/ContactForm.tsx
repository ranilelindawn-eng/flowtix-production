'use client'
import { FormEvent, useState } from 'react'

export default function ContactForm() {
  const [state, setState] = useState<'idle'|'sending'|'sent'|'error'>('idle')
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setState('sending')
    const form = event.currentTarget
    const body = new URLSearchParams(new FormData(form) as never).toString()
    try {
      const response = await fetch('/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body })
      if (!response.ok) throw new Error('Submission failed')
      form.reset(); setState('sent')
    } catch { setState('error') }
  }
  return <form name="contact" onSubmit={submit} className="grid gap-5 rounded-3xl border border-white/10 bg-white/[0.04] p-8">
    <input type="hidden" name="form-name" value="contact" />
    <label className="grid gap-2"><span>Name</span><input required name="name" className="rounded-xl border border-white/10 bg-slate-950 px-4 py-3" /></label>
    <label className="grid gap-2"><span>Email</span><input required type="email" name="email" className="rounded-xl border border-white/10 bg-slate-950 px-4 py-3" /></label>
    <label className="grid gap-2"><span>Topic</span><select name="topic" className="rounded-xl border border-white/10 bg-slate-950 px-4 py-3"><option>General inquiry</option><option>Account support</option><option>Security</option><option>Business plan</option></select></label>
    <label className="grid gap-2"><span>Message</span><textarea required name="message" rows={6} className="rounded-xl border border-white/10 bg-slate-950 px-4 py-3" /></label>
    <button disabled={state==='sending'} className="rounded-full bg-gradient-to-r from-blue-600 to-cyan-400 px-6 py-3 font-semibold">{state==='sending' ? 'Sending…' : 'Send message'}</button>
    {state==='sent' ? <p role="status" className="text-emerald-300">Your message was submitted successfully.</p> : null}
    {state==='error' ? <p role="alert" className="text-rose-300">The form could not be submitted. Please try again after deployment on Netlify.</p> : null}
  </form>
}
