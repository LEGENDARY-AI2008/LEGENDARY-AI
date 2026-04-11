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

const SIGNATURE =
  "\n\n🤖 *This AI Was Created By Praise Ayantunde*\n🎓 *A Student Of Federal University Of Technology*"

// ⚠️ safe error handling
process.on("uncaughtException", (err) => {
  console.log("⚠️ Error:", err.message)
})

process.on("unhandledRejection", (err) => {
  console.log("⚠️ Rejection:", err)
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

  // 💓 keep alive log
  setInterval(() => {
    console.log("💓 Bot still running...")
  }, 60000)

  // ♻️ 10 MIN AUTO RESTART (SAFE)
  setTimeout(() => {
    console.log("♻️ 10 minutes reached — restarting...")
    process.exit(0)
  }, 10 * 60 * 1000)

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

      console.log("❌ Closed:", code)

      if (code === DisconnectReason.loggedOut) {
        console.log("🚨 Logged out — rescan needed")
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

      console.log("💬", text)

      const response = await axios.post(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          model: "openai/gpt-4o-mini",
          messages: [{ role: "user", content: text }]
        },
        {
          headers: {
            Authorization: `Bearer ${OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://localhost",
            "X-Title": "Legendary AI"
          },
          timeout: 30000
        }
      )

      let reply =
        response.data?.choices?.[0]?.message?.content ||
        "⚠️ No response"

      reply += SIGNATURE

      await sock.sendMessage(msg.key.remoteJid, { text: reply })

    } catch (err) {
      console.log("❌ Error:", err.message)
    }
  })
}

startBot()

require("http")
  .createServer((req, res) => res.end("Bot running 🚀"))
  .listen(process.env.PORT || 3000)
