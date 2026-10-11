export function ClusterBadge() {
  const cluster = process.env.NEXT_PUBLIC_CLUSTER || "devnet";
  const color =
    cluster === "mainnet-beta" ? "text-claw-accent border-claw-accent" : "text-claw-ok border-claw-ok";
  return (
    <div className={`panel px-3 py-2 text-xs ${color}`}>
      <span className="kicker text-[10px]">cluster</span>
      <div className="font-bold uppercase">{cluster}</div>
    </div>
  );
}
