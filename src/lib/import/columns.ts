// Spreadsheet column letters and indexes.

// "A" -> 0, "B" -> 1, ..., "AA" -> 26.
export function columnIndex(letter: string): number {
  return letter
    .toUpperCase()
    .split("")
    .reduce((total, char) => total * 26 + (char.charCodeAt(0) - 64), 0) - 1;
}

export function columnLetter(index: number): string {
  let letter = "";
  let n = index + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}
