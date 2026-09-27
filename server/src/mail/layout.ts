/* Damvia - Open Source Digital Asset Manager
Copyright (C) 2024  Arnaud DE SAINT JEAN
This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>. */
import { textOn } from './color'
import { escapeHtml } from './html'

export type LayoutInput = {
	appName: string
	appUrl: string
	accent: string
	logoUrl: string | null
	footerText: string
	subject: string
	preheader: string
	heading: string
	bodyHtml: string
	button: { label: string, url: string } | null
}

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
const INK = '#18181b'
const TEXT = '#3f3f46'
const MUTED = '#71717a'
const LINE = '#e4e4e7'

// Mail clients drop most stylesheets, so every tag the editor produces gets
// its style inline.
function styleBody(html: string, accent: string): string {
	const styles: Record<string, string> = {
		p: `margin:0 0 16px;font-size:16px;line-height:26px;color:${TEXT};`,
		h1: `margin:24px 0 12px;font-size:22px;line-height:30px;font-weight:600;color:${INK};`,
		h2: `margin:24px 0 12px;font-size:19px;line-height:27px;font-weight:600;color:${INK};`,
		h3: `margin:20px 0 10px;font-size:17px;line-height:25px;font-weight:600;color:${INK};`,
		h4: `margin:20px 0 10px;font-size:16px;line-height:24px;font-weight:600;color:${INK};`,
		ul: `margin:0 0 16px;padding:0 0 0 22px;color:${TEXT};`,
		ol: `margin:0 0 16px;padding:0 0 0 22px;color:${TEXT};`,
		li: `margin:0 0 6px;font-size:16px;line-height:24px;color:${TEXT};`,
		blockquote: `margin:0 0 16px;padding:4px 0 4px 16px;border-left:3px solid ${LINE};color:${MUTED};`,
		a: `color:${accent};text-decoration:underline;`,
		strong: `font-weight:600;color:${INK};`,
		hr: `border:0;border-top:1px solid ${LINE};margin:24px 0;`,
	}
	return html.replace(/<(p|h[1-4]|ul|ol|li|blockquote|a|strong|hr)(\s[^>]*)?>/gi, (_match, tag: string, attributes = '') =>
		`<${tag}${attributes} style="${styles[tag.toLowerCase()]}">`)
		// A paragraph's margin would double the gap before the next block.
		.replace(/<li([^>]*)><p[^>]*>([\s\S]*?)<\/p><\/li>/gi, '<li$1>$2</li>')
}

export function emailLayout(input: LayoutInput): string {
	const accent = input.accent
	const host = input.appUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')
	const brand = input.logoUrl
		? `<img src="${escapeHtml(input.logoUrl)}" width="160" alt="${escapeHtml(input.appName)}" style="display:block;width:auto;max-width:160px;max-height:48px;height:auto;border:0;outline:none;text-decoration:none;">`
		: `<span style="font-size:18px;line-height:24px;font-weight:600;color:${INK};">${escapeHtml(input.appName)}</span>`
	const button = input.button ? `
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:8px 0 28px;">
                <tr>
                  <td bgcolor="${accent}" style="border-radius:8px;background:${accent};">
                    <a href="${escapeHtml(input.button.url)}" target="_blank" style="display:inline-block;padding:13px 24px;font-family:${FONT};font-size:15px;line-height:20px;font-weight:600;color:${textOn(accent)};text-decoration:none;border-radius:8px;">${input.button.label}</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0;font-size:13px;line-height:20px;color:${MUTED};">Button not working? Paste this link into your browser:<br><a href="${escapeHtml(input.button.url)}" target="_blank" style="color:${MUTED};text-decoration:underline;word-break:break-all;">${escapeHtml(input.button.url)}</a></p>` : ''
	const footer = input.footerText.trim()
		? `${escapeHtml(input.footerText.trim()).replace(/\n/g, '<br>')}<br>`
		: ''

	return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(input.subject)}</title>
<style>
  :root { color-scheme: light; supported-color-schemes: light; }
  body { margin:0; padding:0; }
  a { color:${accent}; }
  @media (max-width:620px) {
    .dv-card { padding:32px 24px !important; }
    .dv-outer { padding:16px 8px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${input.preheader}${'&#847;&zwnj;&nbsp;'.repeat(60)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f4f4f5;">
    <tr>
      <td class="dv-outer" align="center" style="padding:40px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;">
          <tr>
            <td style="padding:0 4px 20px;font-family:${FONT};">${brand}</td>
          </tr>
          <tr>
            <td class="dv-card" style="background:#ffffff;border:1px solid ${LINE};border-radius:12px;padding:40px;font-family:${FONT};">
              <div style="height:4px;width:40px;background:${accent};border-radius:2px;margin:0 0 24px;"></div>
              ${input.heading ? `<h1 style="margin:0 0 20px;font-size:24px;line-height:32px;font-weight:600;letter-spacing:-0.01em;color:${INK};">${input.heading}</h1>` : ''}
              ${styleBody(input.bodyHtml, accent)}${button}
            </td>
          </tr>
          <tr>
            <td style="padding:24px 4px 0;font-family:${FONT};font-size:12px;line-height:18px;color:#a1a1aa;">
              ${footer}Sent by ${escapeHtml(input.appName)} · <a href="${escapeHtml(input.appUrl)}" target="_blank" style="color:#a1a1aa;text-decoration:underline;">${escapeHtml(host)}</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}
