import { useState, useRef, useEffect } from 'react'
import { Send, Mic, Camera, BookOpen, Users, Sun, Leaf, Languages } from 'lucide-react'
import { GoogleGenerativeAI } from '@google/generative-ai'
import './KnowledgeHub.css'

const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

const LANGS = {
  en: 'English', hi: 'हिंदी', pa: 'ਪੰਜਾਬੀ', mr: 'मराठी',
  ta: 'தமிழ்', te: 'తెలుగు', bn: 'বাংলা', gu: 'ગુજરાતી'
}

const TRANSLATIONS = {
  greeting: {
    en: "Hello! I'm AgriAdvisor AI. Ask me anything about crops, pests, irrigation, or weather!",
    hi: "नमस्ते! मैं AgriAdvisor AI हूँ। फसल, कीट, सिंचाई, या मौसम के बारे में कुछ भी पूछें!",
    pa: "ਸਤ ਸ੍ਰੀ ਅਕਾਲ! ਮੈਂ AgriAdvisor AI ਹਾਂ। ਫਸਲਾਂ, ਕੀੜੇ, ਸਿੰਚਾਈ ਜਾਂ ਮੌਸਮ ਬਾਰੇ ਕੁਝ ਵੀ ਪੁੱਛੋ!",
    mr: "नमस्कार! मी AgriAdvisor AI आहे. पीक, कीड, सिंचन किंवा हवामानाबद्दल काहीही विचारा!",
    ta: "வணக்கம்! நான் AgriAdvisor AI. பயிர், பூச்சி, நீர்ப்பாசனம் அல்லது வானிலை பற்றி கேளுங்கள்!",
    te: "నమస్కారం! నేను AgriAdvisor AI. పంటలు, చీడలు, నీటిపారుదల గురించి అడగండి!",
    bn: "নমস্কার! আমি AgriAdvisor AI। ফসল, কীটপতঙ্গ, সেচ বা আবহাওয়া সম্পর্কে জিজ্ঞাসা করুন!",
    gu: "નમસ્તે! હું AgriAdvisor AI છું. પાક, જીવાત, સિંચાઈ અથવા હવામાન વિશે કંઈ પણ પૂછો!"
  }
}

const quickResponses = {
  en: ['Weather for tomorrow?', 'Irrigation schedule?', 'Crop health check', 'Market prices', 'Pest control tips', 'Best fertilizer?'],
  hi: ['कल का मौसम?', 'सिंचाई कार्यक्रम?', 'फसल स्वास्थ्य जांच', 'बाजार भाव', 'कीट नियंत्रण', 'उर्वरक सलाह'],
  pa: ['ਕੱਲ੍ਹ ਦਾ ਮੌਸਮ?', 'ਸਿੰਚਾਈ ਸਮਾਂ-ਸਾਰਣੀ?', 'ਫਸਲ ਸਿਹਤ', 'ਮਾਰਕਿਟ ਭਾਅ', 'ਕੀੜੇ ਕੰਟਰੋਲ', 'ਖਾਦ ਸਲਾਹ'],
  mr: ['उद्याचे हवामान?', 'सिंचन वेळापत्रक?', 'पीक आरोग्य तपास', 'बाजार भाव', 'कीड नियंत्रण', 'खत सल्ला'],
  ta: ['நாளை வானிலை?', 'நீர்ப்பாசன அட்டவணை?', 'பயிர் சுகாதாரம்', 'சந்தை விலை', 'பூச்சி கட்டுப்பாடு', 'உர ஆலோசனை'],
  te: ['రేపటి వాతావరణం?', 'నీటిపారుదల షెడ్యూల్?', 'పంట ఆరోగ్యం', 'మార్కెట్ ధరలు', 'చీడ నియంత్రణ', 'ఎరువు సలహా'],
  bn: ['আগামীকালের আবহাওয়া?', 'সেচ সময়সূচী?', 'ফসল স্বাস্থ্য', 'বাজার মূল্য', 'কীটনাশক', 'সার পরামর্শ'],
  gu: ['કાલનું હવામાન?', 'સિંચાઈ સમયપત્રક?', 'પાક સ્વાસ્થ્ય', 'બજાર ભાવ', 'જંતુ નિયંત્રણ', 'ખાતર સલાહ'],
}

