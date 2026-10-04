/**
 * Builds the Major Project-B report (KJSIT format) as a Word document.
 *
 *   python report/build.py            # recommended: two passes so the Contents page numbers are filled in
 *   node report/build_report.js       # single pass (page numbers resolved by Word: Ctrl+A, F9)
 *
 * Formatting rules from the institute template: Times New Roman; headings 16 pt, sub-headings 14 pt,
 * text 12 pt; 1.5 line spacing; justified; margins left 1.5", others 1"; roman page numbers for the
 * preliminary pages and arabic numbers from Chapter 1.
 */
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const JSZip = require("jszip");
const {
  AlignmentType, BorderStyle, Bookmark, Document, Footer, HeadingLevel, ImageRun, LevelFormat,
  NumberFormat, Packer, PageBreak, PageNumber, PageReference, Paragraph, ShadingType, Table,
  TableCell, TableRow, TabStopType, TextRun, VerticalAlign, WidthType,
} = require("docx");

const ROOT = path.resolve(__dirname, "..");
const FM = require("./front_matter");
const REFS = require("./content/references");
const CHAPTERS = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => require(`./content/ch${n}.js`));
const PAGEMAP_FILE = path.join(__dirname, ".pagemap.json");
const PAGEMAP = fs.existsSync(PAGEMAP_FILE) ? JSON.parse(fs.readFileSync(PAGEMAP_FILE, "utf8")) : {};
const OUT = path.join(__dirname, "PixelProse_Major_Project_Report.docx");

// ------------------------------------------------------------------ page geometry (DXA, 1" = 1440)
const PAGE_W = 11906, PAGE_H = 16838; // A4
const MARGIN = { left: 2160, right: 1440, top: 1440, bottom: 1440 };
const TEXT_W = PAGE_W - MARGIN.left - MARGIN.right; // 8306 DXA ≈ 5.77"
const TEXT_W_IN = TEXT_W / 1440;
const FONT = "Times New Roman";
const LINE = 360; // 1.5 line spacing

// ------------------------------------------------------------------ numbering of figures, tables, equations, refs
const figNum = {}, tabNum = {}, eqNum = {}, refNum = {};
const figList = [], tabList = [], refOrder = [];
CHAPTERS.forEach((blocks, ci) => {
  const ch = ci + 1;
  let f = 0, t = 0, e = 0;
  for (const b of blocks) {
    if (b.t === "fig") { figNum[b.id] = `${ch}.${++f}`; figList.push({ id: b.id, num: figNum[b.id], caption: b.caption }); }
    if (b.t === "table") { tabNum[b.id] = `${ch}.${++t}`; tabList.push({ id: b.id, num: tabNum[b.id], caption: b.caption }); }
    if (b.t === "eq") eqNum[b.id] = `${ch}.${++e}`;
  }
});
// references numbered by first citation, scanning all text in order
const scanRefs = (s) => { for (const m of String(s).matchAll(/\{ref:(\w+)\}/g)) if (!(m[1] in refNum)) { if (!REFS[m[1]]) throw new Error(`Unknown reference ${m[1]}`); refNum[m[1]] = refOrder.push(m[1]); } };
CHAPTERS.forEach((blocks) => blocks.forEach((b) => {
  if (b.text) scanRefs(b.text);
  (b.items || []).forEach(scanRefs);
  (b.rows || []).forEach((row) => row.forEach(scanRefs));
  (b.headers || []).forEach(scanRefs);
}));

function resolve(text) {
  return String(text)
    .replace(/\{fig:(\w+)\}/g, (_, id) => { if (!figNum[id]) throw new Error(`Unknown figure ${id}`); return `Figure ${figNum[id]}`; })
    .replace(/\{tab:(\w+)\}/g, (_, id) => { if (!tabNum[id]) throw new Error(`Unknown table ${id}`); return `Table ${tabNum[id]}`; })
    .replace(/\{eq:(\w+)\}/g, (_, id) => { if (!eqNum[id]) throw new Error(`Unknown equation ${id}`); return `(${eqNum[id]})`; })
    .replace(/(\s*)\{ref:(\w+)\}/g, (_, sp, id) => ` [${refNum[id]}]`)
    .replace(/\] \[/g, "], [");
}

