import { describe, expect, it, vi } from "vitest";

import { deleteAllAuthUsers } from "./test-auth-reset";

describe("deleteAllAuthUsers", () => {
  it("deletes every Auth user while repeatedly reading the first page", async () => {
    const listUsers = vi
      .fn()
      .mockResolvedValueOnce({ data: { users: [{ id: "user-1" }, { id: "user-2" }] }, error: null })
      .mockResolvedValueOnce({ data: { users: [] }, error: null });
    const deleteUser = vi.fn().mockResolvedValue({ error: null });

    await expect(deleteAllAuthUsers({ auth: { admin: { deleteUser, listUsers } } })).resolves.toEqual({ deletedUsers: 2 });

    expect(listUsers).toHaveBeenCalledWith({ page: 1, perPage: 1000 });
    expect(deleteUser).toHaveBeenCalledWith("user-1");
    expect(deleteUser).toHaveBeenCalledWith("user-2");
  });
});
