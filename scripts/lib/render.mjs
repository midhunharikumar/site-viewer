// Shared email rendering: tiny markdown→HTML, the email shell, and HTML→text.
// Used by both the newsletter CLI and the Vercel cron function.

const SITE = () => process.env.SITE_URL || 'https://flatmap.cloud';

export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Deliberately tiny markdown: headings, bold/italic, links, lists, paragraphs.
export function mdToHtml(md) {
  const inline = (t) => esc(t)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/\*([^*]+)\*/g, '<i>$1</i>')
    .replace(/_([^_]+)_/g, '<i>$1</i>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
  const out = [];
  let list = null;
  const flush = () => { if (list) { out.push(`<${list.tag}>${list.items.join('')}</${list.tag}>`); list = null; } };
  for (const raw of md.split('\n')) {
    const line = raw.trimEnd();
    let m;
    if ((m = line.match(/^(#{1,4})\s+(.*)$/))) { flush(); out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); }
    else if ((m = line.match(/^[-*]\s+(.*)$/))) { if (!list || list.tag !== 'ul') { flush(); list = { tag: 'ul', items: [] }; } list.items.push(`<li>${inline(m[1])}</li>`); }
    else if ((m = line.match(/^\d+\.\s+(.*)$/))) { if (!list || list.tag !== 'ol') { flush(); list = { tag: 'ol', items: [] }; } list.items.push(`<li>${inline(m[1])}</li>`); }
    else if (line === '') { flush(); }
    else { flush(); out.push(`<p>${inline(line)}</p>`); }
  }
  flush();
  return out.join('\n');
}

export function wrap(bodyHtml) {
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:600px;margin:0 auto;color:#111;line-height:1.55;font-size:15px">
${bodyHtml}
<hr style="border:none;border-top:1px solid #eee;margin:28px 0 12px">
<p style="font-size:11px;color:#888">You're receiving this because you signed up for the Bengaluru property report at
<a href="${SITE()}" style="color:#888">flatmap.cloud</a>. Reply with "unsubscribe" to stop.</p>
</div>`;
}

export function htmlToText(html) {
  return html
    .replace(/<\/(p|div|h[1-4]|li)>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Convert a full markdown draft into the {html,text} email payload.
export function draftToEmail(markdown) {
  const html = wrap(mdToHtml(markdown));
  return { html, text: htmlToText(html) };
}