/** Parse **bold** and *italic* into TextRuns. */
function runs(text, base = {}) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0;
  const s = resolve(text);
  for (const m of s.matchAll(re)) {
    if (m.index > last) out.push(new TextRun({ text: s.slice(last, m.index), font: FONT, ...base }));
    const tok = m[0];
    if (tok.startsWith("**")) out.push(new TextRun({ text: tok.slice(2, -2), bold: true, font: FONT, ...base }));
    else out.push(new TextRun({ text: tok.slice(1, -1), italics: true, font: FONT, ...base }));
    last = m.index + tok.length;
  }
  if (last < s.length) out.push(new TextRun({ text: s.slice(last), font: FONT, ...base }));
  return out;
}

// ------------------------------------------------------------------ paragraph helpers
const para = (text, opts = {}) => new Paragraph({
  alignment: AlignmentType.JUSTIFIED, spacing: { line: LINE, after: 60 }, children: runs(text, opts.run || {}), ...opts.p,
});
const center = (text, size = 24, bold = false, after = 0, extra = {}) => new Paragraph({
  alignment: AlignmentType.CENTER, spacing: { line: 276, after },
  children: [new TextRun({ text, font: FONT, size, bold, ...extra })],
});
const blank = (n = 1) => Array.from({ length: n }, () => new Paragraph({ spacing: { line: 276 }, children: [] }));
const pageBreak = () => new Paragraph({ children: [new PageBreak()] });
const titleH = (text, bookmark, before = 0) => new Paragraph({
  heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER, spacing: { before, after: 360, line: 276 },
  children: [new Bookmark({ id: bookmark, children: [new TextRun({ text, font: FONT, size: 32, bold: true })] })],
});

const bm = (s) => s.replace(/[^A-Za-z0-9]/g, "_");
const pageOf = (id) => (PAGEMAP[id] !== undefined ? String(PAGEMAP[id]) : "");

// ------------------------------------------------------------------ images
const imgCache = {};
async function imageRun(file, widthIn, maxHeightIn = 3.5) {
  const p = file.startsWith("img:") ? path.join(ROOT, "docs", "images", file.slice(4)) : path.join(__dirname, file.includes("/") ? file : path.join("figures", file));
  const meta = imgCache[p] || (imgCache[p] = await sharp(p).metadata());
  let w = Math.min(widthIn, TEXT_W_IN - 0.05);
  let h = (w * meta.height) / meta.width;
  if (h > maxHeightIn) { h = maxHeightIn; w = (h * meta.width) / meta.height; }
  const type = /\.jpe?g$/i.test(p) ? "jpg" : "png";
  // Embed at 220 dpi of the printed size: sharp in print, far smaller file.
  const targetW = Math.round(w * 220);
  let data = fs.readFileSync(p);
  if (meta.width > targetW) {
    const img = sharp(p).resize({ width: targetW });
    data = await (type === "jpg" ? img.jpeg({ quality: 85 }) : img.png({ compressionLevel: 9 })).toBuffer();
  }
  return new ImageRun({ type, data, transformation: { width: Math.round(w * 96), height: Math.round(h * 96) } });
}

// ------------------------------------------------------------------ tables
const BORDER = { style: BorderStyle.SINGLE, size: 4, color: "000000" };
const BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
const NOBORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const NOBORDERS = { top: NOBORDER, bottom: NOBORDER, left: NOBORDER, right: NOBORDER };

function cell(content, width, { header = false, align = AlignmentType.LEFT, size = 20, span = 1, borders = BORDERS, bold = false } = {}) {
  const pad = size <= 21 ? 12 : 25; // list tables (contents, figures, tables) are packed tighter
  const children = Array.isArray(content) ? content : [content];
  return new TableCell({
    width: { size: width, type: WidthType.DXA }, columnSpan: span, borders, verticalAlign: VerticalAlign.CENTER,
    shading: header ? { type: ShadingType.CLEAR, fill: "E7E6E6", color: "auto" } : undefined,
    margins: { top: pad, bottom: pad, left: 80, right: 80 },
    children: children.map((c) => (c instanceof Paragraph ? c : new Paragraph({
      alignment: align, spacing: { line: 240 },
      children: runs(String(c), { size, bold: header || bold }),
    }))),
  });
}

function scaleWidths(rel, total = TEXT_W) {
  const sum = rel.reduce((a, b) => a + b, 0);
  const w = rel.map((x) => Math.floor((x / sum) * total));
  w[w.length - 1] += total - w.reduce((a, b) => a + b, 0);
  return w;
}

