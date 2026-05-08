const fs = require('fs');
const path = require('path');
const DB_PATH = path.join(__dirname, 'data.json');
const TMP_PATH = path.join(__dirname, 'data.json.tmp');

let data = { appointments: [], settings: { clinic_fee: 200 }, closed_dates: [] };

const load = () => {
  try {
    if (fs.existsSync(DB_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
      data = parsed && Array.isArray(parsed.appointments) ? parsed : data;
      if (!data.settings) data.settings = { clinic_fee: 200 };
      if (!data.closed_dates) data.closed_dates = [];
    }
  } catch (e) { console.error('⚠️ خطأ تحميل:', e.message); }
};
const save = () => {
  try { fs.writeFileSync(TMP_PATH, JSON.stringify(data, null, 2), 'utf8'); fs.renameSync(TMP_PATH, DB_PATH); }
  catch (e) { console.error('❌ خطأ حفظ:', e.message); }
};
load();

const getLocalDate = (offset = 0) => {
  const d = new Date(); d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

module.exports = {
  initDB: async () => console.log('✅ الداتا بيس المحلية جاهزة'),
  getLocalDate,
  getFee: () => data.settings.clinic_fee,
  setFee: (f) => { data.settings.clinic_fee = f; save(); },
  getClosedDates: () => data.closed_dates,
  closeDate: (date) => { const d = date.split('T')[0]; if (!data.closed_dates.includes(d)) { data.closed_dates.push(d); save(); } },
  addAppointment: async (a) => { a.date = a.date.split('T')[0]; data.appointments.push(a); save(); },
  getAppointments: async (date) => data.appointments.filter(a => a.date === date.split('T')[0] && a.status === 'confirmed'),
  getAppointmentByPhone: async (phone) => data.appointments.find(a => a.phone === phone && a.status === 'confirmed'),

  // ✅ دالة جديدة: تجلب فقط الحجز النشط (تاريخ مستقبلي أو اليوم)
  getActiveBooking: async (phone) => {
    const today = getLocalDate(0);
    return data.appointments.find(a => a.phone === phone && a.date >= today && a.status === 'confirmed');
  },

  deleteAppointment: async (phone) => { data.appointments = data.appointments.filter(a => a.phone !== phone || a.status !== 'confirmed'); save(); },
  cancelAllAppointments: async (date) => { const d = date.split('T')[0]; data.appointments = data.appointments.filter(a => a.date !== d || a.status !== 'confirmed'); save(); },
  getTodayAppointments: async () => { const t = getLocalDate(0); return data.appointments.filter(a => a.date === t && a.status === 'confirmed'); },
  getUpcomingAppointments: async () => { const t = getLocalDate(0); return data.appointments.filter(a => a.date >= t && a.status === 'confirmed').sort((a, b) => a.date.localeCompare(b.date)); },
  getWeeklyAppointments: async () => { const t = getLocalDate(0); const end = getLocalDate(7); return data.appointments.filter(a => a.date >= t && a.date <= end && a.status === 'confirmed').sort((a, b) => a.date.localeCompare(b.date)); }
};