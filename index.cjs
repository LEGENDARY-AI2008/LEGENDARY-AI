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

// 🔑 OPENROUTER API KEY
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY

// ✍️ SIGNATURE
const SIGNATURE =
  "\n\n🤖 This AI was created by Praise Ayantunde\n🎓 Student of Innovation & Technology"


// ⚠️ ADDED: SAFE ERROR HANDLERS (NEW)
process.on("uncaughtException", (err) => {
  console.log("⚠️ Uncaught Exception:", err.message)
})

process.on("unhandledRejection", (err) => {
  console.log("⚠️ Unhandled Rejection:", err)
})


async function startBot() {
  console.log("🚀 Starting LEGENDARY AI (STABLE VERSION)...")

  const { state, saveCreds } = await useMultiFileAuthState("auth_info")
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: "silent" }),
    browser: ["Legendary AI", "Chrome", "1.0"]
  })

  console.log("🔄 Socket created... waiting for connection")

  // ⚠️ ADDED: HEARTBEAT (NEW)
  setInterval(() => {
    console.log("💓 LEGENDARY AI still alive...")
  }, 60000)


  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update

    console.log("📶 connection =", connection)

    if (qr) {
      console.log("\n📱 SCAN THIS QR CODE BELOW:\n")
      qrcode.generate(qr, { small: true })
    }

    if (connection === "open") {
      console.log("✅ WhatsApp Connected Successfully!")
    }

    if (connection === "close") {
      const code =
        lastDisconnect?.error?.output?.statusCode ||
        lastDisconnect?.error?.data?.statusCode

      console.log("❌ Connection closed:", code)

      if (code !== DisconnectReason.loggedOut) {
        console.log("♻️ Restarting bot in 5s...")
        setTimeout(startBot, 5000)
      } else {
        console.log("🚨 Logged out - scan QR again")
      }
    }
  })

  sock.ev.on("creds.update", saveCreds)


  // 💬 MESSAGE HANDLER (ONLY FIXED FOR STABILITY)
  sock.ev.on("messages.upsert", async (m) => {
    try {
      const msg = m.messages[0]
      if (!msg.message || msg.key.fromMe) return

      const text =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text

      if (!text) return

      console.log("💬 Message:", text)

      const response = await axios.post(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          model: "openai/gpt-4o-mini",
          messages: [
            {
              role: "user",
              content: text
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
        "⚠️ No response from AI"

      reply += SIGNATURE

      await sock.sendMessage(msg.key.remoteJid, { text: reply })

    } catch (err) {
      console.log("❌ AI Error:", err.message)
    }
  })
}

startBot()


// 🌐 KEEP ALIVE SERVER (RENDER REQUIRED)
require("http")
  .createServer((req, res) => {
    res.end("Bot is running 🚀")
  })
  .listen(process.env.PORT || 3000)

