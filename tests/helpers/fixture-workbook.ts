import ExcelJS from "exceljs";

/**
 * Synthetic workbook with the same layout as HEIST.xlsx, so tests do not
 * depend on the private event file. 3 teams × (5 scans + shared finish QR15).
 */

export type FixtureRow = { scan: string | number; copy: string; placement: string; clue: string; dest: string; next: string; extra?: string };
export type FixtureTeam = { n: number; start: { qr: string; location: string; riddle: string; answer: string }; rows: FixtureRow[]; sequence?: string[] };

const L = {
  noticeG: "L01 — Ground-floor noticeboard",
  corr1: "L02 — First-floor corridor",
  aqua1: "L03 — First-floor AquaGuard",
  corr2: "L04 — Second-floor corridor",
  notice2: "L05 — Second-floor noticeboard",
  corr4: "L08 — Fourth-floor corridor",
  desk: "L14 — Ground-floor Event Desk",
};

function route(n: number, ids: string[], places: string[]): FixtureRow[] {
  const finishPlace = L.desk;
  const all = [...ids, "QR15"];
  const allPlaces = [...places, finishPlace];
  return all.map((id, i) => {
    const isFinish = i === all.length - 1;
    const clueAction = id === "QR16" ? "MAGNET: You pull one point from your rival.\n" : id === "QR18" ? "BONUS: You gain +1 point.\n" : id === "QR17" ? "SUPER SHOES: You gain one extra hint for your next clue.\n" : "";
    return {
      scan: isFinish ? "Finish" : i + 1,
      copy: `${id}-T${n}`,
      placement: allPlaces[i]!,
      clue: isFinish
        ? "VAULT OPENED. You have completed THE HEIST. Report your finish to the Event Desk."
        : `${clueAction}Team ${n} clue ${i + 1}:\nseek the place beyond.`,
      dest: isFinish ? "FINISH" : allPlaces[i + 1]!,
      next: isFinish ? "—" : `${all[i + 1]}-T${n}`,
    };
  });
}

export function defaultFixture(): FixtureTeam[] {
  return [
    {
      n: 1,
      start: { qr: "QR01", location: "Ground-floor noticeboard", riddle: "Pinned but never imprisoned,\nRead but never replied.", answer: "Noticeboard" },
      rows: route(1, ["QR01", "QR16", "QR18", "QR17", "QR02"], [L.noticeG, L.corr1, L.aqua1, L.corr2, L.notice2]),
    },
    {
      n: 2,
      start: { qr: "QR03", location: "First-floor corridor", riddle: "I join doors together but hold no key.", answer: "Corridor" },
      rows: route(2, ["QR03", "QR18", "QR16", "QR17", "QR04"], [L.corr1, L.aqua1, L.corr2, L.notice2, L.corr4]),
    },
    {
      n: 3,
      start: { qr: "QR05", location: "First-floor AquaGuard", riddle: "I hum without a hymn.", answer: "AquaGuard" },
      rows: route(3, ["QR05", "QR17", "QR18", "QR16", "QR06"], [L.aqua1, L.corr2, L.notice2, L.corr4, L.noticeG]),
    },
  ];
}

export async function buildFixtureWorkbook(teams: FixtureTeam[] = defaultFixture()): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const maxLen = Math.max(...teams.map((t) => (t.sequence ?? t.rows.map((r) => r.copy.split("-")[0]!)).length));
  const seq = wb.addWorksheet("sequence sheet");
  seq.addRow(["Team", ...Array.from({ length: maxLen - 1 }, (_, i) => `Scan ${i + 1}`), "Finish"]);
  for (const t of teams) seq.addRow([`Team ${t.n}`, ...(t.sequence ?? t.rows.map((r) => r.copy.split("-")[0]!))]);
  seq.addRow([]);
  seq.addRow(["RULES"]);

  const start = wb.addWorksheet("Starting clues");
  start.addRow(["Team Name", "QR Code", "Location", "Riddle", "Answer"]);
  for (const t of teams) start.addRow([`Team ${t.n}`, t.start.qr, t.start.location, t.start.riddle, t.start.answer]);

  for (const t of teams) {
    const ws = wb.addWorksheet(`Team ${t.n}`);
    ws.addRow(["Team", "Scan", "QR copy", "Current placement", "Clue text", "Destination", "Next QR"]);
    for (const r of t.rows) ws.addRow([`T${t.n}`, r.scan, r.copy, r.placement, r.clue, r.dest, r.next, ...(r.extra ? [r.extra] : [])]);
  }
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}
