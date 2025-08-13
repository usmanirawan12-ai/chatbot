'use client'

import TMProvider from './parts/TMProvider'
import CameraPanel from './parts/CameraPanel'
import ChatPanel from './parts/ChatPanel'
import PredictionSummary from './parts/PredictionSummary'
import ThresholdControl from './parts/ThresholdControl'
import UploadButton from './parts/UploadButton'

export default function Page() {
  return (
    <TMProvider>
      <div className="min-h-[100dvh] bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-slate-100">
        <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
          <header className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                Chat BOT KELOMPOK 3
              </h1>
              <p className="text-sm text-slate-300/80">
                Mini “chat GPT” berbasis Teachable Machine • Webcam + Upload • UI kelas premium
              </p>
            </div>
            <div className="hidden sm:block text-xs text-slate-300/70">
              Dibuat menggunakan Next.js
            </div>
          </header>

          <main className="grid lg:grid-cols-2 gap-6">
            {/* KIRI: Kamera/Upload + Ringkasan Prediksi */}
            <section className="space-y-4">
              <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md shadow-2xl shadow-indigo-900/20 p-4 sm:p-5">
                <div className="flex flex-col gap-3 sm:gap-4">
                  <div className="flex items-center gap-3 flex-wrap">
                    <CameraPanel />
                    <div className="ml-auto">
                      <ThresholdControl />
                    </div>
                  </div>

                  <div className="border-t border-white/10 my-2" />
                  <UploadButton />
                </div>
              </div>

              <PredictionSummary />
            </section>

            {/* KANAN: Chat */}
            <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md shadow-2xl shadow-indigo-900/20 p-3 sm:p-5">
              <ChatPanel />
            </section>
          </main>

          <footer className="text-center text-xs text-slate-400/70 pt-2 pb-6">
            Tip: ubah respons per label di <code className="text-slate-200">RESPONSE_BY_LABEL</code> (TMProvider).
          </footer>
        </div>
      </div>
    </TMProvider>
  )
}
