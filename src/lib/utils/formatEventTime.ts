/**
 * Event time formatting pinned to New York time.
 *
 * Formatting in a fixed timezone (rather than the runtime's local zone) makes
 * server and client render identical strings, which avoids hydration
 * mismatches, and shows NYC times even to someone browsing from elsewhere.
 */
const NYC_TIME_ZONE = "America/New_York";

const clockFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: NYC_TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

const dayKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: NYC_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const hourFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: NYC_TIME_ZONE,
  hour: "numeric",
  hourCycle: "h23",
});

const shortDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: NYC_TIME_ZONE,
  weekday: "short",
  month: "short",
  day: "numeric",
});

const longDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: NYC_TIME_ZONE,
  weekday: "long",
  month: "long",
  day: "numeric",
});

const weekdayFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: NYC_TIME_ZONE,
  weekday: "long",
});

const EVENING_START_HOUR = 17;

export interface ClockTimeParts {
  /** e.g. "8:30" */
  clock: string;
  /** "am" or "pm" */
  meridiem: string;
}

function toDate(value: Date | string): Date {
  return typeof value === "string" ? new Date(value) : value;
}

export function formatClockTimeParts(value: Date | string): ClockTimeParts {
  const parts = clockFormatter.formatToParts(toDate(value));
  const hour = parts.find((part) => part.type === "hour")?.value ?? "";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
  const dayPeriod = parts.find((part) => part.type === "dayPeriod")?.value ?? "";
  return { clock: `${hour}:${minute}`, meridiem: dayPeriod.toLowerCase() };
}

export function formatClockTime(value: Date | string): string {
  const { clock, meridiem } = formatClockTimeParts(value);
  return `${clock} ${meridiem}`;
}

/** Calendar day in New York, as a sortable "YYYY-MM-DD" key. */
export function getNycDayKey(value: Date | string): string {
  return dayKeyFormatter.format(toDate(value));
}

/** Hour of day in New York, 0–23. */
export function getNycHour(value: Date | string): number {
  return Number(hourFormatter.format(toDate(value))) % 24;
}

/** "8pm", "12am" — the label for an hour band in the feed. */
export function formatHourBandLabel(hour: number): string {
  const meridiem = hour < 12 ? "am" : "pm";
  const displayHour = hour % 12 || 12;
  return `${displayHour}${meridiem}`;
}

/** "Tonight", "Today", "Tomorrow", or a short date like "Tue, Sep 30". */
export function describeRelativeDay(value: Date | string, now: Date = new Date()): string {
  const eventDate = toDate(value);
  const eventDayKey = getNycDayKey(eventDate);
  const todayKey = getNycDayKey(now);
  const tomorrowKey = getNycDayKey(new Date(now.getTime() + 24 * 60 * 60 * 1000));

  if (eventDayKey === todayKey) {
    return getNycHour(eventDate) >= EVENING_START_HOUR ? "Tonight" : "Today";
  }
  if (eventDayKey === tomorrowKey) return "Tomorrow";
  return shortDateFormatter.format(eventDate);
}

export function formatShortDate(value: Date | string): string {
  return shortDateFormatter.format(toDate(value));
}

export function formatLongDate(value: Date | string): string {
  return longDateFormatter.format(toDate(value));
}

export function formatWeekday(value: Date | string): string {
  return weekdayFormatter.format(toDate(value));
}
