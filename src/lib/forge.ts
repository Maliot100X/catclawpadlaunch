// CatClawPad forge — deterministic pseudo-AI generation (no LLM service).
// Mirrors launcher.wtf behavior: input -> name, ticker, lore, tags, logo style.

export type ForgeInput = {
  prompt?: string;
  xPost?: string;
  hashtag?: string;
  imageUrl?: string;
  tiktok?: string;
  trend?: string;
  style?: string; // auto|meme|cartoon|3d|realistic|anime|minimal|pixel
};

export type ForgeResult = {
  name: string;
  ticker: string;
  description: string;
  tags: string[];
  logoStyle: string;
  source: string;
};

const STOP = new Set(["a","an","the","of","in","on","at","to","for","with","that","and","or","is","are","was","were","it", "his","her","their","my","your"]);

function words(s: string): string[] {
  return (s||"").toLowerCase().replace(/[^a-z0-9#@ ]/g," ").split(/\s+/).filter(w=>w && !STOP.has(w));
}

function titleCase(s: string): string {
  return s.split(/\s+/).map(w=>w.charAt(0).toUpperCase()+w.slice(1)).join(" ").trim();
}

const SUFFIXES = ["Coin","Inu","Cat","Claw","Paw","Moon","Chad","Wojak","Frog","Kit"];
const HOOK_TEMPLATES = [
  (n:string)=>`${n}. That's it. That's the coin. Ape or stay mid.`,
  (n:string)=>`They laughed at ${n}. Now ${n} laughs at them. Diamond claws only.`,
  (n:string)=>`Born from the feed. Raised by the chart. ${n} never sells.`,
  (n:string)=>`${n} isn't a coin, it's a lifestyle. Paper hands make poor choices.`,
];

export function forge(input: ForgeInput): ForgeResult {
  const raw = input.prompt || input.xPost || input.hashtag || input.tiktok || input.trend || "mystery cat";
  const source = input.prompt ? "prompt" : input.xPost ? "x" : input.hashtag ? "hashtag" : input.tiktok ? "tiktok" : input.trend ? "trend" : "prompt";
  const seed = raw + "|" + (input.style||"auto");
  let h = 2166136261;
  for (let i=0;i<seed.length;i++){ h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  const rand = (n:number) => h % n;

  const w = words(raw);
  const core = w.slice(0,3).join(" ") || "cat claw";
  const name = titleCase(core.length < 4 ? core + " " + SUFFIXES[rand(SUFFIXES.length)] : core).slice(0, 32);
  let ticker = w.map(x=>x.charAt(0).toUpperCase()).join("").slice(0,6);
  if (ticker.length < 3) ticker = (w[w.length-1]||"claw").replace(/[^a-z]/g,"").slice(0,5).toUpperCase() || "CLAW";
  const description = HOOK_TEMPLATES[rand(HOOK_TEMPLATES.length)](name) + " Launched thru catclawpad.";
  const tags = [source, w[rand(Math.max(w.length,1))]||"meme", "solana", "pumpfun"].slice(0,4);

  const styles = ["meme","cartoon","3d","realistic","anime","minimal","pixel"];
  const logoStyle = (!input.style || input.style === "auto") ? styles[rand(styles.length)] : input.style;

  return { name, ticker: "$"+ticker, description, tags, logoStyle, source };
}
