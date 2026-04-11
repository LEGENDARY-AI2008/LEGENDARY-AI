require("dotenv").config()

const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason
} = require("@whiskeysockets/baileys")

const pino = require("pino")
const axios = require("axios")
const qrcode = require("qrcode-terminal")

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY

// ✍️ SIGNATURE (FIRST MESSAGE ONLY)
const SIGNATURE =
  "\n\n🤖 This AI Was Created By Praise Ayantunde\n🎓 A Student Of Federal University Of Technology, Akure"

// 🧠 TRACK USERS
const greetedUsers = new Set()

// ⏰ REAL NIGERIA TIME
const getTime = () =>
  new Date().toLocaleString("en-NG", { timeZone: "Africa/Lagos" })

// 🌐 SIMPLE WEB SEARCH (for latest info)
const searchWeb = async (query) => {
  try {
    const res = await axios.get(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json`
    )

    return (
      res.data.AbstractText ||
      res.data.Answer ||
      "No recent information found online."
    )
  } catch (err) {
    return "Web search failed."
  }
}

// ⚠️ ERROR HANDLING
process.on("uncaughtException", (err) => {
  console.log("⚠️ Error:", err.message)
})

process.on("unhandledRejection", (err) => {
  console.log("⚠️ Rejection:", err.message)
})

async function startBot() {
  console.log("🚀 LEGENDARY AI STARTED")

  const { state, saveCreds } = await useMultiFileAuthState("auth_info")
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: "silent" }),
    browser: ["Legendary AI", "Chrome", "1.0"]
  })

  console.log("🔄 Connecting...")

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update

    console.log("📶 connection =", connection)

    if (qr) {
      console.log("📱 Scan QR:")
      qrcode.generate(qr, { small: true })
    }

    if (connection === "open") {
      console.log("✅ WhatsApp Connected")
    }

    if (connection === "close") {
      const code =
        lastDisconnect?.error?.output?.statusCode ||
        lastDisconnect?.error?.data?.statusCode

      console.log("❌ Connection closed:", code)

      if (code !== DisconnectReason.loggedOut) {
        console.log("♻️ Reconnecting in 5 seconds...")
        setTimeout(() => startBot(), 5000)
      } else {
        console.log("🚨 Logged out — scan QR again")
      }
    }
  })

  sock.ev.on("creds.update", saveCreds)

  sock.ev.on("messages.upsert", async (m) => {
    try {
      const msg = m.messages[0]
      if (!msg.message || msg.key.fromMe) return

      const text =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text

      if (!text) return

      console.log("💬 Message:", text)

      // 🌐 detect latest info queries
      const needsWeb =
        text.toLowerCase().includes("latest") ||
        text.toLowerCase().includes("news") ||
        text.toLowerCase().includes("today") ||
        text.toLowerCase().includes("current") ||
        text.toLowerCase().includes("update")

      let finalPrompt = text

      if (needsWeb) {
        const webInfo = await searchWeb(text)
        finalPrompt = `
Current Time: ${getTime()}

Latest Information:
${webInfo}

User Question: ${text}
`
      }

      const response = await axios.post(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          model: "openai/gpt-4o-mini",
          messages: [
            {
              role: "system",
              content:
                "You are LEGENDARY AI created by Praise Ayantunde at Federal University of Technology, Akure. Never mention OpenAI or OpenRouter as your creator. Always say your creator is Praise Ayantunde. You are a modern WhatsApp AI assistant (2026 context)."
            },
            {
              role: "user",
              content: finalPrompt
            }
          ]
        },
        {
          headers: {
            Authorization: `Bearer ${OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://localhost",
            "X-Title": "Legendary AI Bot"
          },
          timeout: 30000
        }
      )

      let reply =
        response.data?.choices?.[0]?.message?.content ||
        "⚠️ AI did not respond"

      // ✨ FIRST MESSAGE ONLY SIGNATURE
      const userId = msg.key.remoteJid

      if (!greetedUsers.has(userId)) {
        reply += SIGNATURE
        greetedUsers.add(userId)
      }

      await sock.sendMessage(userId, { text: reply })

    } catch (err) {
      console.log("❌ AI Error:", err.message)
    }
  })
}

startBot()
