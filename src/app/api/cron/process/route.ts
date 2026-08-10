import { NextResponse } from "next/server";
import { processJobs } from "@/lib/jobs/worker";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    const expected =
      process.env.INTERNAL_JOB_WORKER_SECRET?.trim();

    if (!expected) {
      return NextResponse.json(
        {
          ok: false,
          error: "Missing INTERNAL_JOB_WORKER_SECRET",
        },
        {
          status: 500,
        },
      );
    }

    const authorization =
      request.headers.get("authorization");

    const supplied =
      authorization?.startsWith("Bearer ")
        ? authorization.slice(7).trim()
        : "";

    if (!supplied || supplied !== expected) {
      return NextResponse.json(
        {
          ok: false,
          error: "Unauthorized worker request",
        },
        {
          status: 401,
        },
      );
    }

    const result = await processJobs({
      workerId: "github-actions",
      queues: [
        "communications",
        "default",
        "post_call",
        "sequences",
        "campaigns",
        "telephony",
        "ai",
      ],
      limit: 25,
      leaseSeconds: 300,
    });

    return NextResponse.json({
      ok: true,
      workerId: "github-actions",
      processedAt: new Date().toISOString(),
      ...result,
    });
  } catch (error) {
    console.error(
      "Background worker request failed.",
      error,
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown error",
      },
      {
        status: 500,
      },
    );
  }
}