// ------------------------------------------------------------------ chapter blocks → docx
let numInstance = 0;
async function renderBlock(b, ch) {
  switch (b.t) {
    case "h1":
      return [
        new Paragraph({
          heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER, spacing: { after: 120, line: 276 }, pageBreakBefore: b.num !== 1,
          children: [new Bookmark({ id: `ch_${b.num}`, children: [new TextRun({ text: `CHAPTER ${b.num}`, font: FONT, size: 32, bold: true })] })],
        }),
        center(b.title, 32, true, 360),
      ];
    case "h2":
      return [new Paragraph({
        heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 120, line: LINE }, keepNext: true,
        children: [new Bookmark({ id: `h_${bm(b.num)}`, children: [new TextRun({ text: `${b.num} ${b.title}`, font: FONT, size: 28, bold: true })] })],
      })];
    case "h3":
      return [new Paragraph({
        heading: HeadingLevel.HEADING_3, spacing: { before: 180, after: 80, line: LINE }, keepNext: true,
        children: [new TextRun({ text: `${b.num} ${b.title}`, font: FONT, size: 24, bold: true })],
      })];
    case "p":
      return [para(b.text)];
    case "bullets":
      return b.items.map((it) => new Paragraph({
        alignment: AlignmentType.JUSTIFIED, spacing: { line: LINE, after: 0 }, numbering: { reference: "bullets", level: 0 }, children: runs(it),
      }));
    case "numbers": {
      const inst = ++numInstance;
      return b.items.map((it) => new Paragraph({
        alignment: AlignmentType.JUSTIFIED, spacing: { line: LINE, after: 0 }, numbering: { reference: "numbers", level: 0, instance: inst }, children: runs(it),
      }));
    }
    case "fig": {
      const num = figNum[b.id];
      return [
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 60, after: 40, line: 240 }, keepNext: true, children: [await imageRun(b.file, b.width, b.maxHeight)] }),
        new Paragraph({
          alignment: AlignmentType.CENTER, spacing: { after: 120, line: 240 },
          children: [new Bookmark({ id: `fig_${bm(num)}`, children: [new TextRun({ text: `Figure ${num}: `, font: FONT, size: 22, bold: true })] }),
            new TextRun({ text: b.caption, font: FONT, size: 22 })],
        }),
      ];
    }
    case "table": {
      const num = tabNum[b.id];
      const widths = scaleWidths(b.widths || b.headers.map(() => 1));
      const rows = [new TableRow({ tableHeader: true, children: b.headers.map((h, i) => cell(h, widths[i], { header: true })) })]
        .concat(b.rows.map((r) => new TableRow({ cantSplit: true, children: r.map((c, i) => cell(c, widths[i])) })));
      return [
        new Paragraph({
          alignment: AlignmentType.CENTER, spacing: { before: 200, after: 100, line: 276 }, keepNext: true,
          children: [new Bookmark({ id: `tab_${bm(num)}`, children: [new TextRun({ text: `Table ${num}: `, font: FONT, size: 22, bold: true })] }),
            new TextRun({ text: b.caption, font: FONT, size: 22 })],
        }),
        new Table({ width: { size: TEXT_W, type: WidthType.DXA }, columnWidths: widths, rows }),
        new Paragraph({ spacing: { after: 120 }, children: [] }),
      ];
    }
    case "eq": {
      // Borderless two-column row: the equation wraps inside its cell and the number stays on the right.
      const wEq = TEXT_W - 900;
      return [new Table({
        width: { size: TEXT_W, type: WidthType.DXA }, columnWidths: [wEq, 900],
        rows: [new TableRow({ cantSplit: true, children: [
          new TableCell({ width: { size: wEq, type: WidthType.DXA }, borders: NOBORDERS, verticalAlign: VerticalAlign.CENTER,
            margins: { top: 60, bottom: 60, left: 0, right: 80 },
            children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { line: 300 }, children: [new TextRun({ text: resolve(b.text), font: "Cambria Math", size: 22 })] })] }),
          new TableCell({ width: { size: 900, type: WidthType.DXA }, borders: NOBORDERS, verticalAlign: VerticalAlign.CENTER,
            children: [new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { line: 240 }, children: [new TextRun({ text: `(${eqNum[b.id]})`, font: FONT, size: 24 })] })] }),
        ] })],
      })];
    }
    case "code": {
      const lines = b.lines.map((ln) => new Paragraph({
        spacing: { line: 240, before: 0, after: 0 }, shading: { type: ShadingType.CLEAR, fill: "F3F3F3", color: "auto" },
        children: [new TextRun({ text: resolve(ln) || " ", font: "Courier New", size: 16 })],
      }));
      const cap = b.caption ? [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 80, after: 200 }, children: [new TextRun({ text: `Listing: ${b.caption}`, font: FONT, size: 22, italics: true })] })] : [];
      return [new Paragraph({ spacing: { after: 60 }, children: [] }), ...lines, ...cap];
    }
    case "break":
      return [pageBreak()];
    default:
      throw new Error(`Unknown block ${b.t}`);
  }
}

