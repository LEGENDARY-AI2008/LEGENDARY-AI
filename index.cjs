require("dotenv").config()

const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason
} = require("@whiskeysockets/baileys")

const qrcode = require("qrcode-terminal")
const axios = require("axios")
const fs = require("fs")
const translate = require("translate-google")
const gtts = require("google-tts-api")
const fetch = require("node-fetch")
const moment = require("moment-timezone")

// ================= WIKI =================
const WIKI = "https://en.wikipedia.org/api/rest_v1/page/summary/"

// ================= MEMORY =================
const memory = new Map()
const MAX_MEMORY = 30

function getMemory(id) {
  if (!memory.has(id)) memory.set(id, [])
  return memory.get(id)
}

function addMemory(id, role, text) {
  const userMem = getMemory(id)
  userMem.push({ role, text })

  if (userMem.length > MAX_MEMORY) {
    userMem.splice(0, userMem.length - MAX_MEMORY)
  }
}

// ================= SIGNATURE =================
const firstChat = new Map()

const SIGNATURE =
"\n\n👤 *This AI was created by Praise Ayantunde*\n🎓 *A student of Federal University of Technology, Akure*"

// ================= TIME =================
function getGlobalTime(query = "") {
  const zones = moment.tz.names()
  const match = zones.find(z => z.toLowerCase().includes(query.toLowerCase()))
  const zone = match || "Africa/Lagos"

  return {
    zone,
    time: moment().tz(zone).format("LLLL")
  }
}

// ================= WIKIPEDIA =================
async function getWikipedia(query) {
  try {
    const res = await fetch(WIKI + encodeURIComponent(query))
    const data = await res.json()
    if (!data || data.title === "Not found.") return null

    return {
      extract: data.extract,
      link: data.content_urls?.desktop?.page
    }
  } catch {
    return null
  }
}

// ================= VOICE =================
async function sendVoice(sock, id, text, lang = "en") {
  try {
    const url = gtts.getAudioUrl(text, { lang })
    const res = await fetch(url)
    const buffer = await res.arrayBuffer()

    await sock.sendMessage(id, {
      audio: Buffer.from(buffer),
      mimetype: "audio/mpeg",
      ptt: true
    })
  } catch {
    await sock.sendMessage(id, { text: "❌ Voice failed" })
  }
}

// ================= AI =================
async function askAI(text, history) {
  try {
    const res = await axios.post(
      "https://api.groq.ai/v1/ai/completions",
      {
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are Legendary AI created by Ayantunde Praise Elijah. Never mention OpenAI. Always act current and intelligent."
          },
          ...history.map(h => ({
            role: h.role,
            content: h.text
          })),
          { role: "user", content: text }
        ]
      },
      {
        headers: {
          "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    )

    return res.data.choices[0].message.content
  } catch (err) {
    console.error("Groq AI error:", err.message)
    return "⚠️ AI error"
  }
}

// ================= BOT =================
let isRunning = false

async function startBot() {
  if (isRunning) return
  isRunning = true

  const { state, saveCreds } = await useMultiFileAuthState("auth_info")
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    auth: state,
    version,
    printQRInTerminal: false // FIXED: prevents QR conflict issues in unstable env
  })

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update

    if (qr) qrcode.generate(qr, { small: true })

    if (connection === "open") {
      console.log("✅ CONNECTED")
      isRunning = true
    }

    if (connection === "close") {
      const status = lastDisconnect?.error?.output?.statusCode

      const shouldReconnect =
        status !== DisconnectReason.loggedOut &&
        status !== 401 &&
        status !== 403

      console.log("⚠️ Connection closed:", status)

      isRunning = false

      if (shouldReconnect) {
        setTimeout(() => {
          startBot()
        }, 5000) // FIXED: prevents stream conflict
      }
    }
  })

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0]
    if (!msg.message || msg.key.fromMe) return

    const id = msg.key.remoteJid

    let text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      ""

    const lower = text.toLowerCase()

    const history = getMemory(id)
    addMemory(id, "user", text)

    let isFirst = false
    if (!firstChat.has(id)) {
      firstChat.set(id, true)
      isFirst = true
    }

    const attachSignature = (r) => (isFirst ? r + SIGNATURE : r)

    // ================= CREATOR =================
    if (lower.includes("creator") || lower.includes("who created")) {
      const reply =
`👤 *LEGENDARY AI CREATOR PROFILE*

🧠 NAME:
AYANTUNDE PRAISE ELIJAH (LEGEND)

🇳🇬 COUNTRY/STATE:
Nigeria / Ondo State

🎓 UNIVERSITY:
Federal University of Technology, Akure (FUTA)

🏫 SCHOOL:
School of Earth and Mineral Sciences

📡 DEPARTMENT:
Remote Sensing & Geosciences Information Systems

📘 LEVEL:
100 Level Student

💻 ROLES:
✔ AI Developer
✔ Tech Expert
✔ System Builder
✔ Founder of LËGĒNDÃRY LAB™ Studio
✔ Creator of Legendary AI

⚡ STATUS:
Still building multiple tech and AI systems`

      await sock.sendMessage(id, {
        text: attachSignature(reply)
      })
      return
    }

    // ================= TIME =================
    if (lower.includes("time") || lower.includes("date")) {
      const t = getGlobalTime(text)

      await sock.sendMessage(id, {
        text: attachSignature(`🕒 ${t.zone}\n⏰ ${t.time}`)
      })
      return
    }

    // ================= VOICE =================
    if (lower.includes("voice")) {
      const clean = text.replace(/voice/gi, "").trim()
      await sendVoice(sock, id, clean || "Hello", "en")
      return
    }

    // ================= WIKIPEDIA =================
    let query = text.startsWith("/") ? text.slice(1) : text
    const wiki = await getWikipedia(query)

    if (wiki) {
      await sock.sendMessage(id, {
        text: attachSignature(`📚 ${wiki.extract}\n\n🔗 ${wiki.link}`)
      })
      return
    }

    // ================= AI FALLBACK =================
    const ai = await askAI(text, history)
    addMemory(id, "assistant", ai)

    await sock.sendMessage(id, {
      text: attachSignature(ai)
    })
  })

  sock.ev.on("creds.update", saveCreds)
}

startBot()
