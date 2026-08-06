import { redirect } from "next/navigation";
import { destinationFor } from "@/lib/destination";
import { getSession } from "@/lib/session";

export default async function Home() {
  const session = await getSession();
  if (!session) redirect("/login");
  redirect(destinationFor(session.user));
}
