import { readGoogleSession } from "@/lib/session";
import SignIn from "@/components/SignIn";
import Dashboard from "@/components/dashboard/Dashboard";
import ConsentGate from "@/components/ConsentGate";
import { createDataRequestCode } from "@/lib/data-request";
import { consentStorageReady } from "@/lib/consent";
import { aiEnabled } from "@/lib/ai";

export default async function Home() {
  const { session, problem } = await readGoogleSession();

  if (!session) {
    return <SignIn storeUnavailable={problem === "store_unavailable"} />;
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
