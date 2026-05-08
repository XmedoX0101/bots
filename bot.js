const db = require('./db');
const { sendMessage } = require('./client');
const { parseWithAI } = require('./ai');
require('dotenv').config();

const { getLocalDate } = require('./db');
const sessions = new Map();
const WORK_DAYS = [1, 3, 6]; // الاتنين، الأربعاء، السبت
const BOOKING_DAYS = 3;
const CLINIC = 'عيادة احمد قطب استشاري الجراحة العامه وجراحه الأورام والمناظير';
const FOOTER = `▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n ${CLINIC}\nد/احمد قطب `;
const dayNames = { 0: 'الأحد', 1: 'الاتنين', 2: 'الثلاثاء', 3: 'الأربعاء', 4: 'الخميس', 5: 'الجمعة', 6: 'السبت' };
const cleanPhone = (s) => s ? String(s).split('@')[0].split(':')[0].replace(/\D/g, '') : '';
const DOCTOR_NUMBERS = (process.env.DOCTOR_PHONE || '').split(',').map(n => cleanPhone(n)).filter(n => n.length > 0);

const parseNum = (str) => {
  if (!str) return NaN;
  const map = { '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9' };
  return isNaN(parseInt(str.toString().replace(/[٠-٩]/g, d => map[d] || d))) ? NaN : parseInt(str.toString().replace(/[٠-٩]/g, d => map[d] || d));
};

// ✅ توحيد النص العربي (يزيل الهمزات، التاء المربوطة، التشكيل، المسافات الزائدة)
const normalizeArabic = (str) => {
  if (!str) return '';
  return str.toString()
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ء/g, '')
    .replace(/[^\w\s\u0600-\u06FF]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
};

const getAvailableDates = async () => {
  const dates = [], today = new Date();
  const closed = db.getClosedDates();
  let collected = 0;
  for (let i = 1; i <= 21 && collected < BOOKING_DAYS; i++) {
    const d = new Date(today); d.setDate(today.getDate() + i);
    const ds = getLocalDate(i);
    if (WORK_DAYS.includes(d.getDay()) && !closed.includes(ds)) {
      dates.push({ date: ds, name: `${dayNames[d.getDay()]} - ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}` });
      collected++;
    }
  }
  return dates;
};

const fmtApt = (list) => {
  if (!Array.isArray(list) || !list.length) return 'لا توجد مواعيد.';
  return list.map((a, i) => {
    const d = new Date(a.date);
    return `👤 ${i + 1}. ${a.name || 'غير مسجل'} | 📅 ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} | 🩺 ${a.symptom || '-'}`;
  }).join('\n');
};

