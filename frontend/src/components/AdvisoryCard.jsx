import { useState, useEffect } from 'react'
import { GoogleGenerativeAI } from '@google/generative-ai'

const apiKey = import.meta.env.VITE_GEMINI_API_KEY
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null

export default function AdvisoryCard({ zones, temp, rainfall, ready }) {
  const [tips, setTips] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const getAdvice = async () => {
    if (!genAI) {
      setError('Gemini API key missing in frontend/.env')
      return
    }
    setLoading(true)
    setError('')
    try {
      const summary = zones
        .map(z => `Zone ${z.id + 1}: health=${z.health}, NDVI=${z.ndvi?.toFixed?.(2) ?? 'n/a'}, soil=${z.soil}`)
        .join('\n')

      const prompt = `You are an agricultural advisor for a sugarcane farm in Maharashtra, India.
Current temperature: ${temp ?? 'unknown'}°C. Rainfall today: ${rainfall ?? 0} mm.
Zone data:
${summary}

Give exactly 4 short action points for the farmer today (max 15 words each).
Mention specific zone numbers. Plain text, one per line, no markdown.`

      const model = genAI.getGenerativeModel({ model: 'gemini-3.6-flash' })
      const result = await model.generateContent(prompt)
      setTips(result.response.text())
    } catch (e) {
      console.error(e)
      const bad = zones.filter(z => z.health === 'Problematic').map(z => z.id + 1)
      const mod = zones.filter(z => z.health === 'Moderate').map(z => z.id + 1)
      const lines = []
      if (bad.length) lines.push(`Inspect zones ${bad.join(', ')} today, crop health is poor.`)
      if (mod.length) lines.push(`Monitor zones ${mod.join(', ')}, health is only moderate.`)
      if ((rainfall ?? 0) < 1) lines.push('No rain today, check soil moisture and irrigate dry zones.')
      if (temp > 35) lines.push(`High temperature (${temp}°C), irrigate early morning or evening.`)
      setTips(lines.join('\n') || 'All zones look healthy. No action needed today.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (ready) getAdvice()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready])

  return (
    <div className="card" style={{ margin: '16px 0' }}>
      <div className="card-section-title">🤖 Today's Actions (AI Advisory)</div>
      {loading && <p>Analysing your farm zones...</p>}
      {error && <p style={{ color: 'var(--red)' }}>{error}</p>}
      {!loading && tips && (
        <ul style={{ paddingLeft: 18, lineHeight: 1.7 }}>
          {tips.split('\n').filter(t => t.trim()).map((t, i) => (
            <li key={i}>{t.replace(/^[-*\d.\s]+/, '')}</li>
          ))}
        </ul>
      )}
      <button className="btn" onClick={getAdvice} disabled={loading || !ready} style={{ marginTop: 8 }}>
        Refresh advice
      </button>
    </div>
  )
}