import { createHash, randomBytes, randomInt } from "node:crypto";
import QRCode from "qrcode";

/** Unambiguous alphabet for printed manual codes (no 0/O, 1/I/L). */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const MANUAL_CODE_LENGTH = 8;

/** 192-bit cryptographically random token, URL-safe. */
export function newScanToken(): string {
  return randomBytes(24).toString("base64url");
}

export function newManualCode(): string {
  let out = "";
  for (let i = 0; i < MANUAL_CODE_LENGTH; i++) out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return out;
}

export function formatManualCode(code: string): string {
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

export function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

export type ParsedScan = { kind: "token"; value: string } | { kind: "code"; value: string };

const TOKEN_RE = /^[A-Za-z0-9_-]{24,64}$/;

/**
 * Accepts what a camera decodes (our /s/<token> URL or a bare token) or what a
 * participant types (the 8-character manual code, with or without dash).
 */
export function parseScanInput(raw: string): ParsedScan | null {
  const input = (raw ?? "").trim();
  if (!input || input.length > 512) return null;
  const urlMatch = input.match(/\/s\/([A-Za-z0-9_-]{24,64})(?:[/?#].*)?$/);
  if (urlMatch) return { kind: "token", value: urlMatch[1]! };
  if (TOKEN_RE.test(input) && input.length >= 24) return { kind: "token", value: input };
  const code = input.toUpperCase().replace(/[\s-]/g, "");
  if (code.length === MANUAL_CODE_LENGTH && [...code].every((c) => CODE_ALPHABET.includes(c))) {
    return { kind: "code", value: code };
  }
  return null;
}

export function scanUrl(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/s/${token}`;
}

export async function qrSvg(content: string): Promise<string> {
  return QRCode.toString(content, { type: "svg", errorCorrectionLevel: "M", margin: 2, width: 320 });
}

export async function qrPng(content: string, size = 640): Promise<Buffer> {
  return QRCode.toBuffer(content, { type: "png", errorCorrectionLevel: "M", margin: 2, width: size });
}

export async function qrDataUrl(content: string, size = 320): Promise<string> {
  return QRCode.toDataURL(content, { errorCorrectionLevel: "M", margin: 1, width: size });
}
