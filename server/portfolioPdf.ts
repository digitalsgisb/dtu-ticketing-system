import fs from "node:fs";
import type { Writable } from "node:stream";
import PDFDocument from "pdfkit";
import sharp from "sharp";

export type PortfolioPdfImage = {
  caption: string;
  path: string;
  mimeType: string;
};

export type PortfolioPdfProject = {
  name: string;
  summary: string;
  department: string;
  overview: string;
  problem: string;
  solution: string;
  features: string[];
  impact: string;
  contribution: string;
  technologies: string[];
  cover: PortfolioPdfImage | null;
  gallery: PortfolioPdfImage[];
};

export type PortfolioPdfData = {
  title: string;
  intro: string;
  generatedAt: Date;
  logoPath: string;
  projects: PortfolioPdfProject[];
};

const page = { width: 595.28, height: 841.89, margin: 46 };
const colours = {
  navy: "#061D29",
  deepNavy: "#03141D",
  teal: "#21A79F",
  mint: "#79D8D1",
  paper: "#F5F6F2",
  ink: "#14313B",
  muted: "#62767C",
  line: "#D7E1DF",
  white: "#FFFFFF"
};

function clean(value: string | null | undefined) {
  return String(value ?? "")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, "")
    .trim();
}

async function safeImage(doc: PDFKit.PDFDocument, image: PortfolioPdfImage | null, x: number, y: number, width: number, height: number) {
  doc.save().roundedRect(x, y, width, height, 8).fill("#0A2733");
  if (!image || !["image/jpeg", "image/png", "image/webp"].includes(image.mimeType)) {
    doc.fillColor("#71919A").font("Helvetica-Bold").fontSize(9)
      .text(image ? "Preview unavailable in PDF" : "Project preview", x, y + height / 2 - 5, { width, align: "center" });
    doc.restore();
    return;
  }
  try {
    const original = await fs.promises.readFile(image.path);
    const buffer = image.mimeType === "image/webp" ? await sharp(original).png().toBuffer() : original;
    doc.image(buffer, x, y, { fit: [width, height], align: "center", valign: "center" });
  } catch {
    doc.fillColor("#71919A").font("Helvetica-Bold").fontSize(9)
      .text("Preview unavailable in PDF", x, y + height / 2 - 5, { width, align: "center" });
  }
  doc.restore();
}

function fitTitle(doc: PDFKit.PDFDocument, value: string, maxWidth: number, maxHeight: number, initialSize: number) {
  let size = initialSize;
  doc.font("Helvetica-Bold");
  while (size > 25 && doc.fontSize(size).heightOfString(value, { width: maxWidth, lineGap: -2 }) > maxHeight) size -= 1;
  return size;
}

