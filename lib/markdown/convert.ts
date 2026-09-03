import TurndownService from "turndown";

/** Extracts a language hint from class attributes like "language-ts", "lang-js", "highlight-python". */
function languageFromClass(className: string): string {
  const match = className.match(
    /(?:language|lang|highlight(?:-source)?|brush:?)[-: ]([\w+#-]+)/i
  );
  if (match) return match[1].toLowerCase();
  // highlight.js often uses bare language names as classes (e.g. class="js hljs").
  const bare = className
    .split(/\s+/)
    .find((c) =>
      /^(js|jsx|ts|tsx|javascript|typescript|python|ruby|go|golang|rust|java|kotlin|swift|php|c|cpp|csharp|cs|css|scss|html|xml|json|yaml|yml|bash|sh|shell|zsh|sql|graphql|dockerfile|markdown|md|toml|ini|diff|makefile|r|dart|elixir|erlang|haskell|lua|perl|scala|clojure|powershell)$/i.test(
        c
      )
    );
  return bare?.toLowerCase() ?? "";
}

function cell(content: string): string {
  return content.trim().replace(/\|/g, "\\|").replace(/\n+/g, " ");
}

/** Builds a Turndown instance configured for DEV.to-flavored (GitHub-flavored) Markdown. */
export function createConverter(): TurndownService {
  const turndown = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    fence: "```",
    bulletListMarker: "-",
    emDelimiter: "_",
    strongDelimiter: "**",
    hr: "---",
    linkStyle: "inlined",
  });

  turndown.remove(["script", "style", "noscript", "title"]);

  // Fenced code blocks with language detection from <pre> or nested <code>.
  turndown.addRule("fencedCodeWithLanguage", {
    filter: (node) =>
      node.nodeName === "PRE" ||
      (node.nodeName === "CODE" && node.parentNode?.nodeName === "PRE"),
    replacement: (_content, node) => {
      const pre = node.nodeName === "PRE" ? node : (node.parentNode as HTMLElement);
      if (node.nodeName === "CODE" && node.parentNode?.nodeName === "PRE") {
        // Handled at the PRE level to avoid double conversion.
        return "";
      }
      const el = pre as HTMLElement;
      const code = el.querySelector?.("code");
      const className = `${el.getAttribute?.("class") ?? ""} ${code?.getAttribute("class") ?? ""} ${
        el.getAttribute?.("data-language") ?? el.getAttribute?.("data-lang") ?? ""
      }`;
      const language = languageFromClass(className);
      const text = (code ?? el).textContent ?? "";
      const trimmed = text.replace(/\s+$/, "").replace(/^\n+/, "");
      // Grow the fence if the code itself contains backtick runs.
      const fenceRuns = trimmed.match(/`{3,}/g);
      const fence = "`".repeat(Math.max(3, ...(fenceRuns?.map((r) => r.length + 1) ?? [0])));
      return `\n\n${fence}${language}\n${trimmed}\n${fence}\n\n`;
    },
  });

  turndown.addRule("strikethrough", {
    filter: ["del", "s"],
    replacement: (content) => (content.trim() ? `~~${content}~~` : ""),
  });

  // GFM tables.
  turndown.addRule("table", {
    filter: "table",
    replacement: (_content, node) => {
      const table = node as HTMLElement;
      const rows: string[][] = [];
      for (const tr of Array.from(table.querySelectorAll("tr"))) {
        const cells = Array.from(tr.querySelectorAll("th, td")).map((c) =>
          cell(c.textContent ?? "")
        );
        if (cells.length > 0) rows.push(cells);
      }
      if (rows.length === 0) return "";
      const width = Math.max(...rows.map((r) => r.length));
      const pad = (r: string[]) => [...r, ...Array(width - r.length).fill("")];
      const line = (r: string[]) => `| ${pad(r).join(" | ")} |`;
      const separator = `| ${Array(width).fill("---").join(" | ")} |`;
      const [header, ...body] = rows;
      return `\n\n${[line(header), separator, ...body.map(line)].join("\n")}\n\n`;
    },
  });

  // <figure> → image plus italic caption line.
  turndown.addRule("figure", {
    filter: "figure",
    replacement: (_content, node) => {
      const figure = node as HTMLElement;
      const img = figure.querySelector("img");
      const caption = figure.querySelector("figcaption")?.textContent?.trim();
      if (!img) {
        const inner = figure.textContent?.trim();
        return inner ? `\n\n${inner}\n\n` : "";
      }
      const src = img.getAttribute("src") ?? "";
      if (!src) return "";
      const alt = (img.getAttribute("alt") ?? caption ?? "").replace(/[\[\]\n]/g, " ").trim();
      const image = `![${alt}](${src})`;
      return caption ? `\n\n${image}\n_${caption}_\n\n` : `\n\n${image}\n\n`;
    },
  });

  turndown.addRule("image", {
    filter: "img",
    replacement: (_content, node) => {
      const img = node as HTMLElement;
      const src = img.getAttribute("src") ?? "";
      if (!src) return "";
      const alt = (img.getAttribute("alt") ?? "").replace(/[\[\]\n]/g, " ").trim();
      return `![${alt}](${src})`;
    },
  });

  // Drop links that have no text and no image content (icon/anchor links).
  turndown.addRule("emptyLink", {
    filter: (node) =>
      node.nodeName === "A" && !node.textContent?.trim() && !node.querySelector("img"),
    replacement: () => "",
  });

  return turndown;
}

/** Converts cleaned article HTML into Markdown. */
export function htmlToMarkdown(html: string): string {
  return createConverter().turndown(html);
}
