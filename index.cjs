const fs = require("fs");

let users = new Set(
  fs.existsSync("users.json")
    ? JSON.parse(fs.readFileSync("users.json"))
    : []
);


const express = require("express")
const app = express()

app.get("/", (req, res) => {
  res.send("LEGENDARY AI is alive 🔥")
})

app.listen(process.env.PORT || 3000)

require("dotenv").config()

const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason
} = require("@whiskeysockets/baileys")

const qrcode = require("qrcode-terminal")
const axios = require("axios")
const translate = require("translate-google")
const gtts = require("google-tts-api")
const fetch = require("node-fetch")
const moment = require("moment-timezone")

// ================= LIVE DATA =================
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
  if (userMem.length > MAX_MEMORY) userMem.shift()
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
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "openai/gpt-4o-mini",
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
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`
        }
      }
    )

    return res.data.choices[0].message.content
  } catch {
    return "⚠️ AI error"
  }
}

// ================= BOT =================
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info")
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({ auth: state, version })

  sock.ev.on("connection.update", ({ connection, qr }) => {
    if (qr) qrcode.generate(qr, { small: true })
    if (connection === "open") console.log("✅ CONNECTED")
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

    // ================= CREATOR INFO (FULL) =================
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
0Remote Sensing & Geosciences Information Systems

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

      await sock.sendMessage(id, { text: attachSignature(reply) })
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
    if (
      lower.includes("voice") ||
      lower.includes("send voice")
    ) {
      const clean = text.replace(/voice|send voice/gi, "").trim()
      await sendVoice(sock, id, clean || "Hello", "en")
      return
    }

    // ================= 🔥 WIKIPEDIA FIRST (FIXED) =================
let query = text

// if starts with /
if (text.startsWith("/")) {
  query = text.slice(1)
}

// 🔥 CLEAN QUERY (VERY IMPORTANT)
query = query
  .replace(/[^a-zA-Z0-9 ]/g, "")
  .replace(/who is|what is|tell me|about|current|the|a|an/gi, "")
  .trim()

const wiki = await getWikipedia(query)

if (wiki) {
  const reply = `📚 WIKIPEDIA\n\n${wiki.extract}\n\n🔗 ${wiki.link}`

  await sock.sendMessage(id, {
    text: attachSignature(reply)
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

const fs = require("fs");

let users = new Set(
  fs.existsSync("users.json")
    ? JSON.parse(fs.readFileSync("users.json"))
    : []
);

sock.ev.on("messages.upsert", async ({ messages }) => {
  const msg = messages[0];
  const sender = msg.key.remoteJid;

  if (!sender) return;

  users.add(sender);

  fs.writeFileSync("users.json", JSON.stringify([...users]));
});

sock.ev.on("messages.upsert", async ({ messages }) => {
  const msg = messages[0];
  const sender = msg.key.remoteJid;
  const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text;

  if (sender !== "2349056760155@s.whatsapp.net") return;

  if (text === ".stats") {
    await sock.sendMessage(sender, {
      text: `👥 Total users chatting bot: ${users.size}`
    });
  }
});

sock.ev.on("messages.upsert", async ({ messages }) => {
  const msg = messages[0];
  const sender = msg.key.remoteJid;

  if (!sender) return;

  users.add(sender);

  fs.writeFileSync("users.json", JSON.stringify([...users]));
});
sock.ev.on("messages.upsert", async ({ messages }) => {
  const msg = messages[0];
  const sender = msg.key.remoteJid;
  const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text;

  if (sender !== "2349056760155@s.whatsapp.net") return;

  if (text.startsWith(".broadcast ")) {
    const message = text.replace(".broadcast ", "");

    for (let user of users) {
      await sock.sendMessage(user, { text: `📢 ${message}` });
    }

    await sock.sendMessage(sender, {
      text: `✅ Sent to ${users.size} users`
    });
  }
});
const activeUsers = new Map();

sock.ev.on("messages.upsert", async ({ messages }) => {
  const msg = messages[0];
  const sender = msg.key.remoteJid;

  if (!sender) return;

  activeUsers.set(sender, Date.now());
});
sock.ev.on("messages.upsert", async ({ messages }) => {
  const msg = messages[0];
  const sender = msg.key.remoteJid;
  const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text;

  if (sender !== "2349056760155@s.whatsapp.net") return;

  if (text === ".active") {
    const now = Date.now();

    const active = [...activeUsers.entries()]
      .filter(([u, t]) => now - t < 5 * 60 * 1000)
      .map(([u]) => u.replace("@s.whatsapp.net", ""))
      .join("\n");

    await sock.sendMessage(sender, {
      text: `⚡ ACTIVE USERS\n\n${active || "None"}`
    });
  }
});
