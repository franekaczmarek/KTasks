import { redirect } from "next/navigation";

import { TopBar } from "@/components/layout/top-bar";
import { getServerSupabase } from "@/lib/supabase/server";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const supabase = await getServerSupabase();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login");

  return (
    <>
      <TopBar />
      <main className="mx-auto w-full max-w-[1600px] flex-1 px-6 py-6">{children}</main>
    </>
  );
}
