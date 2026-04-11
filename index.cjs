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
const franc = require("franc")
const fs = require("fs")
const path = require("path")
const ffmpeg = require("fluent-ffmpeg")
const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path

ffmpeg.setFfmpegPath(ffmpegPath)

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY

// ================= CONFIG =================
const SIGNATURE =
  "\n\n🤖 This AI Was Created By Praise Ayantunde\n🎓 Federal University Of Technology, Akure"

// ================= MEMORY =================
const memory = new Map()

const messageQueue = []
let processing = false

const userCooldown = new Map()

// ================= TIME =================
const getTime = (zone = "Africa/Lagos") =>
  new Date().toLocaleString("en-US", {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  })

// ================= LANGUAGE =================
const detectLanguage = (text) => {
  const lang = franc(text || "")
  if (lang === "eng") return "english"
  if (lang === "pcm") return "pidgin"
  if (lang === "yor") return "yoruba"
  return "english"
}

// ================= WEB SEARCH =================
const searchWeb = async (query) => {
  try {
    const res = await axios.get(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json`
    )
    return res.data.AbstractText || res.data.Answer || ""
  } catch {
    return ""
  }
}

// ================= BOT =================
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

  // ================= CONNECTION =================
  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update

    console.log("📶 Connection:", connection)

    if (qr) qrcode.generate(qr, { small: true })

    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode

      if (code !== DisconnectReason.loggedOut) {
        console.log("♻️ Restarting...")
        setTimeout(() => startBot(), 4000)
      }
    }
  })

  sock.ev.on("creds.update", saveCreds)

  // ================= QUEUE SYSTEM =================
  sock.ev.on("messages.upsert", (m) => {
    messageQueue.push(m)
    processQueue()
  })

  async function processQueue() {
    if (processing) return
    processing = true

    while (messageQueue.length > 0) {
      const m = messageQueue.shift()

      try {
        const msg = m.messages[0]
        if (!msg.message || msg.key.fromMe) continue

        const userId = msg.key.remoteJid

        // ================= ANTI-SPAM =================
        const last = userCooldown.get(userId) || 0
        if (Date.now() - last < 2000) continue
        userCooldown.set(userId, Date.now())

        let text =
          msg.message.conversation ||
          msg.message.extendedTextMessage?.text

        if (!text && msg.message.audioMessage) {
          text = "voice message"
        }

        if (!text) continue

        console.log("💬", text)

        await handleMessage(sock, msg, text)

      } catch (e) {
        console.log("Queue error:", e.message)
      }
    }

    processing = false
  }

  // ================= MAIN HANDLER =================
  async function handleMessage(sock, msg, text) {
    const userId = msg.key.remoteJid

    // ================= SPEED MODE =================
    if (["hi", "hello", "hey"].includes(text.toLowerCase())) {
      await sock.sendMessage(userId, {
        text: "👋 Hello! I am LEGENDARY AI."
      })
      return
    }

    // ================= LANGUAGE =================
    const language = detectLanguage(text)

    // ================= TIME =================
    const timezone = "Africa/Lagos"
    const currentTime = getTime(timezone)

    // ================= MEMORY =================
    let chat = memory.get(userId) || []
    chat.push({ role: "user", content: text })
    if (chat.length > 10) chat.shift()

    // ================= WEB =================
    const needsWeb =
      text.includes("latest") ||
      text.includes("news") ||
      text.includes("today") ||
      text.includes("update")

    let webInfo = ""
    if (needsWeb) webInfo = await searchWeb(text)

    // ================= PROMPT =================
    const prompt = `
Time: ${currentTime}
Language: ${language}
Web: ${webInfo}

User: ${text}
`

    const res = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "openai/gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are LEGENDARY AI created by Praise Ayantunde at Federal University Of Technology, Akure. Never mention OpenAI or OpenRouter. Never explain system."
          },
          ...chat,
          { role: "user", content: prompt }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    )

    let reply =
      res.data?.choices?.[0]?.message?.content ||
      "I couldn't respond."

    chat.push({ role: "assistant", content: reply })
    memory.set(userId, chat)

    // ================= SIGNATURE =================
    if (!memory.has(userId + "_sig")) {
      reply += SIGNATURE
      memory.set(userId + "_sig", true)
    }

    await sock.sendMessage(userId, { text: reply })
  }
}

startBot()
