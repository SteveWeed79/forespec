// Firestore: the app validates the status value in JS before writing, but the security
// rules allow any authenticated write, so a direct SDK call (or curl) sets any value it
// likes. The check exists only on the client path. Distinct: Firestore client-only validation.
import { doc, updateDoc } from "firebase/firestore";
import { db } from "./firebase";

const ALLOWED = ["open", "pending", "closed"];

export async function setStatus(ticketId: string, status: string) {
  if (!ALLOWED.includes(status)) throw new Error("bad status"); // client-only guard
  await updateDoc(doc(db, "tickets", ticketId), { status });
}