// ------------------------------------------------------------------ preliminary pages
async function logo(file, h) {
  const p = path.join(__dirname, "assets", file);
  const meta = await sharp(p).metadata();
  return new ImageRun({ type: file.endsWith(".png") ? "png" : "jpg", data: fs.readFileSync(p), transformation: { width: Math.round((h * meta.width) / meta.height), height: h } });
}

async function coverPage(withRoll) {
  const s = FM.students.map((st) => center(withRoll ? `${st.name} (Roll No. ${st.roll || "________"})` : st.name, 28, true, 120));
  return [
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [await logo("mu_logo.png", 110)] }),
    center(FM.title, 32, true, 280),
    center("LY Innovation-Based Major Project-B Report", 24, true, 160),
    center("Submitted in partial fulfillment of the requirements of the Degree of", 24, true, 120),
    center("Bachelor of Technology in Computer Engineering", 24, true, 200),
    center("by", 24, false, 200),
    ...s,
    center(FM.division, 24, false, 360),
    center("Supervisor", 24, true, 120),
    center(FM.guide, 28, true, 360),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [await logo("somaiya_logo.jpeg", 90)] }),
    center("Department of Computer Engineering", 26, false, 160),
    center("K. J. Somaiya Institute of Technology", 26, false, 60),
    center("An Autonomous Institute permanently affiliated to University of Mumbai", 22, true, 20),
    center("Ayurvihar, Sion, Mumbai -400022", 22, true, 20),
    center(FM.year, 22, true, 0),
  ];
}

function signatureBlock(lines, align = AlignmentType.CENTER) {
  return lines.map((l, i) => new Paragraph({ alignment: align, spacing: { line: 276 }, children: [new TextRun({ text: l, font: FONT, size: 24, bold: i < 2 })] }));
}

async function certificatePage() {
  const header = new Table({
    width: { size: TEXT_W, type: WidthType.DXA }, columnWidths: [1600, TEXT_W - 3200, 1600],
    rows: [new TableRow({ children: [
      cell(new Paragraph({ alignment: AlignmentType.LEFT, children: [await logo("somaiya_logo_cert.jpeg", 80)] }), 1600, { borders: NOBORDERS }),
      cell(new Paragraph({ alignment: AlignmentType.CENTER, children: [new Bookmark({ id: "fm_certificate", children: [new TextRun({ text: "CERTIFICATE", font: FONT, size: 32, bold: true })] })] }), TEXT_W - 3200, { borders: NOBORDERS }),
      cell(new Paragraph({ alignment: AlignmentType.RIGHT, children: [await logo("mu_logo.png", 80)] }), 1600, { borders: NOBORDERS }),
    ] })],
  });
  const names = FM.students.map((s) => s.name).join(", ");
  const sigTable = new Table({
    width: { size: TEXT_W, type: WidthType.DXA }, columnWidths: [TEXT_W / 2, TEXT_W / 2],
    rows: [new TableRow({ children: [
      cell(signatureBlock(["_______________________________", `${FM.hod},`, "Head, Department of Computer Engineering"]), TEXT_W / 2, { borders: NOBORDERS }),
      cell(signatureBlock(["_______________________________", FM.principal, "Principal KJSIT"]), TEXT_W / 2, { borders: NOBORDERS }),
    ] })],
  });
  return [
    header,
    ...blank(1),
    new Paragraph({
      alignment: AlignmentType.JUSTIFIED, spacing: { line: LINE, before: 240 },
      children: [
        new TextRun({ text: "This is to certify that the project entitled “", font: FONT, size: 24, italics: true }),
        new TextRun({ text: FM.title, font: FONT, size: 24, italics: true, bold: true }),
        new TextRun({ text: "” is bonafide work of ", font: FONT, size: 24, italics: true }),
        new TextRun({ text: names, font: FONT, size: 24, italics: true, bold: true }),
        new TextRun({ text: " submitted to the University of Mumbai in partial fulfillment of the requirement in Major Project, for the award of the degree of “Bachelors of Technology” in “Computer Engineering”.", font: FONT, size: 24, italics: true }),
      ],
    }),
    ...blank(3),
    ...signatureBlock(["_______________________________", FM.guide, "Project Guide", "Department of Computer Engineering"]),
    ...blank(3),
    sigTable,
    ...blank(5),
    new Paragraph({ children: [new TextRun({ text: `Place: ${FM.place}`, font: FONT, size: 24 })] }),
    new Paragraph({ children: [new TextRun({ text: "Date:", font: FONT, size: 24 })] }),
  ];
}

