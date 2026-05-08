const AI_TIMEOUT = 3000;
const SYSTEM_PROMPT = `أنت مساعد ذكي لإدارة عيادة طبية. مهمتك فهم نية العميل واستخراج البيانات بدقة من أي صياغة عربية (فصحى أو عامية).
أرجع JSON فقط بهذه الصيغة الدقيقة:
{
  "intent": "book|cancel|info|contact|modify|unknown",
  "extracted": { "name": null, "age": null, "symptom": null, "day_hint": null }
}
قواعد صارمة:
- intent: book (طلب حجز/ميعاد), cancel (إلغاء/مسح/عايز الغي), info (سعر/عنوان/مواعيد), modify (تعديل), contact (تواصل), unknown.
- استخرج الاسم، العمر، الشكوى، أو اليوم المذكور حتى لو كان ضمن جملة طويلة أو عامية مثل "عايز احجز يوم الاتنين الجاي لصداع".
- إذا لم يذكر شيء، اتركه null. لا تخترع بيانات.
- افهم السياق الضمني: "معايا حجز عايز امسحه" -> cancel, "كام سعر الكشف" -> info.
- لا تخرج أي نص خارج JSON.`;

async function parseWithAI(text) {
  if (!process.env.GROQ_API_KEY) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT);
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: text }],
        temperature: 0.2, max_tokens: 180, response_format: { type: 'json_object' }
      }),
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return JSON.parse(data.choices?.[0]?.message?.content || '{}');
  } catch (e) {
    console.warn(`⚠️ AI غير متاح (${e.message})`);
    return null;
  }
}
module.exports = { parseWithAI };