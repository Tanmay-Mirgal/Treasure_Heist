/**
 * Heuristics that estimate which location a riddle points at, so the
 * organizer can be warned when a clue appears to describe the QR's own
 * placement instead of its destination. These only produce warnings and
 * suggestions; they never change data.
 */

export type Floor = "ground" | "first" | "second" | "third" | "fourth" | "fifth" | "sixth";
export type Kind = "NOTICEBOARD" | "AQUAGUARD" | "CORRIDOR" | "LIFT" | "LIBRARY" | "EVENT_DESK";

const FLOOR_WORDS: Record<string, Floor> = {
  ground: "ground",
  first: "first",
  "1st": "first",
  second: "second",
  "2nd": "second",
  third: "third",
  "3rd": "third",
  fourth: "fourth",
  "4th": "fourth",
  fifth: "fifth",
  "5th": "fifth",
  sixth: "sixth",
  "6th": "sixth",
};

const KIND_PATTERNS: [Kind, RegExp][] = [
  ["EVENT_DESK", /event desk|desk where the whole hunt/i],
  ["LIBRARY", /library|author|thousands of voices/i],
  ["LIFT", /\blift\b|metal doors|lifting box|doors that sigh|carry you high|vertical boxes|lift without legs/i],
  ["NOTICEBOARD", /notice|letters linger|wall of words|pinned|paper hides paper|announce|paper people|hundred pins/i],
  ["AQUAGUARD", /aquaguard|machine|hum without|purif|dry throat|silent helper|serve without a plate|tireless role|guard a gift/i],
  ["CORRIDOR", /corridor|passage|neither room nor road|step by step|path that|walk my length|walk it end to end|doors stand|doors on my sides|join doors|connect the doors|connects one view/i],
];

export type ClueInfo = { floors: Set<Floor>; kinds: Set<Kind> };
export type LocInfo = { floor: Floor | null; kind: Kind | null };

/** Remove the leading "MAGNET: ..." / "BONUS: ..." reward sentence before analysis. */
export function stripActionSentence(text: string): string {
  return text.replace(/^[\s"“”']*(MAGNET|BONUS|SUPER\s*SHOES)\s*:[^.\n]*[.\n]/i, "").trim();
}

export function analyzeClue(text: string): ClueInfo {
  const body = stripActionSentence(text);
  const floors = new Set<Floor>();
  const re = /\b(ground|first|second|third|fourth|fifth|sixth|1st|2nd|3rd|4th|5th|6th)(?:[-\s]floor|\s+floor)/gi;
  for (const m of body.matchAll(re)) floors.add(FLOOR_WORDS[m[1]!.toLowerCase()]!);
  const kinds = new Set<Kind>();
  for (const [k, rx] of KIND_PATTERNS) if (rx.test(body)) kinds.add(k);
  // "Event Desk" mentions dominate (e.g. "Step out beside the doors... find the desk").
  if (kinds.has("EVENT_DESK")) {
    kinds.clear();
    kinds.add("EVENT_DESK");
  }
  return { floors, kinds };
}

export function analyzeLocationLabel(label: string): LocInfo {
  const l = label.toLowerCase();
  let floor: Floor | null = null;
  const m = l.match(/\b(ground|first|second|third|fourth|fifth|sixth|1st|2nd|3rd|4th|5th|6th)[-\s]floor/);
  if (m) floor = FLOOR_WORDS[m[1]!]!;
  let kind: Kind | null = null;
  if (/event desk/.test(l)) kind = "EVENT_DESK";
  else if (/library/.test(l)) kind = "LIBRARY";
  else if (/lift/.test(l)) kind = "LIFT";
  else if (/notice/.test(l)) kind = "NOTICEBOARD";
  else if (/aquaguard/.test(l)) kind = "AQUAGUARD";
  else if (/corridor/.test(l)) kind = "CORRIDOR";
  return { floor, kind };
}

/** Does the clue plausibly describe this location? null = not enough signal. */
export function clueMatchesLocation(info: ClueInfo, loc: LocInfo): boolean | null {
  const hasFloor = info.floors.size > 0;
  const hasKind = info.kinds.size > 0;
  if (!hasFloor && !hasKind) return null;
  const floorOk = !hasFloor || (loc.floor !== null && info.floors.has(loc.floor));
  const kindOk = !hasKind || (loc.kind !== null && info.kinds.has(loc.kind));
  return floorOk && kindOk;
}

export type ClueVerdict = "OK" | "DESCRIBES_CURRENT" | "MISMATCH" | "UNKNOWN";

export function judgeClue(clueText: string, placementLabel: string, destinationLabel: string): ClueVerdict {
  const info = analyzeClue(clueText);
  const toDest = clueMatchesLocation(info, analyzeLocationLabel(destinationLabel));
  if (toDest === null) return "UNKNOWN";
  if (toDest) return "OK";
  // Only conclude when the clue names a floor or a single unambiguous kind.
  const decisive = info.floors.size > 0 || info.kinds.size === 1;
  if (!decisive) return "UNKNOWN";
  const toHere = clueMatchesLocation(info, analyzeLocationLabel(placementLabel));
  return toHere ? "DESCRIBES_CURRENT" : "MISMATCH";
}

export function describeInfo(info: ClueInfo): string {
  const f = [...info.floors].join("/") || "unspecified floor";
  const k = [...info.kinds].map((x) => x.toLowerCase().replace("_", " ")).join("/") || "unspecified place";
  return `${f} ${k}`;
}
