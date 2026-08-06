import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import qrcode from "qrcode-generator";
import {
  CERTIFICATE_DISCLAIMER,
  certificateTitle,
  type CertificateContent,
  type CertificateStatus
} from "@finance/domain";

/**
 * The attestation, as a real PDF.
 *
 * ADR-007 refused a PDF pipeline and it was right to, for the reason it gave:
 * this application runs without internet access, and the obvious renderers —
 * a headless browser, a CDN webfont — both break that. `pdf-lib` does not:
 * it is pure TypeScript, it emits the bytes itself, and the fourteen standard
 * PDF fonts are resolved by the *reader*, so nothing is fetched and no font
 * file ships. See ADR-010.
 *
 * WHAT IT PRINTS IS WHAT WAS STORED. Every figure comes from the frozen
 * `CertificateContent`; this module never recomputes a score or re-reads a
 * curriculum. A document that changed between two downloads would not be a
 * document.
 */

const A4 = { width: 595.28, height: 841.89 } as const;
const MARGIN = 56;
const INK = rgb(0.09, 0.11, 0.15);
const MUTED = rgb(0.42, 0.45, 0.5);
const RULE = rgb(0.82, 0.84, 0.87);
const ALERT = rgb(0.7, 0.11, 0.09);

/**
 * The standard fonts encode WinAnsi, which covers French — accents, cedilla,
 * ligatures, curly apostrophes, the euro sign — and throws on everything else.
 * The holder's name is typed by the holder, so an emoji or a Cyrillic
 * character would otherwise turn a download into a 500. Unrepresentable
 * characters become `?`; control characters and newlines disappear, because a
 * newline inside `drawText` runs off the page rather than wrapping.
 */
export function toPrintable(value: string): string {
  let out = "";

  for (const char of value.normalize("NFC")) {
    const code = char.codePointAt(0) ?? 0;

    if (code === 0x0a || code === 0x0d || code === 0x09) {
      out += " ";
      continue;
    }

    if (code < 0x20 || code === 0x7f) {
      continue;
    }

    // Latin-1 plus the WinAnsi additions this product actually uses.
    const winAnsiExtras = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
    out += code <= 0xff || winAnsiExtras.includes(char) ? char : "?";
  }

  return out.replace(/\s+/g, " ").trim();
}

/** Hard-truncates to what fits, so a long name cannot run into the margin. */
function fit(text: string, font: PDFFont, size: number, maxWidth: number): string {
  const printable = toPrintable(text);

  if (font.widthOfTextAtSize(printable, size) <= maxWidth) {
    return printable;
  }

  let cut = printable;

  while (cut.length > 1 && font.widthOfTextAtSize(`${cut}…`, size) > maxWidth) {
    cut = cut.slice(0, -1);
  }

  return `${cut}…`;
}

/** Greedy wrap on spaces. Enough for a disclaimer and a competency list. */
function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = toPrintable(text).split(" ").filter(Boolean);
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const candidate = line === "" ? word : `${line} ${word}`;

    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
      continue;
    }

    if (line !== "") {
      lines.push(line);
    }

    line = word;
  }

  if (line !== "") {
    lines.push(line);
  }

  return lines;
}

function drawQrCode(page: PDFPage, text: string, x: number, y: number, size: number): void {
  // Error correction M: a printed attestation gets folded and photocopied, and
  // M recovers ~15 % of the modules. Type 0 lets the library pick the smallest
  // version that fits.
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();

  const modules = qr.getModuleCount();
  const scale = size / modules;

  // A quiet zone is part of the spec: without it many scanners refuse to lock
  // on. The white square underneath provides it even on a tinted background.
  page.drawRectangle({
    x: x - scale * 2,
    y: y - scale * 2,
    width: size + scale * 4,
    height: size + scale * 4,
    color: rgb(1, 1, 1)
  });

  for (let row = 0; row < modules; row += 1) {
    for (let col = 0; col < modules; col += 1) {
      if (qr.isDark(row, col)) {
        page.drawRectangle({
          x: x + col * scale,
          // PDF's origin is bottom-left, the matrix's is top-left.
          y: y + size - (row + 1) * scale,
          width: scale,
          height: scale,
          color: INK
        });
      }
    }
  }
}

