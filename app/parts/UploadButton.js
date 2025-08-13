'use client'

import { useTM } from './TMProvider'

export default function UploadButton() {
  const { handleFile, imgURL, imgRef } = useTM()

  return (
    <div>
      <label className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-white/15 bg-white/10 hover:bg-white/15 cursor-pointer transition">
        <span>Upload Gambar</span>
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      </label>

      {imgURL && (
        <img
          ref={imgRef}
          src={imgURL}
          alt="preview"
          className="mt-3 max-h-72 rounded-xl border border-white/10"
        />
      )}
    </div>
  )
}
