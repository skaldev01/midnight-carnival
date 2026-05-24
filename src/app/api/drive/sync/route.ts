import { NextResponse } from "next/server";
import { getAuthedSession } from "@/services/auth/authService";
import { syncProjectToDrive } from "@/services/drive/driveService";
import type { Project } from "@/types/project";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RequestBody = { project?: Partial<Project> };

function isValidProject(p: unknown): p is Project {
  if (!p || typeof p !== "object") return false;
  const proj = p as Partial<Project>;
  return (
    typeof proj.id === "string" &&
    typeof proj.title === "string" &&
    typeof proj.createdAt === "string" &&
    typeof proj.updatedAt === "string"
  );
}

export async function POST(req: Request) {
  const session = await getAuthedSession();
  if (!session) {
    return NextResponse.json(
      { error: "Not signed in.", code: "unauthorized" },
      { status: 401 }
    );
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body.", code: "bad_request" },
      { status: 400 }
    );
  }

  if (!isValidProject(body.project)) {
    return NextResponse.json(
      { error: "Missing or invalid project payload.", code: "bad_request" },
      { status: 400 }
    );
  }

  try {
    const cloud = await syncProjectToDrive(session.accessToken, body.project);
    return NextResponse.json({ cloud });
  } catch (err) {
    console.error("[/api/drive/sync] failed:", err);
    const message =
      err instanceof Error ? err.message : "Drive sync failed.";
    return NextResponse.json(
      { error: message, code: "drive_error" },
      { status: 502 }
    );
  }
}
