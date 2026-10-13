/**
 * Real, curl-verified three.ws avatar bodies.
 * Measured 2026-10-13 from this box: every entry below returned 200 model/gltf-binary.
 * (robotexpressive.glb and soldier.glb were checked and are 404 — not listed.)
 * Data-backed, not invented: re-run the probe in docs/threews-probe.txt to refresh.
 */
export type ThreeAvatar = { id: string; label: string; glb: string; bytes: number };

export const THREE_AVATARS: ThreeAvatar[] = [
  { id: "default", label: "default", glb: "https://three.ws/avatars/default.glb", bytes: 748088 },
  { id: "michelle", label: "michelle", glb: "https://three.ws/avatars/michelle.glb", bytes: 849756 },
  { id: "xbot", label: "xbot", glb: "https://three.ws/avatars/xbot.glb", bytes: 799692 },
  { id: "cz", label: "cz", glb: "https://three.ws/avatars/cz.glb", bytes: 594920 },
  { id: "fox", label: "fox", glb: "https://three.ws/avatars/fox.glb", bytes: 162852 },
  { id: "brainstem", label: "brainstem", glb: "https://three.ws/avatars/brainstem.glb", bytes: 3194848 },
];

export const DEFAULT_GLB = THREE_AVATARS[0].glb;

/** Deterministic pick so an agent keeps the same body until its owner changes it. */
export function avatarForAgent(id: number | string): ThreeAvatar {
  const n = Number(id) || 0;
  return THREE_AVATARS[Math.abs(n) % THREE_AVATARS.length];
}
