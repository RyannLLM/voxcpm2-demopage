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

function inlineMarkdown(escaped) {
    return escaped.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
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
    return `<audio controls=\"controls\" style=\"width: 190px;\"><source src=\"${safePath}\"></audio>`;
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

    const headerHtml = header.map((cell) => `<th style=\"vertical-align: middle; text-align: center\">${escapeHtml(cell)}</th>`).join("");

    const rowHtml = mergedRows
        .map((row) => {
            const cellHtml = row
                .map((cell) => {
                    if (cell.skip) {
                        return "";
                    }

                    const rowspanAttr = cell.rowspan > 1 ? ` rowspan=\"${cell.rowspan}\"` : "";
                    return `<td style=\"vertical-align: middle; text-align: center\"${rowspanAttr}>${renderCell(cell.text, audioBase)}</td>`;
                })
                .join("");
            return `<tr>${cellHtml}</tr>`;
        })
        .join("\n");

    return `
<div class=\"table-responsive pt-3\">
  <table class=\"table table-hover pt-2\">
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
        return `<p>${escapeHtml(block.text)}</p>`;
    }

    if (block.type === "table") {
        return renderTable(block.table, audioBase);
    }

    if (block.type === "card") {
        const contentHtml = block.content.map((item) => renderBlock(item, audioBase)).join("\n");
        return `
<div class=\"demo-card\">
  <h3 style=\"text-align: center; margin-top: 1.5rem;\">${escapeHtml(block.title)}</h3>
  ${contentHtml}
</div>`;
    }

    return "";
}

function renderHtml(parsed) {
    const tocHtml = parsed.sections
        .map((section) => `<li><a href=\"#${section.id}\">${escapeHtml(section.title)}</a></li>`)
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
<div class=\"container pt-5 mt-5 shadow-lg p-5 mb-5 bg-white rounded\">
  <div class=\"text-center\">
    <h2 id=\"${section.id}\" style=\"text-align: center;\">${escapeHtml(section.title)}</h2>
  </div>
  ${blocksHtml}
</div>`;
        })
        .join("\n");

    const heroHtml = parsed.heroImage
        ? `<div class=\"image-container\"><div><img src=\"${escapeHtml(parsed.heroImage)}\" alt=\"hero\" height=\"600\" width=\"600\"></div></div>`
        : "";

    const teamLogosHtml = parsed.teamLogos.length
        ? `<div class=\"image-container\">${parsed.teamLogos
            .map((logoPath) => `<div><img src=\"${escapeHtml(logoPath)}\" alt=\"team-logo\" height=\"600\" width=\"600\"></div>`)
            .join("")}</div>`
        : "";

    const linkBadges = [
        parsed.projectLink
            ? `<a href=\"${escapeHtml(parsed.projectLink)}\"><img src=\"https://img.shields.io/badge/Project%20Page-GitHub-blue\"></a>`
            : "",
        parsed.huggingFaceLink
            ? `<a href=\"${escapeHtml(parsed.huggingFaceLink)}\"><img src=\"https://img.shields.io/badge/HuggingFace-Model-yellow\"></a>`
            : "",
        parsed.modelScopeLink
            ? `<a href=\"${escapeHtml(parsed.modelScopeLink)}\"><img src=\"https://img.shields.io/badge/ModelScope-Model-purple\"></a>`
            : "",
        parsed.demoLink
            ? `<a href=\"${escapeHtml(parsed.demoLink)}\"><img src=\"https://img.shields.io/badge/Live%20PlayGround-Demo-orange\"></a>`
            : "",
    ]
        .filter(Boolean)
        .join("\n");

    const introHtml = parsed.intro ? `<p>${escapeHtml(parsed.intro).replace(/\n/g, "<br>")}</p>` : "";
    const notesHtml = parsed.notes ? `<p>${escapeHtml(parsed.notes).replace(/\n/g, "<br>")}</p>` : "";
    const abstractHtml = parsed.abstract ? `<p><b>Abstract:</b> ${inlineMarkdown(escapeHtml(parsed.abstract)).replace(/\n/g, "<br>")}</p>` : "";
    const keyFeaturesHtml = parsed.keyFeatures.length
        ? `<p><b>Key Features</b><ul>${parsed.keyFeatures
            .map((item) => `<li>${item ? inlineMarkdown(escapeHtml(item)) : "&nbsp;"}</li>`)
            .join("")}</ul></p>`
        : "";

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset=\"utf-8\">
  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">
  <link href=\"https://fonts.googleapis.com/css?family=Roboto:300,400,700\" rel=\"stylesheet\" type=\"text/css\">
  <link rel=\"stylesheet\" href=\"./css/custom.css\">
  <link rel=\"stylesheet\" href=\"./css/normalize.css\">
  <link rel=\"stylesheet\" href=\"./css/bootstrap.min.css\">
  <title>${escapeHtml(parsed.pageTitle)}</title>
  <style>
    .image-container { display: flex; justify-content: center; align-items: center; margin-bottom: 5px; }
        .image-container img { margin-right: 0; }
        .image-container img:last-child { margin-right: 0; }
        .caption { text-align: center; font-size: 16px; }
    .demo-card { margin-top: 2rem; padding-top: 0.5rem; }
  </style>
</head>
<body>
  <div class=\"container\">
    <main role=\"main\">
      <article>
        <div class=\"container pt-5 mt-5 shadow-lg p-5 mb-5 bg-white rounded\">
          ${heroHtml}
          <div class=\"text-center\">
                        <h1>${escapeHtml(parsed.workTitle || parsed.pageTitle)}</h1>
            ${parsed.pageSubtitle ? `<p class=\"fst-italic mb-0\"><br>${escapeHtml(parsed.pageSubtitle)}</p>` : ""}
                                                ${parsed.team ? `<p class=\"fst-italic mb-0\"><br>${escapeHtml(parsed.team)}</p>` : ""}
                                                ${parsed.teamMembers ? `<p><b>${escapeHtml(parsed.teamMembers)}</b></p>` : ""}
                        ${linkBadges}
          </div>
                    ${teamLogosHtml}
          ${introHtml}
          ${notesHtml}
                    ${abstractHtml}
                    ${keyFeaturesHtml}
          <p>
            <b>Contents</b>
            <ul>
              ${tocHtml}
            </ul>
          </p>
        </div>
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
