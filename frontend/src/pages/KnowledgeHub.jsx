import { useState, useRef, useEffect } from 'react'
import { Send, Mic, BookOpen, Users, Languages, ChevronDown, ChevronUp } from 'lucide-react'
import { GoogleGenerativeAI } from '@google/generative-ai'
import './KnowledgeHub.css'

const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

const LANGS = {
  en: 'English', hi: 'हिंदी',mr: 'मराठी'
}

const TRANSLATIONS = {
  greeting: {
    en: "Hello! I'm AgriAdvisor AI. Ask me anything about crops, pests, irrigation, or weather!",
    hi: "नमस्ते! मैं AgriAdvisor AI हूँ। फसल, कीट, सिंचाई, या मौसम के बारे में कुछ भी पूछें!",
    mr: "नमस्कार! मी AgriAdvisor AI आहे. पीक, कीड, सिंचन किंवा हवामानाबद्दल काहीही विचारा!",
  }
}

const quickResponses = {
  en: ['Weather for tomorrow?', 'Irrigation schedule?', 'Crop health check', 'Market prices', 'Pest control tips', 'Best fertilizer?'],
  hi: ['कल का मौसम?', 'सिंचाई कार्यक्रम?', 'फसल स्वास्थ्य जांच', 'बाजार भाव', 'कीट नियंत्रण', 'उर्वरक सलाह'],
  mr: ['उद्याचे हवामान?', 'सिंचन वेळापत्रक?', 'पीक आरोग्य तपास', 'बाजार भाव', 'कीड नियंत्रण', 'खत सल्ला'],
}

const aiResponses = [
  {
    en: `Based on recent GIS moisture data and your report, this looks like early stages of **Wheat Rust** in Block B-12. Recommended Action Plan:\n\n✅ Apply Tebuconazole fungicide at 0.1% concentration.\n✅ Adjust irrigation to morning hours to reduce night leaf-wetness.\n✅ Schedule field inspection within 48 hours.`,
    hi: `हाल के GIS मॉइस्चर डेटा के आधार पर, यह Block B-12 में **गेहूं के जंग** के प्रारंभिक लक्षण लगते हैं। अनुशंसित कार्य योजना:\n\n✅ Tebuconazole कवकनाशी 0.1% सांद्रता पर लगाएं।\n✅ पत्ती की नमी कम करने के लिए सुबह सिंचाई करें।\n✅ 48 घंटों के भीतर खेत का निरीक्षण करें।`
  },
]

const expertGuides = [
  { title: 'Preparing for Kharif Sowing: Soil Enrichment for Sugarcane', tag: 'SEASONAL GUIDE', author: 'Lead Agronomist', time: '2 days ago', emoji: '🌱' },
  { title: 'Managing Moisture Stress in Maharashtra Sugarcane Fields', tag: 'FIELD ADVISORY', author: 'Dr. Sanjay Verma', time: '5 days ago', emoji: '💧' },
  { title: 'MSP Update 2025: Sugarcane FRP & State SAP Prices', tag: 'GOVERNMENT ALERT', author: 'Ministry of Agriculture', time: '1 week ago', emoji: '📋' },
]