function approvalPage() {
  return [
    titleH("PROJECT APPROVAL FOR L. Y.", "fm_approval"),
    new Paragraph({ spacing: { line: LINE, after: 120 }, children: [
      new TextRun({ text: "This project report entitled “", font: FONT, size: 24 }),
      new TextRun({ text: FM.title, font: FONT, size: 24, bold: true }),
      new TextRun({ text: "” by", font: FONT, size: 24 }),
    ] }),
    ...FM.students.map((s) => center(`${s.name} (Roll No. ${s.roll || "________"})`, 24, false, 120)),
    new Paragraph({ spacing: { line: LINE, before: 120 }, children: [
      new TextRun({ text: "is an approved Last Year Innovation-Based Major Project ", font: FONT, size: 24 }),
      new TextRun({ text: "in Computer Engineering.", font: FONT, size: 24, bold: true }),
    ] }),
    ...blank(2),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Examiners:", font: FONT, size: 24, bold: true })] }),
    ...blank(2),
    ...["1.  _______________________", "Name and Signature", "External Examiner", "", "", "2.  _______________________", "Name and Signature", "Internal Examiner"].map((t, i) =>
      new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { line: 276 }, children: [new TextRun({ text: t, font: FONT, size: 24, bold: /Examiner/.test(t) && i > 0 })] })),
    ...blank(8),
    new Paragraph({ children: [new TextRun({ text: `Place: ${FM.place}`, font: FONT, size: 24 })] }),
    new Paragraph({ children: [new TextRun({ text: "Date:", font: FONT, size: 24 })] }),
  ];
}

function declarationPage() {
  return [
    titleH("DECLARATION", "fm_declaration"),
    para("We declare that this written submission represents our ideas in our own words and where other's ideas or words have been included, we have adequately cited and referenced the sources. We also declare that we have adhered to all principles of academic honesty and integrity and have not misrepresented or fabricated or falsified any idea/data/fact/source in our submission. We understand that any violation of the above will be cause for disciplinary action by the Institute and can also evoke penal action from the sources which have thus not been properly cited or from whom proper permission has not been taken when needed."),
    ...blank(2),
    ...FM.students.flatMap((s) => [
      new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 360 }, children: [new TextRun({ text: "_______________________", font: FONT, size: 24 })] }),
      new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: s.name, font: FONT, size: 24 })] }),
    ]),
    ...blank(6),
    new Paragraph({ children: [new TextRun({ text: "Date:", font: FONT, size: 24 })] }),
  ];
}

function acknowledgementPage() {
  const p = (children) => new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { line: LINE, after: 200 }, children });
  const t = (text, bold = false) => new TextRun({ text, font: FONT, size: 24, bold });
  return [
    titleH("ACKNOWLEDGEMENT", "fm_ack"),
    p([t("Before presenting our LY Major Project work entitled “"), t(FM.title, true), t("”, we would like to convey our sincere thanks to the people who guided us throughout the course for this project work.")]),
    p([t("First, we would like to express our immense gratitude towards our Project Guide "), t(FM.guide, true), t(" for the constant encouragement, support, guidance, and mentoring at the ongoing stages of the project and report.")]),
    p([t("We would like to express our sincere thanks to our H.O.D. "), t(FM.hod, true), t(", for the encouragement, co-operation, and suggestions progressing stages of the report.")]),
    p([t("We would like to express our sincere thanks to our beloved Principal "), t(FM.principal, true), t(" for providing various facilities to carry out this project.")]),
    p([t("Finally, we would like to thank all the teaching and non-teaching staff of the college, and our friends, for their moral support rendered during the course of the reported work, and for their direct and indirect involvement in the completion of our report work, which made our endeavor fruitful.")]),
    ...blank(3),
    ...FM.students.map((s) => new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { line: 276 }, children: [t(s.name)] })),
    ...blank(3),
    new Paragraph({ children: [t(`Place: ${FM.place}`)] }),
    new Paragraph({ children: [t("Date:")] }),
  ];
}

