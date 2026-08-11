import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import type { Options as SanitizeSchema } from "rehype-sanitize";
import "github-markdown-css/github-markdown-dark.css";

/**
 * What a repository README is allowed to render.
 *
 * The content here is a file out of somebody's Git repository, and `rehypeRaw`
 * turns the raw HTML inside it into real DOM. Without a sanitizer that is a
 * script-execution primitive: importing a repository would be enough to run
 * code in the session of everyone who opens the project.
 *
 * `defaultSchema` already drops `script`, event handlers and `javascript:`
 * URLs. The additions below are the tags READMEs genuinely use -- collapsible
 * sections, centred badges, line breaks -- and nothing that loads or executes.
 * `iframe`, `object`, `embed`, `form` and `style` stay out deliberately.
 */
const schema: SanitizeSchema = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    "details",
    "summary",
    "picture",
    "source",
    "kbd",
    "abbr",
    "figure",
    "figcaption",
  ],
  attributes: {
    ...defaultSchema.attributes,
    // `align` is how the badge tables at the top of most READMEs are laid out.
    div: [...(defaultSchema.attributes?.div ?? []), "align"],
    p: [...(defaultSchema.attributes?.p ?? []), "align"],
    h1: ["align"],
    h2: ["align"],
    h3: ["align"],
    img: [...(defaultSchema.attributes?.img ?? []), "align", "width", "height"],
    details: ["open"],
    source: ["srcSet", "media", "type"],
    // Anchors keep the default allowlist, which already constrains the
    // protocols `href` may use.
  },
};

interface MarkdownContentProps {
  content: string;
  resolveImageSrc: (src?: string) => string | undefined;
}

export function MarkdownContent({ content, resolveImageSrc }: MarkdownContentProps) {
  return (
    <div className="markdown-body" style={{ background: "transparent" }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        // Order matters: raw HTML is parsed into nodes first, then sanitized.
        // Reversing these two sanitizes the escaped text and then reintroduces
        // the markup, which is the same as having no sanitizer at all.
        rehypePlugins={[rehypeRaw, [rehypeSanitize, schema]]}
        components={{
          img: ({ src, alt }) => <img src={resolveImageSrc(src)} alt={alt || ""} />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