const forumPosts = [
  {
    title: 'Best fertilizer for sugarcane in Maharashtra?',
    tag: 'CROP MANAGEMENT',
    tagColor: 'rgba(45,122,58,0.15)',
    tagText: 'var(--green-accent)',
    replies: 16,
    users: ['A', 'B', 'C'],
    discussion: [
      { user: 'Ramesh P.', avatar: 'R', time: '2h ago', text: 'I use 12:32:16 NPK at planting, then urea top-dress at 45 and 90 days. Works well for Co-86032.' },
      { user: 'Suresh M.', avatar: 'S', time: '3h ago', text: 'Potassium sulphate at 50 kg/ha during grand growth phase really improved my yield last season.' },
      { user: 'Vijay K.', avatar: 'V', time: '5h ago', text: 'Don\'t forget micronutrients — zinc sulphate 25 kg/ha at tillering stage. Many farmers skip this.' },
    ]
  },
  {
    title: 'Shared tractor rental near Nashik – anyone interested?',
    tag: 'LOGISTICS',
    tagColor: 'rgba(59,130,246,0.1)',
    tagText: 'var(--blue)',
    replies: 12,
    users: ['D', 'E'],
    discussion: [
      { user: 'Anil D.', avatar: 'A', time: '1h ago', text: 'I have a Mahindra 575 available on weekends. Can share for ₹800/hour. Contact me.' },
      { user: 'Priya E.', avatar: 'P', time: '4h ago', text: 'Interested! I need it for intercultivation in my sugarcane field next Saturday.' },
    ]
  },
  {
    title: 'Red rot symptoms spotted in Zone 3 – help needed',
    tag: 'PEST ALERT',
    tagColor: 'rgba(239,68,68,0.1)',
    tagText: 'var(--red)',
    replies: 8,
    users: ['F', 'G', 'H'],
    discussion: [
      { user: 'Mohan F.', avatar: 'M', time: '30m ago', text: 'Seeing red discolouration with white patches inside the stalk. Classic red rot signs.' },
      { user: 'Dr. G. Patil', avatar: 'G', time: '1h ago', text: 'Remove and destroy infected stalks immediately. Apply Carbendazim 0.1% as drench. Do not use infected setts for next planting.' },
      { user: 'Harish H.', avatar: 'H', time: '2h ago', text: 'Same issue last year. Hot water treatment of setts at 50°C for 2 hours before planting prevents it.' },
    ]
  },
]

