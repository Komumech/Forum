// Standardized iCalendar (.ics) generation and calendar integration
export interface CalendarEventDetails {
  title: string;
  description?: string;
  location?: string;
  startTime: Date;
  endTime?: Date;
  roomId?: string;
  organizerName?: string;
  organizerEmail?: string;
}

export function generateICSContent(event: CalendarEventDetails): string {
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  
  const formatDateToICS = (date: Date): string => {
    return (
      date.getUTCFullYear().toString() +
      pad(date.getUTCMonth() + 1) +
      pad(date.getUTCDate()) +
      'T' +
      pad(date.getUTCHours()) +
      pad(date.getUTCMinutes()) +
      pad(date.getUTCSeconds()) +
      'Z'
    );
  };

  const startStr = formatDateToICS(event.startTime);
  const end = event.endTime || new Date(event.startTime.getTime() + 60 * 60 * 1000);
  const endStr = formatDateToICS(end);
  const nowStr = formatDateToICS(new Date());
  const uid = `${event.roomId || Math.random().toString(36).substring(2, 10)}_${Date.now()}@komu.forum`;

  const cleanText = (str?: string) => (str ? str.replace(/\n/g, '\\n').replace(/,/g, '\\,') : '');

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Remix Forum//Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${nowStr}`,
    `DTSTART:${startStr}`,
    `DTEND:${endStr}`,
    `SUMMARY:${cleanText(event.title || 'Forum Meeting')}`,
    `DESCRIPTION:${cleanText(event.description || `Join Forum Meeting: ${event.location || ''}`)}`,
    `LOCATION:${cleanText(event.location || '')}`,
    'STATUS:CONFIRMED',
    'TRANSP:OPAQUE',
    'END:VEVENT',
    'END:VCALENDAR'
  ];

  return lines.join('\r\n');
}

export function downloadICSFile(event: CalendarEventDetails, fileName = 'meeting-invite.ics') {
  const icsData = generateICSContent(event);
  const blob = new Blob([icsData], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function getGoogleCalendarUrl(event: CalendarEventDetails): string {
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  const formatDate = (date: Date) =>
    date.getUTCFullYear().toString() +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    'T' +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds()) +
    'Z';

  const end = event.endTime || new Date(event.startTime.getTime() + 60 * 60 * 1000);
  const dates = `${formatDate(event.startTime)}/${formatDate(end)}`;
  
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title || 'Forum Meeting',
    dates,
    details: event.description ? `${event.description}\n\nMeeting link: ${event.location || ''}` : `Join Forum meeting: ${event.location || ''}`,
    location: event.location || ''
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
