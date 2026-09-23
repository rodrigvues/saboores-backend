/**
 * Janela de temporada do ranking. O mês é SEMPRE o de São Paulo: o servidor roda
 * em UTC, e `new Date().getMonth()` viraria o mês três horas antes da hora.
 */
export const RANKING_TIMEZONE = "America/Sao_Paulo";

export type MonthWindow = {
  /** 'YYYY-MM' no fuso da temporada. */
  period: string;
  /** Instante UTC do dia 1º 00:00:00 local. Inclusivo. */
  start: Date;
  /** Instante UTC do dia 1º 00:00:00 local do mês seguinte. EXCLUSIVO. */
  end: Date;
};

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: RANKING_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

type LocalParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

/** Relógio de parede de São Paulo no instante dado. */
function localParts(date: Date): LocalParts {
  const found: Record<string, number> = {};
  for (const part of partsFormatter.formatToParts(date)) {
    if (part.type !== "literal") found[part.type] = Number(part.value);
  }
  return {
    year: found.year!,
    month: found.month!,
    day: found.day!,
    hour: found.hour!,
    minute: found.minute!,
    second: found.second!,
  };
}

/** Quanto o relógio local está à frente do UTC neste instante, em ms (SP = -3h). */
function zoneOffsetMs(date: Date): number {
  const p = localParts(date);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asIfUtc - date.getTime();
}

/** Instante UTC da meia-noite local do dia 1º. Dois passos porque o offset pode
 *  mudar entre o palpite e o instante real (horário de verão histórico). */
function zonedMonthStart(year: number, month: number): Date {
  const guess = Date.UTC(year, month - 1, 1, 0, 0, 0);
  const firstPass = zoneOffsetMs(new Date(guess));
  const secondPass = zoneOffsetMs(new Date(guess - firstPass));
  return new Date(guess - secondPass);
}

function windowOf(year: number, month: number): MonthWindow {
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return {
    period: `${year}-${String(month).padStart(2, "0")}`,
    start: zonedMonthStart(year, month),
    end: zonedMonthStart(nextYear, nextMonth),
  };
}

/** Temporada a que o instante pertence. */
export function monthWindow(ref: Date = new Date()): MonthWindow {
  const { year, month } = localParts(ref);
  return windowOf(year, month);
}

/** Temporada anterior à do instante dado. */
export function previousMonthWindow(ref: Date = new Date()): MonthWindow {
  // 1 ms antes do início do mês corrente cai, com certeza, no mês anterior.
  return monthWindow(new Date(monthWindow(ref).start.getTime() - 1));
}

/** Janela de um período explícito ('YYYY-MM'). Não tem chamador nesta entrega:
 *  existe para o backfill futuro e é coberta pelo caso P9. */
export function windowOfPeriod(period: string): MonthWindow {
  const [year, month] = period.split("-").map(Number);
  return windowOf(year!, month!);
}

/** 'Setembro/2026'. Tabela fixa: não depende do ICU do runtime. */
export function monthLabel(period: string): string {
  const [year, month] = period.split("-");
  return `${MONTH_NAMES[Number(month) - 1] ?? period}/${year}`;
}

/** Último dia da temporada em dd/MM/yyyy, no fuso da temporada. */
export function lastDayLabel(window: MonthWindow): string {
  const p = localParts(new Date(window.end.getTime() - 1));
  return `${String(p.day).padStart(2, "0")}/${String(p.month).padStart(2, "0")}/${p.year}`;
}
