import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeSupabase } from "@/lib/test/supabase-mock";

const supaState: { current: ReturnType<typeof makeSupabase> | null } = {
  current: null,
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => supaState.current!.client),
}));

import { GET, PATCH } from "./route";

function setSupa(opts: Parameters<typeof makeSupabase>[0]) {
  supaState.current = makeSupabase(opts);
  return supaState.current;
}

const row = {
  user_id: "u1",
  display_name: "Ana",
  avatar_url: null,
  created_at: "x",
  updated_at: "x",
};

beforeEach(() => {
  supaState.current = null;
});

describe("GET /api/profile", () => {
  it("rejects unauthenticated", async () => {
    setSupa({ auth: { userId: null } });
    expect((await GET()).status).toBe(401);
  });

  it("returns the mapped own profile", async () => {
    setSupa({ tables: { profiles: [{ data: row, error: null }] } });
    expect(await (await GET()).json()).toEqual({
      userId: "u1",
      displayName: "Ana",
      avatarUrl: null,
    });
  });

  it("returns null when no profile row", async () => {
    setSupa({ tables: { profiles: [{ data: null, error: null }] } });
    expect(await (await GET()).json()).toBeNull();
  });
});

describe("PATCH /api/profile", () => {
  it("rejects unauthenticated", async () => {
    setSupa({ auth: { userId: null } });
    const res = await PATCH(
      new Request("http://t/api/profile", {
        method: "PATCH",
        body: JSON.stringify({ displayName: "New" }),
      })
    );
    expect(res.status).toBe(401);
  });

  it("updates display name with trimmed value", async () => {
    const supa = setSupa({
      tables: {
        profiles: [{ data: { ...row, display_name: "New" }, error: null }],
      },
    });
    const res = await PATCH(
      new Request("http://t/api/profile", {
        method: "PATCH",
        body: JSON.stringify({ displayName: " New " }),
      })
    );
    expect(res.status).toBe(200);
    expect((await res.json()).displayName).toBe("New");
    const update = supa
      .callsFor("profiles")[0]
      .find((c) => c.method === "update");
    expect((update!.args[0] as { display_name: string }).display_name).toBe(
      "New"
    );
  });
});
