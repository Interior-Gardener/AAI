// Content helpers for the report. Chapters are written as arrays of these blocks;
// build_report.js turns them into Word paragraphs with the KJSIT formatting rules.

const H1 = (num, title) => ({ t: "h1", num, title });
const H2 = (num, title) => ({ t: "h2", num, title });
const H3 = (num, title) => ({ t: "h3", num, title });
/** Paragraph. Supports **bold**, *italic* and {fig:id} / {tab:id} / {eq:id} references. */
const P = (text) => ({ t: "p", text });
const BUL = (items) => ({ t: "bullets", items });
const NUM = (items) => ({ t: "numbers", items });
/** Figure: file in report/figures (or docs/images via "img:" prefix), caption, width in inches. */
const FIG = (id, file, caption, width = 5.5, maxHeight) => ({ t: "fig", id, file, caption, width, maxHeight });
/** Table: header row, body rows, caption, relative column widths. */
const TAB = (id, headers, rows, caption, widths) => ({ t: "table", id, headers, rows, caption, widths });
/** Displayed equation with a number on the right. */
const EQ = (id, text) => ({ t: "eq", id, text });
/** Monospaced code listing. */
const CODE = (lines, caption) => ({ t: "code", lines, caption });
const BREAK = () => ({ t: "break" });

module.exports = { H1, H2, H3, P, BUL, NUM, FIG, TAB, EQ, CODE, BREAK };
