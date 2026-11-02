// Small RFC 4180 CSV reader (quotes, doubled quotes, commas and line breaks
// inside quotes, CRLF). Enough for the pricebook files; no dependency.

export function parseCsv(text: string): string[][] {
  const tooBig = (what: string) => {
    throw new CsvTooLargeError(what);
  };
  if (typeof text !== "string" || text.length > CSV_LIMITS.chars) tooBig(`more than ${CSV_LIMITS.chars} characters`);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let quoteSeen = false; // a quote inside a quoted field: end, or the first of ""
  let skipLf = false; // after \r, a following \n belongs to the same line break
  let first = true;

  const endField = () => {
    row.push(field);
    field = "";
    if (row.length > CSV_LIMITS.columns) tooBig(`more than ${CSV_LIMITS.columns} columns`);
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
    if (rows.length > CSV_LIMITS.rows + 1) tooBig(`more than ${CSV_LIMITS.rows} rows`);
  };

  for (const c of text) {
    if (first) {
      first = false;
      if (c === "\ufeff") continue; // byte order mark
    }
    if (skipLf) {
      skipLf = false;
      if (c === "\n") continue;
    }
    if (quoted) {
      if (quoteSeen) {
        quoteSeen = false;
        if (c === '"') {
          field += '"';
          continue;
        }
        quoted = false; // the quote closed the field; handle c below
      } else if (c === '"') {
        quoteSeen = true;
        continue;
      } else {
        field += c;
        continue;
      }
    }
    if (c === '"' && field === "") quoted = true; // a quote only opens a field at its start
    else if (c === ",") endField();
    else if (c === "\n") endRow();
    else if (c === "\r") {
      endRow();
      skipLf = true;
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

export const CSV_LIMITS = { columns: 100, rows: 50_000, chars: 5_000_000 };

/**
 * Rows as objects keyed by the header line. Only the named columns are kept
 * (when given), and oversized files are refused before any work is done.
 */
export function parseCsvObjects(
  text: string,
  keep?: readonly string[],
): { header: string[]; rows: Record<string, string>[] } {
  const all = parseCsv(text);
  const [header = [], ...body] = all;
  if (header.length > CSV_LIMITS.columns) throw new CsvTooLargeError(`more than ${CSV_LIMITS.columns} columns`);
  if (body.length > CSV_LIMITS.rows) throw new CsvTooLargeError(`more than ${CSV_LIMITS.rows} rows`);
  const keys = header.map((h) => h.trim());
  const cols = keys
    .map((k, i) => [k, i] as const)
    .filter(([k]) => !keep || keep.includes(k));
  return {
    header: keys,
    rows: body.map((r) => {
      const o: Record<string, string> = Object.create(null);
      for (const [k, i] of cols) o[k] = (r[i] ?? "").trim();
      return o;
    }),
  };
}

export class CsvTooLargeError extends Error {}