function abstractPage() {
  return [
    titleH("ABSTRACT", "fm_abstract"),
    ...FM.abstract.map((a) => para(a)),
    new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { line: LINE, before: 120 }, children: [
      new TextRun({ text: "Keywords: ", font: FONT, size: 24, bold: true }), new TextRun({ text: FM.keywords, font: FONT, size: 24, italics: true })] }),
  ];
}

// Front-matter pages never move and use roman numerals, so they are written as plain text;
// chapter pages are live PAGEREF fields (with cached values) that Word can refresh.
const refCell = (id, width) => cell(new Paragraph({
  alignment: AlignmentType.CENTER, spacing: { line: 240 },
  children: id.startsWith("fm_") ? [new TextRun({ text: pageOf(id), font: FONT, size: 21 })] : [new PageReference(id), new TextRun({ text: "", font: FONT })],
}), width, { align: AlignmentType.CENTER });

function contentsPage() {
  const W = scaleWidths([0.75, 0.6, 5.2, 0.9]);
  const row = (a, b, title, id, { bold = false } = {}) => new TableRow({ cantSplit: true, children: [
    cell(a, W[0], { align: AlignmentType.CENTER, size: 21, bold }), cell(b, W[1], { size: 21 }), cell(title, W[2], { size: 21, bold }),
    id ? refCell(id, W[3]) : cell("", W[3]),
  ] });
  const header = new TableRow({ tableHeader: true, children: [
    cell("Chapter No.", W[0] + W[1], { header: true, span: 2, size: 21, align: AlignmentType.CENTER }), cell("TITLE", W[2], { header: true, size: 21 }), cell("Page No.", W[3], { header: true, size: 21, align: AlignmentType.CENTER }),
  ] });
  const rows = [header,
    row("", "", "LIST OF FIGURES", "fm_lof", { bold: true }),
    row("", "", "LIST OF TABLES", "fm_lot", { bold: true }),
    row("", "", "LIST OF ABBREVIATIONS", "fm_abbr", { bold: true }),
  ];
  CHAPTERS.forEach((blocks, ci) => {
    const h1 = blocks.find((b) => b.t === "h1");
    rows.push(row(String(ci + 1), "", h1.title, `ch_${ci + 1}`, { bold: true }));
    blocks.filter((b) => b.t === "h2").forEach((b) => rows.push(row("", b.num, b.title, `h_${bm(b.num)}`)));
  });
  rows.push(row("", "", "REFERENCES", "bm_refs", { bold: true }));
  rows.push(row("", "", "PUBLISHED PAPERS", "bm_papers", { bold: true }));
  rows.push(row("", "", "CERTIFICATES (Paper Publications / Conferences / Competitions)", "bm_certs", { bold: true }));
  rows.push(row("", "", "PLAGIARISM REPORT", "bm_plag", { bold: true }));
  return [titleH("CONTENTS", "fm_contents"), new Table({ width: { size: TEXT_W, type: WidthType.DXA }, columnWidths: W, rows })];
}

function listPage(title, bmId, items, kind) {
  const W = scaleWidths([1.1, 5.2, 1.0]);
  const rows = [new TableRow({ tableHeader: true, children: [
    cell(`${kind} No.`, W[0], { header: true, size: 21, align: AlignmentType.CENTER }), cell("Title", W[1], { header: true, size: 21 }), cell("Page No.", W[2], { header: true, size: 21, align: AlignmentType.CENTER }),
  ] })].concat(items.map((it) => new TableRow({ cantSplit: true, children: [
    cell(it.num, W[0], { size: 21, align: AlignmentType.CENTER }), cell(it.caption, W[1], { size: 21 }),
    refCell(`${kind === "Figure" ? "fig" : "tab"}_${bm(it.num)}`, W[2]),
  ] })));
  return [titleH(title, bmId), new Table({ width: { size: TEXT_W, type: WidthType.DXA }, columnWidths: W, rows })];
}

