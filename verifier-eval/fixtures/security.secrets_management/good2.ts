// Client component: no secret in sight, it just calls our own route.
"use client";

import { useState } from "react";

export function GeocodeBox() {
  const [coords, setCoords] = useState<string>("");
  const lookup = async (place: string) => {
    const res = await fetch(`/api/geocode?place=${encodeURIComponent(place)}`);
    const { location } = await res.json();
    setCoords(location ?? "not found");
  };
  return (
    <div>
      <input onChange={(e) => lookup(e.target.value)} placeholder="City" />
      <span>{coords}</span>
    </div>
  );
}

// app/api/geocode/route.ts (server): the key stays on the server.
export async function GET(req: Request) {
  const place = new URL(req.url).searchParams.get("place") ?? "";
  const res = await fetch(
    `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
      place
    )}&key=${process.env.GOOGLE_MAPS_API_KEY}`
  );
  const data = await res.json();
  const loc = data.results?.[0]?.geometry?.location;
  return Response.json({ location: loc ? `${loc.lat},${loc.lng}` : null });
}
