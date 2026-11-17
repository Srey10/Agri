// api.js — talks to the real Flask backend (forum_api.py) instead of localStorage.
// Override with VITE_API_URL / VITE_ML_API_URL (frontend/.env.local) to use a hosted backend.
const BASE_URL = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:5001').replace(/\/+$/, '')
export const ML_API_URL = (import.meta.env.VITE_ML_API_URL || 'http://127.0.0.1:5000').replace(/\/+$/, '')
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
  let res
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    // network failure (backend not running / blocked): say so instead of the browser's "Failed to fetch"
    const err = new Error(`Cannot reach the AgriSense server at ${BASE_URL}. Is the backend running?`)
    err.network = true
    throw err
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.error || data.msg || 'Request failed')
    err.status = res.status
    throw err
  }
  return data
}

// ---- Auth --------------------------------------------------------------
export async function registerUser({ name, email, password, ...profile }) {
  const data = await request('/auth/register', { method: 'POST', body: { name, email, password, ...profile } })
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
  } catch (err) {
    // Only an auth rejection logs the user out. A server outage keeps the saved token.
    if (!err.network && [401, 404, 422].includes(err.status)) clearToken()
    return null
  }
}

export function fetchFarmerProfile() {
  return request('/farmer/profile', { auth: true })
}

// Partial update: only the keys you pass change. Resolves to { name, profile, user }.
export function updateProfile(changes) {
  return request('/farmer/profile', { method: 'PUT', auth: true, body: changes })
}

// Fields (plots). Both resolve to { field, user }; `user` carries the refreshed fields list.
export function createField({ name, boundary }) {
  return request('/farmer/fields', { method: 'POST', auth: true, body: { name, boundary } })
}

export function updateField(id, changes) {
  return request(`/farmer/fields/${id}`, { method: 'PUT', auth: true, body: changes })
}

export function fetchFarmBoundary() {
  return request('/farmer/farm-boundary', { auth: true })
}

// boundary: GeoJSON Polygon. Resolves to { boundary, areaHectares, user } where user has mappingComplete.
export function saveFarmBoundary(boundary) {
  return request('/farmer/farm-boundary', { method: 'PUT', auth: true, body: { boundary } })
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

// ---- Quick Chat ----------------------------------------------------------
export function getChatMessages(after = 0) {
  return request(`/chat/messages?after=${after}`, { auth: true })
}
export function sendChatMessage(content) {
  return request('/chat/messages', { method: 'POST', auth: true, body: { content } })
}