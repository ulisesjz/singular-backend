import fs from 'fs';
import { readFileSync } from 'fs';
import { PDFDocument } from 'pdf-lib';
import docx from 'docx-parser';
import * as XLSX from 'xlsx';

export async function parsePDF(filePath) {
  const buffer = readFileSync(filePath);
  const pdfDoc = await PDFDocument.load(buffer);
  const text = (await Promise.all(
    pdfDoc.getPages().map(page => page.getTextContent().then(c => c.items.map(i => i.str).join(' ')))
  )).join('\n');
  return text;
}

export function parseDOCX(filePath) {
  return new Promise((resolve, reject) => {
    docx.parseDocx(filePath, (data) => {
      resolve(data);
    });
  });
}

export function parseXLSX(filePath) {
  const workbook = XLSX.readFile(filePath);
  const result = [];
  workbook.SheetNames.forEach(name => {
    const sheet = XLSX.utils.sheet_to_csv(workbook.Sheets[name]);
    result.push(sheet);
  });
  return result.join('\n');
}
