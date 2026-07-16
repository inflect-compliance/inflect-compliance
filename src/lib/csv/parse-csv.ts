/**
 * Minimal RFC-4180-ish CSV parser.
 *
 * The risk (and asset) importers previously split on `,` and `\n`, which
 * silently corrupted any cell containing a quoted comma, an escaped quote,
 * or an embedded newline — exactly the cells a real-world risk register
 * carries ("Loss of availability, integrity", multi-line descriptions).
 * This parser handles:
 *   - quoted fields (`"a,b"` → `a,b`)
 *   - escaped quotes inside quotes (`"she said ""hi"""` → `she said "hi"`)
 *   - embedded commas + newlines inside quoted fields
 *   - CRLF or LF line endings
 *
 * Pure + dependency-free so it runs in the browser (the importer parses
 * client-side before POSTing structured rows to the bulk endpoint).
 */

/** Parse CSV text into a matrix of string cells. Empty rows are dropped. */
export function parseCsv(text: string): string[][] {
    const rows: string[][] = [];
    let field = '';
    let row: string[] = [];
    let inQuotes = false;
    let i = 0;

    const endField = () => {
        row.push(field);
        field = '';
    };
    const endRow = () => {
        endField();
        rows.push(row);
        row = [];
    };

    while (i < text.length) {
        const ch = text[i];
        if (inQuotes) {
            if (ch === '"') {
                if (text[i + 1] === '"') {
                    field += '"';
                    i += 2;
                    continue;
                }
                inQuotes = false;
                i += 1;
                continue;
            }
            field += ch;
            i += 1;
            continue;
        }
        if (ch === '"') {
            inQuotes = true;
            i += 1;
            continue;
        }
        if (ch === ',') {
            endField();
            i += 1;
            continue;
        }
        if (ch === '\r') {
            i += 1;
            continue;
        }
        if (ch === '\n') {
            endRow();
            i += 1;
            continue;
        }
        field += ch;
        i += 1;
    }
    // Flush the trailing field/row (file without a final newline).
    if (field.length > 0 || row.length > 0) endRow();

    // Drop rows that are entirely blank.
    return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/**
 * Parse CSV into header-keyed records. The first non-empty row is the header
 * (trimmed + lowercased); each subsequent row maps to `{ header: cell }`.
 * Returns `[]` when there is no data row. Cells are trimmed.
 */
export function parseCsvRecords(text: string): Record<string, string>[] {
    const matrix = parseCsv(text);
    if (matrix.length < 2) return [];
    const headers = matrix[0].map((h) => h.trim().toLowerCase());
    return matrix.slice(1).map((cols) => {
        const rec: Record<string, string> = {};
        headers.forEach((h, idx) => {
            if (h) rec[h] = (cols[idx] ?? '').trim();
        });
        return rec;
    });
}
