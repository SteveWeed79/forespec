// Presentational cart component — a decoy. Mentions price/total/cart but holds none of
// the tracked issues; selection should not surface it for the security or checkout checks.
export function Cart({ items }: { items: { name: string; price: number }[] }) {
  const total = items.reduce((sum, item) => sum + item.price, 0);
  return (
    <div className="cart">
      <ul>{items.map((i) => <li key={i.name}>{i.name}: ${i.price}</li>)}</ul>
      <strong>Total: ${total}</strong>
    </div>
  );
}
