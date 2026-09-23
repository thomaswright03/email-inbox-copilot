import { auth } from "@/auth";
import SignIn from "@/components/SignIn";
import Dashboard from "@/components/Dashboard";

export default async function Home() {
  const session = await auth();

  if (!session?.accessToken) {
    return <SignIn />;
  }

  return <Dashboard userName={session.user?.name ?? session.user?.email ?? "you"} />;
}
