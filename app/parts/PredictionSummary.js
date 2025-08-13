'use client'

import { useTM } from './TMProvider'

export default function PredictionSummary() {
  const { labels, predList, top1, ready, error } = useTM()

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md shadow-xl p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-lg font-semibold">Ringkasan Prediksi</h2>
        <div className="text-xs text-slate-300/80">
          Status: {error ? 'Error' : (ready ? 'Model siap' : 'Memuat…')}
        </div>
      </div>

      <div className="mt-3 grid sm:grid-cols-2 gap-4">
        <div>
          <div className="text-sm text-slate-300/80">Label terdeteksi</div>
          <div className="mt-1 text-sm">
            {labels?.length ? labels.join(', ') : '—'}
          </div>
        </div>

        <div>
          <div className="text-sm text-slate-300/80">Top-1</div>
          <div className="mt-1 text-sm">
            {top1 ? `${top1.className} (${(top1.probability * 100).toFixed(2)}%)` : '—'}
          </div>
        </div>
      </div>

      <div className="mt-4 border-t border-white/10 pt-3 space-y-1 text-sm">
        {predList?.map(p => (
          <div key={p.className} className="flex items-center justify-between">
            <span>{p.className}</span>
            <b className="font-semibold">{p.probability.toFixed(2)}</b>
          </div>
        ))}
        {!predList?.length && <div className="text-slate-400/70">Belum ada prediksi.</div>}
      </div>
    </div>
  )
}
