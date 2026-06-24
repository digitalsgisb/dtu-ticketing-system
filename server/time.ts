const malaysiaDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kuala_Lumpur",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

export function malaysiaDate(offsetDays = 0) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return malaysiaDateFormatter.format(date);
}

export function malaysiaYear() {
  return Number.parseInt(malaysiaDate().slice(0, 4), 10);
}

export function malaysiaMonthStartUtc() {
  return `${malaysiaDate().slice(0, 7)}-01T00:00:00+08:00`;
}
