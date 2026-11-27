// Consultation schedule. Pure module: the booking island renders from it and the API validates against it.
// Iran has had no daylight saving since 2022, so Tehran time is a fixed UTC+03:30.

export const CONSULT = {
  daysAhead: 8, // bookable days, starting tomorrow
  closedWeekday: 5, // Friday (0 = Sunday)
  slots: ['10:00', '10:30', '11:00', '11:30', '12:00', '14:00', '14:30', '15:00', '16:00', '17:00', '18:00', '19:00'],
  maxUpcomingPerCustomer: 2,
  types: [
    { id: 'video', name: 'تماس تصویری', len: '۱۵ دقیقه', desc: 'کارشناس پوست شما را زیر نور طبیعی می‌بیند و دقیق‌ترین پیشنهاد را می‌دهد.' },
    { id: 'phone', name: 'تماس صوتی', len: '۱۵ دقیقه', desc: 'برای سؤال‌های مشخص درباره‌ی روتین یا ترکیبات.' },
    { id: 'chat', name: 'چت متنی', len: 'تا ۳۰ دقیقه', desc: 'با ارسال عکس، بدون نیاز به تماس.' },
  ],
  topics: ['ساختن روتین از صفر', 'آکنه و جوش', 'لک و ناهمرنگی', 'شروع رتینوئید', 'پوست حساس و قرمزی', 'سایر'],
} as const;

export const KIND_LABEL: Record<string, string> = Object.fromEntries(CONSULT.types.map((t) => [t.id, t.name]));

const TZ = '+03:30';
/** YYYY-MM-DD of a date in Tehran. */
export const tehranDate = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(d);
export const slotDate = (day: string, time: string) => new Date(`${day}T${time}:00${TZ}`);

/** The bookable days (YYYY-MM-DD), tomorrow onwards, with Fridays marked closed. */
export function bookableDays(now = new Date()) {
  const today = new Date(`${tehranDate(now)}T12:00:00${TZ}`);
  return Array.from({ length: CONSULT.daysAhead }, (_, i) => {
    const d = new Date(today.getTime() + (i + 1) * 86400_000);
    const day = tehranDate(d);
    const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
    return { day, closed: weekday === CONSULT.closedWeekday };
  });
}

/** True if `iso` is exactly one of the offered slots on an open, bookable day. */
export function isBookableSlot(iso: string, now = new Date()) {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return false;
  return bookableDays(now).some(({ day, closed }) => !closed && CONSULT.slots.some((t) => slotDate(day, t).getTime() === at.getTime()));
}

export const bookingCode = (id: number) => `CN-${String(id).padStart(4, '0')}`;
