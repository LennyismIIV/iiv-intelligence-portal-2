import {
  AlignmentType,
  Document,
  Footer,
  Header,
  HeadingLevel,
  Packer,
  PageNumber,
  Paragraph,
  TextRun,
  BorderStyle,
} from "docx";
import {
  DRAFT_WATERMARK,
  INSTRUMENT_A_NAME,
  SCORECARD_BRAND,
  SCORECARD_EDITION,
  type ExportField,
  type ScorecardDocument,
} from "@shared/scorecardExport";

const NAVY = "0B1F3A";
const GOLD = "C4A35A";
const GAP = "8A4B08";
const MUTED = "4A5568";

function runsForField(field: ExportField): TextRun[] {
  return [
    new TextRun({ text: `${field.label}: `, bold: true, font: "Calibri", size: 21 }),
    new TextRun({
      text: field.value,
      italics: field.gap,
      color: field.gap ? GAP : "1A1A1A",
      font: "Calibri",
      size: 21,
    }),
  ];
}

function fieldParagraph(field: ExportField): Paragraph {
  return new Paragraph({
    spacing: { after: 80 },
    children: runsForField(field),
  });
}

function bodyParagraph(text: string, opts: { italics?: boolean; color?: string } = {}): Paragraph {
  return new Paragraph({
    spacing: { after: 80 },
    children: [
      new TextRun({
        text,
        italics: opts.italics,
        color: opts.color ?? "1A1A1A",
        font: "Calibri",
        size: 21,
      }),
    ],
  });
}

function heading(title: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 280, after: 120 },
    border: {
      bottom: { color: GOLD, space: 4, style: BorderStyle.SINGLE, size: 8 },
    },
    children: [
      new TextRun({
        text: title,
        bold: true,
        color: NAVY,
        font: "Calibri",
        size: 26,
      }),
    ],
  });
}

function headerFooterChildren(doc: ScorecardDocument, kind: "header" | "footer"): Paragraph[] {
  const watermark = doc.draft
    ? [
        new TextRun({
          text: `  ·  ${DRAFT_WATERMARK}`,
          bold: true,
          color: "9B2C2C",
          font: "Calibri",
          size: 16,
        }),
      ]
    : [];

  if (kind === "header") {
    return [
      new Paragraph({
        children: [
          new TextRun({
            text: `${SCORECARD_BRAND}  ·  ${SCORECARD_EDITION} Reclassification Scorecard  ·  `,
            bold: true,
            color: NAVY,
            font: "Calibri",
            size: 18,
          }),
          new TextRun({
            text: doc.firmName || doc.header.firmName.value,
            color: NAVY,
            font: "Calibri",
            size: 18,
          }),
          ...watermark,
        ],
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: INSTRUMENT_A_NAME,
            italics: true,
            color: MUTED,
            font: "Calibri",
            size: 16,
          }),
        ],
      }),
    ];
  }

  return [
    new Paragraph({
      children: [
        new TextRun({
          text: INSTRUMENT_A_NAME,
          italics: true,
          color: MUTED,
          font: "Calibri",
          size: 15,
        }),
        new TextRun({
          text: `  ·  ${SCORECARD_BRAND}`,
          bold: true,
          color: NAVY,
          font: "Calibri",
          size: 15,
        }),
        ...watermark,
        new TextRun({ text: "  ·  ", font: "Calibri", size: 15, color: MUTED }),
        new TextRun({
          children: [PageNumber.CURRENT],
          font: "Calibri",
          size: 15,
          color: MUTED,
        }),
      ],
    }),
  ];
}

