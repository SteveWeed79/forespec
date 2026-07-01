"use client";

import { useState } from "react";

export function GeocodeBox() {
  const [coords, setCoords] = useState<string>("");
  const lookup = async (place: string) => {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
        place
      )}&key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}`
    );
    const data = await res.json();
    const loc = data.results?.[0]?.geometry?.location;
    setCoords(loc ? `${loc.lat},${loc.lng}` : "not found");
  };
  return (
    <div>
      <input onChange={(e) => lookup(e.target.value)} placeholder="City" />
      <span>{coords}</span>
    </div>
  );
}
