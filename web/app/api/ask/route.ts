import { NextResponse, type NextRequest } from "next/server";

import { answer } from "@/lib/ask";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { q?: string };
  const q = (body.q ?? "").trim().slice(0, 300);
  if (q.length < 3) return NextResponse.json({ error: "Ask a question" }, { status: 400 });
  return NextResponse.json(await answer(q));
}
