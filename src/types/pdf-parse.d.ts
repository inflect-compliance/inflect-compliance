// Minimal ambient types for `pdf-parse` (ships no types). We import the
// library entrypoint directly (`pdf-parse/lib/pdf-parse.js`) to dodge the
// package index's debug-harness block that reads a bundled test PDF on load.
declare module 'pdf-parse/lib/pdf-parse.js' {
    interface PdfParseResult {
        text: string;
        numpages: number;
        info: unknown;
        metadata: unknown;
        version: string;
    }
    function pdfParse(dataBuffer: Buffer): Promise<PdfParseResult>;
    export default pdfParse;
}
