type AuthAdminClient = {
  auth: {
    admin: {
      deleteUser(userId: string): PromiseLike<{ error: { message: string } | null }>;
      listUsers(options: { page: number; perPage: number }): PromiseLike<{ data: { users: Array<{ id: string }> } | null; error: { message: string } | null }>;
    };
  };
};

export async function deleteAllAuthUsers(client: AuthAdminClient) {
  let deletedUsers = 0;

  for (;;) {
    const { data, error } = await client.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error) throw new Error(`list users: ${error.message}`);
    const users = data?.users ?? [];
    if (users.length === 0) return { deletedUsers };

    for (const user of users) {
      const { error: deleteError } = await client.auth.admin.deleteUser(user.id);
      if (deleteError) throw new Error(`delete user ${user.id}: ${deleteError.message}`);
      deletedUsers += 1;
    }
  }
}
