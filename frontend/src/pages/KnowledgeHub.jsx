import { useState, useRef, useEffect } from 'react'
import { Send, Mic, Languages } from 'lucide-react'
import { GoogleGenerativeAI } from '@google/generative-ai'
import './KnowledgeHub.css'

const apiKey = import.meta.env.VITE_GEMINI_API_KEY
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null

const LANGS = {
  en: 'English',
  hi: 'हिंदी',
  mr: 'मराठी'
}

const TRANSLATIONS = {
  greeting: {
    en: "Hello! I'm AgriAdvisor AI. Ask me anything about crops, pests, irrigation, or weather!",
    hi: "नमस्ते! मैं AgriAdvisor AI हूँ। फसल, कीट, सिंचाई, या मौसम के बारे में कुछ भी पूछें!",
    mr: "नमस्कार! मी AgriAdvisor AI आहे. पीक, कीड, सिंचन किंवा हवामानाबद्दल काहीही विचारा!"
  }
}

const quickResponses = {
  en: [
    'Weather for tomorrow?',
    'Irrigation schedule?',
    'Crop health check',
    'Market prices',
    'Pest control tips',
    'Best fertilizer?'
  ],

  hi: [
    'कल का मौसम?',
    'सिंचाई कार्यक्रम?',
    'फसल स्वास्थ्य जांच',
    'बाजार भाव',
    'कीट नियंत्रण',
    'उर्वरक सलाह'
  ],

  mr: [
    'उद्याचे हवामान?',
    'सिंचन वेळापत्रक?',
    'पीक आरोग्य तपास',
    'कीड नियंत्रण',
    'बाजार भाव?',
    'चांगले खत कोणते?'
  ]
}

