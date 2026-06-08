export type Timeframe = "tonight" | "next_2_days" | "this_week";

/**
 * Returns the current date in 'America/New_York' timezone as a naive UTC Date object.
 * This allows doing standard Date math (like setHours, setDate) while respecting NYC calendar boundaries.
 */
function getNaiveNYCDate(date: Date = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
  }).formatToParts(date);

  const getPart = (type: string) =>
    parseInt(parts.find((p) => p.type === type)?.value || "0", 10);

  // Note: formatToParts might return hour=24 for midnight in some Node versions, handle safely:
  let hour = getPart("hour");
  if (hour === 24) hour = 0;

  return new Date(
    Date.UTC(
      getPart("year"),
      getPart("month") - 1,
      getPart("day"),
      hour,
      getPart("minute"),
      getPart("second")
    )
  );
}

/**
 * Converts a naive NYC UTC Date back to a real Date object by subtracting the offset.
 */
function naiveNYCToRealDate(naiveDate: Date, realNow: Date, naiveNow: Date): Date {
  const offsetMs = naiveNow.getTime() - realNow.getTime();
  return new Date(naiveDate.getTime() - offsetMs);
}

export function getTonightRange() {
  const now = new Date();
  const naiveNow = getNaiveNYCDate(now);
  
  const naiveEnd = new Date(naiveNow.getTime());
  // 4:00 AM the following calendar day
  naiveEnd.setUTCDate(naiveEnd.getUTCDate() + 1);
  naiveEnd.setUTCHours(4, 0, 0, 0);

  return {
    start: now,
    end: naiveNYCToRealDate(naiveEnd, now, naiveNow),
  };
}

export function getNextTwoDaysRange() {
  const now = new Date();
  const naiveNow = getNaiveNYCDate(now);
  
  const naiveEnd = new Date(naiveNow.getTime());
  // 11:59:59 PM tomorrow
  naiveEnd.setUTCDate(naiveEnd.getUTCDate() + 1);
  naiveEnd.setUTCHours(23, 59, 59, 999);

  return {
    start: now,
    end: naiveNYCToRealDate(naiveEnd, now, naiveNow),
  };
}

export function getThisWeekRange() {
  const now = new Date();
  const naiveNow = getNaiveNYCDate(now);
  
  const naiveEnd = new Date(naiveNow.getTime());
  // 11:59:59 PM on the upcoming Sunday.
  // If today IS Sunday, roll to next Sunday (7 days ahead) so the filter
  // covers the full coming week rather than ending in a few hours.
  const currentDayOfWeek = naiveEnd.getUTCDay(); // 0 = Sunday, 1 = Monday
  const daysUntilSunday = currentDayOfWeek === 0 ? 7 : 7 - currentDayOfWeek;
  
  naiveEnd.setUTCDate(naiveEnd.getUTCDate() + daysUntilSunday);
  naiveEnd.setUTCHours(23, 59, 59, 999);

  return {
    start: now,
    end: naiveNYCToRealDate(naiveEnd, now, naiveNow),
  };
}

export function getTimeframeRange(timeframe: Timeframe) {
  switch (timeframe) {
    case "tonight":
      return getTonightRange();
    case "next_2_days":
      return getNextTwoDaysRange();
    case "this_week":
      return getThisWeekRange();
    default:
      return getTonightRange();
  }
}