const aiResponses = [
  {
    en: `Based on recent GIS moisture data and your report, this looks like early stages of **Wheat Rust** in Block B-12. Recommended Action Plan:\n\n✅ Apply Tebuconazole fungicide at 0.1% concentration.\n✅ Adjust irrigation to morning hours to reduce night leaf-wetness.\n✅ Schedule field inspection within 48 hours.`,
    hi: `हाल के GIS मॉइस्चर डेटा के आधार पर, यह Block B-12 में **गेहूं के जंग** के प्रारंभिक लक्षण लगते हैं। अनुशंसित कार्य योजना:\n\n✅ Tebuconazole कवकनाशी 0.1% सांद्रता पर लगाएं।\n✅ पत्ती की नमी कम करने के लिए सुबह सिंचाई करें।\n✅ 48 घंटों के भीतर खेत का निरीक्षण करें।`
  },
]

const expertGuides = [
  { title: 'Preparing for Kharif Sowing: Soil Enrichment Steps', tag: 'SEASONAL GUIDE', author: 'Lead Agronomist', time: '2 days ago', emoji: '🌱' },
  { title: 'Managing Water Logging in Lower Punjab Fields', tag: 'FIELD ADVISORY', author: 'Dr. Sanjay Verma', time: '5 days ago', emoji: '💧' },
  { title: 'MSP Update 2025: Wheat & Paddy Prices', tag: 'GOVERNMENT ALERT', author: 'Ministry of Agriculture', time: '1 week ago', emoji: '📋' },
]

const forumPosts = [
  { title: 'Best fertilizer for monsoon wheat?', tag: 'CROP MANAGEMENT', replies: 16, users: ['A', 'B', 'C'] },
  { title: 'Shared tractor rental in South Field – anyone interested?', tag: 'LOGISTICS', replies: 12, users: ['D', 'E'] },
  { title: 'Pest spotted in Block C – white flies on cotton', tag: 'PEST ALERT', replies: 8, users: ['F', 'G', 'H'] },
]

export default function KnowledgeHub({ user }) {
  const [lang, setLang] = useState('en')
  const [messages, setMessages] = useState([
    { role: 'ai', text: TRANSLATIONS.greeting[lang] || TRANSLATIONS.greeting.en }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
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
        model: "gemini-2.5-flash", 
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
          {/* Expert Advisory */}
          <div className="card">
            <div className="card-section-title"><BookOpen size={13} /> Expert Advisory</div>
            <div className="expert-guides">
              {expertGuides.map((g, i) => (
                <div key={i} className="expert-guide card-hover" style={{ padding: 12, background: 'var(--bg-card2)', borderRadius: 8, cursor: 'pointer', marginBottom: 10, border: '1px solid var(--border)' }}>
                  <div className="guide-emoji">{g.emoji}</div>
                  <div className="badge badge-orange" style={{ fontSize: 9, marginTop: 6 }}>{g.tag}</div>
                  <div className="guide-title">{g.title}</div>
                  <div className="guide-meta">Updated {g.time} • {g.author}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Forum */}
          <div className="card" style={{ marginTop: 14 }}>
            <div className="kh-forum-header">
              <div className="card-section-title" style={{ margin: 0 }}><Users size={13} /> Farmer Forum</div>
              <button className="btn-ghost" style={{ fontSize: 11 }}>View All</button>
            </div>
            <div className="forum-posts">
              {forumPosts.map((p, i) => (
                <div key={i} className="forum-post">
                  <div className="forum-tag" style={{ background: i === 0 ? 'rgba(45,122,58,0.15)' : i === 2 ? 'rgba(239,68,68,0.1)' : 'rgba(59,130,246,0.1)', color: i === 0 ? 'var(--green-accent)' : i === 2 ? 'var(--red)' : 'var(--blue)' }}>{p.tag}</div>
                  <div className="forum-title">{p.title}</div>
                  <div className="forum-meta">
                    <div className="forum-users">{p.users.map(u => <div key={u} className="forum-user-dot">{u}</div>)}</div>
                    <div className="forum-replies">💬 {p.replies} replies</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="card" style={{ marginTop: 14 }}>
            <div className="card-section-title">Quick Actions</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[
                { icon: '☁️', label: 'Weather' }, { icon: '🔍', label: 'Scan Crop' },
                { icon: '💰', label: 'Mandi Price' }, { icon: '📞', label: 'Call Expert' },
              ].map(a => (
                <button key={a.label} className="quick-action-btn">
                  <span style={{ fontSize: 22 }}>{a.icon}</span>
                  <span>{a.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