function sectionChildren(doc: ScorecardDocument): Paragraph[] {
  const out: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { after: 60 },
      children: [
        new TextRun({
          text: `${SCORECARD_BRAND} CEO Reclassification Scorecard`,
          bold: true,
          color: NAVY,
          font: "Calibri",
          size: 36,
        }),
      ],
    }),
    new Paragraph({
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: INSTRUMENT_A_NAME,
          italics: true,
          color: MUTED,
          font: "Calibri",
          size: 20,
        }),
      ],
    }),
  ];

  if (doc.draft) {
    out.push(
      new Paragraph({
        spacing: { after: 200 },
        children: [
          new TextRun({
            text: DRAFT_WATERMARK,
            bold: true,
            color: "9B2C2C",
            font: "Calibri",
            size: 22,
          }),
        ],
      }),
    );
  }

  for (const section of doc.sections) {
    out.push(heading(section.title));
    if (section.id === "header") {
      out.push(
        fieldParagraph(doc.header.firmName),
        fieldParagraph(doc.header.scorecardDate),
        fieldParagraph(doc.header.scoredAt),
        fieldParagraph(doc.header.tapeAsOf),
        fieldParagraph(doc.header.brand),
        bodyParagraph(`Edition: ${SCORECARD_EDITION}`),
        fieldParagraph(doc.header.evaluator),
        fieldParagraph(doc.header.confidenceRollup),
      );
    } else if (section.id === "map_a") {
      out.push(
        fieldParagraph(doc.mapA.instrument),
        fieldParagraph(doc.mapA.mapAX),
        fieldParagraph(doc.mapA.mapAY),
        fieldParagraph(doc.mapA.quadrant),
        fieldParagraph(doc.mapA.gradeX),
        fieldParagraph(doc.mapA.gradeY),
      );
    } else if (section.id === "strategic_posture") {
      out.push(
        bodyParagraph("One lead only (orchestrator | trust_builder | decision_partner).", { italics: true, color: MUTED }),
        fieldParagraph(doc.strategicPosture.lead),
        fieldParagraph(doc.strategicPosture.justification),
      );
    } else if (section.id === "valuation_category_band") {
      out.push(
        fieldParagraph(doc.valuation.category),
        fieldParagraph(doc.valuation.band),
        fieldParagraph(doc.valuation.hardRulesFired),
        fieldParagraph(doc.valuation.tapeRanges),
        fieldParagraph(doc.valuation.conviction),
        fieldParagraph(doc.valuation.narrative),
        fieldParagraph(doc.valuation.tapeAsOf),
        bodyParagraph("Bands are taken only from the approved tape snapshot / assessment. No evergreen multiples.", {
          italics: true,
          color: MUTED,
        }),
      );
    } else if (section.id === "control_point_read") {
      out.push(
        fieldParagraph(doc.controlPoint.primary),
        fieldParagraph(doc.controlPoint.vcControlLayers),
      );
    } else if (section.id === "ai_on_control_point") {
      out.push(
        fieldParagraph(doc.aiOnControlPoint.result),
        fieldParagraph(doc.aiOnControlPoint.doctrine),
        fieldParagraph(doc.aiOnControlPoint.evidence),
        bodyParagraph("Doctrine: reclassification is not automation.", { italics: true, color: MUTED }),
      );
    } else if (section.id === "implication_trifecta") {
      out.push(
        bodyParagraph("Supplier / Buyer / Investor implications + ≤6 item 90-day agenda.", { italics: true, color: MUTED }),
        fieldParagraph(doc.trifecta.supplier),
        fieldParagraph(doc.trifecta.buyer),
        fieldParagraph(doc.trifecta.investor),
        ...doc.trifecta.agenda.map(fieldParagraph),
      );
    } else if (section.id === "evidence_appendix") {
      for (const row of doc.appendix) {
        out.push(
          new Paragraph({
            spacing: { before: 140, after: 60 },
            children: [
              new TextRun({
                text: `${row.label} (${row.claimKey})`,
                bold: true,
                color: NAVY,
                font: "Calibri",
                size: 22,
              }),
            ],
          }),
          fieldParagraph(row.claimValue),
          fieldParagraph(row.grade),
          fieldParagraph(row.confidence),
          fieldParagraph(row.notes),
        );
      }
    }
  }

  return out;
}

export function buildScorecardDocx(doc: ScorecardDocument): Document {
  return new Document({
    creator: `${SCORECARD_BRAND} Portal`,
    title: `${SCORECARD_BRAND} ${SCORECARD_EDITION} Scorecard — ${doc.firmName}`,
    description: INSTRUMENT_A_NAME,
    styles: {
      default: {
        document: {
          run: { font: "Calibri", size: 21 },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1008, right: 864, bottom: 864, left: 864 },
          },
        },
        headers: {
          default: new Header({ children: headerFooterChildren(doc, "header") }),
        },
        footers: {
          default: new Footer({ children: headerFooterChildren(doc, "footer") }),
        },
        children: sectionChildren(doc),
      },
    ],
  });
}

export async function renderScorecardDocx(doc: ScorecardDocument): Promise<Buffer> {
  return Buffer.from(await Packer.toBuffer(buildScorecardDocx(doc)));
}
