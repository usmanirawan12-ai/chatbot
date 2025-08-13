'use client'

import { useRef } from 'react'
import { useTM } from './TMProvider'

export default function CameraPanel() {
  const { ready, startWebcam, stopWebcam } = useTM()
  const mountRef = useRef(null)

  return (
    <div className="w-full">
      <div className="flex items-center gap-2">
        <button
          onClick={() => startWebcam(mountRef.current)}
          disabled={!ready}
          className="px-4 py-2 rounded-xl border border-white/15 bg-white/10 hover:bg-white/15 disabled:opacity-50 transition"
        >
          Start Webcam
        </button>
        <button
          onClick={stopWebcam}
          className="px-4 py-2 rounded-xl border border-rose-400/30 bg-rose-500/20 hover:bg-rose-500/30 transition"
        >
          Stop Webcam
        </button>
      </div>

      <div
        ref={mountRef}
        className="mt-3 rounded-xl overflow-hidden border border-white/10 bg-black/40 aspect-square"
      />
    </div>
  )
}
