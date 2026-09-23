import { auth } from "@/auth";
import SignIn from "@/components/SignIn";
import Dashboard from "@/components/Dashboard";
import ConsentGate from "@/components/ConsentGate";
import { LEGAL_VERSION } from "@/content/legal";

export default async function Home() {
  const session = await auth();

  if (!session?.accessToken) {
    return <SignIn />;
  }

  if (session.legalVersionAccepted !== LEGAL_VERSION) {
    return <ConsentGate />;
  }

  return <Dashboard userName={session.user?.name ?? session.user?.email ?? "you"} />;
}
