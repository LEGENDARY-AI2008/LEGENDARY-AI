require("dotenv").config()

const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  downloadContentFromMessage
} = require("@whiskeysockets/baileys")

const pino = require("pino")
const axios = require("axios")
const fs = require("fs")

// ================= CONFIG =================
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY

// ================= MEMORY =================
const MEM_PATH = "./memory.json"

function loadMem() {
  if (!fs.existsSync(MEM_PATH)) return {}
  return JSON.parse(fs.readFileSync(MEM_PATH))
}

function saveMem(data) {
  fs.writeFileSync(MEM_PATH, JSON.stringify(data, null, 2))
}

function addMem(user, msg) {
  const mem = loadMem()
  if (!mem[user]) mem[user] = []

  mem[user].push({ msg, time: Date.now() })

  if (mem[user].length > 30) mem[user].shift()

  saveMem(mem)
}

function getMem(user) {
  return loadMem()[user] || []
}

// ================= FACTS =================
const FACTS = {
  "president of nigeria": "🇳🇬 Nigeria: Bola Ahmed Tinubu (since 2023)",
  "usa president": "🇺🇸 USA: Joe Biden",
  "uk prime minister": "🇬🇧 UK: Keir Starmer"
}

function checkFacts(text) {
  const t = text.toLowerCase()
  for (let k in FACTS) {
    if (t.includes(k)) return FACTS[k]
  }
  return null
}

// ================= AI =================
async function askAI(prompt) {
  try {
    const res = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "meta-llama/llama-3-8b-instruct",
        messages: [{ role: "user", content: prompt }]
      },
      {
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    )

    return res.data.choices[0].message.content
  } catch (e) {
    console.log("AI ERROR:", e.response?.data || e.message)
    return "⚠️ AI busy"
  }
}

// ================= IMAGE HANDLER (STABLE) =================
async function getImageBuffer(msg) {
  try {
    const type = Object.keys(msg.message)[0]

    const stream = await downloadContentFromMessage(
      msg.message[type],
      "image"
    )

    let buffer = Buffer.from([])

    for await (const chunk of stream) {
      buffer = Buffer.concat([buffer, chunk])
    }

    return buffer
  } catch (e) {
    console.log("IMAGE ERROR:", e.message)
    return null
  }
}

async function analyzeImage(buffer, caption = "") {
  try {
    const base64 = buffer.toString("base64")

    const res = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "meta-llama/llama-3.2-11b-vision-instruct",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Analyze or improve this flyer/image professionally. Caption: ${caption}`
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${base64}`
                }
              }
            ]
          }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    )

    return res.data.choices[0].message.content
  } catch (e) {
    console.log("VISION ERROR:", e.response?.data || e.message)
    return "❌ Image analysis failed"
  }
}

// ================= BRAIN =================
async function brain(userId, input) {
  const memory = getMem(userId)
  const context = memory.slice(-10).map(m => m.msg).join("\n")

  const prompt = `
You are LEGENDARY AI.

Memory:
${context}

User:
${input}
`

  return await askAI(prompt)
}

// ================= BOT START =================
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info")
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: "silent" }),
    browser: ["LEGENDARY AI", "Chrome", "1.0"]
  })

  console.log("🚀 LEGENDARY AI STARTED")

  sock.ev.on("creds.update", saveCreds)

  // ================= CONNECTION (CLEAN ONLY) =================
  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect } = update

    console.log("📶 Connection:", connection)

    if (connection === "open") {
      console.log("✅ Connected")
    }

    if (connection === "close") {
      console.log("❌ Connection closed")
      console.log("📛 Status:", lastDisconnect?.error?.output?.statusCode)
    }
  })

  // ================= MESSAGES =================
  sock.ev.on("messages.upsert", async (m) => {
    const msg = m.messages[0]
    if (!msg.message || msg.key.fromMe) return

    const userId = msg.key.remoteJid

    // ================= IMAGE =================
    if (msg.message.imageMessage) {
      const buffer = await getImageBuffer(msg)

      if (!buffer) {
        return sock.sendMessage(userId, {
          text: "❌ Could not read image"
        })
      }

      const caption = msg.message.imageMessage.caption || ""

      const result = await analyzeImage(buffer, caption)

      return sock.sendMessage(userId, {
        text: "🖼️ IMAGE RESULT:\n\n" + result
      })
    }

    // ================= TEXT =================
    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text

    if (!text) return

    addMem(userId, text)

    // ================= FACTS =================
    const fact = checkFacts(text)
    if (fact) {
      return sock.sendMessage(userId, { text: fact })
    }

    // ================= AI =================
    const reply = await brain(userId, text)

    return sock.sendMessage(userId, {
      text: reply + "\n\n🤖 LEGENDARY AI"
    })
  })
}

startBot()
