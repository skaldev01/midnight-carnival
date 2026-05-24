import { NextResponse } from "next/server";
import { getAuthedSession } from "@/services/auth/authService";
import { loadProjectsFromDrive } from "@/services/drive/driveService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getAuthedSession();
  if (!session) {
    return NextResponse.json(
      { error: "Not signed in.", code: "unauthorized" },
      { status: 401 }
    );
  }

  try {
    const projects = await loadProjectsFromDrive(session.accessToken);
    return NextResponse.json({ projects });
  } catch (err) {
    console.error("[/api/drive/projects] failed:", err);
    const message =
      err instanceof Error ? err.message : "Drive load failed.";
    return NextResponse.json(
      { error: message, code: "drive_error" },
      { status: 502 }
    );
  }
}
