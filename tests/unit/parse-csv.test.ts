/**
 * PR-K — robust CSV parse for the risk importer.
 *
 * The old importer split on `,`/`\n`, corrupting any quoted cell. These
 * assert the RFC-4180-ish parser handles the cells a real risk register
 * carries: quoted commas, escaped quotes, embedded newlines, CRLF.
 */
import { parseCsv, parseCsvRecords } from '@/lib/csv/parse-csv';

describe('parseCsv', () => {
    it('parses a simple grid', () => {
        expect(parseCsv('a,b\n1,2')).toEqual([
            ['a', 'b'],
            ['1', '2'],
        ]);
    });

    it('keeps commas inside quoted fields', () => {
        expect(parseCsv('title\n"Loss of availability, integrity"')).toEqual([
            ['title'],
            ['Loss of availability, integrity'],
        ]);
    });

    it('unescapes doubled quotes', () => {
        expect(parseCsv('q\n"she said ""hi"""')).toEqual([
            ['q'],
            ['she said "hi"'],
        ]);
    });

    it('keeps newlines inside quoted fields', () => {
        expect(parseCsv('desc\n"line1\nline2"')).toEqual([
            ['desc'],
            ['line1\nline2'],
        ]);
    });

    it('tolerates CRLF line endings and a missing trailing newline', () => {
        expect(parseCsv('a,b\r\n1,2')).toEqual([
            ['a', 'b'],
            ['1', '2'],
        ]);
    });

    it('drops fully-blank rows', () => {
        expect(parseCsv('a\n\n\nb')).toEqual([['a'], ['b']]);
    });
});

describe('parseCsvRecords', () => {
    it('maps header-keyed records with trimmed, lowercased headers', () => {
        const recs = parseCsvRecords('Title,Owner\n"Data breach","alice@x.io"');
        expect(recs).toEqual([{ title: 'Data breach', owner: 'alice@x.io' }]);
    });

    it('returns [] when there is no data row', () => {
        expect(parseCsvRecords('title,owner')).toEqual([]);
        expect(parseCsvRecords('')).toEqual([]);
    });

    it('handles a quoted comma so the column count stays correct', () => {
        const recs = parseCsvRecords('title,category\n"A, B",Technical');
        expect(recs).toEqual([{ title: 'A, B', category: 'Technical' }]);
    });
});
