import { useState } from "react";

export function CardForm() {
  const [card, setCard] = useState({ number: "", cvv: "", exp: "" });
  const submit = async () => {
    await fetch("/api/payments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(card),
    });
  };
  return (
    <form onSubmit={submit}>
      <input value={card.number} onChange={(e) => setCard({ ...card, number: e.target.value })} />
      <input value={card.cvv} onChange={(e) => setCard({ ...card, cvv: e.target.value })} />
      <input value={card.exp} onChange={(e) => setCard({ ...card, exp: e.target.value })} />
    </form>
  );
}