export default function KnowledgeHub({ user }) {
  const [lang, setLang] = useState('en')
  const [messages, setMessages] = useState([
    { role: 'ai', text: TRANSLATIONS.greeting[lang] || TRANSLATIONS.greeting.en }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [expandedForum, setExpandedForum] = useState(null)
  const chatEndRef = useRef(null)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    setMessages([{ role: 'ai', text: TRANSLATIONS.greeting[lang] || TRANSLATIONS.greeting.en }])
  }, [lang])

  const sendMessage = async (text) => {
    if (!text.trim()) return;
    setMessages(m => [...m, { role: 'user', text }]);
    setInput('');
    setLoading(true);
    
    try {
      if (!genAI) {
        throw new Error("API key is missing or not configured correctly.");
      }

      // Convert local state to Gemini history format, ignoring initial greetings as they don't matter much and can clutter context
      const historyItems = messages
        .filter(m => m.text !== TRANSLATIONS.greeting[lang] && m.text !== TRANSLATIONS.greeting.en)
        .map(m => ({
          role: m.role === 'ai' ? 'model' : 'user',
          parts: [{ text: m.text }],
        }));

      const model = genAI.getGenerativeModel({
        model: "gemini-3.6-flash", 
        systemInstruction: `You are AgriAdvisor, an expert AI agricultural advisor specifically tailored for farming in India. The current selected language is ${LANGS[lang] || 'English'}. Keep your answers relatively short, professional, and directly related to agriculture, crops, pests, irrigation, or weather. Format your text nicely using markdown formatting where appropriate.`
      });

      const chatSession = model.startChat({ history: historyItems });
      const result = await chatSession.sendMessage(text);
      const aiResponseText = result.response.text();

      setMessages(m => [...m, { role: 'ai', text: aiResponseText }]);
    } catch (error) {
      console.error(error);
      setMessages(m => [...m, { role: 'ai', text: `Sorry, I am facing a technical issue. (${error.message})` }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="kh-page fade-in">
      <div className="kh-header">
        <div>
          <h1 className="dash-title">🌾 Rural Knowledge Hub & AI Chatbot</h1>
          <p className="dash-sub">AgriAdvisor – Multilingual AI Expert • Specialized for Indian Farmers</p>
        </div>
        <div className="lang-selector">
          <Languages size={15} />
          {Object.entries(LANGS).map(([code, label]) => (
            <button key={code} className={`lang-pill ${lang === code ? 'active' : ''}`} onClick={() => setLang(code)}>{label}</button>
          ))}
        </div>
      </div>

      <div className="kh-main">
        {/* Chat */}
        <div className="kh-chat-col">
          <div className="kh-chat-header">
            <div className="chat-bot-info">
              <div className="chat-bot-avatar">🤖</div>
              <div>
                <div className="chat-bot-name">AgriAdvisor</div>
                <div className="chat-bot-status"><span className="dot dot-green pulse"></span> AI Expert Live • {LANGS[lang]}</div>
              </div>
            </div>
            <div className="badge badge-green">Field Unit 04-B</div>
          </div>

          <div className="chat-messages">
            {messages.map((m, i) => (
              <div key={i} className={`chat-msg ${m.role}`}>
                {m.role === 'ai' && <div className="msg-avatar ai-avatar">🤖</div>}
                <div className={`msg-bubble ${m.role}`}>
                  <div className="msg-text" dangerouslySetInnerHTML={{ __html: m.text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br/>') }} />
                  {m.role === 'ai' && <div className="msg-time">AgriAdvisor AI • {new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div>}
                </div>
                {m.role === 'user' && <div className="msg-avatar user-avatar">{user?.name?.[0] || 'A'}</div>}
              </div>
            ))}
            {loading && (
              <div className="chat-msg ai">
                <div className="msg-avatar ai-avatar">🤖</div>
                <div className="msg-bubble ai"><div className="typing-dots"><span/><span/><span/></div></div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Quick Replies */}
          <div className="quick-replies">
            {(quickResponses[lang] || quickResponses.en).map(q => (
              <button key={q} className="quick-reply-btn" onClick={() => sendMessage(q)}>{q}</button>
            ))}
          </div>

          {/* Input */}
          <div className="chat-input-row">
            <input
              className="input chat-input"
              placeholder={lang === 'hi' ? 'अपने डिजिटल कृषि विशेषज्ञ से पूछें...' : lang === 'pa' ? 'ਆਪਣੇ ਡਿਜੀਟਲ ਕਿਸਾਨ ਮਾਹਿਰ ਨੂੰ ਪੁੱਛੋ...' : 'Ask your Digital Agronomist...'}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendMessage(input)}
            />
            <button className="btn-outline icon-btn" title="Voice Input"><Mic size={16} /></button>
            <button className="btn-primary icon-btn" onClick={() => sendMessage(input)}><Send size={16} /></button>
          </div>
        </div>

        {/* Right Panel */}
        <div className="kh-right-col">

          {/* Farmer Forum — expandable */}
          <div className="card" style={{ marginTop: 14 }}>
            <div className="kh-forum-header">
              <div className="card-section-title" style={{ margin: 0 }}><Users size={13} /> Farmer Forum</div>
              <button className="btn-ghost" style={{ fontSize: 11 }}>View All</button>
            </div>
            <div className="forum-posts">
              {forumPosts.map((p, i) => {
                const isOpen = expandedForum === i
                return (
                  <div key={i} className={`forum-post ${isOpen ? 'forum-post-open' : ''}`}>
                    {/* Header row — always visible, click to toggle */}
                    <div className="forum-post-header" onClick={() => setExpandedForum(isOpen ? null : i)}>
                      <div>
                        <div className="forum-tag" style={{ background: p.tagColor, color: p.tagText }}>{p.tag}</div>
                        <div className="forum-title">{p.title}</div>
                        <div className="forum-meta">
                          <div className="forum-users">{p.users.map(u => <div key={u} className="forum-user-dot">{u}</div>)}</div>
                          <div className="forum-replies">💬 {p.replies} replies</div>
                        </div>
                      </div>
                      <div className="forum-chevron">
                        {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </div>
                    </div>

                    {/* Expandable discussion */}
                    <div className={`forum-discussion ${isOpen ? 'open' : ''}`}>
                      <div className="forum-discussion-inner">
                        {p.discussion.map((d, j) => (
                          <div key={j} className="forum-comment">
                            <div className="forum-comment-avatar">{d.avatar}</div>
                            <div className="forum-comment-body">
                              <div className="forum-comment-meta">
                                <span className="forum-comment-user">{d.user}</span>
                                <span className="forum-comment-time">{d.time}</span>
                              </div>
                              <div className="forum-comment-text">{d.text}</div>
                            </div>
                          </div>
                        ))}
                        <div className="forum-reply-input">
                          <input className="input" style={{ fontSize: 11, padding: '6px 10px' }} placeholder="Add a reply..." />
                          <button className="btn-primary" style={{ fontSize: 11, padding: '6px 12px' }}>Reply</button>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Quick Actions */}
          
          </div>
        </div>
      </div>
    
  )
}
