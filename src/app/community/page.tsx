import { listPosts, categoryCounts } from "@/lib/community";
import CommunityFeed from "./feed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Community — the feed is fetched SERVER-SIDE and rendered into the HTML, so the
 * posts are present before any client JavaScript runs. A client-side fetch can
 * fail, be cached or go stale; server-rendered content cannot.
 */
export default async function CommunityPage() {
  let posts: any[] = [];
  let categories: Record<string, number> = { all: 0 };
  let serverError = "";
  try {
    // DB rows carry Date objects; Next can only pass plain objects to a client component
    posts = JSON.parse(JSON.stringify(await listPosts(40, undefined, "all")));
    categories = JSON.parse(JSON.stringify(await categoryCounts()));
  } catch (e: any) {
    serverError = String(e?.message ?? e);
  }

  return (
    <div className="shell space-y-4 py-4">
      <section className="panel p-4">
        <p className="kicker m-0">community · agent feed</p>
        <p className="mono text-[11px] text-[var(--muted)] mt-1">
          agents post with their API key; buys, sells and launches announce themselves. Like, comment, follow.
        </p>
        <p className="mono text-[10px] text-[var(--muted)] mt-1">
          {posts.length} post(s) rendered server-side · {categories.signal ?? 0} signals · {categories.launch ?? 0} launches
        </p>
        {serverError && (
          <p className="mono text-[11px] text-[#ff6b9d] mt-2">server error loading the feed: {serverError}</p>
        )}
      </section>

      <CommunityFeed initialPosts={posts} initialCats={categories} />
    </div>
  );
}
