'use client'

import { useTM } from './TMProvider'

export default function ThresholdControl() {
  const { threshold, setThreshold } = useTM()
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-slate-300/80">Ambang</span>
      <input
        type="range"
        min="0"
        max="0.99"
        step="0.01"
        value={threshold}
        onChange={(e) => setThreshold(Number(e.target.value))}
        className="accent-indigo-400"
      />
      <span className="text-sm tabular-nums">{threshold.toFixed(2)}</span>
    </div>
  )
}
