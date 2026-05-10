require("dotenv").config()

const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason
} = require("@whiskeysockets/baileys")

const { GoogleGenerativeAI } = require("@google/generative-ai")
const fs = require("fs-extra")
const moment = require("moment-timezone")
const pino = require("pino")

// ================= GEMINI =================
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" })

// ================= ADMINS =================
const ADMINS = [
  process.env.ADMIN_NUMBER,
  process.env.ADMIN_NUMBER_2
]

function isAdmin(id) {
  return ADMINS.includes(id)
}

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
  if (userMem.length > MAX_MEMORY) userMem.shift()
}

// ================= USERS =================
const USERS_FILE = "users.json"

function loadUsers() {
  if (!fs.existsSync(USERS_FILE)) fs.writeJsonSync(USERS_FILE, {})
  return fs.readJsonSync(USERS_FILE)
}

function saveUsers(users) {
  fs.writeJsonSync(USERS_FILE, users, { spaces: 2 })
}

function registerUser(id, name) {
  const users = loadUsers()
  if (!users[id]) {
    users[id] = {
      id,
      name,
      joinedAt: moment().tz("Africa/Lagos").format("LLLL"),
      referrals: 0,
      dailyLimits: {
        image: 0,
        audio: 0,
        imageRecognition: 0,
        audioRecognition: 0,
        lastReset: moment().format("YYYY-MM-DD")
      }
    }
    saveUsers(users)
  }
  return users[id]
}

function getAllUsers() {
  return loadUsers()
}

// ================= DAILY LIMITS =================
function checkAndResetLimits(id) {
  const users = loadUsers()
  const user = users[id]
  if (!user) return

  const today = moment().format("YYYY-MM-DD")
  if (user.dailyLimits.lastReset !== today) {
    user.dailyLimits = {
      image: 0,
      audio: 0,
      imageRecognition: 0,
      audioRecognition: 0,
      lastReset: today
    }
    saveUsers(users)
  }
}

function incrementLimit(id, type) {
  const users = loadUsers()
  const user = users[id]
  if (!user) return false

  checkAndResetLimits(id)
  if (user.dailyLimits[type] >= 5) return false

  user.dailyLimits[type]++
  saveUsers(users)
  return true
}

// ================= FIRST CHAT =================
const firstChat = new Map()

// ================= SIGNATURE =================
const SIGNATURE = `

━━━━━━━━━━━━━━━━━━━━
🏛️ *LËGĒNDÃRY LAB™ Studio*
📅 Est. 2026
👤 Headed, Created & Conducted by
*Ayantunde Praise Elijah (LEGEND)*
🎓 A Student of Federal University of
Technology, Akure (FUTA)
━━━━━━━━━━━━━━━━━━━━`

// ================= WELCOME MESSAGE =================
function getWelcomeMessage(name) {
  return `👋 *Welcome ${name}!*

I am *Legendary AI* 🤖
Your intelligent assistant, created by a team named *LËGĒNDÃRY LAB™ Studio* in 2026, headed, created and conducted by *Ayantunde Praise Elijah (LEGEND)*, a student of *Federal University of Technology, Akure (FUTA)*

Here's what I can do for you:
✅ Answer any question
✅ Generate images
✅ Recognize images & voice
✅ Extract PDF content
✅ Send voice messages
✅ Search Wikipedia
✅ And much more!

Type */help* to see all commands

🌐 *Join our community for more info:*
${process.env.COMMUNITY_LINK}

📧 *For suggestions or enquiries:*
${process.env.SUPPORT_EMAIL}

${SIGNATURE}`
}

// ================= HELP MESSAGE =================
const HELP_MESSAGE = `
📖 *LEGENDARY AI COMMANDS*
━━━━━━━━━━━━━━━━━━━━

💬 *General:*
• Just type anything to chat with AI
• */help* — Show this menu
• */about* — About Legendary AI
• */team* — Meet the creator team
• */time* — Current time

🎨 *Media:*
• */imagine <prompt>* — Generate image
• */voice <text>* — Generate voice note
• Send image + */recognize* — Recognize image

📚 *PDF:*
• */pdf <course name>* — Get course PDF
• Send PDF + */extract* — Extract PDF content
• Send PDF + */questions* — Generate questions from PDF

📝 *Employment:*
• */apply* — Apply to join LËGĒNDÃRY LAB™ Studio

👮 *Admin Only:*
• */users* — Total user count
• */broadcast <message>* — Broadcast to all users
• */upload <course>* — Upload a PDF
• */ban <number>* — Ban a user

━━━━━━━━━━━━━━━━━━━━`

