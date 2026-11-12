/**
 * Utilidades de horario. NO contienen horarios: reciben el objeto que entrega la fuente de datos
 *   { timezone?, weekly: [{ days: [0..6], open: 'HH:MM', close: 'HH:MM' }] }   (0 = domingo)
 * Si close <= open, se entiende que cierra pasada la medianoche ('00:00' equivale a 24:00).
 */
const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DOW = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

const toMin = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + (m || 0);
};

/** Fecha y hora local en la zona indicada: { date: 'YYYY-MM-DD', dow, minutes }. */
function localParts(date, timeZone) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, dow: DOW[p.weekday], minutes: Number(p.hour) * 60 + Number(p.minute) };
}

function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return { date: d.toISOString().slice(0, 10), dow: d.getUTCDay(), day: d.getUTCDate(), month: d.getUTCMonth() };
}

function intervalsForDow(hours, dow) {
  const out = [];
  for (const w of hours?.weekly || []) {
    if (!w.days.includes(dow)) continue;
    const open = toMin(w.open);
    let close = toMin(w.close);
    if (close <= open) close += 1440;
    out.push({ open, close });
  }
  return out.sort((a, b) => a.open - b.open);
}

function isOpenAt(hours, parts) {
  for (const iv of intervalsForDow(hours, parts.dow)) if (parts.minutes >= iv.open && parts.minutes < iv.close) return true;
  for (const iv of intervalsForDow(hours, (parts.dow + 6) % 7)) if (iv.close > 1440 && parts.minutes + 1440 < iv.close) return true;
  return false;
}

function formatTime(min) {
  const h = Math.floor(min / 60) % 24;
  const m = String(min % 60).padStart(2, '0');
  return `${h % 12 || 12}:${m} ${h < 12 ? 'a. m.' : 'p. m.'}`;
}

const formatIntervals = (ivs) => (ivs.length ? ivs.map((i) => `${formatTime(i.open)} a ${formatTime(i.close)}`).join(' y ') : 'cerrado');

/** Texto del horario semanal, agrupando los días que comparten horario. */
function formatWeekly(hours) {
  const groups = new Map();
  for (let dow = 1; dow <= 7; dow++) {
    const d = dow % 7; // lunes primero
    const text = formatIntervals(intervalsForDow(hours, d));
    groups.set(text, [...(groups.get(text) || []), DAYS[d]]);
  }
  if (groups.size === 1) return [`Todos los días: ${[...groups.keys()][0]}`];
  return [...groups].map(([text, days]) => `${days.join(', ')}: ${text}`);
}

/** Horas de inicio posibles (en minutos desde medianoche) para un día. Solo empiezan antes de las 24:00. */
function slotsFor(hours, dow, { slotMinutes, leadMinutes, nowMinutes = null }) {
  const out = [];
  for (const iv of intervalsForDow(hours, dow)) {
    for (let t = iv.open; t <= iv.close - slotMinutes && t < 1440; t += slotMinutes) {
      if (nowMinutes !== null && t < nowMinutes + leadMinutes) continue;
      out.push(t);
    }
  }
  return out;
}

/** Fechas con al menos un horario disponible para reservar, a partir de hoy. */
function dateOptions(hours, nowParts, opts) {
  const out = [];
  for (let i = 0; i <= opts.daysAhead; i++) {
    const d = addDays(nowParts.date, i);
    const slots = slotsFor(hours, d.dow, { ...opts, nowMinutes: i === 0 ? nowParts.minutes : null });
    if (!slots.length) continue;
    const label = i === 0 ? 'Hoy' : i === 1 ? 'Mañana' : `${DAYS[d.dow]} ${d.day} ${MONTHS[d.month]}`;
    out.push({ date: d.date, dow: d.dow, label, slots });
  }
  return out;
}

module.exports = { localParts, isOpenAt, formatTime, formatWeekly, dateOptions, slotsFor, toMin, addDays, DAYS, MONTHS };
