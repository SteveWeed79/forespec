// Account-recovery security questions — pure comparison logic, no database access and no
// injection surface. DECOY: it name-drops "security" repeatedly, which the generic id-token
// can latch onto; selection must NOT prefer this over the real SQL-injection file.
export const SECURITY_QUESTIONS = [
  "What was the name of your first pet?",
  "In what city were you born?",
  "What is your mother's maiden name?",
];

export function checkSecurityAnswer(storedSecurityAnswer: string, providedSecurityAnswer: string): boolean {
  return storedSecurityAnswer.trim().toLowerCase() === providedSecurityAnswer.trim().toLowerCase();
}
