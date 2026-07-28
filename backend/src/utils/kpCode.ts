/** Дополнение нулями слева: 1 → «001» при width=3. Числа шире width не обрезаются. */
export function padKpPart(
  value: number | null | undefined,
  width: number
): string {
  if (value == null || !Number.isFinite(value)) return "";
  return String(Math.trunc(value)).padStart(width, "0");
}

/**
 * Код КП: «КП-001-07»
 * — порядковый номер КП пользователя (3 цифры)
 * — employee_number владельца в компании (2 цифры)
 */
export function formatKpCode(
  kpNumber: number | null | undefined,
  employeeNumber: number | null | undefined
): string {
  const kp = padKpPart(kpNumber, 3);
  const emp = padKpPart(employeeNumber, 2);
  if (!kp || !emp) return "";
  return `КП-${kp}-${emp}`;
}

/**
 * Извлекает порядковый номер КП из поисковой строки.
 * Понимает «12», «012», «КП-012», «КП-012-07».
 */
export function parseKpNumberFromQuery(q: string): number | null {
  const trimmed = q.trim();
  if (!trimmed) return null;
  const m = /(?:^|\b)(?:КП[-\s]?)?(\d{1,6})(?:\b|$)/i.exec(trimmed);
  if (!m) return null;
  const n = Number.parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}
