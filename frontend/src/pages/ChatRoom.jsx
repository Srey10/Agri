import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { getChatMessages, sendChatMessage } from '../data/api'

function timeLabel(iso) {
  return new Date(iso + 'Z').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function ChatRoom({ user }) {
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const lastId = useRef(0)
  const listRef = useRef(null)

  const load = async () => {
    try {
      const fresh = await getChatMessages(lastId.current)
      if (fresh.length) {
        lastId.current = Math.max(lastId.current, fresh[fresh.length - 1].id)
        setMessages(prev => {
          const seen = new Set(prev.map(m => m.id))
          return [...prev, ...fresh.filter(m => !seen.has(m.id))]
        })
      }
      setError('')
    } catch {
      setError('Cannot reach the chat server. Is forum_api.py running?')
    }
  }

  useEffect(() => {
    load()
    const timer = setInterval(load, 4000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages])

  const send = async (e) => {
    e.preventDefault()
    const content = text.trim()
    if (!content) return
    setText('')
    try {
      await sendChatMessage(content)
      await load()
    } catch (err) {
      setError(err.message)
      setText(content)
    }
  }

  const border = '1px solid rgba(128,128,128,0.3)'

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: 16 }}>
      <Link to="/forum" style={{ textDecoration: 'none' }}>← Back to Forum</Link>
      <h1 style={{ margin: '8px 0 4px' }}>💬 Quick Chat</h1>
      <p style={{ opacity: 0.7, marginTop: 0 }}>Talk with other farmers, no need to start a discussion.</p>

      {error && <p style={{ color: 'var(--red)' }}>{error}</p>}

      <div ref={listRef} style={{ height: '55vh', overflowY: 'auto', border, borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {messages.length === 0 && <p style={{ opacity: 0.6 }}>No messages yet. Say hello!</p>}
        {messages.map(m => {
          const mine = m.authorId === user?.id
          return (
            <div key={m.id} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '75%', background: mine ? 'rgba(46,125,50,0.2)' : 'rgba(128,128,128,0.15)', borderRadius: 10, padding: '6px 10px' }}>
              {!mine && <div style={{ fontSize: 12, fontWeight: 600 }}>{m.authorName}</div>}
              <div style={{ wordBreak: 'break-word' }}>{m.content}</div>
              <div style={{ fontSize: 11, opacity: 0.6, textAlign: 'right' }}>{timeLabel(m.createdAt)}</div>
            </div>
          )
        })}
      </div>

      <form onSubmit={send} style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          maxLength={500}
          placeholder="Type a message..."
          style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border }}
        />
        <button type="submit" className="btn-primary" disabled={!text.trim()}>Send</button>
      </form>
    </div>
  )
}