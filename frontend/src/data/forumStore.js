// forumStore.js
// -----------------------------------------------------------------------------
// DEMO DATA LAYER — backed by localStorage so the forum works with zero backend.
//
// IMPORTANT FOR THE HANDOFF: every exported function here is written to look
// exactly like a real API call would (same inputs, same shape of output).
// When the real backend/DB is ready, only the *inside* of these functions
// needs to change to `fetch('/forum/...')` calls — no component using this
// file needs to change. Treat this file as the "contract" for the DB schema.
// -----------------------------------------------------------------------------

const POSTS_KEY = 'agrovista_forum_posts'
const CATEGORIES_KEY = 'agrovista_forum_categories'

const DEFAULT_CATEGORIES = [
  { id: 'crop-farming', name: 'Crop & Farming', description: 'General cultivation, sowing, harvesting' },
  { id: 'pest-disease', name: 'Pest & Disease', description: 'Identification and treatment' },
  { id: 'irrigation', name: 'Irrigation', description: 'Water scheduling, drip/sprinkler setups' },
  { id: 'fertilizers-soil', name: 'Fertilizers & Soil', description: 'Nutrients, soil health, testing' },
  { id: 'govt-schemes', name: 'Government Schemes', description: 'Subsidies, MSP, insurance' },
  { id: 'market-prices', name: 'Market & Prices', description: 'Mandi rates, selling advice' },
  { id: 'equipment', name: 'Equipment', description: 'Tools, machinery, maintenance' },
  { id: 'general', name: 'General Discussion', description: 'Everything else' },
]

const SEED_POSTS = [
  {
    id: 'p1',
    title: 'Yellowing leaves on sugarcane after last week\'s rain — normal?',
    content: 'Noticed the lower leaves on about a third of my sugarcane plot turning yellow after heavy rain. Soil is draining okay as far as I can tell. Anyone seen this before? Wondering if it is nitrogen leaching or something more serious like yellow leaf disease.',
    categoryId: 'pest-disease',
    tags: ['sugarcane', 'yellowing', 'rain'],
    authorName: 'Arjun Sharma',
    createdAt: daysAgo(2),
    likes: ['Priya Patel', 'Ravi Kumar'],
    comments: [
      { id: 'c1', authorName: 'Dr. Sanjay Verma', content: 'Could be nitrogen leaching from the rain. Get a quick soil test before assuming disease — yellow leaf disease usually shows a distinct midrib pattern.', parentId: null, createdAt: daysAgo(2) },
      { id: 'c2', authorName: 'Arjun Sharma', content: 'Good call, will get it tested this week.', parentId: 'c1', createdAt: daysAgo(1) },
    ],
    reports: [],
  },
  {
    id: 'p2',
    title: 'Best drip irrigation spacing for wheat in black cotton soil?',
    content: 'Switching from flood to drip this season. Black cotton soil holds moisture well but cracks badly in dry spells. What lateral spacing has worked for others in similar soil?',
    categoryId: 'irrigation',
    tags: ['drip-irrigation', 'wheat', 'black-soil'],
    authorName: 'Priya Patel',
    createdAt: daysAgo(4),
    likes: ['Arjun Sharma'],
    comments: [
      { id: 'c3', authorName: 'Ravi Kumar', content: '45cm lateral spacing worked for me on similar soil, with emitters every 30cm.', parentId: null, createdAt: daysAgo(3) },
    ],
    reports: [],
  },
  {
    id: 'p3',
    title: 'PM-KISAN installment delayed — anyone else facing this?',
    content: 'My last installment hasn\'t come through despite eKYC being done in March. Checked the status page and it just says "pending". Any leads on who to contact locally?',
    categoryId: 'govt-schemes',
    tags: ['pm-kisan', 'subsidy'],
    authorName: 'Ravi Kumar',
    createdAt: daysAgo(1),
    likes: [],
    comments: [],
    reports: [],
  },
  {
    id: 'p4',
    title: 'Mandi prices for onion crashing this week — sell now or hold?',
    content: 'Lasalgaon rates dropped almost 18% in four days. I have about 40 quintals ready. Curious what others are doing — holding for a rebound or offloading now.',
    categoryId: 'market-prices',
    tags: ['onion', 'mandi', 'pricing'],
    authorName: 'Meera Joshi',
    createdAt: hoursAgo(6),
    likes: ['Arjun Sharma', 'Priya Patel', 'Ravi Kumar'],
    comments: [
      { id: 'c4', authorName: 'Priya Patel', content: 'Holding for a week if storage allows — this dip usually corrects after the festival demand kicks in.', parentId: null, createdAt: hoursAgo(4) },
    ],
    reports: [],
  },
]

