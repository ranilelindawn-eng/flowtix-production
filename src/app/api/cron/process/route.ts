import { NextResponse } from "next/server";
import { processJobs } from "@/lib/jobs/worker";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    const expected =
      process.env.INTERNAL_JOB_WORKER_SECRET?.trim();

    if (!expected) {
      throw new Error(
        "Missing INTERNAL_JOB_WORKER_SECRET environment variable.",
      );
    }

    const authorization = request.headers.get("authorization");

    const supplied =
      authorization?.startsWith("Bearer ")
        ? authorization.slice("Bearer ".length).trim()
        : "";

    if (!supplied || supplied !== expected) {
      return NextResponse.json(
        {
          error: "Unauthorized worker request.",
        },
        {
          status: 401,
        },
      );
    }

    const result = await processJobs({
      workerId: "vercel-cron",
      queues: [
        "communications",
      ],
      limit: 10,
      leaseSeconds: 120,
    });

    return NextResponse.json({
      ok: true,
      workerId: "vercel-cron",
      processedAt: new Date().toISOString(),
      ...result,
    });
  } catch (error) {
    console.error(
      "Cron background worker failed.",
      error,
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown cron worker error",
      },
      {
        status: 500,
      },
    );
  }
}