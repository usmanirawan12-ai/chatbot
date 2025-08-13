'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

/** ===== Konfigurasi global ===== */
const MODEL_DIR = '/my_model/'
const FPS_LIMIT = 6
const DEFAULT_THRESHOLD = 0.70

// TTS
const LOCALE = 'id-ID'
const ENABLE_SOUND_DEFAULT = true
const SPEAK_COOLDOWN_MS = 2500

// Anti-spam
const WEBCAM_COOLDOWN_MS = 10000
const TTL_LABEL_MUTE_MS = 15000
const SCORE_DELTA_TO_SPEAK = 0.10

const RESPONSE_BY_LABEL = {}
const AUDIO_BY_LABEL = {}

const TMContext = createContext(null)
export const useTM = () => useContext(TMContext)

async function headOk(url) {
  try { const res = await fetch(url, { method: 'HEAD', cache: 'no-store' }); return res.ok }
  catch { return false }
}

export default function TMProvider({ children }) {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [labels, setLabels] = useState([])
  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD)
  const [enableSound, setEnableSound] = useState(ENABLE_SOUND_DEFAULT)

  const [chat, setChat] = useState([
    { role: 'assistant', text: 'Hai! Nyalakan webcam atau unggah gambar—aku akan menebak pakai model Teachable Machine-mu.' },
  ])
  const push = (role, textOrNode) => setChat(p => [...p, { role, text: textOrNode }])

  const tmRef = useRef({ tf: null, tmImage: null, model: null, webcam: null })
  const rafRef = useRef(0)
  const lastTickRef = useRef(0)

  const [imgURL, setImgURL] = useState('')
  const imgRef = useRef(null)

  const [predList, setPredList] = useState([])
  const [top1, setTop1] = useState(null)

  const speechSupportedRef = useRef(typeof window !== 'undefined' && 'speechSynthesis' in window)
  const voicesReadyRef = useRef(false)
  const lastSpokenAtRef = useRef(0)
  const lastSpokenLabelRef = useRef('')
  const lastSpokenScoreRef = useRef(0)

  const lastUploadSigRef = useRef(new Map())
  const lastWebcamRespondAtRef = useRef(0)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        // === TFJS & backend ===
        const tf = await import('@tensorflow/tfjs')
        tmRef.current.tf = tf
        await tf.ready().catch(() => {})
        try { await tf.setBackend('webgl'); await tf.ready() }
        catch { await tf.setBackend('cpu'); await tf.ready() }

        // === Cek file model ===
        const modelURL = MODEL_DIR + 'model.json'
        const metadataURL = MODEL_DIR + 'metadata.json'

        const [okModel, okMeta] = await Promise.all([headOk(modelURL), headOk(metadataURL)])
        if (!okModel || !okMeta) {
          const missing = []
          if (!okModel) missing.push(modelURL)
          if (!okMeta) missing.push(metadataURL)
          setError('File model hilang: ' + missing.join(', '))
          push('assistant', <>File model tidak ditemukan:
            {missing.map((u,i)=>(<div key={i}><a href={u} target="_blank" rel="noreferrer">{u}</a></div>))}
          </>)
          return
        }

        // === Baca model.json untuk cek semua .bin ===
        const mj = await (await fetch(modelURL, { cache: 'no-store' })).json()
        const paths = Array.from(new Set((mj?.weightsManifest || []).flatMap(g => g?.paths || [])))
        if (!paths.length) throw new Error('weightsManifest kosong di model.json')

        const missingBins = []
        for (const p of paths) {
          const binURL = MODEL_DIR + p
          if (!(await headOk(binURL))) missingBins.push(binURL)
        }
        if (missingBins.length) {
          setError('BIN hilang: ' + missingBins.join(', '))
          push('assistant', <>File <b>.bin</b> tidak ditemukan:
            {missingBins.map((u,i)=>(<div key={i}><a href={u} target="_blank" rel="noreferrer">{u}</a></div>))}
          </>)
          return
        }

        // === Import @teachablemachine/image (tahan banting) ===
        const tmMod = await import('@teachablemachine/image')
        const tmImageLib = tmMod?.default || tmMod?.tmImage || globalThis?.tmImage
        if (!tmImageLib || typeof tmImageLib.load !== 'function') {
          console.error('[TM] Modul @teachablemachine/image tidak menyediakan load(). tmMod =', tmMod)
          throw new Error('Library TM tidak tersedia (default/tmImage/globalThis kosong).')
        }
        tmRef.current.tmImage = tmImageLib

        // === Load model ===
        const model = await tmImageLib.load(modelURL, metadataURL)
        tmRef.current.model = model

        // === Labels ===
        try {
          const meta = await (await fetch(metadataURL, { cache: 'no-store' })).json()
          const ls = meta?.labels || meta?.label || []
          if (mounted && Array.isArray(ls) && ls.length) setLabels(ls)
        } catch {}

        if (!mounted) return
        setReady(true)
        push('assistant', 'Model siap. Arahkan objek ke kamera atau unggah file.')
      } catch (e) {
        console.error('[TM] Gagal memuat model/metadata:', e)
        if (!mounted) return
        setError(String(e?.message || e))
        push('assistant', 'Ups, ada masalah saat memuat model. Lihat Console → detail error.')
      }
    })()

    if (speechSupportedRef.current) {
      const loadVoices = () => { window.speechSynthesis.getVoices(); voicesReadyRef.current = true }
      loadVoices()
      window.speechSynthesis.onvoiceschanged = loadVoices
    }
    return () => { mounted = false }
  }, [])

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

  const replyFor = (label, prob) => {
    const conf = (prob * 100).toFixed(2) + '%'
    return (<>
      {RESPONSE_BY_LABEL[label] ?? <>Kuduga ini <span style={{ fontWeight: 800, color: '#000' }}>{label}</span> (keyakinan {conf}).</>}
      {' '}{reaction(prob)}
    </>)
  }

  const replyUnknown = () => (<>Maaf, <span style={{ fontWeight: 800, color: '#000' }}>saya belum tahu</span>. Coba tambahkan dataset gambar yang lebih banyak.</>)

  function pickIndonesianVoice() {
    const list = window.speechSynthesis.getVoices()
    return list.find(v => /(^|\W)id(-|_|$)/i.test(v.lang))
        || list.find(v => /indonesian/i.test(v.name))
        || list.find(v => /id/i.test(v.lang))
        || list[0] || null
  }

  function speak(text) {
    if (!enableSound || !speechSupportedRef.current) return
    const now = Date.now()
    if (now - lastSpokenAtRef.current < SPEAK_COOLDOWN_MS) return
    lastSpokenAtRef.current = now
    const u = new SpeechSynthesisUtterance(text)
    u.lang = LOCALE
    const vv = voicesReadyRef.current ? pickIndonesianVoice() : null
    if (vv) u.voice = vv
    u.rate = 1.0; u.pitch = 1.0; u.volume = 1.0
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(u)
  }

  function playSoundForLabel(label, prob) {
    const url = AUDIO_BY_LABEL[label]
    if (url) { new Audio(url).play().catch(()=>{}); return }
    speak(`Terdeteksi ${label}. Keyakinan ${(prob * 100).toFixed(0)} persen.`)
  }
  function speakUnknown() { speak('Maaf, saya belum tahu. Coba kirim dataset gambar yang lebih banyak.') }

  function shouldSpeak({ label, prob, source, sig }) {
    const now = Date.now()
    if (source === 'upload') {
      const rec = lastUploadSigRef.current.get(label) || { sig: null, muteUntil: 0 }
      if (sig && sig !== rec.sig) { lastUploadSigRef.current.set(label, { sig, muteUntil: now + TTL_LABEL_MUTE_MS }); return true }
      if (now < rec.muteUntil) return false
      lastUploadSigRef.current.set(label, { sig: rec.sig, muteUntil: now + TTL_LABEL_MUTE_MS })
      return true
    }
    if (label !== lastSpokenLabelRef.current) return true
    if (Math.abs(prob - lastSpokenScoreRef.current) >= SCORE_DELTA_TO_SPEAK) return true
    return false
  }
  function markSpoken({ label, prob }) { lastSpokenLabelRef.current = label; lastSpokenScoreRef.current = prob }

  const predictFrom = useCallback(async (el, { source = 'stream', sig = '' } = {}) => {
    try {
      const model = tmRef.current.model
      if (!model || !el) return
      const preds = await model.predict(el)
      const top = bestOf(preds)
      setPredList(preds); setTop1(top)
      if (!top) return
      if (top.probability >= threshold) {
        push('assistant', replyFor(top.className, top.probability))
        if (shouldSpeak({ label: top.className, prob: top.probability, source, sig })) {
          playSoundForLabel(top.className, top.probability); markSpoken({ label: top.className, prob: top.probability })
        }
      } else { push('assistant', replyUnknown()); speakUnknown() }
    } catch (e) { console.error('[TM] Gagal prediksi:', e); push('assistant', 'Terjadi kendala saat memproses gambar (lihat console).') }
  }, [threshold])

  const startWebcam = useCallback(async (mountNode) => {
    const { tmImage } = tmRef.current
    try {
      if (!navigator?.mediaDevices?.getUserMedia) { push('assistant','Browser tidak mendukung kamera atau perlu HTTPS.'); return }
      const rect = mountNode.getBoundingClientRect()
      const width = Math.max(320, Math.floor(rect.width || 320))
      const height = Math.max(240, Math.floor(rect.height || 240))
      const webcam = new tmImage.Webcam(width, height, true)
      await webcam.setup({ facingMode: 'environment' })
      await webcam.play()
      tmRef.current.webcam = webcam
      mountNode.innerHTML = ''
      const c = webcam.canvas
      c.style.width = '100%'; c.style.height = '100%'; c.style.objectFit = 'cover'; c.style.display = 'block'
      mountNode.appendChild(c)
      push('assistant', 'Webcam aktif. Arahkan objek ke kamera.')
      const loop = async (ts) => {
        if (!tmRef.current.webcam) return
        if (ts - lastTickRef.current >= 1000 / FPS_LIMIT) {
          tmRef.current.webcam.update()
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
      console.error('[TM] Start webcam gagal:', e)
      push('assistant', e?.name === 'NotAllowedError'
        ? 'Akses kamera ditolak. Beri izin kamera di browser.'
        : 'Gagal mengaktifkan webcam. Pastikan situs ini HTTPS dan kamera tersedia.')
    }
  }, [predictFrom])

  const stopWebcam = useCallback(async () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    if (tmRef.current.webcam) { await tmRef.current.webcam.stop(); tmRef.current.webcam = null }
    push('assistant', 'Webcam dimatikan.')
  }, [])

  const handleFile = useCallback(async (file) => {
    if (!file) return
    push('user', `Mengirim gambar: ${file.name}`)
    const url = URL.createObjectURL(file)
    if (imgURL) URL.revokeObjectURL(imgURL)
    setImgURL(url)
    const sig = `${file.name}:${file.size}:${file.lastModified}`
    const imgEl = new Image()
    imgEl.onload = async () => {
      if (imgRef.current) { imgRef.current.src = url; await predictFrom(imgRef.current, { source: 'upload', sig }) }
      URL.revokeObjectURL(url)
    }
    imgEl.onerror = () => { push('assistant','Gambar gagal dimuat.'); URL.revokeObjectURL(url) }
    imgEl.src = url
  }, [imgURL, predictFrom])

  const value = {
    ready, error, labels, threshold, setThreshold,
    chat, push, predList, top1,
    imgURL, imgRef, startWebcam, stopWebcam, handleFile,
    enableSound, setEnableSound,
  }

  return <TMContext.Provider value={value}>{children}</TMContext.Provider>
}