// ================= GEMINI AI =================
async function askGemini(text, history, userName) {
  try {
    const systemPrompt = `You are Legendary AI, a smart and friendly AI assistant created by a team named LËGĒNDÃRY LAB™ Studio in 2026, headed, created and conducted by Ayantunde Praise Elijah (also known as LEGEND), a student of Federal University of Technology, Akure (FUTA), studying Remote Sensing & Geosciences Information Systems at 100 Level, from Ondo State, Nigeria.

You are currently chatting with ${userName}. Always address them by their first name when possible to make conversation feel personal and friendly.

Be helpful, friendly, and conversational. Keep responses clear and well formatted for WhatsApp.
Do not use markdown formatting like ** or ## — use WhatsApp formatting instead (*bold*, _italic_).
Never say you are ChatGPT, Gemini or any other AI. You are LEGENDARY AI.`

    const historyText = history
      .map(h => `${h.role === "user" ? userName : "Legendary AI"}: ${h.text}`)
      .join("\n")

    const fullPrompt = `${systemPrompt}\n\nConversation history:\n${historyText}\n\n${userName}: ${text}\n\nLegendary AI:`

    const result = await model.generateContent(fullPrompt)
    return result.response.text()
  } catch (err) {
    console.error("Gemini error:", err)
    return "⚠️ I encountered an error. Please try again!"
  }
}

// ================= TYPING EFFECT =================
async function sendWithTyping(sock, id, text) {
  try {
    await sock.presenceSubscribe(id)
    await sock.sendPresenceUpdate("composing", id)
    await new Promise(r => setTimeout(r, Math.min(text.length * 30, 3000)))
    await sock.sendPresenceUpdate("paused", id)
    await sock.sendMessage(id, { text })
  } catch {
    await sock.sendMessage(id, { text })
  }
}

// ================= GET NAME =================
function getName(msg) {
  try {
    const pushName = msg.pushName || ""
    if (pushName) return pushName
    const id = msg.key.remoteJid
    const number = id.replace("@s.whatsapp.net", "")
    return number
  } catch {
    return "Friend"
  }
}