function abbreviationsPage() {
  const W = scaleWidths([0.8, 1.6, 4.9]);
  const rows = [new TableRow({ tableHeader: true, children: [
    cell("Sr. No", W[0], { header: true, size: 21, align: AlignmentType.CENTER }), cell("Abbreviation", W[1], { header: true, size: 21 }), cell("Description", W[2], { header: true, size: 21 }),
  ] })].concat(FM.abbreviations.map(([a, d], i) => new TableRow({ cantSplit: true, children: [
    cell(String(i + 1), W[0], { size: 21, align: AlignmentType.CENTER }), cell(a, W[1], { size: 21 }), cell(d, W[2], { size: 21 }),
  ] })));
  return [titleH("LIST OF ABBREVIATIONS", "fm_abbr"), new Table({ width: { size: TEXT_W, type: WidthType.DXA }, columnWidths: W, rows })];
}

function referencesPage() {
  return [
    titleH("REFERENCES", "bm_refs"),
    ...refOrder.map((k, i) => new Paragraph({
      alignment: AlignmentType.JUSTIFIED, spacing: { line: 300, after: 100 }, indent: { left: 620, hanging: 620 },
      tabStops: [{ type: TabStopType.LEFT, position: 620 }],
      children: [new TextRun({ text: `[${i + 1}]\t`, font: FONT, size: 24 }), new TextRun({ text: REFS[k], font: FONT, size: 24 })],
    })),
  ];
}

function placeholderPage(title, id, note) {
  return [
    titleH(title, id),
    ...blank(8),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { line: LINE }, children: [new TextRun({ text: note, font: FONT, size: 24, italics: true, color: "7F7F7F" })] }),
  ];
}

// ------------------------------------------------------------------ assemble
const footer = (fmt) => new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 22 })] })] });
const pageProps = (numbering) => ({ page: { size: { width: PAGE_W, height: PAGE_H }, margin: MARGIN, pageNumbers: numbering } });

async function build() {
  const body = [];
  for (const [ci, blocks] of CHAPTERS.entries()) for (const b of blocks) body.push(...(await renderBlock(b, ci + 1)));

  const pb = () => pageBreak();
  const front = [
    ...(await certificatePage()), pb(), ...approvalPage(), pb(), ...declarationPage(), pb(), ...acknowledgementPage(), pb(),
    ...abstractPage(), pb(), ...contentsPage(), pb(), ...listPage("LIST OF FIGURES", "fm_lof", figList, "Figure"), pb(),
    ...listPage("LIST OF TABLES", "fm_lot", tabList, "Table"), pb(), ...abbreviationsPage(),
  ];
  const back = [
    pb(), ...referencesPage(),
    pb(), ...placeholderPage("PUBLISHED PAPERS", "bm_papers", "(Attach the published / communicated research paper(s) based on this project here.)"),
    pb(), ...placeholderPage("CERTIFICATES", "bm_certs", "(Attach paper publication certificates, conferences attended and competitions participated in here.)"),
    pb(), ...placeholderPage("PLAGIARISM REPORT", "bm_plag", "(Attach the first few pages of the plagiarism report here.)"),
  ];

  const doc = new Document({
    creator: FM.students.map((s) => s.name).join(", "),
    title: FM.title,
    description: "LY Innovation-Based Major Project-B Report, K. J. Somaiya Institute of Technology",
    features: { updateFields: true },
    styles: {
      default: { document: { run: { font: FONT, size: 24 }, paragraph: { spacing: { line: LINE } } } },
      paragraphStyles: [
        { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 32, bold: true, font: FONT, color: "000000" }, paragraph: { outlineLevel: 0 } },
        { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 28, bold: true, font: FONT, color: "000000" }, paragraph: { outlineLevel: 1 } },
        { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 24, bold: true, font: FONT, color: "000000" }, paragraph: { outlineLevel: 2 } },
      ],
    },
    numbering: {
      config: [
        { reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 300 } } } }] },
        { reference: "numbers", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 360 } } } }] },
      ],
    },
    sections: [
      { properties: pageProps(undefined), children: [...(await coverPage(false)), pb(), ...(await coverPage(true))] },
      { properties: pageProps({ start: 1, formatType: NumberFormat.LOWER_ROMAN }), footers: { default: footer() }, children: front },
      { properties: pageProps({ start: 1, formatType: NumberFormat.DECIMAL }), footers: { default: footer() }, children: [...body, ...back] },
    ],
  });

  let buf = await Packer.toBuffer(doc);
  buf = await injectPageNumbers(buf);
  fs.writeFileSync(OUT, buf);
  fs.writeFileSync(path.join(__dirname, ".search.json"), JSON.stringify(searchPlan(), null, 1));
  console.log(`wrote ${OUT}  (figures ${figList.length}, tables ${tabList.length}, references ${refOrder.length}, page map ${Object.keys(PAGEMAP).length ? "applied" : "empty"})`);
}

