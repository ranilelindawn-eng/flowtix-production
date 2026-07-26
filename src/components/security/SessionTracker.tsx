 'use client'
import { useEffect } from 'react'
export default function SessionTracker(){useEffect(()=>{void fetch('/api/security/session',{method:'POST'});const id=setInterval(()=>void fetch('/api/security/session',{method:'POST'}),300000);return()=>clearInterval(id)},[]);return null}
