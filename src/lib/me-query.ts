import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Role } from "./roles";

export type Me = { id: string; email: string; name: string; role: Role } | null;

/** The signed-in user's name and role (read through RLS: a user can only read their own role row). */
export const meQuery = queryOptions({
  queryKey: ["me"],
  staleTime: 60_000,
  queryFn: async (): Promise<Me> => {
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) return null;
    const [{ data: r }, { data: p }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", user.id).maybeSingle(),
      supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
    ]);
    const name = p?.display_name || (user.user_metadata?.["full_name"] as string | undefined) || user.email || "Account";
    return { id: user.id, email: user.email ?? "", name, role: (r?.role ?? "CLIPPER") as Role };
  },
});
