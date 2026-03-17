const { google } = require('googleapis');

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://www.tudatero.com');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  const { date } = req.query;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'date requerida (YYYY-MM-DD)' });
  }

  try {
    const auth = new google.auth.JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/calendar'],
      subject: process.env.GOOGLE_CALENDAR_ID,
    });

    const calendar = google.calendar({ version: 'v3', auth });

    const timeMin = new Date(`${date}T00:00:00-03:00`).toISOString();
    const timeMax = new Date(`${date}T23:59:59-03:00`).toISOString();

    const freebusyRes = await calendar.freebusy.query({
      resource: {
        timeMin,
        timeMax,
        timeZone: 'America/Argentina/Buenos_Aires',
        items: [{ id: process.env.GOOGLE_CALENDAR_ID }],
      },
    });

    const busy = freebusyRes.data.calendars[process.env.GOOGLE_CALENDAR_ID].busy || [];

    const busySlots = [];
    for (let h = 9; h < 18; h++) {
      for (let m = 0; m < 60; m += 30) {
        if (h === 17 && m === 30) break;
        const slotStart = new Date(`${date}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00-03:00`);
        const slotEnd = new Date(slotStart.getTime() + 30 * 60 * 1000);
        const isBusy = busy.some(b => slotStart < new Date(b.end) && slotEnd > new Date(b.start));
        if (isBusy) busySlots.push(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`);
      }
    }

    res.status(200).json({ busySlots });
  } catch (error) {
    console.error('Availability error:', error.message);
    res.status(200).json({ busySlots: [] });
  }
}
