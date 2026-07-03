// Renders the assistant's answer with dangerouslySetInnerHTML, unsanitized — the file
// selection must surface for ai.output_handling.
export function Answer({ completion }: { completion: string }) {
  return <div className="assistant-answer" dangerouslySetInnerHTML={{ __html: completion }} />;
}