export default function KnowledgeHub({ user }) {
  const [lang, setLang] = useState('en')

  const [messages, setMessages] = useState([
    {
      role: 'ai',
      text: TRANSLATIONS.greeting.en
    }
  ])

  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  const chatEndRef = useRef(null)

  // Scroll to latest message
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({
      behavior: 'smooth'
    })
  }, [messages])

  // Change greeting when language changes
  useEffect(() => {
    setMessages([
      {
        role: 'ai',
        text:
          TRANSLATIONS.greeting[lang] ||
          TRANSLATIONS.greeting.en
      }
    ])
  }, [lang])

  // Send message to Gemini
  const sendMessage = async (text) => {
    if (!text.trim() || loading) return

    setMessages((m) => [
      ...m,
      {
        role: 'user',
        text
      }
    ])

    setInput('')
    setLoading(true)

    try {
      if (!genAI) {
        throw new Error(
          'API key is missing or not configured correctly.'
        )
      }

      // Convert local messages to Gemini history format
      const historyItems = messages
        .filter(
          (m) =>
            m.text !== TRANSLATIONS.greeting[lang] &&
            m.text !== TRANSLATIONS.greeting.en
        )
        .map((m) => ({
          role: m.role === 'ai' ? 'model' : 'user',
          parts: [
            {
              text: m.text
            }
          ]
        }))

      const model = genAI.getGenerativeModel({
        model: 'gemini-3.6-flash',

        systemInstruction: `
You are AgriAdvisor, an expert AI agricultural advisor
specifically tailored for farming in India.

The current selected language is ${
          LANGS[lang] || 'English'
        }.

Keep your answers relatively short, professional,
and directly related to agriculture, crops, pests,
irrigation, soil, farming, or weather.

Give practical and easy-to-understand advice for Indian farmers.

Format your answers nicely using markdown formatting
where appropriate.

Always respond in the selected language.
        `
      })

      const chatSession = model.startChat({
        history: historyItems
      })

      const result = await chatSession.sendMessage(text)

      const aiResponseText = result.response.text()

      setMessages((m) => [
        ...m,
        {
          role: 'ai',
          text: aiResponseText
        }
      ])
    } catch (error) {
      console.error(error)

      setMessages((m) => [
        ...m,
        {
          role: 'ai',
          text: `Sorry, I am facing a technical issue. (${error.message})`
        }
      ])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="kh-page fade-in">

      {/* ================= HEADER ================= */}

      <div className="kh-header">

        <div>
          <h1 className="dash-title">
            🌾 Rural Knowledge Hub & AI Chatbot
          </h1>

          <p className="dash-sub">
            AgriAdvisor – Multilingual AI Expert • Specialized for Indian Farmers
          </p>
        </div>

        {/* Language Selector */}
        <div className="lang-selector">

          <Languages size={15} />

          {Object.entries(LANGS).map(
            ([code, label]) => (
              <button
                key={code}
                className={`lang-pill ${
                  lang === code ? 'active' : ''
                }`}
                onClick={() => setLang(code)}
              >
                {label}
              </button>
            )
          )}

        </div>

      </div>


      {/* ================= MAIN ================= */}

      <div className="kh-main">

        {/* ================= CHAT ================= */}

        <div className="kh-chat-col">

          {/* Chat Header */}
          <div className="kh-chat-header">

            <div className="chat-bot-info">

              <div className="chat-bot-avatar">
                🤖
              </div>

              <div>

                <div className="chat-bot-name">
                  AgriAdvisor
                </div>

                <div className="chat-bot-status">

                  <span className="dot dot-green pulse"></span>

                  AI Expert Live • {LANGS[lang]}

                </div>

              </div>

            </div>

            <div className="badge badge-green">
              Field Unit 04-B
            </div>

          </div>


          {/* ================= MESSAGES ================= */}

          <div className="chat-messages">

            {messages.map((m, i) => (

              <div
                key={i}
                className={`chat-msg ${m.role}`}
              >

                {/* AI Avatar */}
                {m.role === 'ai' && (
                  <div className="msg-avatar ai-avatar">
                    🤖
                  </div>
                )}

                {/* Message Bubble */}
                <div
                  className={`msg-bubble ${m.role}`}
                >

                  <div
                    className="msg-text"
                    dangerouslySetInnerHTML={{
                      __html: m.text
                        .replace(
                          /\*\*(.*?)\*\*/g,
                          '<strong>$1</strong>'
                        )
                        .replace(
                          /\n/g,
                          '<br/>'
                        )
                    }}
                  />

                  {/* AI Timestamp */}
                  {m.role === 'ai' && (
                    <div className="msg-time">

                      AgriAdvisor AI •{' '}

                      {new Date().toLocaleTimeString(
                        'en-IN',
                        {
                          hour: '2-digit',
                          minute: '2-digit'
                        }
                      )}

                    </div>
                  )}

                </div>

                {/* User Avatar */}
                {m.role === 'user' && (
                  <div className="msg-avatar user-avatar">
                    {user?.name?.[0] || 'A'}
                  </div>
                )}

              </div>

            ))}


            {/* ================= TYPING INDICATOR ================= */}

            {loading && (

              <div className="chat-msg ai">

                <div className="msg-avatar ai-avatar">
                  🤖
                </div>

                <div className="msg-bubble ai">

                  <div className="typing-dots">
                    <span />
                    <span />
                    <span />
                  </div>

                </div>

              </div>

            )}

            <div ref={chatEndRef} />

          </div>


          {/* ================= QUICK REPLIES ================= */}

          <div className="quick-replies">

            {(quickResponses[lang] ||
              quickResponses.en
            ).map((q) => (

              <button
                key={q}
                className="quick-reply-btn"
                onClick={() => sendMessage(q)}
                disabled={loading}
              >
                {q}
              </button>

            ))}

          </div>


          {/* ================= INPUT ================= */}

          <div className="chat-input-row">

            <input
              className="input chat-input"

              placeholder={
                lang === 'hi'
                  ? 'अपने डिजिटल कृषि विशेषज्ञ से पूछें...'
                  : lang === 'mr'
                    ? 'आपल्या डिजिटल कृषी तज्ज्ञाला विचारा...'
                    : 'Ask your Digital Agronomist...'
              }

              value={input}

              onChange={(e) =>
                setInput(e.target.value)
              }

              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  sendMessage(input)
                }
              }}

              disabled={loading}
            />

            {/* Voice Button */}
            <button
              className="btn-outline icon-btn"
              title="Voice Input"
              type="button"
            >
              <Mic size={16} />
            </button>

            {/* Send Button */}
            <button
              className="btn-primary icon-btn"
              onClick={() => sendMessage(input)}
              disabled={loading}
              type="button"
            >
              <Send size={16} />
            </button>

          </div>

        </div>


        {/* ================= RIGHT PANEL ================= */}

        <div className="kh-right-col">
          {/* Empty for now */}
        </div>

      </div>

    </div>
  )
}