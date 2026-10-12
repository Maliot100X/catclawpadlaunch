// Procedural logo engine — real SVG generation, seeded per coin + style.
// 8 styles: meme | cartoon | 3d | realistic | anime | minimal | pixel

export type LogoStyle = "meme"|"cartoon"|"3d"|"realistic"|"anime"|"minimal"|"pixel";

const PALETTES: Record<string, [string,string,string]> = {
  meme:     ["#c8ff3d","#7c5cff","#06070f"],
  cartoon:  ["#ff6b9d","#3cf2ff","#06070f"],
  "3d":     ["#7c5cff","#3cf2ff","#04050c"],
  realistic:["#e9ecff","#8d93bd","#0a0b10"],
  anime:    ["#ff9de2","#6bd6ff","#0b0a14"],
  minimal:  ["#e9ecff","#232851","#06070f"],
  pixel:    ["#c8ff3d","#ff6b9d","#0a0b10"],
  auto:     ["#c8ff3d","#3cf2ff","#06070f"],
};

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
function rng(seed: number) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

export function generateLogoSVG(seedText: string, style: string): { svg: string; palette: [string,string,string] } {
  const key = (PALETTES[style] ? style : "auto") as keyof typeof PALETTES;
  const [c1, c2, bg] = PALETTES[key];
  const h = hash(seedText + "|" + style);
  const rand = rng(h);
  const S = 240, cx = S/2, cy = S/2;
  const parts: string[] = [];

  // background
  parts.push(`<rect width="240" height="240" fill="${bg}"/>`);

  if (key === "pixel") {
    // 12x12 pixel grid creature
    const gx = 12, cell = S / gx;
    for (let y = 2; y < 10; y++) for (let x = 2; x < 10; x++) {
      if (rand() > 0.55) parts.push(`<rect x="${x*cell}" y="${y*cell}" width="${cell}" height="${cell}" fill="${rand()>0.5?c1:c2}"/>`);
    }
    // eyes
    parts.push(`<rect x="${3*cell}" y="${5*cell}" width="${cell}" height="${cell}" fill="${bg}"/>`);
    parts.push(`<rect x="${8*cell}" y="${5*cell}" width="${cell}" height="${cell}" fill="${bg}"/>`);
  } else if (key === "minimal") {
    parts.push(`<circle cx="${cx}" cy="${cy}" r="72" fill="none" stroke="${c1}" stroke-width="6"/>`);
    parts.push(`<circle cx="${cx}" cy="${cy}" r="${30+rand()*20}" fill="${c2}"/>`);
  } else if (key === "3d") {
    // layered orbs with gradient
    for (let i = 0; i < 4; i++) {
      const r = 70 - i*14, ox = (rand()-0.5)*30, oy = (rand()-0.5)*30;
      parts.push(`<circle cx="${cx+ox}" cy="${cy+oy}" r="${r}" fill="url(#g3d)" opacity="${0.85-i*0.12}"/>`);
    }
  } else if (key === "meme") {
    // face: big head + eyes + grin
    parts.push(`<circle cx="${cx}" cy="${cy+8}" r="78" fill="${c1}"/>`);
    parts.push(`<ellipse cx="${cx-28}" cy="${cy-12}" rx="16" ry="${16+rand()*10}" fill="${bg}"/>`);
    parts.push(`<ellipse cx="${cx+28}" cy="${cy-12}" rx="16" ry="${16+rand()*10}" fill="${bg}"/>`);
    parts.push(`<circle cx="${cx-28}" cy="${cy-10}" r="6" fill="${c2}"/>`);
    parts.push(`<circle cx="${cx+28}" cy="${cy-10}" r="6" fill="${c2}"/>`);
    parts.push(`<path d="M ${cx-30} ${cy+34} Q ${cx} ${cy+30+Math.floor(rand()*22)} ${cx+30} ${cy+34}" stroke="${bg}" stroke-width="7" fill="none" stroke-linecap="round"/>`);
    // ears
    parts.push(`<polygon points="${cx-70},${cy-44} ${cx-48},${cy-96} ${cx-24},${cy-58}" fill="${c1}" stroke="${bg}" stroke-width="5"/>`);
    parts.push(`<polygon points="${cx+70},${cy-44} ${cx+48},${cy-96} ${cx+24},${cy-58}" fill="${c1}" stroke="${bg}" stroke-width="5"/>`);
  } else if (key === "cartoon") {
    // blob character
    parts.push(`<path d="M ${cx-80} ${cy+60} Q ${cx-90} ${cy-70} ${cx} ${cy-74} Q ${cx+90} ${cy-70} ${cx+80} ${cy+60} Z" fill="${c1}"/>`);
    parts.push(`<circle cx="${cx-24}" cy="${cy-14}" r="13" fill="#fff"/><circle cx="${cx+24}" cy="${cy-14}" r="13" fill="#fff"/>`);
    parts.push(`<circle cx="${cx-24}" cy="${cy-12}" r="6" fill="${bg}"/><circle cx="${cx+24}" cy="${cy-12}" r="6" fill="${bg}"/>`);
    parts.push(`<path d="M ${cx-20} ${cy+26} Q ${cx} ${cy+46} ${cx+20} ${cy+26}" stroke="${bg}" stroke-width="6" fill="none" stroke-linecap="round"/>`);
  } else if (key === "anime") {
    // sharp eyes style
    parts.push(`<polygon points="60,180 120,60 180,180" fill="${c2}" opacity="0.35"/>`);
    parts.push(`<path d="M ${cx-46} ${cy-8} L ${cx-10} ${cy-22} L ${cx-14} ${cy+6} Z" fill="${c1}"/>`);
    parts.push(`<path d="M ${cx+46} ${cy-8} L ${cx+10} ${cy-22} L ${cx+14} ${cy+6} Z" fill="${c1}"/>`);
    parts.push(`<circle cx="${cx-24}" cy="${cy-2}" r="7" fill="${c2}"/><circle cx="${cx+24}" cy="${cy-2}" r="7" fill="${c2}"/>`);
    parts.push(`<line x1="${cx-52}" y1="${cy-30}" x2="${cx-6}" y2="${cy-30}" stroke="${c1}" stroke-width="6"/>`);
    parts.push(`<line x1="${cx+6}" y1="${cy-30}" x2="${cx+52}" y2="${cy-30}" stroke="${c1}" stroke-width="6"/>`);
  } else {
    // realistic: monochrome geometric portrait
    parts.push(`<ellipse cx="${cx}" cy="${cy+16}" rx="64" ry="76" fill="url(#gr)"/>`);
    parts.push(`<ellipse cx="${cx-24}" cy="${cy-6}" rx="10" ry="14" fill="${bg}"/>`);
    parts.push(`<ellipse cx="${cx+24}" cy="${cy-6}" rx="10" ry="14" fill="${bg}"/>`);
    parts.push(`<path d="M ${cx-18} ${cy+44} L ${cx} ${cy+50} L ${cx+18} ${cy+44}" stroke="${bg}" stroke-width="4" fill="none"/>`);
  }

  const grad = key === "3d"
    ? `<defs><radialGradient id="g3d"><stop offset="0%" stop-color="${c2}"/><stop offset="100%" stop-color="${c1}"/></radialGradient></defs>`
    : `<defs><linearGradient id="gr" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${c1}"/><stop offset="100%" stop-color="${c2}"/></linearGradient></defs>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">${grad}${parts.join("")}</svg>`;
  return { svg, palette: [c1, c2, bg] };
}

