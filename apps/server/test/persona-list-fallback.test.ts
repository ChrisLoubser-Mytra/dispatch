import { describe, it, expect, vi } from "vitest";

import { resolvePersonaList } from "../src/shared/mcp/persona-interaction-tools.js";

const persona = (slug: string) => ({ slug, name: slug, description: "" });

describe("resolvePersonaList", () => {
  it("returns the worktree's personas when the worktree has them", async () => {
    const listPersonas = vi.fn(async (root: string) =>
      root === "/wt" ? [persona("a")] : [persona("b")]
    );

    const result = await resolvePersonaList(listPersonas, "/wt", "/repo");

    expect(result).toEqual([persona("a")]);
    expect(listPersonas).toHaveBeenCalledTimes(1);
    expect(listPersonas).toHaveBeenCalledWith("/wt");
  });

  it("falls back to the repo root when the worktree has no personas", async () => {
    const listPersonas = vi.fn(async (root: string) =>
      root === "/repo" ? [persona("b")] : []
    );

    const result = await resolvePersonaList(listPersonas, "/wt", "/repo");

    expect(result).toEqual([persona("b")]);
    expect(listPersonas).toHaveBeenCalledWith("/wt");
    expect(listPersonas).toHaveBeenCalledWith("/repo");
  });

  it("does not re-query when the worktree root and repo root are identical", async () => {
    const listPersonas = vi.fn(async () => []);

    const result = await resolvePersonaList(listPersonas, "/repo", "/repo");

    expect(result).toEqual([]);
    expect(listPersonas).toHaveBeenCalledTimes(1);
  });

  it("uses the repo root directly when there is no worktree root", async () => {
    const listPersonas = vi.fn(async (root: string) =>
      root === "/repo" ? [persona("b")] : []
    );

    const result = await resolvePersonaList(listPersonas, null, "/repo");

    expect(result).toEqual([persona("b")]);
    expect(listPersonas).toHaveBeenCalledTimes(1);
    expect(listPersonas).toHaveBeenCalledWith("/repo");
  });

  it("returns an empty list when neither root is available", async () => {
    const listPersonas = vi.fn(async () => []);

    const result = await resolvePersonaList(listPersonas, null, null);

    expect(result).toEqual([]);
    expect(listPersonas).not.toHaveBeenCalled();
  });
});
