const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");
const INPUT_MD = path.join(ROOT_DIR, "md", "demo-content.md");
const OUTPUT_HTML = path.join(ROOT_DIR, "index.html");

const AUDIO_EXT_RE = /\.(wav|mp3|m4a|flac|ogg)(\?.*)?$/i;
const H2_RE = /^##\s+(.+)$/;
const H3_RE = /^###\s+(.+)$/;

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function slugify(text) {
    return String(text)
        .trim()
        .toLowerCase()
        .replace(/[^\w\u4e00-\u9fa5\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-");
}

function splitCsv(value) {
    return String(value || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
}

function getMetaValue(metaLines, keyPattern) {
    const line = metaLines.find((entry) => keyPattern.test(entry.trim()));
    if (!line) {
        return "";
    }
    return line.split(":").slice(1).join(":").trim();
}

function parseTopMeta(lines) {
    let pageTitle = "VoxCPM2 Demo Page";
    let workTitle = "";
    let pageSubtitle = "";
    let team = "";
    let teamMembers = "";
    let heroImage = "";
    let teamLogos = [];
    let projectLink = "";
    let huggingFaceLink = "";
    let modelScopeLink = "";
    let demoLink = "";
    let audioBase = "";

    const firstH2Index = lines.findIndex((line) => line.trim().startsWith("## "));
    const metaLines = firstH2Index >= 0 ? lines.slice(0, firstH2Index) : lines;

    const firstH1 = metaLines.find((line) => line.trim().startsWith("# "));
    if (firstH1) {
        pageTitle = firstH1.trim().slice(2).trim();
    }

    workTitle = getMetaValue(metaLines, /^(工作标题|work_title|paper_title)\s*:/i) || pageTitle;
    pageSubtitle = getMetaValue(metaLines, /^(副标题|subtitle|page_subtitle)\s*:/i);
    team =
        getMetaValue(metaLines, /^(团队|team|authors|作者)\s*:/i) ||
        getMetaValue(metaLines, /^(作者)\s*:/i);
    teamMembers = getMetaValue(metaLines, /^(团队组成|team_members|affiliations)\s*:/i);
    heroImage = getMetaValue(metaLines, /^(封面图|hero_image|cover_image)\s*:/i);
    teamLogos = splitCsv(getMetaValue(metaLines, /^(团队logo|team_logos?)\s*:/i));
    projectLink = getMetaValue(metaLines, /^(项目链接|project_link)\s*:/i);
    huggingFaceLink = getMetaValue(metaLines, /^(huggingface链接|hugging_face_link|hf_link)\s*:/i);
    modelScopeLink = getMetaValue(metaLines, /^(modelscope链接|modelscope_link|ms_link)\s*:/i);
    demoLink = getMetaValue(metaLines, /^(演示链接|demo_link)\s*:/i);
    audioBase = getMetaValue(metaLines, /^(音频根路径|audio_root|audio_base)\s*:/i);

    return {
        pageTitle,
        workTitle,
        pageSubtitle,
        team,
        teamMembers,
        heroImage,
        teamLogos,
        projectLink,
        huggingFaceLink,
        modelScopeLink,
        demoLink,
        audioBase,
    };
}

function extractAudioBaseFromLine(line) {
    const trimmed = line.trim();
    const match = trimmed.match(/^(音频根路径|audio_root|audio_base)\s*:\s*(.+)$/i);
    if (!match) {
        return "";
    }
    return match[2].trim();
}

function getHeadingContent(lines, headingName) {
    const start = lines.findIndex((line) => line.trim() === `## ${headingName}`);
    if (start < 0) {
        return "";
    }

    const content = [];
    for (let i = start + 1; i < lines.length; i += 1) {
        if (lines[i].trim().startsWith("## ")) {
            break;
        }
        content.push(lines[i]);
    }

    return content.join("\n").trim();
}

function parseTableRow(rowLine) {
    let row = rowLine.trim();
    if (row.startsWith("|")) {
        row = row.slice(1);
    }
    if (row.endsWith("|")) {
        row = row.slice(0, -1);
    }
    return row.split("|").map((cell) => cell.trim());
}

function isSeparatorRow(cells) {
    if (!cells.length) {
        return false;
    }
    return cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function parseTable(lines, startIndex) {
    const tableLines = [];
    let i = startIndex;

    while (i < lines.length && lines[i].trim().startsWith("|")) {
        tableLines.push(lines[i].trim());
        i += 1;
    }

    const rows = tableLines
        .map(parseTableRow)
        .filter((cells) => cells.length && cells.some((c) => c !== ""));

    if (!rows.length) {
        return { table: null, nextIndex: i };
    }

    let header = rows[0];
    let body = rows.slice(1);
    if (rows.length > 1 && isSeparatorRow(rows[1])) {
        body = rows.slice(2);
    }

    return {
        table: { header, rows: body },
        nextIndex: i,
    };
}

function parseSection(lines, startIndex, endIndex, inheritedAudioBase) {
    const blocks = [];
    let sectionAudioBase = inheritedAudioBase || "";
    let i = startIndex;

    while (i < endIndex) {
        const line = lines[i].trim();

        if (!line) {
            i += 1;
            continue;
        }

        const audioBaseValue = extractAudioBaseFromLine(line);
        if (audioBaseValue) {
            sectionAudioBase = audioBaseValue;
            i += 1;
            continue;
        }

        const h3Match = line.match(H3_RE);
        if (h3Match) {
            const card = {
                type: "card",
                title: h3Match[1].trim(),
                content: [],
            };
            i += 1;

            while (i < endIndex) {
                const childLine = lines[i].trim();
                if (childLine.match(H3_RE)) {
                    break;
                }
                if (!childLine) {
                    i += 1;
                    continue;
                }

                if (childLine.startsWith("|")) {
                    const { table, nextIndex } = parseTable(lines, i);
                    if (table) {
                        card.content.push({ type: "table", table });
                    }
                    i = nextIndex;
                    continue;
                }

                card.content.push({ type: "text", text: childLine });
                i += 1;
            }

            blocks.push(card);
            continue;
        }

        if (line.startsWith("|")) {
            const { table, nextIndex } = parseTable(lines, i);
            if (table) {
                blocks.push({ type: "table", table });
            }
            i = nextIndex;
            continue;
        }

        blocks.push({ type: "text", text: line });
        i += 1;
    }

    return { blocks, audioBase: sectionAudioBase };
}

function parseSections(lines, subtitle, defaultAudioBase) {
    const sections = [];
    const skipH2 = new Set(["页面简介", "页面说明（可选）", "使用说明", "Abstract", "摘要", "Key Features", "关键特性"]);

    const h2List = [];
    for (let i = 0; i < lines.length; i += 1) {
        const match = lines[i].trim().match(H2_RE);
        if (match) {
            h2List.push({ index: i, title: match[1].trim() });
        }
    }

    for (let i = 0; i < h2List.length; i += 1) {
        const current = h2List[i];
        const next = h2List[i + 1];
        const endIndex = next ? next.index : lines.length;

        if (skipH2.has(current.title)) {
            continue;
        }

        if (subtitle && current.title === subtitle && current.index < lines.findIndex((l) => l.trim() === "## 页面简介")) {
            continue;
        }

        const parsedSection = parseSection(lines, current.index + 1, endIndex, defaultAudioBase);
        if (!parsedSection.blocks.length) {
            continue;
        }

        sections.push({
            title: current.title,
            id: slugify(current.title),
            blocks: parsedSection.blocks,
            audioBase: parsedSection.audioBase,
        });
    }

    return sections;
}

function parseFeatureList(rawText) {
    const lines = String(rawText || "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

    const bullets = lines
        .filter((line) => /^-\s*/.test(line))
        .map((line) => line.replace(/^-\s*/, ""));

    if (bullets.length > 0) {
        return bullets;
    }

    return lines;
}

function resolveAudioSrc(pathText, audioBase) {
    const raw = pathText.trim();
    if (!audioBase) {
        return raw;
    }

    if (/^https?:\/\//i.test(raw)) {
        return raw;
    }

    if (/^[a-zA-Z]:[\\/]/.test(raw) || raw.startsWith("/") || raw.startsWith("./") || raw.startsWith("../")) {
        return raw;
    }

    const base = audioBase.replace(/\\/g, "/").replace(/\/+$/, "");
    const value = raw.replace(/\\/g, "/").replace(/^\/+/, "");
    if (!base) {
        return value;
    }

    if (value === base || value.startsWith(`${base}/`)) {
        return value;
    }

    return `${base}/${value}`;
}

function renderAudio(pathText, audioBase) {
    const src = resolveAudioSrc(pathText, audioBase);
    const safePath = escapeHtml(src);
    return `<audio controls="controls" style="width: 220px;"><source src="${safePath}"></audio>`;
}

function renderCell(cellText, audioBase) {
    const text = cellText.trim();
    if (!text) {
        return "";
    }
    if (AUDIO_EXT_RE.test(text)) {
        return renderAudio(text, audioBase);
    }
    return escapeHtml(text)
        .replace(/\\n/g, "<br>")
        .replace(/\n/g, "<br>");
}

function normalizeRowLength(row, targetLength) {
    const normalized = [...row];
    while (normalized.length < targetLength) {
        normalized.push("");
    }
    return normalized.slice(0, targetLength);
}

function isMergeMarker(cellText) {
    const token = String(cellText || "").trim();
    return token === "___" || token === "_";
}

function buildMergedRows(bodyRows, columnCount) {
    const matrix = bodyRows.map((row) =>
        normalizeRowLength(row, columnCount).map((cellText) => ({
            text: cellText,
            rowspan: 1,
            skip: false,
        }))
    );

    const anchors = new Array(columnCount).fill(-1);

    for (let rowIndex = 0; rowIndex < matrix.length; rowIndex += 1) {
        for (let colIndex = 0; colIndex < columnCount; colIndex += 1) {
            const cell = matrix[rowIndex][colIndex];

            if (isMergeMarker(cell.text)) {
                const anchorRow = anchors[colIndex];
                if (anchorRow >= 0) {
                    matrix[anchorRow][colIndex].rowspan += 1;
                    cell.skip = true;
                } else {
                    cell.text = "";
                    anchors[colIndex] = rowIndex;
                }
                continue;
            }

            anchors[colIndex] = rowIndex;
        }
    }

    return matrix;
}

function renderTable(table, audioBase) {
    const header = table.header || [];
    const bodyRows = table.rows || [];
    const inferredColumns = bodyRows.reduce((maxLen, row) => Math.max(maxLen, row.length), 0);
    const columnCount = header.length || inferredColumns;
    const mergedRows = buildMergedRows(bodyRows, columnCount);

    const headerHtml = header.map((cell) => `<th>${escapeHtml(cell)}</th>`).join("");

    const rowHtml = mergedRows
        .map((row) => {
            const cellHtml = row
                .map((cell) => {
                    if (cell.skip) {
                        return "";
                    }

                    const rowspanAttr = cell.rowspan > 1 ? ` rowspan="${cell.rowspan}"` : "";
                    return `<td${rowspanAttr}>${renderCell(cell.text, audioBase)}</td>`;
                })
                .join("");
            return `<tr>${cellHtml}</tr>`;
        })
        .join("\n");

    return `
<div class="table-wrap">
  <table class="demo-table">
    <thead>
      <tr>${headerHtml}</tr>
    </thead>
    <tbody>
      ${rowHtml}
    </tbody>
  </table>
</div>`;
}

function renderBlock(block, audioBase) {
    if (block.type === "text") {
        return `<p class="section-note">${escapeHtml(block.text)}</p>`;
    }

    if (block.type === "table") {
        return renderTable(block.table, audioBase);
    }

    if (block.type === "card") {
        const contentHtml = block.content.map((item) => renderBlock(item, audioBase)).join("\n");
        return `
<div class="sub-card">
  <h3>${escapeHtml(block.title)}</h3>
  ${contentHtml}
</div>`;
    }

    return "";
}

function renderLinkChips(parsed) {
    const badges = [
        parsed.projectLink
            ? `<a href="${escapeHtml(parsed.projectLink)}"><img src="https://img.shields.io/badge/Project%20Page-GitHub-blue" alt="Project Page"></a>`
            : "",
        parsed.huggingFaceLink
            ? `<a href="${escapeHtml(parsed.huggingFaceLink)}"><img src="https://img.shields.io/badge/%F0%9F%A4%97%20Hugging%20Face-OpenBMB-yellow" alt="Hugging Face"></a>`
            : "",
        parsed.modelScopeLink
            ? `<a href="${escapeHtml(parsed.modelScopeLink)}"><img src="https://img.shields.io/badge/ModelScope-OpenBMB-purple" alt="ModelScope"></a>`
            : "",
        parsed.demoLink
            ? `<a href="${escapeHtml(parsed.demoLink)}"><img src="https://img.shields.io/badge/Live%20PlayGround-Demo-orange" alt="Live Demo"></a>`
            : "",
    ].filter(Boolean);

    if (badges.length === 0) {
        return "";
    }

    return `<div class="link-badges">${badges.join("\n")}</div>`;
}

function renderHtml(parsed) {
    const tocHtml = parsed.sections
        .map((section) => `<li><a href="#${section.id}">${escapeHtml(section.title)}</a></li>`)
        .join("\n");

    const sectionsHtml = parsed.sections
        .map((section) => {
            let effectiveAudioBase = section.audioBase || parsed.audioBase || "";
            const visibleBlocks = [];

            section.blocks.forEach((block) => {
                if (block.type === "text") {
                    const declaredAudioBase = extractAudioBaseFromLine(block.text);
                    if (declaredAudioBase) {
                        effectiveAudioBase = declaredAudioBase;
                        return;
                    }
                }
                visibleBlocks.push(block);
            });

            const blocksHtml = visibleBlocks
                .map((block) => renderBlock(block, effectiveAudioBase))
                .join("\n");

            return `
<section class="section-card" id="${section.id}">
  <h2>${escapeHtml(section.title)}</h2>
  ${blocksHtml}
</section>`;
        })
        .join("\n");

    const heroHtml = parsed.heroImage
        ? `<div class="hero-image"><img src="${escapeHtml(parsed.heroImage)}" alt="hero"></div>`
        : "";

    const logosHtml = parsed.teamLogos.length
        ? `<div class="logo-row">${parsed.teamLogos
            .map((logoPath) => `<img src="${escapeHtml(logoPath)}" alt="team-logo">`)
            .join("")}</div>`
        : "";

    const introHtml = parsed.intro ? `<p class="lead">${escapeHtml(parsed.intro).replace(/\n/g, "<br>")}</p>` : "";
    const notesHtml = parsed.notes ? `<p class="lead">${escapeHtml(parsed.notes).replace(/\n/g, "<br>")}</p>` : "";
    const abstractHtml = parsed.abstract ? `<p><strong>Abstract:</strong> ${escapeHtml(parsed.abstract).replace(/\n/g, "<br>")}</p>` : "";
    const keyFeaturesHtml = parsed.keyFeatures.length
        ? `<div><p><strong>Key Features</strong></p><ul>${parsed.keyFeatures
            .map((item) => `<li>${item ? escapeHtml(item) : "&nbsp;"}</li>`)
            .join("")}</ul></div>`
        : "";

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(parsed.pageTitle)}</title>
  <style>
    :root {
      --bg: #edf2f7;
      --panel: #fbfdff;
      --panel-2: #f4f7fb;
      --text: #1f2937;
      --muted: #667085;
      --line: #dbe4ee;
      --line-strong: #c8d4e2;
      --accent: #466486;
      --accent-soft: #e8eff8;
      --radius: 16px;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
      background: radial-gradient(1200px 420px at 10% -10%, #e7edf6 0%, transparent 62%),
                  radial-gradient(980px 360px at 95% 0%, #e3ebf4 0%, transparent 58%),
                  linear-gradient(180deg, #f6f9fc 0%, var(--bg) 100%);
      color: var(--text);
      line-height: 1.65;
    }

    .page {
      width: min(1180px, 94vw);
      margin: 34px auto 72px;
    }

    .hero {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 24px;
      padding: 34px 36px;
      box-shadow: 0 12px 34px rgba(43, 61, 86, 0.08);
    }

    .hero-copy {
      max-width: 920px;
      margin: 0 auto;
      text-align: center;
    }

    .hero-image {
      display: flex;
      justify-content: center;
      margin-bottom: 18px;
    }

    .hero-image img {
      width: min(760px, 100%);
      height: auto;
      border-radius: 0;
      box-shadow: none;
      border: none;
      background: transparent;
    }

    .hero h1 {
      margin: 8px 0 0;
      font-size: clamp(1.8rem, 2.4vw, 2.6rem);
      letter-spacing: -0.02em;
      line-height: 1.22;
      color: #21344d;
    }

    .team-name {
      margin: 12px 0 0;
      font-style: italic;
      color: var(--muted);
    }

    .team-members {
      margin: 6px 0 0;
      font-weight: 700;
      color: #35597c;
    }

    .link-badges {
      display: flex;
      justify-content: center;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 12px;
    }

    .link-badges a {
      text-decoration: none;
    }

    .logo-row {
      display: flex;
      justify-content: center;
      flex-wrap: wrap;
      gap: 18px;
      margin-top: 20px;
    }

    .logo-row img {
      width: auto;
      max-width: 220px;
      height: 64px;
      object-fit: contain;
      opacity: 0.95;
      filter: saturate(0.86) contrast(0.98);
    }

    .meta {
      margin-top: 22px;
      padding-top: 16px;
      border-top: 1px solid var(--line);
      color: #334155;
      font-size: 0.97rem;
      text-align: left;
      max-width: 920px;
      margin-left: auto;
      margin-right: auto;
    }

    .meta p { margin: 8px 0; }
    .meta ul { margin: 8px 0 0 18px; }

    .toc {
      margin-top: 14px;
      padding-top: 12px;
      border-top: 1px dashed var(--line-strong);
    }

    .toc p { margin: 0 0 6px; font-weight: 600; }
    .toc ul { margin: 0; padding-left: 18px; }
    .toc a { color: var(--accent); text-decoration: none; }
    .toc a:hover { text-decoration: underline; }

    .section-card {
      margin-top: 20px;
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: var(--radius);
      padding: 24px 22px;
      box-shadow: 0 4px 14px rgba(50, 72, 102, 0.05);
    }

    .section-card h2 {
      margin: 0 0 14px;
      text-align: center;
      letter-spacing: -0.01em;
      color: #27435f;
    }

    .section-note {
      margin: 0 0 10px;
      color: var(--muted);
    }

    .sub-card {
      background: var(--panel-2);
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 14px;
      margin-bottom: 12px;
    }

    .sub-card h3 {
      margin: 0 0 10px;
      text-align: center;
      font-size: 1.05rem;
    }

    .table-wrap {
      overflow-x: auto;
      border-radius: 12px;
      border: 1px solid var(--line);
      background: #fff;
    }

    .demo-table {
      width: 100%;
      border-collapse: collapse;
      min-width: 640px;
      font-size: 0.95rem;
    }

    .demo-table thead th {
      background: #edf3f8;
      border-bottom: 1px solid var(--line-strong);
      color: #2f4c68;
      font-weight: 600;
      text-align: center;
      padding: 11px 10px;
      vertical-align: middle;
    }

    .demo-table td {
      border-top: 1px solid var(--line);
      padding: 10px;
      text-align: center;
      vertical-align: middle;
      color: #2b3645;
      background: #fff;
    }

    .demo-table tr:first-child td {
      border-top: none;
    }

    audio {
      max-width: 100%;
      filter: saturate(0.85);
    }

    @media (max-width: 760px) {
      .hero { padding: 20px 14px; }
      .hero-image img { width: 100%; border-radius: 14px; }
      .section-card { padding: 16px 12px; }
      .logo-row { gap: 10px; }
      .logo-row img { max-width: 150px; height: 44px; }
      .demo-table { font-size: 0.88rem; }
    }
  </style>
</head>
<body>
  <div class="page">
    <main role="main">
      <article>
        <section class="hero">
          ${heroHtml}
          <div class="hero-copy">
            <h1>${escapeHtml(parsed.workTitle || parsed.pageTitle)}</h1>
            ${renderLinkChips(parsed)}
            ${parsed.pageSubtitle ? `<p class="team-name">${escapeHtml(parsed.pageSubtitle)}</p>` : ""}
            ${parsed.team ? `<p class="team-name">${escapeHtml(parsed.team)}</p>` : ""}
            ${parsed.teamMembers ? `<p class="team-members">${escapeHtml(parsed.teamMembers)}</p>` : ""}
            ${logosHtml}
          </div>
          <div class="meta">
            ${introHtml}
            ${notesHtml}
            ${abstractHtml}
            ${keyFeaturesHtml}
            <div class="toc">
              <p>Contents</p>
              <ul>${tocHtml}</ul>
            </div>
          </div>
        </section>
        ${sectionsHtml}
      </article>
    </main>
  </div>
</body>
</html>`;
}

function main() {
    if (!fs.existsSync(INPUT_MD)) {
        throw new Error(`Markdown not found: ${INPUT_MD}`);
    }

    const markdown = fs.readFileSync(INPUT_MD, "utf8");
    const lines = markdown.split(/\r?\n/);

    const meta = parseTopMeta(lines);
    const intro = getHeadingContent(lines, "页面简介");
    const notes = getHeadingContent(lines, "页面说明（可选）");
    const abstract = getHeadingContent(lines, "Abstract") || getHeadingContent(lines, "摘要");
    const keyFeaturesRaw = getHeadingContent(lines, "Key Features") || getHeadingContent(lines, "关键特性");
    const keyFeatures = parseFeatureList(keyFeaturesRaw);
    const sections = parseSections(lines, meta.pageSubtitle, meta.audioBase);

    const html = renderHtml({
        ...meta,
        intro,
        notes,
        abstract,
        keyFeatures,
        sections,
    });

    fs.writeFileSync(OUTPUT_HTML, html, "utf8");
    console.log(`Rendered ${OUTPUT_HTML}`);
}

main();