export async function writeShowcasePortfolioPdf(data: PortfolioPdfData, output: Writable) {
  const doc = new PDFDocument({
    autoFirstPage: false,
    bufferPages: true,
    size: "A4",
    margins: { top: page.margin, right: page.margin, bottom: page.margin, left: page.margin },
    info: {
      Title: clean(data.title),
      Author: "Digital Transformation Unit - Sugihara Grand Industries Sdn Bhd",
      Subject: "Digital transformation project portfolio and case studies",
      Keywords: "DTU, digital transformation, project portfolio, case study"
    }
  });
  doc.pipe(output);

  const darkPages = new Set<number>();
  const projectPages: number[] = [];
  const pageIndex = () => doc.bufferedPageRange().start + doc.bufferedPageRange().count - 1;
  const addPage = (dark = false) => {
    doc.addPage();
    const index = pageIndex();
    if (dark) darkPages.add(index);
    doc.rect(0, 0, page.width, page.height).fill(dark ? colours.navy : colours.paper);
    return index;
  };
  const addContentHeader = (label: string) => {
    doc.fillColor(colours.teal).font("Helvetica-Bold").fontSize(8).text("SUGIHARA GRAND INDUSTRIES", page.margin, 30, { width: 215, characterSpacing: 1.3, lineBreak: false });
    doc.fillColor(colours.muted).font("Helvetica").fontSize(8).text(clean(label), 275, 30, { width: page.width - page.margin - 275, height: 10, align: "right", ellipsis: true, lineBreak: false });
    doc.moveTo(page.margin, 49).lineTo(page.width - page.margin, 49).lineWidth(0.7).stroke(colours.line);
  };

  // Cover
  addPage(true);
  doc.rect(page.margin, 58, 54, 5).fill(colours.teal);
  try { doc.image(data.logoPath, page.margin, 86, { fit: [205, 50], valign: "center" }); } catch { /* optional brand asset */ }
  doc.fillColor(colours.mint).font("Helvetica-Bold").fontSize(9).text("DTU / DIGITAL TRANSFORMATION PORTFOLIO", page.margin, 192, { characterSpacing: 1.7 });
  const coverTitle = clean(data.title) || "Digital Transformation & Innovation Portfolio";
  doc.fillColor(colours.white).font("Helvetica-Bold").fontSize(fitTitle(doc, coverTitle, 485, 190, 47))
    .text(coverTitle, page.margin, 224, { width: 485, lineGap: -2 });
  doc.fillColor("#9AB7BE").font("Helvetica").fontSize(12).text(clean(data.intro), page.margin, 440, { width: 430, height: 145, lineGap: 5, ellipsis: true });
  doc.moveTo(page.margin, 650).lineTo(page.width - page.margin, 650).lineWidth(1).stroke("#17434D");
  doc.fillColor(colours.white).font("Helvetica-Bold").fontSize(34).text(String(data.projects.length).padStart(2, "0"), page.margin, 680);
  doc.fillColor("#88A9B0").font("Helvetica-Bold").fontSize(8).text("APPROVED SYSTEMS", page.margin + 58, 690, { characterSpacing: 1.2 });
  const generated = new Intl.DateTimeFormat("en-MY", { dateStyle: "long", timeZone: "Asia/Kuala_Lumpur" }).format(data.generatedAt);
  doc.fillColor("#88A9B0").font("Helvetica").fontSize(8).text(`Generated ${generated}`, page.margin, 758);

  // Contents placeholders (filled after project pages are known).
  const contentsPageCount = Math.max(1, Math.ceil(data.projects.length / 20));
  for (let contentsPage = 0; contentsPage < contentsPageCount; contentsPage += 1) {
    addPage(false);
    addContentHeader(contentsPage ? `Portfolio index / ${contentsPage + 1}` : "Portfolio index");
    doc.fillColor(colours.teal).font("Helvetica-Bold").fontSize(9).text("CONTENTS", page.margin, 86, { characterSpacing: 1.5 });
    doc.fillColor(colours.ink).font("Helvetica-Bold").fontSize(32).text(contentsPage ? "Projects, continued" : "Projects at a glance", page.margin, 108);
    doc.fillColor(colours.muted).font("Helvetica").fontSize(10).text("Each entry includes its visitor-approved case study and project gallery.", page.margin, 151);
  }

  const addProjectHeader = (project: PortfolioPdfProject, index: number, continuation = false) => {
    addContentHeader(`${String(index + 1).padStart(2, "0")} / ${String(data.projects.length).padStart(2, "0")} - ${clean(project.name)}${continuation ? " / continued" : ""}`);
  };
  const startCasePage = (project: PortfolioPdfProject, index: number, continuation = false) => {
    addPage(false);
    addProjectHeader(project, index, continuation);
    doc.x = page.margin;
    doc.y = 78;
  };
  const ensureSpace = (height: number, project: PortfolioPdfProject, index: number) => {
    if (doc.y + height <= page.height - 62) return;
    startCasePage(project, index, true);
  };
  const flowingText = (value: string, project: PortfolioPdfProject, index: number) => {
    const words = value.split(/\s+/).filter(Boolean);
    let offset = 0;
    while (offset < words.length) {
      let available = page.height - 76 - doc.y;
      if (available < 34) {
        startCasePage(project, index, true);
        available = page.height - 76 - doc.y;
      }
      let low = 1;
      let high = words.length - offset;
      let best = 1;
      while (low <= high) {
        const middle = Math.floor((low + high) / 2);
        const candidate = words.slice(offset, offset + middle).join(" ");
        const height = doc.font("Helvetica").fontSize(10.5).heightOfString(candidate, { width: page.width - page.margin * 2, lineGap: 4 });
        if (height <= available) { best = middle; low = middle + 1; }
        else high = middle - 1;
      }
      doc.fillColor(colours.muted).font("Helvetica").fontSize(10.5)
        .text(words.slice(offset, offset + best).join(" "), { width: page.width - page.margin * 2, lineGap: 4 });
      offset += best;
      if (offset < words.length) startCasePage(project, index, true);
    }
  };
  const section = (number: string, title: string, body: string, project: PortfolioPdfProject, index: number) => {
    const value = clean(body);
    if (!value) return;
    const textHeight = doc.font("Helvetica").fontSize(10.5).heightOfString(value, { width: page.width - page.margin * 2, lineGap: 4 });
    ensureSpace(Math.min(textHeight + 54, 240), project, index);
    doc.fillColor(colours.teal).font("Helvetica-Bold").fontSize(8).text(number, page.margin, doc.y, { characterSpacing: 1.2 });
    doc.moveDown(0.55);
    doc.fillColor(colours.ink).font("Helvetica-Bold").fontSize(19).text(title, { width: page.width - page.margin * 2 });
    doc.moveDown(0.35);
    flowingText(value, project, index);
    doc.moveDown(1.15);
    if (doc.y < page.height - 80) doc.moveTo(page.margin, doc.y).lineTo(page.width - page.margin, doc.y).lineWidth(0.6).stroke(colours.line);
    doc.moveDown(1.1);
  };

  for (let index = 0; index < data.projects.length; index += 1) {
    const project = data.projects[index];
    // Project opener
    const openerIndex = addPage(true);
    projectPages[index] = openerIndex + 1;
    doc.fillColor(colours.mint).font("Helvetica-Bold").fontSize(8)
      .text(`${String(index + 1).padStart(2, "0")} / ${String(data.projects.length).padStart(2, "0")}   ${clean(project.department).toUpperCase()}   CASE STUDY`, page.margin, 54, { characterSpacing: 1.2 });
    const title = clean(project.name);
    doc.fillColor(colours.white).font("Helvetica-Bold").fontSize(fitTitle(doc, title, 500, 120, 39))
      .text(title, page.margin, 89, { width: 500, lineGap: -1 });
    doc.fillColor("#9AB7BE").font("Helvetica").fontSize(11).text(clean(project.summary), page.margin, 218, { width: 500, height: 92, lineGap: 4, ellipsis: true });
    await safeImage(doc, project.cover, page.margin, 341, page.width - page.margin * 2, 283);
    doc.fillColor(colours.white).font("Helvetica-Bold").fontSize(24).text(String(project.features.length).padStart(2, "0"), page.margin, 670);
    doc.fillColor("#7E9EA6").font("Helvetica-Bold").fontSize(8).text("KEY FUNCTIONS", page.margin + 42, 680, { characterSpacing: 1 });
    doc.fillColor(colours.white).font("Helvetica-Bold").fontSize(24).text(String(project.gallery.length).padStart(2, "0"), page.margin + 182, 670);
    doc.fillColor("#7E9EA6").font("Helvetica-Bold").fontSize(8).text("GALLERY IMAGES", page.margin + 224, 680, { characterSpacing: 1 });

    // Case-study narrative
    startCasePage(project, index);
    doc.fillColor(colours.teal).font("Helvetica-Bold").fontSize(9).text("THE CASE STUDY", page.margin, 82, { characterSpacing: 1.5 });
    doc.fillColor(colours.ink).font("Helvetica-Bold").fontSize(31).text("Built around the work.", page.margin, 105);
    doc.fillColor(colours.muted).font("Helvetica").fontSize(10).text("The purpose, approach, and value behind this system.", page.margin, 147);
    doc.y = 190;
    section("01 / OVERVIEW", "What the system is", project.overview || project.summary, project, index);
    section("02 / CHALLENGE", "What needed to change", project.problem, project, index);
    section("03 / SOLUTION", "How the system responds", project.solution || project.summary, project, index);

    if (project.features.length) {
      ensureSpace(82, project, index);
      doc.fillColor(colours.teal).font("Helvetica-Bold").fontSize(8).text("04 / CORE FUNCTIONS", page.margin, doc.y, { characterSpacing: 1.2 });
      doc.moveDown(0.55);
      doc.fillColor(colours.ink).font("Helvetica-Bold").fontSize(19).text("What it does");
      doc.moveDown(0.55);
      project.features.forEach((feature, featureIndex) => {
        const value = clean(feature);
        const height = doc.font("Helvetica").fontSize(10.5).heightOfString(value, { width: 450, lineGap: 3 }) + 15;
        ensureSpace(height, project, index);
        doc.fillColor(colours.teal).font("Helvetica-Bold").fontSize(9).text(String(featureIndex + 1).padStart(2, "0"), page.margin, doc.y + 1, { width: 28 });
        doc.fillColor(colours.muted).font("Helvetica").fontSize(10.5).text(value, page.margin + 38, doc.y, { width: 450, lineGap: 3 });
        doc.moveDown(0.75);
      });
      doc.moveDown(0.5);
      doc.moveTo(page.margin, doc.y).lineTo(page.width - page.margin, doc.y).lineWidth(0.6).stroke(colours.line);
      doc.moveDown(1.1);
    }
    section("05 / OUTCOME", "Impact on the work", project.impact, project, index);
    section("06 / CONTRIBUTION", "Role in the delivery", project.contribution, project, index);
    if (project.technologies.length) section("07 / TECHNOLOGY", "Built with", project.technologies.join("  /  "), project, index);

    // Approved gallery - one image per page for a presentation-quality result.
    for (let galleryIndex = 0; galleryIndex < project.gallery.length; galleryIndex += 1) {
      const image = project.gallery[galleryIndex];
      addPage(true);
      doc.fillColor(colours.mint).font("Helvetica-Bold").fontSize(8)
        .text(`${String(index + 1).padStart(2, "0")} / PROJECT GALLERY   ${String(galleryIndex + 1).padStart(2, "0")} / ${String(project.gallery.length).padStart(2, "0")}`, page.margin, 48, { characterSpacing: 1.1 });
      doc.fillColor(colours.white).font("Helvetica-Bold").fontSize(21).text(clean(project.name), page.margin, 72, { width: 500 });
      await safeImage(doc, image, page.margin, 132, page.width - page.margin * 2, 560);
      doc.fillColor("#9AB7BE").font("Helvetica").fontSize(10).text(clean(image.caption) || `Project image ${galleryIndex + 1}`, page.margin, 716, { width: page.width - page.margin * 2 });
    }
  }

  // Populate the contents pages now that project start pages are known.
  const rowsPerColumn = 10;
  data.projects.forEach((project, index) => {
    const contentsPage = Math.floor(index / 20);
    const position = index % 20;
    doc.switchToPage(1 + contentsPage);
    const column = Math.floor(position / rowsPerColumn);
    const row = position % rowsPerColumn;
    const x = page.margin + column * 254;
    const y = 205 + row * 52;
    const width = 223;
    doc.fillColor(colours.teal).font("Helvetica-Bold").fontSize(8).text(String(index + 1).padStart(2, "0"), x, y, { width: 22 });
    doc.fillColor(colours.ink).font("Helvetica-Bold").fontSize(9.5).text(clean(project.name), x + 28, y, { width: width - 55, height: 25, ellipsis: true });
    doc.fillColor(colours.muted).font("Helvetica").fontSize(7.5).text(clean(project.department).toUpperCase(), x + 28, y + 28, { width: width - 55, characterSpacing: 0.5 });
    doc.fillColor(colours.teal).font("Helvetica-Bold").fontSize(9).text(String(projectPages[index]), x + width - 25, y, { width: 25, align: "right" });
    doc.moveTo(x, y + 42).lineTo(x + width, y + 42).lineWidth(0.45).stroke(colours.line);
  });
  if (!data.projects.length) {
    doc.switchToPage(1);
    doc.fillColor(colours.muted).font("Helvetica").fontSize(12).text("No projects are currently included in this showcase.", page.margin, 220);
  }

  // Page numbers and document footer.
  const range = doc.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index += 1) {
    doc.switchToPage(index);
    const dark = darkPages.has(index);
    doc.fillColor(dark ? "#7899A2" : colours.muted).font("Helvetica").fontSize(7.5)
      .text("DTU DIGITAL TRANSFORMATION PORTFOLIO", page.margin, 785, { characterSpacing: 0.8 });
    doc.fillColor(dark ? colours.mint : colours.teal).font("Helvetica-Bold").fontSize(8)
      .text(String(index + 1).padStart(2, "0"), page.width - page.margin - 30, 785, { width: 30, align: "right" });
  }

  doc.end();
}
