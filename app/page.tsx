import { getGoogleSession } from "@/lib/session";
import SignIn from "@/components/SignIn";
import Dashboard from "@/components/Dashboard";
import ConsentGate from "@/components/ConsentGate";
import { createDataRequestCode } from "@/lib/data-request";

export default async function Home() {
  const session = await getGoogleSession();

  if (!session) {
    return <SignIn />;
  }

  if (!session.consented) {
    return <ConsentGate />;
  }

  return (
    <Dashboard
      userName={session.userName ?? session.userEmail}
      accountId={session.userId}
      dataRequestCode={createDataRequestCode(session.userId, session.userEmail)}
    />
  );
}
