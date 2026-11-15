import { NextResponse, type NextRequest } from "next/server";

import { searchCompanies } from "@/lib/pull/screener";

// Resolve a company name or partial ticker to NSE symbols (FR-11).
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json([]);
  try {
    return NextResponse.json((await searchCompanies(q)).slice(0, 8));
  } catch {
    return NextResponse.json([], { status: 502 });
  }
}