export interface CertificatePdfInput {
  serial: string;
  content: CertificateContent;
  issuedAt: string;
  verificationUrl: string;
  status: CertificateStatus;
}

function frenchDate(iso: string): string {
  const parsed = Date.parse(iso);

  if (Number.isNaN(parsed)) {
    return iso;
  }

  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "UTC" }).format(parsed);
}

export async function renderCertificatePdf(input: CertificatePdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([A4.width, A4.height]);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const oblique = await doc.embedFont(StandardFonts.HelveticaOblique);

  const { content } = input;
  const contentWidth = A4.width - MARGIN * 2;
  let y = A4.height - MARGIN;

  const text = (
    value: string,
    options: { size: number; font: PDFFont; color?: typeof INK; gap?: number }
  ) => {
    page.drawText(fit(value, options.font, options.size, contentWidth), {
      x: MARGIN,
      y,
      size: options.size,
      font: options.font,
      color: options.color ?? INK
    });
    y -= options.gap ?? options.size + 8;
  };

  const rule = () => {
    page.drawRectangle({ x: MARGIN, y, width: contentWidth, height: 0.75, color: RULE });
    y -= 22;
  };

  // --- Header ---------------------------------------------------------------

  text("FINANCE LEARNING HUB", { size: 9, font: bold, color: MUTED, gap: 20 });
  text(certificateTitle(content), { size: 26, font: bold, gap: 14 });
  rule();

  // --- Holder and track -----------------------------------------------------

  text("Délivrée à", { size: 9, font: bold, color: MUTED, gap: 16 });
  text(content.holderLabel, { size: 20, font: bold, gap: 24 });

  text("Parcours", { size: 9, font: bold, color: MUTED, gap: 16 });
  text(content.trackLabel, { size: 15, font: regular, gap: 26 });

  // --- Facts ----------------------------------------------------------------

  const facts: Array<[string, string]> = [
    ["Score moyen", `${content.averageScore} %`],
    ["Niveaux validés", `${content.levelCount}`],
    ["Version du curriculum", content.curriculumVersionId],
    ["Date de délivrance", frenchDate(input.issuedAt)],
    ["Numéro d'attestation", input.serial]
  ];

  for (const [label, value] of facts) {
    page.drawText(fit(label, regular, 10, 180), { x: MARGIN, y, size: 10, font: regular, color: MUTED });
    page.drawText(fit(value, bold, 11, contentWidth - 190), {
      x: MARGIN + 190,
      y: y - 1,
      size: 11,
      font: bold,
      color: INK
    });
    y -= 20;
  }

  y -= 10;
  rule();

  // --- Competencies ---------------------------------------------------------

  if (content.competencies.length > 0) {
    text("Compétences travaillées", { size: 9, font: bold, color: MUTED, gap: 16 });

    for (const competency of content.competencies) {
      page.drawText("•", { x: MARGIN, y, size: 10, font: regular, color: MUTED });
      page.drawText(fit(competency, regular, 10, contentWidth - 16), {
        x: MARGIN + 14,
        y,
        size: 10,
        font: regular,
        color: INK
      });
      y -= 16;
    }

    y -= 12;
  }

  // --- Case studies ---------------------------------------------------------
  //
  // Worded as "travaillés" rather than "réussis": completion is derived from
  // case-study evidence recorded on the matching level, which proves the work
  // was done, not that it was flawless. The stronger claim would need a
  // per-case result the product does not store.

  if (content.caseStudies.length > 0) {
    text("Cas pratiques travaillés", { size: 9, font: bold, color: MUTED, gap: 16 });

    for (const caseStudy of content.caseStudies) {
      page.drawText("•", { x: MARGIN, y, size: 10, font: regular, color: MUTED });
      page.drawText(fit(caseStudy, regular, 10, contentWidth - 16), {
        x: MARGIN + 14,
        y,
        size: 10,
        font: regular,
        color: INK
      });
      y -= 16;
    }

    y -= 12;
  }

  // --- Revocation banner ----------------------------------------------------
  //
  // A withdrawn attestation that reprints unchanged would be a forgery kit. The
  // state is stamped on the document itself, not only on the verification page.

  if (input.status !== "active") {
    const banner =
      input.status === "revoked"
        ? "ATTESTATION RÉVOQUÉE — ce document n'est plus valide."
        : "ATTESTATION REMPLACÉE — une version plus récente a été délivrée.";

    page.drawRectangle({
      x: MARGIN,
      y: y - 6,
      width: contentWidth,
      height: 26,
      color: rgb(0.99, 0.93, 0.93)
    });
    page.drawText(fit(banner, bold, 11, contentWidth - 16), {
      x: MARGIN + 8,
      y: y + 2,
      size: 11,
      font: bold,
      color: ALERT
    });
    y -= 40;
  }

  // --- Verification block ---------------------------------------------------

  const qrSize = 108;
  const qrY = MARGIN + 78;

  drawQrCode(page, input.verificationUrl, MARGIN, qrY, qrSize);

  const blockX = MARGIN + qrSize + 24;
  const blockWidth = contentWidth - qrSize - 24;
  let blockY = qrY + qrSize - 12;

  page.drawText("Vérifier cette attestation", {
    x: blockX,
    y: blockY,
    size: 11,
    font: bold,
    color: INK
  });
  blockY -= 18;

  for (const line of wrap(
    "Scannez le code ou ouvrez l'adresse ci-dessous. La page indique si l'attestation est valide, révoquée ou remplacée.",
    regular,
    9,
    blockWidth
  )) {
    page.drawText(line, { x: blockX, y: blockY, size: 9, font: regular, color: MUTED });
    blockY -= 12;
  }

  blockY -= 4;

  for (const line of wrap(input.verificationUrl, bold, 9, blockWidth)) {
    page.drawText(line, { x: blockX, y: blockY, size: 9, font: bold, color: INK });
    blockY -= 12;
  }

  // --- Disclaimer -----------------------------------------------------------

  y = MARGIN + 44;
  page.drawRectangle({ x: MARGIN, y: y + 14, width: contentWidth, height: 0.75, color: RULE });

  for (const line of wrap(CERTIFICATE_DISCLAIMER, oblique, 8, contentWidth)) {
    page.drawText(line, { x: MARGIN, y, size: 8, font: oblique, color: MUTED });
    y -= 10;
  }

  // Metadata: no e-mail, no user id — a PDF's properties are read by anything
  // that opens it.
  doc.setTitle(`${certificateTitle(content)} — ${toPrintable(content.trackLabel)}`);
  doc.setSubject(`Attestation ${input.serial}`);
  doc.setProducer("Finance Learning Hub");
  doc.setCreator("Finance Learning Hub");

  // THE DOCUMENT DATES ARE THE ISSUE DATE, NOT "NOW".
  //
  // `PDFDocument.create()` stamps `CreationDate` and `ModDate` with the current
  // time. Two downloads of the same attestation therefore produced two
  // different files — the dates land in a deflated object stream, so the whole
  // document even changed length. That contradicts the guarantee this feature
  // is built on: everything printed is frozen at issue time, and "a document
  // cannot change under its holder" has to include the bytes.
  //
  // An unparseable `issuedAt` falls back to the epoch rather than to `now`, for
  // the same reason `frenchDate` returns the raw string rather than inventing a
  // date: a wrong-but-stable value is auditable, a value that changes on every
  // request is not.
  const issuedOn = Number.isNaN(Date.parse(input.issuedAt))
    ? new Date(0)
    : new Date(input.issuedAt);

  doc.setCreationDate(issuedOn);
  doc.setModificationDate(issuedOn);

  return doc.save();
}
