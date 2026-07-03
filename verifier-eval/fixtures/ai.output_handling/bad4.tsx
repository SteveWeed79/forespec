// The assistant's answer is injected with dangerouslySetInnerHTML, unsanitized. A model
// that emits <img src=x onerror=fetch('/steal?c='+document.cookie)> — on its own or via
// prompt injection — runs script in the user's session. Distinct sink: React raw HTML.
export function Answer({ assistantHtml }: { assistantHtml: string }) {
  return <div className="answer" dangerouslySetInnerHTML={{ __html: assistantHtml }} />;
}
