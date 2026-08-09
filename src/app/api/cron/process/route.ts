import { NextResponse } from "next/server";
import { processJobs } from "@/lib/jobs/worker";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");

    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        {
          error: "Unauthorized",
        },
        {
          status: 401,
        },
      );
    }

    const result = await processJobs({
  workerId: "vercel-cron",
});

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error) {
    console.error("Cron job processing failed:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown cron processing error",
      },
      {
        status: 500,
      },
    );
  }
}