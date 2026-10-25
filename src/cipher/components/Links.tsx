import type { Messages } from "../i18n";
import { extractLinks } from "../linkify";

/** Clickable list of the http(s) links found in `text`; renders nothing when there are none. */
export function Links({ text, m }: { text: string; m: Messages }) {
  const links = extractLinks(text);
  if (links.length === 0) return null;
  return (
    <div className="c-links">
      <div className="c-links-title">{m.links}</div>
      <ul>
        {links.map((href) => (
          <li key={href}>
            <a href={href} target="_blank" rel="noopener noreferrer nofollow">
              {href}
            </a>
          </li>
        ))}
      </ul>
      <div className="c-hint">{m.linksWarn}</div>
    </div>
  );
}
