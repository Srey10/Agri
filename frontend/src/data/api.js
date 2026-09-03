// api.js — talks to the real Flask backend (forum_api.py) instead of localStorage.
const BASE_URL = 'http://127.0.0.1:5001'
const TOKEN_KEY = 'agrovista_token'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}
export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token)
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

async function request(path, { method = 'GET', body, auth = false } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (auth) {
    const token = getToken()
    if (token) headers['Authorization'] = `Bearer ${token}`
  }
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Request failed')
  return data
}

// ---- Auth --------------------------------------------------------------
export async function registerUser({ name, email, password }) {
  const data = await request('/auth/register', { method: 'POST', body: { name, email, password } })
  setToken(data.token)
  return data.user
}

export async function loginUser({ email, password }) {
  const data = await request('/auth/login', { method: 'POST', body: { email, password } })
  setToken(data.token)
  return data.user
}

export async function fetchCurrentUser() {
  if (!getToken()) return null
  try {
    return await request('/auth/me', { auth: true })
  } catch {
    clearToken()
    return null
  }
}

// ---- Forum ---------------------------------------------------------------
export function getCategories() {
  return request('/forum/categories')
}

export function getPosts({ categoryId, search, sort = 'latest' } = {}) {
  const params = new URLSearchParams()
  if (categoryId) params.set('categoryId', categoryId)
  if (search) params.set('search', search)
  if (sort) params.set('sort', sort)
  return request(`/forum/posts?${params.toString()}`)
}

export function getPostById(id) {
  return request(`/forum/posts/${id}`)
}

export function createPost({ title, content, categoryId, tags }) {
  return request('/forum/posts', { method: 'POST', auth: true, body: { title, content, categoryId, tags } })
}

export function addComment(postId, { content, parentId = null }) {
  return request(`/forum/posts/${postId}/comments`, { method: 'POST', auth: true, body: { content, parentId } })
}

export function toggleLike(postId) {
  return request(`/forum/posts/${postId}/like`, { method: 'POST', auth: true })
}

export function reportItem(postId, { type, targetId, reason }) {
  return request(`/forum/posts/${postId}/report`, { method: 'POST', auth: true, body: { type, targetId, reason } })
}
