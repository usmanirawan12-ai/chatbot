'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

/** ===== Konfigurasi global ===== */
const MODEL_DIR = '/my_model/'       // folder di /public
const FPS_LIMIT = 6                  // fps update webcam (render)
const DEFAULT_THRESHOLD = 0.70

// TTS
const LOCALE = 'id-ID'               // fokus suara Indonesia
const ENABLE_SOUND_DEFAULT = true
const SPEAK_COOLDOWN_MS = 2500       // jeda minimal antar suara global

// Anti-spam
const WEBCAM_COOLDOWN_MS = 10000      // jeda minimal antar RESPON webcam (chat+suara) = 5s
const TTL_LABEL_MUTE_MS = 15000      // upload: anti spam utk file yg sama (15s)
const SCORE_DELTA_TO_SPEAK = 0.10    // webcam: bicara lagi jika skor beda >= 0.10

/** Balasan per label (opsional) */
const RESPONSE_BY_LABEL = {
  // Gajah: 'Aku melihat gajah.',
  // Kuda: 'Kuda terdeteksi.',
}

/** (Opsional) Audio kustom per label di /public/sfx/ */
const AUDIO_BY_LABEL = {
  // Gajah: '/sfx/gajah.mp3',
  // Kuda: '/sfx/kuda.mp3',
}

const TMContext = createContext(null)
export const useTM = () => useContext(TMContext)

