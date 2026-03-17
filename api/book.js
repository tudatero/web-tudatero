const { google } = require('googleapis');

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://www.tudatero.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const { name, email, phone, date, time } = req.body;

  if (!name || !email || !date || !time) {
    return res.status(400).json({ error: 'Faltan datos requeridos' });
  }

  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return res.status(400).json({ error: 'Email inválido' });
  }

  // Validate date is Mon-Fri
  const dayOfWeek = new Date(date + 'T12:00:00').getDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return res.status(400).json({ error: 'Solo se permiten días hábiles' });
  }

  // Validate time is within 09:00-17:30
  const [hours, minutes] = time.split(':').map(Number);
  if (hours < 9 || (hours === 17 && minutes > 30) || hours > 17) {
    return res.status(400).json({ error: 'Horario fuera de rango' });
  }

  try {
    const auth = new google.auth.JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/calendar'],
      subject: process.env.GOOGLE_CALENDAR_ID,
    });

    const calendar = google.calendar({ version: 'v3', auth });

    const startDateTime = new Date(`${date}T${time}:00-03:00`);
    const endDateTime = new Date(startDateTime.getTime() + 30 * 60 * 1000);

    const event = {
      summary: `Consulta · ${name}`,
      description: `Reunión agendada desde www.tudatero.com\n\nCliente: ${name}\nEmail: ${email}${phone ? `\nTeléfono: ${phone}` : ''}`,
      start: {
        dateTime: startDateTime.toISOString(),
        timeZone: 'America/Argentina/Buenos_Aires',
      },
      end: {
        dateTime: endDateTime.toISOString(),
        timeZone: 'America/Argentina/Buenos_Aires',
      },
      attendees: [{ email, displayName: name }],
      conferenceData: {
        createRequest: {
          requestId: `tudatero-${Date.now()}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      },
    };

    await calendar.events.insert({
      calendarId: process.env.GOOGLE_CALENDAR_ID,
      resource: event,
      sendUpdates: 'all',
      conferenceDataVersion: 1,
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Calendar API error:', error.message);
    return res.status(500).json({ error: 'No se pudo crear el evento. Intentá de nuevo.' });
  }
}
