import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';

export class FileExtractorService {
  /**
   * Extract plain text content from an uploaded file based on its mime type / extension.
   */
  public static async extractText(filePath: string, originalName: string, mimeType: string): Promise<string> {
    if (!fs.existsSync(filePath)) {
      return '';
    }

    const ext = path.extname(originalName).toLowerCase();

    try {
      // 1. Plain text formats
      if (
        ['.txt', '.csv', '.tsv', '.json', '.md', '.log', '.yaml', '.yml'].includes(ext) ||
        mimeType.startsWith('text/') ||
        mimeType === 'application/json'
      ) {
        const text = fs.readFileSync(filePath, 'utf8');
        return text.slice(0, 50000); // 50k char safety limit
      }

      // 2. Excel spreadsheets
      if (['.xlsx', '.xls', '.xlsm', '.xlsb'].includes(ext) || mimeType.includes('spreadsheet') || mimeType.includes('excel')) {
        return this.extractFromExcel(filePath);
      }

      // 3. PDF documents
      if (ext === '.pdf' || mimeType === 'application/pdf') {
        return await this.extractFromPdf(filePath);
      }

      // 4. Images
      if (mimeType.startsWith("image/") || [".png", ".jpg", ".jpeg", ".webp"].includes(ext)) {
        const stats = fs.statSync(filePath);
        return `[Image Attachment: ${originalName}, Size: ${Math.round(stats.size / 1024)} KB]`;
      }

      // Fallback: try reading as utf8 text
      try {
        const raw = fs.readFileSync(filePath, "utf8");
        if (/^[\x09\x0A\x0D\x20-\x7E\xA0-\xFF]*$/.test(raw.slice(0, 500))) {
          return raw.slice(0, 50000);
        }
      } catch (e) {}

      return `[Binary Attachment: ${originalName}, Type: ${mimeType}]`;
    } catch (err: any) {
      console.error(`Error extracting text from ${originalName}:`, err);
      return `[File could not be extracted: ${originalName} - ${err.message}]`;
    }
  }

  private static extractFromExcel(filePath: string): string {
    const workbook = XLSX.readFile(filePath);
    const parts: string[] = [];

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const csv = XLSX.utils.sheet_to_csv(sheet);
      if (csv.trim()) {
        parts.push(`--- Sheet: ${sheetName} ---\n${csv.slice(0, 10000)}`);
      }
    }

    return parts.join("\n\n") || "[Empty Excel Spreadsheet]";
  }

  private static async extractFromPdf(filePath: string): Promise<string> {
    try {
      // Dynamic import to handle pdf-parse in ESM
      const pdfModule: any = await import("pdf-parse");
      const pdfParse = pdfModule.default || pdfModule;
      const dataBuffer = fs.readFileSync(filePath);
      const data = await pdfParse(dataBuffer);
      return data.text ? data.text.trim().slice(0, 50000) : "[Empty PDF document]";
    } catch (err: any) {
      console.warn("pdf-parse fallback:", err.message);
      // Lightweight regex fallback for readable PDF stream text
      const buffer = fs.readFileSync(filePath);
      const str = buffer.toString("latin1");
      const textMatches = str.match(/\(([^()]+)\)Tj/g);
      if (textMatches && textMatches.length > 0) {
        return textMatches.map(m => m.replace(/^[\(]/, "").replace(/\)Tj$/, "")).join(" ");
      }
      return `[PDF text extraction unavailable: ${err.message}]`;
    }
  }
}
