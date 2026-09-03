import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, ThumbsUp, Flag, Send, CornerDownRight, Tag } from 'lucide-react'
import { getPostById, getCategories, addComment, toggleLike, reportItem } from '../data/api'
import './Forum.css'

function formatDate(iso) {
  return new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function ForumPost({ user }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [post, setPost] = useState(null)
  const [categories, setCategories] = useState([])
  const [notFound, setNotFound] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [replyTo, setReplyTo] = useState(null)
  const [reportBanner, setReportBanner] = useState('')

  const load = () => {
    getPostById(id).then(setPost).catch(() => setNotFound(true))
  }

  useEffect(load, [id])
  useEffect(() => { getCategories().then(setCategories).catch(() => {}) }, [])

  if (notFound) { navigate('/forum'); return null }
  if (!post) return <div className="forum-page">Loading discussion...</div>

  const categoryName = categories.find(c => c.id === post.categoryId)?.name || post.categoryId

  const handleLike = () => {
    toggleLike(post.id).then(load).catch(() => {})
  }

  const handleComment = (e) => {
    e.preventDefault()
    if (!commentText.trim()) return
    addComment(post.id, { content: commentText, parentId: replyTo })
      .then(() => { setCommentText(''); setReplyTo(null); load() })
      .catch(() => {})
  }

  const handleReport = (type, targetId) => {
    reportItem(post.id, { type, targetId, reason: 'Flagged by user' })
      .then(() => { setReportBanner('Thanks — this has been reported to moderators.'); setTimeout(() => setReportBanner(''), 3000) })
      .catch(() => setReportBanner('Please log in to report content.'))
  }

  const topLevelComments = post.comments.filter(c => !c.parentId)
  const repliesTo = (commentId) => post.comments.filter(c => c.parentId === commentId)

  return (
    <div className="forum-page">
      <Link to="/forum" className="back-link"><ArrowLeft size={16} /> Back to Forum</Link>

      {reportBanner && <div className="report-banner">{reportBanner}</div>}

      <div className="post-detail">
        <div className="post-detail-top">
          <span className="post-category">{categoryName}</span>
          <span className="post-time">{formatDate(post.createdAt)}</span>
        </div>
        <h1>{post.title}</h1>
        <div className="post-author-row">by <strong>{post.authorName}</strong></div>
        <p className="post-detail-content">{post.content}</p>
        <div className="post-tags">
          {post.tags.map(t => <span key={t} className="post-tag"><Tag size={11} />{t}</span>)}
        </div>

        <div className="post-actions">
          <button className="action-btn" onClick={handleLike}>
            <ThumbsUp size={16} /> Like ({post.likes.length})
          </button>
          <button className="action-btn" onClick={() => handleReport('post', post.id)}>
            <Flag size={16} /> Report
          </button>
        </div>
      </div>

      <div className="comments-section">
        <h3>{post.comments.length} Comments</h3>

        <form onSubmit={handleComment} className="comment-form">
          {replyTo && (
            <div className="replying-note">
              Replying to a comment <button type="button" onClick={() => setReplyTo(null)}>cancel</button>
            </div>
          )}
          <textarea
            value={commentText}
            onChange={e => setCommentText(e.target.value)}
            placeholder="Add a comment..."
            rows={2}
          />
          <button type="submit" className="btn-primary"><Send size={14} /> Post</button>
        </form>

        <div className="comment-list">
          {topLevelComments.map(c => (
            <div key={c.id} className="comment-block">
              <Comment comment={c} onReply={() => setReplyTo(c.id)} onReport={() => handleReport('comment', c.id)} />
              {repliesTo(c.id).map(r => (
                <div key={r.id} className="comment-reply">
                  <CornerDownRight size={14} className="reply-icon" />
                  <Comment comment={r} onReport={() => handleReport('comment', r.id)} />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Comment({ comment, onReply, onReport }) {
  return (
    <div className="comment">
      <div className="comment-top">
        <strong>{comment.authorName}</strong>
        <span className="post-time">{formatDate(comment.createdAt)}</span>
      </div>
      <p>{comment.content}</p>
      <div className="comment-actions">
        {onReply && <button onClick={onReply}>Reply</button>}
        <button onClick={onReport}>Report</button>
      </div>
    </div>
  )
}
