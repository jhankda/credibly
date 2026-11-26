import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const aiServiceUrl = process.env.AI_SERVICE_URL || "http://localhost:8000";
    const res = await fetch(new URL("/detect", aiServiceUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (!res.ok) {
      console.error("[AI] Detection service returned an unsuccessful response:", res.status);
      return NextResponse.json({ error: "Anomaly detection is temporarily unavailable." }, { status: 503 });
    }
    return NextResponse.json(await res.json());
  } catch (error) {
    console.error("[AI] Detection request failed:", error);
    return NextResponse.json({ error: "Anomaly detection is temporarily unavailable." }, { status: 503 });
  }
}
