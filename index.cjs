require("dotenv").config()
const fs = require("fs")
const unzipper = require("unzipper")

if (fs.existsSync("auth_info.zip")) {
  fs.createReadStream("auth_info.zip")
    .pipe(unzipper.Extract({ path: "." }))
}

const express = require("express")
const app = express()

const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  downloadMediaMessage
} = require("@whiskeysockets/baileys")

const axios = require("axios")
const pino = require("pino")
const qrcode = require("qrcode-terminal")

// ================= SERVER =================
const PORT = process.env.PORT || 3000
app.get("/", (_, res) => res.send("LEGENDARY AI ONLINE 🚀"))
app.listen(PORT, () => console.log("🌐 Running on", PORT))

// ================= IDENTITY =================
const CREATOR =
"This AI was created and developed by Praise Ayantunde, a student of Federal University of Technology, Akure."

const SYSTEM_PROMPT = `
You are LEGENDARY AI.

RULES:
- Never mention OpenAI, Meta, ChatGPT, OpenRouter
- Never say you are based on another AI system
- Always behave like an independent AI product
- Keep responses clean and professional
`

// ================= STATE =================
let botStarted = false
let isConnected = false

const queue = []
let processing = false

const memoryDB = new Map()
const firstUsers = new Set()

// ================= MEMORY =================
function saveMemory(id, text) {
  if (!memoryDB.has(id)) memoryDB.set(id, [])
  const mem = memoryDB.get(id)

  mem.push(text)
  if (mem.length > 10) mem.shift()
}

function getMemory(id) {
  return memoryDB.get(id)?.join("\n") || ""
}

// ================= AI =================
async function askAI(text, id) {
  try {
    const memory = getMemory(id)

    const res = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "meta-llama/llama-3-8b-instruct",
        messages: [
          {
            role: "system",
            content: SYSTEM_PROMPT + "\n\nMemory:\n" + memory
          },
          { role: "user", content: text }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    )

    return res.data.choices[0].message.content
  } catch (e) {
    return "⚠️ LEGENDARY AI busy."
  }
}

// ================= IMAGE =================
async function generateImage(prompt) {
  try {
    const res = await axios.post(
      "https://api-inference.huggingface.co/models/runwayml/stable-diffusion-v1-5",
      { inputs: prompt },
      {
        headers: {
          Authorization: `Bearer ${process.env.HF_API_KEY}`
        },
        responseType: "arraybuffer",
        validateStatus: () => true
      }
    )

    const buffer = Buffer.from(res.data, "binary")

    if (!buffer || buffer.length < 5000) return null

    return buffer
  } catch (e) {
    console.log("IMAGE ERROR:", e.message)
    return null
  }
}

// ================= BOT =================
async function startBot() {
  if (botStarted) return
  botStarted = true

  const { state, saveCreds } = await useMultiFileAuthState("auth_info")
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: "silent" }),
    browser: ["LEGENDARY AI", "Chrome", "1.0"]
  })

  // ================= CONNECTION =================
  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update

    console.log("📶", connection)

    if (qr) qrcode.generate(qr, { small: true })

    if (connection === "open") {
      isConnected = true
    }

    if (connection === "close") {
      isConnected = false
      const code = lastDisconnect?.error?.output?.statusCode

      if (code !== DisconnectReason.loggedOut) {
        botStarted = false
        setTimeout(startBot, 4000)
      }
    }
  })

  sock.ev.on("creds.update", saveCreds)

  // ================= MESSAGES =================
  sock.ev.on("messages.upsert", async (m) => {
    queue.push(m)
    processQueue()
  })

  async function processQueue() {
    if (processing) return
    processing = true

    while (queue.length > 0) {
      const m = queue.shift()
      const msg = m.messages[0]

      if (!msg.message || msg.key.fromMe || !isConnected) continue

      const userId = msg.key.remoteJid

      let text =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text

      // ================= IMAGE RECEIVED =================
      if (msg.message.imageMessage) {
        return sock.sendMessage(userId, {
          text: "🖼 Image received. Processing upgrade coming soon."
        })
      }

      // ================= VOICE =================
      if (msg.message.audioMessage) {
        return sock.sendMessage(userId, {
          text: "🎤 Voice received. Voice AI coming soon."
        })
      }

      if (!text) continue

      const lower = text.toLowerCase()

      // ================= CREATOR =================
      if (
        lower.includes("who created you") ||
        lower.includes("who made you")
      ) {
        return sock.sendMessage(userId, { text: CREATOR })
      }

      // ================= IMAGE GENERATION =================
      if (
        lower.startsWith("generate image") ||
        lower.startsWith("create image")
      ) {
        const prompt = text.replace(/generate image|create image/i, "").trim()

        const img = await generateImage(prompt)

        if (!img) {
          return sock.sendMessage(userId, {
            text: "❌ Image generation failed. Try again."
          })
        }

        return sock.sendMessage(userId, {
          image: img,
          caption: `🎨 LEGENDARY AI\nPrompt: ${prompt}`
        })
      }

      // ================= MEMORY =================
      saveMemory(userId, text)

      // ================= FIRST USER ONLY =================
      let isFirst = false
      if (!firstUsers.has(userId)) {
        firstUsers.add(userId)
        isFirst = true
      }

      const reply = await askAI(text, userId)

      let finalReply = reply

      // REMOVE ANY OLD SIGNATURES
      finalReply = finalReply.replace(/FUTA Akure/gi, "")

      // ADD SIGNATURE ONLY ON FIRST MESSAGE
      if (isFirst) {
        finalReply += `

🤖 LEGENDARY AI
Created by Praise Ayantunde`
      }

      await sock.sendPresenceUpdate("composing", userId)

      await new Promise(r => setTimeout(r, 800))

      await sock.sendMessage(userId, {
        text: finalReply
      })
    }

    processing = false
  }
}

startBot()