export default function TMProvider({ children }) {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [labels, setLabels] = useState([])
  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD)
  const [enableSound, setEnableSound] = useState(ENABLE_SOUND_DEFAULT)

  // chat
  const [chat, setChat] = useState([
    { role: 'assistant', text: 'Hai! Nyalakan webcam atau unggah gambar—aku akan menebak pakai model Teachable Machine-mu.' },
  ])
  const push = (role, textOrNode) => setChat(prev => [...prev, { role, text: textOrNode }])

  // TM internals
  const tmRef = useRef({ tmImage: null, model: null, webcam: null })
  const rafRef = useRef(0)
  const lastTickRef = useRef(0)

  // upload preview
  const [imgURL, setImgURL] = useState('')
  const imgRef = useRef(null)

  // prediksi
  const [predList, setPredList] = useState([])
  const [top1, setTop1] = useState(null)

  // kontrol suara
  const speechSupportedRef = useRef(typeof window !== 'undefined' && 'speechSynthesis' in window)
  const voicesReadyRef = useRef(false)
  const lastSpokenAtRef = useRef(0)
  const lastSpokenLabelRef = useRef('')    // webcam
  const lastSpokenScoreRef = useRef(0)     // webcam

  // Dedupe upload: label -> { sig, muteUntil }
  const lastUploadSigRef = useRef(new Map())

  // Cooldown respon webcam
  const lastWebcamRespondAtRef = useRef(0)

  // ====== Load model ======
  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        await import('@tensorflow/tfjs')
        const { default: tmImageLib } = await import('@teachablemachine/image')
        tmRef.current.tmImage = tmImageLib

        const model = await tmImageLib.load(MODEL_DIR + 'model.json', MODEL_DIR + 'metadata.json')
        tmRef.current.model = model

        try {
          const res = await fetch(MODEL_DIR + 'metadata.json')
          const meta = await res.json()
          const ls = meta?.labels || meta?.label || []
          if (mounted && Array.isArray(ls) && ls.length) setLabels(ls)
        } catch {}

        if (!mounted) return
        setReady(true)
        push('assistant', 'Model siap. Arahkan objek ke kamera atau unggah file.')
      } catch (e) {
        console.error(e)
        if (!mounted) return
        setError('Gagal memuat model. Pastikan /public/my_model/ berisi model.json, metadata.json, dan weights*.bin.')
      }
    })()

    // Siapkan voice list (Chrome kadang telat load)
    if (speechSupportedRef.current) {
      const loadVoices = () => { window.speechSynthesis.getVoices(); voicesReadyRef.current = true }
      loadVoices()
      window.speechSynthesis.onvoiceschanged = loadVoices
    }

    return () => { mounted = false }
  }, [])

  // ====== Util umum prediksi ======
  const bestOf = (preds) => {
    if (!preds?.length) return null
    let idx = 0
    for (let i = 1; i < preds.length; i++) if (preds[i].probability > preds[idx].probability) idx = i
    return preds[idx]
  }

  const reaction = (p) => {
    if (p >= 0.9) return 'Aku sangat yakin.'
    if (p >= 0.7) return 'Cukup yakin.'
    if (p >= 0.5) return 'Masih ragu—coba sudut atau pencahayaan yang lebih jelas.'
    return 'Keyakinanku rendah—mungkin butuh data latih yang lebih banyak.'
  }

  // >> Balasan: JSX (agar label bisa bold & hitam)
  const replyFor = (label, prob) => {
    const conf = (prob * 100).toFixed(2) + '%'
    const base = RESPONSE_BY_LABEL[label] || (
      <>
        Kuduga ini <span style={{ fontWeight: 800, color: '#000' }}>{label}</span> (keyakinan {conf}).
      </>
    )
    return (<>{base} {reaction(prob)}</>)
  }

  const replyUnknown = () => (
    <>
      Maaf, <span style={{ fontWeight: 800, color: '#000' }}>saya belum tahu</span>. 
      Coba tambahkan dataset gambar yang lebih banyak.
    </>
  )

  // ====== Suara ======
  function pickIndonesianVoice() {
    const list = window.speechSynthesis.getVoices()
    let v = list.find(v => /(^|\W)id(-|_|$)/i.test(v.lang))
    if (v) return v
    v = list.find(v => /indonesian/i.test(v.name))
    return v || list.find(v => /id/i.test(v.lang)) || list[0] || null
  }

  function speak(text) {
    if (!enableSound || !speechSupportedRef.current) return
    try {
      const now = Date.now()
      if (now - lastSpokenAtRef.current < SPEAK_COOLDOWN_MS) return
      lastSpokenAtRef.current = now

      const u = new SpeechSynthesisUtterance(text)
      u.lang = LOCALE
      if (voicesReadyRef.current) {
        const vv = pickIndonesianVoice()
        if (vv) u.voice = vv
      }
      u.rate = 1.0; u.pitch = 1.0; u.volume = 1.0
      window.speechSynthesis.cancel()
      window.speechSynthesis.speak(u)
    } catch (e) {
      console.warn('TTS gagal:', e)
    }
  }

  function playSoundForLabel(label, prob) {
    const url = AUDIO_BY_LABEL[label]
    if (url) {
      const a = new Audio(url)
      a.play().catch(() => {})
      return
    }
    speak(`Terdeteksi ${label}. Keyakinan ${(prob * 100).toFixed(0)} persen.`)
  }

  function speakUnknown() {
    speak('Maaf, saya belum tahu. Coba kirim dataset gambar yang lebih banyak.')
  }

  // ——— Aturan kapan boleh bicara ———
  function shouldSpeak({ label, prob, source, sig }) {
    const now = Date.now()

    if (source === 'upload') {
      // Dedupe berdasarkan signature file. Jika signature berbeda -> bicara.
      const rec = lastUploadSigRef.current.get(label) || { sig: null, muteUntil: 0 }
      if (sig && sig !== rec.sig) {
        lastUploadSigRef.current.set(label, { sig, muteUntil: now + TTL_LABEL_MUTE_MS })
        return true
      }
      // Signature sama: cek TTL anti spam
      if (now < rec.muteUntil) return false
      lastUploadSigRef.current.set(label, { sig: rec.sig, muteUntil: now + TTL_LABEL_MUTE_MS })
      return true
    }

    // Webcam: bicara jika label berubah, atau skor berubah signifikan
    if (label !== lastSpokenLabelRef.current) return true
    if (Math.abs(prob - lastSpokenScoreRef.current) >= SCORE_DELTA_TO_SPEAK) return true
    return false
  }

  function markSpoken({ label, prob }) {
    lastSpokenLabelRef.current = label
    lastSpokenScoreRef.current = prob
  }

  // ====== Prediksi ======
  const predictFrom = useCallback(async (el, { source = 'stream', sig = '' } = {}) => {
    const model = tmRef.current.model
    if (!model || !el) return
    const preds = await model.predict(el)
    const top = bestOf(preds)
    setPredList(preds)
    setTop1(top)
    if (!top) return

    if (top.probability >= threshold) {
      push('assistant', replyFor(top.className, top.probability))
      if (shouldSpeak({ label: top.className, prob: top.probability, source, sig })) {
        playSoundForLabel(top.className, top.probability)
        markSpoken({ label: top.className, prob: top.probability })
      }
    } else {
      push('assistant', replyUnknown())
      // Unknown: cukup hormati cooldown suara global
      speakUnknown()
    }
  }, [threshold])

  // ====== Webcam ======
  const startWebcam = useCallback(async (mountNode) => {
    const { tmImage } = tmRef.current
    try {
      // Ambil ukuran container agar canvas bisa "full"
      const rect = mountNode.getBoundingClientRect()
      const width = Math.max(320, Math.floor(rect.width || 320))
      const height = Math.max(240, Math.floor(rect.height || 240))

      const webcam = new tmImage.Webcam(width, height, true)
      await webcam.setup()
      await webcam.play()
      tmRef.current.webcam = webcam

      // Tempel & paksa canvas memenuhi container
      mountNode.innerHTML = ''
      const c = webcam.canvas
      c.style.width = '100%'
      c.style.height = '100%'
      c.style.objectFit = 'cover'
      c.style.display = 'block'
      mountNode.appendChild(c)

      push('assistant', 'Webcam aktif. Arahkan objek ke kamera.')

      const loop = async (ts) => {
        if (!tmRef.current.webcam) return
        if (ts - lastTickRef.current >= 1000 / FPS_LIMIT) {
          tmRef.current.webcam.update()

          // RESPON webcam dibatasi setiap 5 detik
          const now = Date.now()
          if (now - lastWebcamRespondAtRef.current >= WEBCAM_COOLDOWN_MS) {
            await predictFrom(tmRef.current.webcam.canvas, { source: 'stream' })
            lastWebcamRespondAtRef.current = now
          }

          lastTickRef.current = ts
        }
        rafRef.current = requestAnimationFrame(loop)
      }
      rafRef.current = requestAnimationFrame(loop)
    } catch (e) {
      console.error(e)
      push('assistant', 'Gagal mengaktifkan webcam. Pastikan izin kamera diberikan.')
    }
  }, [predictFrom])

  const stopWebcam = useCallback(async () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    if (tmRef.current.webcam) {
      await tmRef.current.webcam.stop()
      tmRef.current.webcam = null
    }
    push('assistant', 'Webcam dimatikan.')
  }, [])

  // ====== Upload ======
  const handleFile = useCallback(async (file) => {
    if (!file) return
    push('user', `Mengirim gambar: ${file.name}`)
    const url = URL.createObjectURL(file)
    if (imgURL) URL.revokeObjectURL(imgURL)
    setImgURL(url)

    // Signature file (untuk dedupe)
    const sig = `${file.name}:${file.size}:${file.lastModified}`

    setTimeout(async () => {
      if (imgRef.current) await predictFrom(imgRef.current, { source: 'upload', sig })
      URL.revokeObjectURL(url)
    }, 30)
  }, [imgURL, predictFrom])

  const value = {
    ready, error, labels, threshold, setThreshold,
    chat, push,
    predList, top1,
    imgURL, imgRef,
    startWebcam, stopWebcam, handleFile,
    enableSound, setEnableSound,
  }

  return <TMContext.Provider value={value}>{children}</TMContext.Provider>
}