// ================= BOT =================
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info")
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    auth: state,
    version,
    printQRInTerminal: false,
    mobile: false,
    logger: pino({ level: "silent" }),
    browser: ["Legendary AI", "Chrome", "1.0.0"]
  })

  // ================= PAIRING CODE =================
  if (!sock.authState.creds.registered) {
    await new Promise(r => setTimeout(r, 3000))
    const number = process.env.ADMIN_NUMBER_2.replace("@s.whatsapp.net", "")
    console.log("⏳ Requesting pairing code for:", number)
    try {
      const code = await sock.requestPairingCode(number)
      console.log(`\n🔑 YOUR PAIRING CODE: ${code}`)
      console.log(`\n📱 Steps:`)
      console.log(`1. Open WhatsApp on ${number}`)
      console.log(`2. Go to Linked Devices`)
      console.log(`3. Tap Link with phone number`)
      console.log(`4. Enter the code above\n`)
    } catch (err) {
      console.error("Pairing code error:", err.message)
    }
  }

  // ================= CONNECTION =================
  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect } = update

    if (connection === "open") {
      console.log("✅ LEGENDARY AI CONNECTED!")
    }

    if (connection === "close") {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut
      console.log("❌ Connection closed. Reconnecting:", shouldReconnect)
      if (shouldReconnect) startBot()
    }
  })

  // ================= MESSAGES =================
  sock.ev.on("messages.upsert", async ({ messages }) => {
    try {
      const msg = messages[0]
      if (!msg.message || msg.key.fromMe) return

      const id = msg.key.remoteJid
      const isGroup = id.endsWith("@g.us")
      const senderId = isGroup
        ? msg.key.participant
        : msg.key.remoteJid

      const name = getName(msg)
      const firstName = name.split(" ")[0]

      // Register user
      registerUser(senderId, name)
      checkAndResetLimits(senderId)

      let text =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        ""

      if (!text) return

      const lower = text.toLowerCase().trim()
      const history = getMemory(senderId)

      // ================= FIRST CHAT =================
      if (!firstChat.has(senderId)) {
        firstChat.set(senderId, true)
        await sendWithTyping(sock, id, getWelcomeMessage(firstName))
        return
      }

      // ================= COMMANDS =================

      // HELP
      if (lower === "/help") {
        await sendWithTyping(sock, id, HELP_MESSAGE)
        return
      }

      // ABOUT
      if (lower === "/about") {
        const about = `🤖 *LEGENDARY AI*
━━━━━━━━━━━━━━━━━━━━
Created by: *LËGĒNDÃRY LAB™ Studio*
Year: *2026*
Head: *Ayantunde Praise Elijah (LEGEND)*
School: *Federal University of Technology, Akure (FUTA)*
Faculty: *School of Earth & Mineral Sciences*
Department: *Remote Sensing & GIS*
Level: *100 Level*
━━━━━━━━━━━━━━━━━━━━
_Legendary AI is a vision that must be accomplished and known worldwide._ 🌍

${SIGNATURE}`
        await sendWithTyping(sock, id, about)
        return
      }

      // TIME
      if (lower === "/time" || lower === "time" || lower === "what is the time" || lower === "what time is it") {
        const t = moment().tz("Africa/Lagos").format("LLLL")
        await sendWithTyping(sock, id, `🕒 *Current Time (Nigeria)*\n⏰ ${t}\n${SIGNATURE}`)
        return
      }

      // USERS (Admin only)
      if (lower === "/users") {
        if (!isAdmin(senderId)) {
          await sendWithTyping(sock, id, "❌ *Admin only command!*")
          return
        }
        const users = getAllUsers()
        const count = Object.keys(users).length
        await sendWithTyping(sock, id, `👥 *Total Legendary AI Users:* ${count}`)
        return
      }

      // BROADCAST (Admin only)
      if (lower.startsWith("/broadcast ")) {
        if (!isAdmin(senderId)) {
          await sendWithTyping(sock, id, "❌ *Admin only command!*")
          return
        }
        const broadcastMsg = text.slice(11) + `\n${SIGNATURE}`
        const users = getAllUsers()
        let sent = 0
        for (const userId of Object.keys(users)) {
          try {
            await sock.sendMessage(userId, { text: broadcastMsg })
            sent++
            await new Promise(r => setTimeout(r, 1000))
          } catch {}
        }
        await sendWithTyping(sock, id, `✅ *Broadcast sent to ${sent} users!*`)
        return
      }

      // APPLY
      if (lower === "/apply" || lower.includes("i want to apply") || lower.includes("i want to join")) {
        await sendWithTyping(sock, id, `📝 *LËGĒNDÃRY LAB™ Studio Employment*
━━━━━━━━━━━━━━━━━━━━
Welcome! We are glad you want to join our team! 🎉

We have the following departments:

1️⃣ *Tech Department*
   └ Build and maintain Legendary AI systems

2️⃣ *Publicizing Department*
   └ Promote Legendary AI on social media

3️⃣ *Support Management Department*
   └ Handle user support and enquiries

4️⃣ *Files/PDF Donation Department*
   └ Upload and manage university PDFs

Reply with the *number* of the department you want to join!

${SIGNATURE}`)
        return
      }

      // TEAM
      if (lower === "/team" || lower.includes("who created") || lower.includes("creator") || lower.includes("list team")) {
        const team = `👥 *LËGĒNDÃRY LAB™ Studio TEAM*
━━━━━━━━━━━━━━━━━━━━
👑 *CREATOR & HEAD*
• Name: Ayantunde Praise Elijah (LEGEND)
• Occupation: Student & AI Developer
• Level: 100 Level
• Faculty/School: School of Earth & Mineral Sciences / FUTA
• Department: Remote Sensing & GIS
• Phone: +2349056760155
━━━━━━━━━━━━━━━━━━━━
_More team members will be added as they join_ 🚀

${SIGNATURE}`
        await sendWithTyping(sock, id, team)
        return
      }

      // PDF REQUEST
      if (lower.startsWith("/pdf ")) {
        const course = text.slice(5).trim()
        await sendWithTyping(sock, id, `📚 Searching for *${course}* PDF...\n\n_PDF library coming soon! Stay tuned._ 📖\n${SIGNATURE}`)
        return
      }

      // ================= AI FALLBACK =================
      addMemory(senderId, "user", text)
      const ai = await askGemini(text, history, firstName)
      addMemory(senderId, "assistant", ai)

      await sendWithTyping(sock, id, ai + `\n${SIGNATURE}`)

    } catch (err) {
      console.error("Message error:", err)
    }
  })

  sock.ev.on("creds.update", saveCreds)
}

startBot()

