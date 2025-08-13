'use client'

import { useEffect, useRef } from 'react'
import { useTM } from './TMProvider'

function Bubble({ role, children }) {
  const isBot = role === 'assistant'
  return (
    <div className={`max-w-[85%] ${isBot ? '' : 'ml-auto'}`}>
      <div className="text-[10px] uppercase tracking-wide mb-1 text-slate-300/60">
        {isBot ? 'Sera' : 'Kamu'}
      </div>
      <div
        className={
          'whitespace-pre-wrap rounded-2xl border p-3 shadow ' +
          (isBot
            ? 'bg-white text-slate-900 border-white/60 shadow-slate-900/10'
            : 'bg-slate-900/90 text-white border-white/10 shadow-black/30')
        }
      >
        {children}
      </div>
    </div>
  )
}

export default function ChatPanel() {
  const { chat } = useTM()
  const boxRef = useRef(null)

  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [chat])

  return (
    <div className="flex flex-col h-[520px]">
      <div
        ref={boxRef}
        className="flex-1 overflow-auto rounded-xl bg-gradient-to-br from-white/5 to-white/10 border border-white/10 p-3 sm:p-4 space-y-3"
      >
        {chat.map((m, i) => (
          <Bubble key={i} role={m.role}>{m.text}</Bubble>
        ))}
      </div>

      
    </div>
  )
}