function daysAgo(n) { return new Date(Date.now() - n * 86400000).toISOString() }
function hoursAgo(n) { return new Date(Date.now() - n * 3600000).toISOString() }

function readPosts() {
  const raw = localStorage.getItem(POSTS_KEY)
  if (!raw) {
    localStorage.setItem(POSTS_KEY, JSON.stringify(SEED_POSTS))
    return [...SEED_POSTS]
  }
  try { return JSON.parse(raw) } catch { return [] }
}

function writePosts(posts) {
  localStorage.setItem(POSTS_KEY, JSON.stringify(posts))
}

function readCategories() {
  const raw = localStorage.getItem(CATEGORIES_KEY)
  if (!raw) {
    localStorage.setItem(CATEGORIES_KEY, JSON.stringify(DEFAULT_CATEGORIES))
    return [...DEFAULT_CATEGORIES]
  }
  try { return JSON.parse(raw) } catch { return DEFAULT_CATEGORIES }
}

// ---- Public API (this shape = the eventual REST contract) -----------------

export function getCategories() {
  return readCategories()
}

export function getPosts({ categoryId, search, sort = 'latest' } = {}) {
  let posts = readPosts()

  if (categoryId) posts = posts.filter(p => p.categoryId === categoryId)

  if (search && search.trim()) {
    const q = search.trim().toLowerCase()
    posts = posts.filter(p =>
      p.title.toLowerCase().includes(q) ||
      p.content.toLowerCase().includes(q) ||
      p.tags.some(t => t.toLowerCase().includes(q))
    )
  }

  if (sort === 'latest') posts = posts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  if (sort === 'popular') posts = posts.sort((a, b) => (b.likes.length + b.comments.length) - (a.likes.length + a.comments.length))
  if (sort === 'most-commented') posts = posts.sort((a, b) => b.comments.length - a.comments.length)

  return posts
}

export function getPostById(id) {
  return readPosts().find(p => p.id === id) || null
}

export function createPost({ title, content, categoryId, tags, authorName }) {
  if (!title?.trim() || !content?.trim() || !categoryId) {
    throw new Error('Title, content, and category are required')
  }
  const posts = readPosts()
  const newPost = {
    id: 'p' + Date.now(),
    title: title.trim().slice(0, 150),
    content: content.trim().slice(0, 5000),
    categoryId,
    tags: (tags || []).map(t => t.trim()).filter(Boolean).slice(0, 6),
    authorName,
    createdAt: new Date().toISOString(),
    likes: [],
    comments: [],
    reports: [],
  }
  posts.unshift(newPost)
  writePosts(posts)
  return newPost
}

export function addComment(postId, { content, authorName, parentId = null }) {
  if (!content?.trim()) throw new Error('Comment cannot be empty')
  const posts = readPosts()
  const post = posts.find(p => p.id === postId)
  if (!post) throw new Error('Post not found')
  const comment = {
    id: 'c' + Date.now(),
    authorName,
    content: content.trim().slice(0, 1000),
    parentId,
    createdAt: new Date().toISOString(),
  }
  post.comments.push(comment)
  writePosts(posts)
  return comment
}

export function toggleLike(postId, userName) {
  const posts = readPosts()
  const post = posts.find(p => p.id === postId)
  if (!post) return null
  const idx = post.likes.indexOf(userName)
  if (idx === -1) post.likes.push(userName)
  else post.likes.splice(idx, 1)
  writePosts(posts)
  return post.likes
}

export function reportItem(postId, { type, targetId, reason, reportedBy }) {
  const posts = readPosts()
  const post = posts.find(p => p.id === postId)
  if (!post) return null
  post.reports.push({ id: 'r' + Date.now(), type, targetId, reason, reportedBy, status: 'pending', createdAt: new Date().toISOString() })
  writePosts(posts)
  return post.reports
}

export function deletePost(postId) {
  const posts = readPosts().filter(p => p.id !== postId)
  writePosts(posts)
}

export function getUserActivity(userName) {
  const posts = readPosts()
  const myPosts = posts.filter(p => p.authorName === userName)
  const myComments = posts.flatMap(p => p.comments.filter(c => c.authorName === userName).map(c => ({ ...c, postId: p.id, postTitle: p.title })))
  return {
    postCount: myPosts.length,
    commentCount: myComments.length,
    posts: myPosts,
    comments: myComments,
  }
}

export function getAllReports() {
  const posts = readPosts()
  return posts.flatMap(p => p.reports.map(r => ({ ...r, postId: p.id, postTitle: p.title })))
}