/** Put cached page numbers inside PAGEREF fields so they show correctly even before Word updates fields. */
async function injectPageNumbers(buf) {
  const zip = await JSZip.loadAsync(buf);
  let xml = await zip.file("word/document.xml").async("string");
  let count = 0;
  // docx-js writes <w:r>begin · instrText · end</w:r> without a result; rebuild it as a standard field
  // (begin / instr / separate / cached result / end), keeping it "dirty" so Word refreshes it on open.
  xml = xml.replace(
    /<w:r><w:fldChar w:fldCharType="begin"( w:dirty="true")?\/><w:instrText xml:space="preserve">PAGEREF (\S+?)<\/w:instrText><w:fldChar w:fldCharType="end"\/><\/w:r>/g,
    (_, dirty, id) => {
      count++;
      const rpr = `<w:rPr><w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:cs="${FONT}"/><w:sz w:val="21"/><w:szCs w:val="21"/></w:rPr>`;
      return `<w:r>${rpr}<w:fldChar w:fldCharType="begin" w:dirty="true"/></w:r>` +
        `<w:r>${rpr}<w:instrText xml:space="preserve"> PAGEREF ${id} \\h </w:instrText></w:r>` +
        `<w:r>${rpr}<w:fldChar w:fldCharType="separate"/></w:r>` +
        `<w:r>${rpr}<w:t>${pageOf(id)}</w:t></w:r>` +
        `<w:r>${rpr}<w:fldChar w:fldCharType="end"/></w:r>`;
    },
  );
  if (!count) throw new Error("No PAGEREF fields found to fill");
  // Make line spacing explicitly proportional ("auto"); some renderers treat a missing rule as "exact",
  // which clips images and squashes multi-line titles.
  const autoRule = (x) => x.replace(/<w:spacing((?:(?!w:lineRule)[^>])*?w:line="\d+"(?:(?!w:lineRule)[^>])*?)\/>/g, '<w:spacing$1 w:lineRule="auto"/>');
  xml = autoRule(xml);
  zip.file("word/styles.xml", autoRule(await zip.file("word/styles.xml").async("string")));
  zip.file("word/document.xml", xml);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

/** What build.py should look for in the rendered PDF to find each bookmark's page. */
function searchPlan() {
  const items = [];
  const fm = (id, text) => items.push({ id, text, section: "front" });
  fm("fm_certificate", "CERTIFICATE");
  fm("fm_lof", "LIST OF FIGURES"); fm("fm_lot", "LIST OF TABLES"); fm("fm_abbr", "LIST OF ABBREVIATIONS");
  CHAPTERS.forEach((blocks, ci) => {
    items.push({ id: `ch_${ci + 1}`, text: `CHAPTER ${ci + 1}`, section: "main" });
    for (const b of blocks) {
      if (b.t === "h2") items.push({ id: `h_${bm(b.num)}`, text: `${b.num} ${b.title}`, section: "main" });
      if (b.t === "fig") items.push({ id: `fig_${bm(figNum[b.id])}`, text: `Figure ${figNum[b.id]}:`, section: "main" });
      if (b.t === "table") items.push({ id: `tab_${bm(tabNum[b.id])}`, text: `Table ${tabNum[b.id]}:`, section: "main" });
    }
  });
  items.push({ id: "bm_refs", text: "REFERENCES", section: "main" });
  items.push({ id: "bm_papers", text: "PUBLISHED PAPERS", section: "main" });
  items.push({ id: "bm_certs", text: "CERTIFICATES", section: "main" });
  items.push({ id: "bm_plag", text: "PLAGIARISM REPORT", section: "main" });
  return items;
}

build().catch((e) => { console.error(e); process.exit(1); });
