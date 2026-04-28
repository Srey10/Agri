import { useState, useRef } from 'react'
import { Upload, ImagePlus, X, Microscope, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react'
import './CropDisease.css'

const COMMON_DISEASES = [
  { name: 'Red Rot', emoji: '🔴', severity: 'High', description: 'Caused by Colletotrichum falcatum. Affects stalk internodes, red discolouration with white patches.', action: 'Remove infected stalks. Apply Carbendazim 0.1%.' },
  { name: 'Smut', emoji: '⚫', severity: 'High', description: 'Caused by Sporisorium scitamineum. Black whip-like structure emerges from shoot.', action: 'Destroy infected plants. Use disease-free setts.' },
  { name: 'Wilt', emoji: '🟡', severity: 'Medium', description: 'Caused by Fusarium sacchari. Yellowing and drying of leaves, hollow stalk.', action: 'Improve drainage. Apply Trichoderma viride.' },
  { name: 'Leaf Scald', emoji: '🟠', severity: 'Medium', description: 'Caused by Xanthomonas albilineans. White pencil-line streaks on leaves.', action: 'Use resistant varieties. Hot water treatment of setts.' },
  { name: 'Ratoon Stunting', emoji: '🟤', severity: 'Low', description: 'Caused by Leifsonia xyli. Stunted growth, reduced tillering.', action: 'Hot water treatment at 50°C for 2 hours.' },
]

export default function CropDisease() {
  const [dragOver, setDragOver] = useState(false)
  const [image, setImage] = useState(null)
  const [imageUrl, setImageUrl] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [result, setResult] = useState(null)
  const fileRef = useRef()

  const handleFile = (file) => {
    if (!file || !file.type.startsWith('image/')) return
    setImage(file)
    setImageUrl(URL.createObjectURL(file))
    setResult(null)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    handleFile(e.dataTransfer.files[0])
  }

  // ✅ CONNECTED TO FLASK BACKEND
  const handleAnalyze = async () => {
    if (!image) return

    setAnalyzing(true)

    try {
      const formData = new FormData()
      formData.append("image", image)

      const res = await fetch("http://127.0.0.1:5000/predict", {
        method: "POST",
        body: formData
      })

      const data = await res.json()

      setResult({
        status: "done",
        disease: data.disease,
        confidence: data.confidence,
        treatment: data.treatment
      })

    } catch (err) {
      console.error(err)
      setResult({
        status: "error",
        message: "Error connecting to backend"
      })
    }

    setAnalyzing(false)
  }

  const clearImage = () => {
    setImage(null)
    setImageUrl(null)
    setResult(null)
  }

  return (
    <div className="cd-page fade-in">
      <div className="cd-header">
        <div>
          <h1 className="dash-title">
            <Microscope size={22} style={{ display: 'inline', marginRight: 8 }} />
            Crop Disease Detection
          </h1>
          <p className="dash-sub">
            Mote Patil Sugarcane Farms · Upload a crop image for disease analysis
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div className="badge badge-blue">Model Connected</div>
          <div className="badge badge-blue">Sugarcane</div>
        </div>
      </div>

      <div className="cd-main">
        {/* Upload Panel */}
        <div className="cd-upload-col">
          <div className="card">
            <div className="card-section-title" style={{ marginBottom: 16 }}>
              <ImagePlus size={13} /> Upload Crop Image
            </div>

            {!imageUrl ? (
              <div
                className={`cd-dropzone ${dragOver ? 'drag-over' : ''}`}
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current.click()}
              >
                <div className="cd-dropzone-icon">🌿</div>
                <div className="cd-dropzone-title">Drop crop image here</div>
                <div className="cd-dropzone-sub">or click to browse · JPG, PNG, WEBP supported</div>
                <button className="btn-outline" style={{ marginTop: 16, fontSize: 12 }}>
                  <Upload size={14} /> Choose Image
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={e => handleFile(e.target.files[0])}
                />
              </div>
            ) : (
              <div className="cd-preview">
                <div className="cd-preview-img-wrap">
                  <img src={imageUrl} alt="Crop" className="cd-preview-img" />
                  <button className="cd-clear-btn" onClick={clearImage}>
                    <X size={14} />
                  </button>
                </div>
                <div className="cd-preview-info">
                  <div className="cd-preview-name">{image.name}</div>
                  <div className="cd-preview-size">{(image.size / 1024).toFixed(1)} KB</div>
                </div>
                <button
                  className="btn-primary"
                  style={{ width: '100%', justifyContent: 'center', marginTop: 12 }}
                  onClick={handleAnalyze}
                  disabled={analyzing}
                >
                  {analyzing
                    ? <><Loader2 size={15} className="spin-icon" /> Analysing...</>
                    : <><Microscope size={15} /> Analyse for Disease</>
                  }
                </button>
              </div>
            )}
          </div>

          {/* Result */}
          {result && (
            <div className="card cd-result-card" style={{ marginTop: 14 }}>
              <div className="card-section-title" style={{ marginBottom: 12 }}>
                <CheckCircle size={13} /> Analysis Result
              </div>

              <div className="cd-result-pending">
                {result.status === "done" ? (
                  <>
                    <div style={{ fontSize: 28, marginBottom: 10 }}>🧪</div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>
                      Disease: {result.disease}
                    </div>
                    <div style={{ fontSize: 12, marginTop: 4 }}>
                      Confidence: {result.confidence.toFixed(2)}%
                    </div>
                    <div style={{ marginTop: 8, fontSize: 12, color: 'var(--green-accent)' }}>
                      💊 {result.treatment}
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 28 }}>⚠️</div>
                    <div style={{ fontSize: 12 }}>{result.message}</div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Disease Reference Panel */}
        <div className="cd-info-col">
          <div className="card">
            <div className="card-section-title" style={{ marginBottom: 16 }}>
              📚 Common Sugarcane Diseases
            </div>
            <div className="cd-disease-list">
              {COMMON_DISEASES.map((d, i) => (
                <div key={i} className="cd-disease-item">
                  <div className="cd-disease-header">
                    <span className="cd-disease-emoji">{d.emoji}</span>
                    <div className="cd-disease-name">{d.name}</div>
                    <div className={`badge ${d.severity === 'High' ? 'badge-red' : d.severity === 'Medium' ? 'badge-yellow' : 'badge-blue'}`} style={{ fontSize: 9 }}>
                      {d.severity}
                    </div>
                  </div>
                  <div className="cd-disease-desc">{d.description}</div>
                  <div className="cd-disease-action">
                    <span style={{ color: 'var(--green-accent)', fontWeight: 600, fontSize: 10 }}>✅ Action: </span>
                    {d.action}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
