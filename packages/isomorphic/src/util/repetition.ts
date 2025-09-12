// Utility for converting a 1-based repetition number to capital letters (Excel-style)
// 1 -> A, 2 -> B, ... 26 -> Z, 27 -> AA, etc.
export function toRepetitionLetter(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "";
  let s = "";
  while (n > 0) {
    n--;
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26);
  }
  return s;
}

// Inverse of toRepetitionLetter
// A -> 1, B -> 2, ... Z -> 26, AA -> 27, AB -> 28, etc.
// Returns 0 for invalid input (empty string or containing non A-Z letters)
export function toRepetitionNumber(s: string): number {
  if (!s) return 0;
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    let val: number;
    if (code >= 65 && code <= 90) {
      // A-Z
      val = code - 64;
    } else if (code >= 97 && code <= 122) {
      // a-z (allow lowercase defensively)
      val = code - 96;
    } else {
      return 0; // invalid char
    }
    n = n * 26 + val;
  }
  return n;
}