const handleWebhook = async (from, text, rawMsg, isReady, jidType = 'whatsapp') => {
  try {
    if (!isReady) return;
    const clean = cleanPhone(from);
    const isDr = DOCTOR_NUMBERS.includes(clean);
    const currentFee = db.getFee();
    const input = text.trim();
    let sess = sessions.get(from) || { step: 'idle' };

    // 🔒 أولاً: معالجة الخطوات النشطة (أولوية قصوى لمنع التداخل واللوب)
    if (sess.step !== 'idle') {
      // 💰 دكتور: تغيير السعر
      if (sess.step === 'dr_set_fee') {
        const fee = parseNum(input);
        if (isNaN(fee) || fee < 0 || fee > 10000) return sendMessage(from, `⚠️ يرجى إرسال رقم صحيح للسعر (0-10000).`);
        db.setFee(fee);
        sessions.delete(from);
        console.log(`💰 تم تحديث سعر الكشف لـ ${fee} من قبل الدكتور ${clean}`);
        return sendMessage(from, `✅ تم تحديث سعر الكشف إلى ${fee} ج.م بنجاح.\n\n${FOOTER}`);
      }
      // 🗑️ دكتور: تأكيد إلغاء يوم
      if (sess.step === 'dr_confirm_cancel' && ['تأكيد', 'نعم', 'موافق'].some(w => input.includes(w))) {
        const d = sess.targetDate || getLocalDate(0);
        const apts = await db.getAppointments(d);
        let c = 0;
        const apology = `⚠️ اعتذار من عيادة قطب\nتم إلغاء جميع مواعيد يوم ${d} لظروف طارئة. نعتذر ونرجو التواصل.\n\n${FOOTER}`;
        for (const a of apts) { try { await sendMessage(a.full_jid || a.phone, apology); c++; await new Promise(r => setTimeout(r, 500)); } catch (e) { } }
        await db.cancelAllAppointments(d); db.closeDate(d);
        sessions.delete(from);
        return sendMessage(from, `✅ تم إلغاء اليوم وإرسال اعتذار لـ ${c} مريض.`);
      }
      // 📅 دكتور: اختيار يوم للإلغاء
      if (sess.step === 'dr_select_cancel') {
        const num = parseNum(input);
        const normInput = normalizeArabic(input);
        let sel = (num >= 1 && num <= sess.cancelDays.length) ? sess.cancelDays[num - 1] : sess.cancelDays.find(x => normalizeArabic(x.name).includes(normInput) || normInput.includes(normalizeArabic(x.name.split(' ')[0])));
        if (!sel) return sendMessage(from, `⚠️ اختر يوم صحيح.`);
        sess.targetDate = sel.date; sess.step = 'dr_confirm_cancel'; sessions.set(from, sess);
        return sendMessage(from, `⚠️ تأكيد إلغاء يوم ${sel.name}؟\nاكتب "تأكيد".`);
      }

      // 🧑 مريض: اختيار اليوم
      if (sess.step === 'select_date') {
        if (!Array.isArray(sess.dates)) { sessions.delete(from); return sendMessage(from, `⚠️ انتهت الجلسة، اكتب "حجز" للبدء.`); }
        const num = parseNum(input);
        const normInput = normalizeArabic(input);
        let sel = (num >= 1 && num <= sess.dates.length) ? sess.dates[num - 1] : sess.dates.find(d => normalizeArabic(d.name).includes(normInput) || normInput.includes(normalizeArabic(d.name.split(' ')[0])));
        if (!sel) return sendMessage(from, `⚠️ اكتب رقم اليوم أو اسمه بدقة (مثال: 3 أو الاربعاء).\n\n${FOOTER}`);
        sess.selectedDate = sel.date; sess.step = 'c_name'; sessions.set(from, sess);
        return sendMessage(from, `📅 تم اختيار يوم ${sel.name}\n✍️ اكتب اسمك الكامل:`);
      }
      // 🧑 مريض: الاسم
      if (sess.step === 'c_name') {
        if (input.length < 2) return sendMessage(from, `⚠️ الاسم قصير.`);
        sess.name = input; sess.step = 'c_age'; sessions.set(from, sess);
        return sendMessage(from, `📅 اكتب عمرك:`);
      }
      // 🧑 مريض: العمر
      if (sess.step === 'c_age') {
        const age = parseNum(input);
        if (isNaN(age) || age < 1 || age > 120) return sendMessage(from, `⚠️ العمر غير صحيح.`);
        sess.age = age; sess.step = 'c_sym'; sessions.set(from, sess);
        return sendMessage(from, `🩺 اكتب الشكوى الطبية:`);
      }
      // 🧑 مريض: الشكوى
      if (sess.step === 'c_sym') {
        if (input.length < 3) return sendMessage(from, `⚠️ وضّح الشكوى أكثر.`);
        sess.symptom = input;
        await db.addAppointment({ phone: clean, full_jid: from, jid_type: jidType, name: sess.name, age: sess.age, symptom: sess.symptom, date: sess.selectedDate, status: 'confirmed' });
        sessions.delete(from);
        const conf = `✅ تم الحجز بنجاح!\n👤 ${sess.name}\n📅 ${sess.selectedDate}\n💰 ${currentFee} ج.م\n🩺 ${sess.symptom}\n\nنتمنى لك الشفاء العاجل\n\nعنوان العياده:\n\n٢٠٥ برج الندي شارع ٢٦ يوليو اسفنكس البرج فوق اشرفكو للإطارات \n\n موقع العياده في خرائط جوجل: \n\n https://share.google/GtXVGQ7uWvqAcdyzD.\n${FOOTER}`;
        await sendMessage(from, conf);
        if (DOCTOR_NUMBERS.length) {
          const msg = `🔔 حجز جديد\n👤 ${sess.name}\n📅 ${sess.selectedDate}\n🩺 ${sess.symptom}`;
          for (const doc of DOCTOR_NUMBERS) sendMessage(doc, msg).catch(() => { });
        }
        return;
      }
    }

    // 🤖 تحليل ذكي (يعمل فقط لو الجلسة خالية)
    const ai = await parseWithAI(input) || { intent: 'unknown', extracted: {} };
    if (ai.extracted.name) sess.name = ai.extracted.name;
    if (ai.extracted.age) sess.age = ai.extracted.age;
    if (ai.extracted.symptom) sess.symptom = ai.extracted.symptom;
    if (ai.extracted.day_hint) sess.dayHint = ai.extracted.day_hint;

    let intent = ai.intent || 'unknown';
    if (intent === 'unknown') {
      if (/حجز|ميعاد/.test(input)) intent = 'book';
      else if (/الغاء|إلغاء|مسح|حذف|عايز الغي|الغي/.test(input)) intent = 'cancel';
      else if (/سعر|كشف|تكلفة/.test(input)) intent = 'info';
      else if (/تعديل|تغيير|غير/.test(input)) intent = 'modify';
      else if (/مرحبا|هلو|سلام/.test(input)) intent = 'greeting';
    }

    // 🚫 الإلغاء الذاتي الفوري
    if (intent === 'cancel') {
      const active = await db.getActiveBooking(clean);
      if (!active) return sendMessage(from, `ℹ️ ليس لديك حجز نشط حالياً.\n\n${FOOTER}`);
      await db.deleteAppointment(clean);
      sessions.delete(from);
      return sendMessage(from, `✅ تم إلغاء حجزك بنجاح.\nيمكنك الحجز مرة أخرى الآن.\n\n${FOOTER}`);
    }

    // 🩺 أوامر الدكتور (فقط لو الجلسة خالية)
    if (isDr) {
      if (/عرض اليوم|مواعيد اليوم|📅/.test(input)) return sendMessage(from, `📅 اليوم (${getLocalDate(0)}):\n${fmtApt(await db.getTodayAppointments())}\n\n${FOOTER}`);
      if (/كل المواعيد|الكل|📋/.test(input)) { const all = await db.getUpcomingAppointments(); return sendMessage(from, `📋 كل المواعيد:\n${fmtApt(all)}\n\n${FOOTER}`); }
      if (/إلغاء اليوم|❌/.test(input)) {
        const today = await db.getTodayAppointments();
        if (!today.length) return sendMessage(from, `⚠️ لا توجد مواعيد اليوم.`);
        sess = { step: 'dr_confirm_cancel', targetDate: getLocalDate(0) };
        sessions.set(from, sess);
        return sendMessage(from, `⚠️ تأكيد إلغاء اليوم؟ اكتب "تأكيد".`);
      }
      if (/يوم محدد|🗑️/.test(input)) {
        const up = await db.getUpcomingAppointments();
        if (!up.length) return sendMessage(from, `⚠️ لا توجد حجوزات.`);
        const map = {}; up.forEach(a => (map[a.date] ||= []).push(a));
        const days = Object.keys(map).sort().map((d, i) => {
          const dt = new Date(d);
          return { date: d, name: `${dayNames[dt.getDay()]} - ${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()} (${map[d].length} حجز)` };
        });
        sess = { step: 'dr_select_cancel', cancelDays: days };
        sessions.set(from, sess);
        let m = `🗑️ اختر اليوم:\n`; days.forEach((d, i) => m += `${i + 1}. ${d.name}\n`);
        return sendMessage(from, m + `\n${FOOTER}`);
      }
      if (/السعر|💰/.test(input)) {
        sess = { step: 'dr_set_fee' };
        sessions.set(from, sess);
        return sendMessage(from, `💰 سعر الكشف الحالي: ${currentFee} ج.م\nيرجى إرسال السعر الجديد (رقم فقط):`);
      }
      const up = await db.getUpcomingAppointments();
      const sum = up.length ? fmtApt(up.slice(0, 3)) : 'لا توجد.';
      return sendMessage(from, `‍⚕️ لوحة الدكتور:\n${sum}\n\nاختر:`, [
        { label: '🗑️ يوم محدد' }, { label: '💰 تغيير السعر' }
      ]);
    }

    // 🧑 منطق المريض (ذكي + يمنع التكرار)
    const activeBooking = await db.getActiveBooking(clean);
    if (activeBooking && (intent === 'book' || intent === 'greeting')) {
      return sendMessage(from, `⛔ لديك حجز نشط بالفعل ليوم ${activeBooking.date}.\nيرجى إلغاءه أولاً أو الانتظار حتى ينتهي ميعاده.\n\n${FOOTER}`);
    }

    if (intent === 'book' || intent === 'greeting' || input.length < 4) {
      if (activeBooking) return sendMessage(from, `⛔ لديك حجز نشط: ${activeBooking.date}\nاكتب "إلغاء" لحذفه ثم الحجز مجدداً.\n\n${FOOTER}`);
      const dates = await getAvailableDates();
      if (!dates.length) return sendMessage(from, `❌ لا توجد أيام متاحة.\n\n${FOOTER}`);

      let m = `🏥 ${CLINIC}\nاختر يوم:\n`;
      dates.forEach((d, i) => m += `${i + 1}. ${d.name}\n`);
      sess = { step: 'select_date', dates };
      sessions.set(from, sess);
      return sendMessage(from, m + `\n${FOOTER}`);
    }

    if (intent === 'info') return sendMessage(from, `📋 سعر الكشف: ${currentFee} ج.م\n📍 ${process.env.CLINIC_ADDRESS || ''}\n\n${FOOTER}`);
    sendMessage(from, `🤔 اكتب "حجز" أو "إلغاء" أو "سعر"\n\n${FOOTER}`);
  } catch (e) {
    console.error('❌ Error:', e.message);
    sendMessage(from, `⚠️ خطأ مؤقت، حاول لاحقاً.`).catch(() => { });
  }
};

module.exports = { handleWebhook };