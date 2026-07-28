const MONTHS_GENITIVE = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
];

/**
 * Принимает дату в форматах "DD.MM.YYYY", "YYYY-MM-DD" или Date — отдаёт
 * "19 мая 2026 г.". Невалидный вход → пустая строка.
 */
export function formatDateRu(input: string | Date | null | undefined): string {
  if (!input) return "";
  let day: number;
  let month: number;
  let year: number;
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) return "";
    day = input.getDate();
    month = input.getMonth();
    year = input.getFullYear();
  } else {
    const s = String(input).trim();
    let m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (m) {
      day = Number(m[1]);
      month = Number(m[2]) - 1;
      year = Number(m[3]);
    } else if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/))) {
      year = Number(m[1]);
      month = Number(m[2]) - 1;
      day = Number(m[3]);
    } else {
      return "";
    }
  }
  if (month < 0 || month > 11 || day < 1 || day > 31) return "";
  return `${day} ${MONTHS_GENITIVE[month]} ${year} г.`;
}
