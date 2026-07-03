// The admin gate lives only in the React component, and the delete goes straight to
// the database from the browser. A user who calls supabase.from("posts").delete()
// directly — or flips isAdmin in devtools — bypasses it entirely, because nothing at
// the database boundary enforces it.
import { supabase } from "./supabaseClient";

export function DeleteButton({ post, isAdmin }: { post: { id: string }; isAdmin: boolean }) {
  if (!isAdmin) return null; // client-only "authorization"
  return {
    onClick: async () => {
      await supabase.from("posts").delete().eq("id", post.id);
    },
  };
}

// Signup writes the role straight from the client — a user can send role: "admin".
export async function createProfile(userId: string, role: string) {
  await supabase.from("profiles").insert({ user_id: userId, role });
}