export function logoDataUrl(seedText: string, style: string): string {
  const { svg } = generateLogoSVG(seedText, style);
  return "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64");
}

// Style -> FLUX prompt mapping for real image generation.
const STYLE_PROMPTS: Record<string, string> = {
  meme: "viral meme coin logo, bold flat cartoon cat mascot face, thick outlines, absurd confident expression,",
  cartoon: "playful cartoon mascot logo, rounded friendly character, vibrant cel shading,",
  "3d": "3d render mascot logo, glossy clay-render character, soft studio lighting, subtle bloom, octane render,",
  realistic: "photorealistic mascot portrait logo, dramatic rim lighting, detailed fur texture, cinematic,",
  anime: "anime style mascot logo, sharp expressive eyes, dynamic pose, vivid two-tone hair, clean lineart,",
  minimal: "ultra minimal geometric logo, single continuous line object, generous negative space, elegant,",
  pixel: "pixel art logo, 16-bit retro sprite character, crisp pixels, limited palette,",
  auto: "eye-catching crypto meme coin mascot logo, memorable character,",
};

export function logoPrompt(name: string, description: string, style: string): string {
  const base = STYLE_PROMPTS[style] || STYLE_PROMPTS.auto;
  return `${base} subject: ${name}. ${description.slice(0, 140)} centered composition, solid dark background #06070f, neon lime and cyan accent palette, circular badge, no text, no watermark, high contrast, 512x512`;
}
