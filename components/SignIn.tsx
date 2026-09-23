"use client";

import { signIn } from "next-auth/react";

export default function SignIn() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-semibold">Inbox Copilot</h1>
      <p className="max-w-sm text-center text-neutral-600">
        Connect your Gmail account to see a daily summary and catch spam that snuck past your junk folder.
      </p>
      <button
        onClick={() => signIn("google")}
        className="rounded-md bg-neutral-900 px-4 py-2 text-white hover:bg-neutral-700"
      >
        Sign in with Google
      </button>
    </div>
  );
}
