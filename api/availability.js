const { google } = require('googleapis');

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://www.tudatero.com');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  const { year, month } = req.query;
  if (!year || !month) return res.status(400).json({ error: 'year y month requeridos' });

  const y = parseInt(year);
  const m = parseInt(month) - 1; // 0-indexed

  try {
    const auth = new google.auth.JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/calendar'],
      subject: process.env.GOOGLE_CALENDAR_ID,
    });

    const calendar = google.calendar({ version: 'v3', auth });

    const timeMin = new Date(y, m, 1, 0, 0, 0).toISOString();
    const timeMax = new Date(y, m + 1, 0, 23, 59, 59).toISOString();

    const freebusyRes = await calendar.freebusy.query({
      resource: {
        timeMin,
        timeMax,
        timeZone: 'America/Argentina/Buenos_Aires',
        items: [{ id: process.env.GOOGLE_CALENDAR_ID }],
      },
    });

    const busy = freebusyRes.data.calendars[process.env.GOOGLE_CALENDAR_ID].busy || [];

    // Build map: { "YYYY-MM-DD": ["09:00", "10:30", ...] }
    const busyByDay = {};
    const daysInMonth = new Date(y, m + 1, 0).getDate();

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${y}-${String(m + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const slots = [];

      for (let h = 9; h < 18; h++) {
        for (let min = 0; min < 60; min += 30) {
          if (h === 17 && min === 30) break;
          const slotStart = new Date(`${dateStr}T${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}:00-03:00`);
          const slotEnd = new Date(slotStart.getTime() + 30 * 60 * 1000);
          const isBusy = busy.some(b => slotStart < new Date(b.end) && slotEnd > new Date(b.start));
          if (isBusy) slots.push(`${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}`);
        }
      }

      if (slots.length > 0) busyByDay[dateStr] = slots;
    }

    res.status(200).json({ busyByDay });
  } catch (error) {
    console.error('Availability error:', error.message);
    res.status(200).json({ busyByDay: {} });
  }
}
