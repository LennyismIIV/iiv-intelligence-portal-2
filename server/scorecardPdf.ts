import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { inflateSync, inflateRawSync } from "node:zlib";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import {
  DRAFT_WATERMARK,
  INSTRUMENT_A_NAME,
  IIV_SCORECARD_BRAND,
  LOCKED_SEND_LABEL,
  SECTION_TITLES,
  editionHeaderLabel,
  editionProductTitle,
  type ScorecardDocument,
  type ScorecardSectionId,
} from "@shared/scorecardExport";

const execFileAsync = promisify(execFile);

const NAVY = rgb(0.043, 0.122, 0.227);
const GOLD = rgb(0.769, 0.639, 0.353);
const GAP = rgb(0.541, 0.294, 0.031);
const BODY = rgb(0.1, 0.1, 0.1);
const MUTED = rgb(0.29, 0.333, 0.408);

/** pdf-lib WinAnsi cannot encode every Unicode char used in the PRD copy. */
export function pdfSafe(text: string): string {
  return text
    .replace(/[—–]/g, "-")
    .replace(/[×]/g, "x")
    .replace(/[·]/g, "|")
    .replace(/[≤]/g, "<=")
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\t\n\r\x20-\x7E]/g, "?");
}

function wrap(text: string, max = 92): string[] {
  const words = pdfSafe(text).split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const word of words) {
    const next = cur ? `${cur} ${word}` : word;
    if (next.length > max) {
      if (cur) lines.push(cur);
      cur = word;
    } else {
      cur = next;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

/**
 * Print PDF from the same section model as the DOCX.
 * Used as the locked-send fallback when LibreOffice is not available,
 * and as the always-on path tests can assert without soffice.
 */
export async function renderScorecardPdf(doc: ScorecardDocument): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const product = editionProductTitle(doc);
  const portal = doc.brand === IIV_SCORECARD_BRAND ? "IIV Intelligence Portal" : "Gen2 Portal";
  pdf.setTitle(`${product} - ${doc.firmName}`);
  pdf.setAuthor(doc.brand);
  pdf.setSubject(pdfSafe(INSTRUMENT_A_NAME));
  pdf.setKeywords([
    doc.brand,
    doc.edition,
    ...(doc.brand === IIV_SCORECARD_BRAND ? [] : [LOCKED_SEND_LABEL]),
    ...doc.sections.map((s) => pdfSafe(s.title)),
  ]);
  pdf.setProducer(portal);
  pdf.setCreator(product);

  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fontOblique = await pdf.embedFont(StandardFonts.HelveticaOblique);

  const pageWidth = 612;
  const pageHeight = 792;
  const margin = 54;
  const headerH = 52;
  const footerH = 40;

  let page = pdf.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin - headerH;

  const drawChrome = () => {
    page.drawRectangle({
      x: 0,
      y: pageHeight - 36,
      width: pageWidth,
      height: 36,
      color: NAVY,
    });
    page.drawText(pdfSafe(`${editionHeaderLabel(doc)}  |  ${doc.firmName}`), {
      x: margin,
      y: pageHeight - 22,
      size: 9,
      font: fontBold,
      color: rgb(1, 1, 1),
    });
    page.drawText(pdfSafe(INSTRUMENT_A_NAME), {
      x: margin,
      y: pageHeight - 48,
      size: 8,
      font: fontOblique,
      color: MUTED,
    });
    const footerBits = [
      pdfSafe(INSTRUMENT_A_NAME),
      doc.brand,
      ...(doc.brand === IIV_SCORECARD_BRAND ? [] : [LOCKED_SEND_LABEL]),
    ];
    if (doc.draft) footerBits.push(pdfSafe(DRAFT_WATERMARK));
    page.drawText(footerBits.join("  |  "), {
      x: margin,
      y: 28,
      size: 7,
      font: font,
      color: MUTED,
      maxWidth: pageWidth - margin * 2,
    });
    page.drawLine({
      start: { x: margin, y: 40 },
      end: { x: pageWidth - margin, y: 40 },
      thickness: 0.6,
      color: GOLD,
    });
  };

  const ensure = (need: number) => {
    if (y - need < margin + footerH) {
      page = pdf.addPage([pageWidth, pageHeight]);
      drawChrome();
      y = pageHeight - margin - headerH;
    }
  };

  drawChrome();

  const title = pdfSafe(editionProductTitle(doc));
  page.drawText(title, { x: margin, y, size: 16, font: fontBold, color: NAVY });
  y -= 18;
  page.drawText(pdfSafe(INSTRUMENT_A_NAME), { x: margin, y, size: 9, font: fontOblique, color: MUTED });
  y -= 22;
  if (doc.draft) {
    page.drawText(pdfSafe(DRAFT_WATERMARK), { x: margin, y, size: 11, font: fontBold, color: rgb(0.6, 0.15, 0.15) });
    y -= 20;
  }

  for (const section of doc.sections) {
    ensure(36);
    page.drawText(pdfSafe(section.title), { x: margin, y, size: 12, font: fontBold, color: NAVY });
    y -= 6;
    page.drawLine({
      start: { x: margin, y },
      end: { x: pageWidth - margin, y },
      thickness: 1,
      color: GOLD,
    });
    y -= 16;
    for (const block of section.blocks) {
      const lines = wrap(block);
      for (const line of lines) {
        ensure(14);
        const isGap = block.includes("[GAP]");
        page.drawText(line, {
          x: margin,
          y,
          size: 9,
          font: isGap ? fontOblique : font,
          color: isGap ? GAP : BODY,
        });
        y -= 12;
      }
      y -= 2;
    }
    y -= 8;
  }

  const bytes = await pdf.save({ useObjectStreams: false });
  return Buffer.from(bytes);
}

export async function convertDocxToPdf(docx: Buffer): Promise<Buffer | null> {
  const soffice = process.env.LIBREOFFICE_BIN
    || (await which(["soffice", "libreoffice"]));
  if (!soffice) return null;

  const dir = await mkdtemp(join(tmpdir(), "scorecard-pdf-"));
  const inPath = join(dir, "scorecard.docx");
  const outPath = join(dir, "scorecard.pdf");
  try {
    await writeFile(inPath, docx);
    await execFileAsync(soffice, [
      "--headless",
      "--norestore",
      "--convert-to",
      "pdf",
      "--outdir",
      dir,
      inPath,
    ], { timeout: 60_000 });
    return await readFile(outPath);
  } catch {
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function which(bins: string[]): Promise<string | null> {
  for (const bin of bins) {
    try {
      await execFileAsync("which", [bin]);
      return bin;
    } catch {
      // try next
    }
  }
  return null;
}

export async function renderLockedSendPdf(
  doc: ScorecardDocument,
  docx: Buffer,
): Promise<{ buffer: Buffer; source: "docx-libreoffice" | "docx-print" }> {
  const converted = await convertDocxToPdf(docx);
  if (converted) {
    return { buffer: converted, source: "docx-libreoffice" };
  }
  return { buffer: await renderScorecardPdf(doc), source: "docx-print" };
}

function inflatePdfStream(bytes: Buffer): string | null {
  try {
    return inflateSync(bytes).toString("latin1");
  } catch {
    try {
      return inflateRawSync(bytes).toString("latin1");
    } catch {
      return null;
    }
  }
}

function decodeUtf16Hex(hex: string): string {
  const buf = Buffer.from(hex, "hex");
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    return buf.subarray(2).swap16().toString("utf16le");
  }
  return buf.toString("latin1");
}

/** Flatten pdf-lib content streams so tests can read drawn text. */
export function extractPdfText(pdf: Buffer): string {
  const raw = pdf.toString("latin1");
  const parts: string[] = [raw];
  const streamRe = /stream\r?\n([\s\S]*?)\nendstream/g;
  let match: RegExpExecArray | null;
  while ((match = streamRe.exec(raw))) {
    const inflated = inflatePdfStream(Buffer.from(match[1], "latin1"));
    if (inflated) parts.push(inflated);
  }
  const hexRe = /<((?:FEFF)?[0-9A-Fa-f]{8,})>/g;
  while ((match = hexRe.exec(raw))) {
    try { parts.push(decodeUtf16Hex(match[1])); } catch { /* ignore */ }
  }
  return parts.join("\n").replace(/\\([()\\])/g, "$1").replace(/\\n/g, "\n");
}

export function pdfContainsSectionOrder(pdf: Buffer, ids: ScorecardSectionId[]): boolean {
  const text = extractPdfText(pdf);
  let last = -1;
  for (const id of ids) {
    const needle = pdfSafe(SECTION_TITLES[id]);
    const idx = text.indexOf(needle);
    if (idx < 0 || idx < last) return false;
    last = idx;
  }
  return true;
}
