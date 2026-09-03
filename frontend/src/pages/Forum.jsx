import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Search, Plus, MessageSquare, ThumbsUp, X, Tag } from 'lucide-react'
import { getCategories, getPosts, createPost } from '../data/api'
import './Forum.css'

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins || 1}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

export default function Forum({ user }) {
  const [categories, setCategories] = useState([])
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')
  const [categoryId, setCategoryId] = useState(null)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('latest')
  const [showCreate, setShowCreate] = useState(false)

  useEffect(() => {
    getCategories().then(setCategories).catch(() => {})
  }, [])

  const loadPosts = () => {
    setLoading(true)
    setErrorMsg('')
    getPosts({ categoryId, search, sort })
      .then(setPosts)
      .catch(() => setErrorMsg('Could not reach the forum server. Is forum_api.py running on port 5001?'))
      .finally(() => setLoading(false))
  }

  useEffect(loadPosts, [categoryId, search, sort])

  const categoryName = (id) => categories.find(c => c.id === id)?.name || id

  return (
    <div className="forum-page">
      <div className="forum-header">
        <div>
          <h1>Community Forum</h1>
          <p className="forum-subtitle">Ask questions, share what's working in your fields, learn from other farmers.</p>
        </div>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>
          <Plus size={16} /> New Discussion
        </button>
      </div>

      <div className="forum-toolbar">
        <div className="forum-search">
          <Search size={16} />
          <input
            placeholder="Search discussions, tags..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select className="forum-sort" value={sort} onChange={e => setSort(e.target.value)}>
          <option value="latest">Latest</option>
          <option value="popular">Most popular</option>
          <option value="most-commented">Most commented</option>
        </select>
      </div>

      {errorMsg && <div className="forum-empty">{errorMsg}</div>}

      <div className="forum-body">
        <aside className="forum-categories">
          <button className={`cat-pill ${!categoryId ? 'active' : ''}`} onClick={() => setCategoryId(null)}>
            All Categories
          </button>
          {categories.map(c => (
            <button
              key={c.id}
              className={`cat-pill ${categoryId === c.id ? 'active' : ''}`}
              onClick={() => setCategoryId(c.id)}
              title={c.description}
            >
              {c.name}
            </button>
          ))}
        </aside>

        <div className="forum-posts">
          {!errorMsg && !loading && posts.length === 0 && (
            <div className="forum-empty">No discussions found. Be the first to start one.</div>
          )}
          {posts.map(post => (
            <Link to={`/forum/${post.id}`} key={post.id} className="post-card">
              <div className="post-card-top">
                <span className="post-category">{categoryName(post.categoryId)}</span>
                <span className="post-time">{timeAgo(post.createdAt)}</span>
              </div>
              <h3 className="post-title">{post.title}</h3>
              <p className="post-excerpt">{post.content.slice(0, 140)}{post.content.length > 140 ? '…' : ''}</p>
              <div className="post-tags">
                {post.tags.map(t => <span key={t} className="post-tag"><Tag size={11} />{t}</span>)}
              </div>
              <div className="post-card-bottom">
                <span className="post-author">by {post.authorName}</span>
                <span className="post-stat"><ThumbsUp size={14} /> {post.likeCount}</span>
                <span className="post-stat"><MessageSquare size={14} /> {post.commentCount}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {showCreate && (
        <CreatePostModal
          categories={categories}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); loadPosts() }}
        />
      )}
    </div>
  )
}

function CreatePostModal({ categories, onClose, onCreated }) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [categoryId, setCategoryId] = useState(categories[0]?.id || '')
  const [tagsInput, setTagsInput] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!title.trim() || !content.trim() || !categoryId) {
      setError('Title, content, and category are required.')
      return
    }
    setSubmitting(true)
    try {
      await createPost({
        title, content, categoryId,
        tags: tagsInput.split(',').map(t => t.trim()).filter(Boolean),
      })
      onCreated()
    } catch (err) {
      setError(err.message)
    }
    setSubmitting(false)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Start a Discussion</h2>
          <button className="modal-close" onClick={onClose}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="modal-form">
          {error && <div className="form-error">{error}</div>}
          <label>Title</label>
          <input value={title} onChange={e => setTitle(e.target.value)} maxLength={150} placeholder="e.g. Best pest control for early blight?" />

          <label>Category</label>
          <select value={categoryId} onChange={e => setCategoryId(e.target.value)}>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          <label>Description</label>
          <textarea value={content} onChange={e => setContent(e.target.value)} rows={5} maxLength={5000} placeholder="Share details, what you've tried, photos description, etc." />

          <label>Tags (comma separated)</label>
          <input value={tagsInput} onChange={e => setTagsInput(e.target.value)} placeholder="e.g. wheat, irrigation, soil-testing" />

          <div className="modal-actions">
            <button type="button" className="btn-outline" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={submitting}>{submitting ? 'Posting...' : 'Post Discussion'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
