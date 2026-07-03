// The delete goes through a server-side Postgres function (security definer) that
// re-checks the caller's role via auth.uid() before deleting, and RLS denies direct
// deletes on posts — so a client calling the table directly can't bypass it. Role is
// never accepted from the client: new profiles default to "member" at the DB, and
// elevation happens server-side only.
import { supabase } from "./supabaseClient";

export async function deletePost(postId: string) {
  const { error } = await supabase.rpc("delete_post_as_admin", { post_id: postId });
  if (error) throw error;
}

export async function createProfile(userId: string) {
  // no role field — the column defaults to 'member' and an RLS insert policy scopes
  // the row to auth.uid(); a user cannot set their own role here.
  await supabase.from("profiles").insert({ user_id: userId });
}
