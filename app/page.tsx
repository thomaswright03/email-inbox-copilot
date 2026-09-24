import { getGoogleSession } from "@/lib/session";
import SignIn from "@/components/SignIn";
import Dashboard from "@/components/dashboard/Dashboard";
import ConsentGate from "@/components/ConsentGate";
import { createDataRequestCode } from "@/lib/data-request";
import { consentStorageReady } from "@/lib/consent";
import { aiEnabled } from "@/lib/ai";

export default async function Home() {
  const session = await getGoogleSession();

  if (!session) {
    return <SignIn />;
  }

  if (!session.consented) {
    return <ConsentGate storageReady={consentStorageReady()} />;
  }

  return (
    <Dashboard
      userName={session.userName ?? session.userEmail}
      userEmail={session.userEmail}
      accountId={session.userId}
      dataRequestCode={createDataRequestCode(session.userId, session.userEmail)}
      aiOn={aiEnabled()}
    />
  );
}
