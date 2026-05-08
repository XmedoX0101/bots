process.on('unhandledRejection', r => console.error('⚠️ Rejection:', r?.message || JSON.stringify(r)));
process.on('uncaughtException', e => console.error('⚠️ Exception:', e.message));
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, downloadMediaMessage } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const pino = require('pino');
const fs = require('fs'); const path = require('path'); require('dotenv').config();

let sock = null, isReady = false, botJid = null;
const cleanJid = jid => jid ? String(jid).split('@')[0].split(':')[0].replace(/\D/g, '') : '';

const startClient = async (handler) => {
  try {
    const dir = path.join(__dirname, 'auth_info');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const { state, saveCreds } = await useMultiFileAuthState(dir);
    sock = makeWASocket({ auth: state, logger: pino({ level: 'silent' }), browser: ['Chrome', 'Chrome', '120.0'], markOnlineOnConnect: false, syncFullHistory: false, printQRInTerminal: false });
    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
      if (connection === 'close') { const code = lastDisconnect?.error?.output?.statusCode; console.log(`⚠️ انقطع: ${code}`); if (code !== DisconnectReason.loggedOut) { isReady = false; setTimeout(() => startClient(handler), 3000); } else { console.log('❌ انتهت الجلسة.'); process.exit(0); } }
      else if (connection === 'open') { console.log('✅ متصل وجاهز! isReady=true'); isReady = true; if (sock.user?.id) { botJid = sock.user.id; console.log(`🤖 جيد البوت: ${botJid}`); } }
      else if (qr) { console.log('📱 امسح الـ QR:'); qrcode.generate(qr, { small: true }); }
    });
    sock.ev.on('messages.upsert', async ({ messages, type: evType }) => {
      try {
        if (evType !== 'notify') return; const msg = messages[0]; if (!msg.message || !msg.key?.remoteJid || msg.key.fromMe) return;
        const jid = msg.key.remoteJid; if (jid.includes('g.us') || (botJid && cleanJid(jid) === cleanJid(botJid))) return;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.buttonsResponseMessage?.selectedButtonId || msg.message.listResponseMessage?.singleSelectReply?.selectedRowId || '';
        // ✅ تمرير sock للبوت عشان يقدر يحمل الصور
        await handler(jid, text, msg, isReady, jid.includes('@lid') ? 'lid' : 'whatsapp', sock, downloadMediaMessage);
      } catch (e) { console.error('❌ [Handler]', e?.message || JSON.stringify(e)); }
    });
    return sock;
  } catch (e) { console.error('❌ [Start]', e?.message || JSON.stringify(e)); setTimeout(() => startClient(handler), 5000); }
};

const sendMessage = async (jid, text, buttons = []) => {
  try {
    if (!sock || !isReady) return console.warn('⚠️ غير جاهز');
    if (botJid && cleanJid(jid) === cleanJid(botJid)) return console.log('🚫 منع إرسال للبوت نفسه');
    const target = jid.includes('@') ? jid : `${jid.replace(/\D/g, '')}@s.whatsapp.net`;
    const payload = buttons.length ? { text: text + '\n\n' + buttons.map((b, i) => `*${i + 1}.* ${b.label}`).join('\n') } : { text };
    await sock.sendPresenceUpdate('composing', target); await new Promise(r => setTimeout(r, 800));
    await sock.sendMessage(target, payload);
  } catch (e) { console.error(`❌ فشل الإرسال: ${e?.message || JSON.stringify(e)}`); }
};

module.exports = { startClient, sendMessage, cleanJid };