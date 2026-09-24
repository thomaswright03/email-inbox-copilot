// Opens a thread in Gmail for the signed-in account. authuser picks the
// right Google account when several are signed in; #all finds the message
// wherever it is (inbox, archive, trash).
export function gmailThreadUrl(threadId: string, accountEmail: string): string {
  return `https://mail.google.com/mail/?authuser=${encodeURIComponent(accountEmail)}#all/${encodeURIComponent(threadId)}`;
}
