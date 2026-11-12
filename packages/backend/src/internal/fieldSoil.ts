import { FIELD_SOIL_SOURCES } from "@rw/db/schemas/internal/fieldSoil.ts";

type Clean = { ok: true; value: Record<string, unknown> } | { ok: false; error: string };

const num = (v: unknown, lo: number, hi: number, whole = false): number | null | undefined => {
  if (typeof v === "string") v = v.trim();
  if (v === null || v === "") return null;
  if (v === undefined) return undefined;
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(",", ".")) : NaN;
  if (!Number.isFinite(n) || n < lo || n > hi || (whole && !Number.isInteger(n))) return NaN;
  return n;
};

/** Validate a measured-soil update: only the known fields, in range. */
export function cleanFieldSoil(body: unknown): Clean {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "Expected an object" };
  const b = body as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  const fields: [string, number, number, boolean][] = [["jb", 1, 12, true], ["ph", 3, 9.5, false], ["wetDepthM", 0, 3, false], ["rootDepthM", 0, 3, false]];
  for (const [k, lo, hi, whole] of fields) {
    const v = num(b[k], lo, hi, whole);
    if (Number.isNaN(v)) return { ok: false, error: `${k} must be a number from ${lo} to ${hi}${whole ? " (whole)" : ""}` };
    if (v !== undefined) out[k] = v === null ? null : Math.round((v as number) * 100) / 100;
  }
  if (b.wetFound !== undefined) {
    if (b.wetFound !== null && typeof b.wetFound !== "boolean") return { ok: false, error: "wetFound must be true, false or null" };
    out.wetFound = b.wetFound;
  }
  if (b.source !== undefined) {
    if (!FIELD_SOIL_SOURCES.includes(b.source as any)) return { ok: false, error: `source must be one of ${FIELD_SOIL_SOURCES.join(", ")}` };
    out.source = b.source;
  }
  if (b.sampledOn !== undefined) {
    if (b.sampledOn === null || b.sampledOn === "") out.sampledOn = null;
    else {
      const d = new Date(String(b.sampledOn));
      if (Number.isNaN(d.getTime()) || d.getFullYear() < 1990 || d.getTime() > Date.now() + 86400000) return { ok: false, error: "sampledOn must be a date" };
      out.sampledOn = d;
    }
  }
  if (b.notes !== undefined) {
    if (typeof b.notes !== "string") return { ok: false, error: "notes must be text" };
    out.notes = b.notes.slice(0, 2000);
  }
  return { ok: true, value: out };
}

/** At least one measured value (soil class, pH, wet depth, rooting depth) in a cleaned update. */
export const hasMeasurement = (v: Record<string, unknown>) => ["jb", "ph", "wetDepthM", "rootDepthM"].some((k) => typeof v[k] === "number");

/** What the screening service gets: the measured values only. */
export function soilForService(s: any) {
  if (!s) return null;
  const pick = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const out: Record<string, number | boolean | null> = { jb: pick(s.jb), ph: pick(s.ph), wet_depth_m: pick(s.wetDepthM), root_depth_m: pick(s.rootDepthM) };
  if (!Object.values(out).some((v) => v !== null)) return null;
  // the auger found no wet soil down to wet_depth_m: the service then reads it as "dry to that depth"
  if (out.wet_depth_m !== null && s.wetFound === false) out.wet_found = false;
  return out;
}
