import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { processJobs } from "@/lib/jobs/worker";
import { scheduleDueSequenceEnrollments } from "@/lib/sequences/engine";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function createWorkerLogClient(
  url: string,
  serviceRoleKey: string,
) {
  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

type WorkerLogClient = ReturnType<
  typeof createWorkerLogClient
>;

type ExecutionLogContext = {
  id: string;
  client: WorkerLogClient;
};

function resolveWorkerId(request: Request) {
  const supplied =
    request.headers.get("x-flowtix-worker-id")?.trim() ?? "";

  if (
    supplied &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(supplied)
  ) {
    return supplied;
  }

  return "github-actions";
}

async function startExecutionLog(
  workerId: string,
): Promise<ExecutionLogContext | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !serviceRoleKey) {
    console.error(
      "Worker execution logging skipped because Supabase service-role configuration is missing.",
    );
    return null;
  }

  const client = createWorkerLogClient(
    url,
    serviceRoleKey,
  );

  const { data, error } = await client
    .from("worker_execution_logs")
    .insert({
      worker_id: workerId,
      status: "running",
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    console.error(
      "Unable to create worker execution log.",
      error,
    );
    return null;
  }

  return {
    id: String(data.id),
    client,
  };
}

async function completeExecutionLog(
  context: ExecutionLogContext | null,
  startedAt: number,
  result: Awaited<ReturnType<typeof processJobs>>,
) {
  if (!context) {
    return;
  }

  const { error } = await context.client
    .from("worker_execution_logs")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      claimed_jobs: result.claimed,
      completed_jobs: result.completed,
      retried_jobs: result.retried,
      failed_jobs: result.failed,
      dead_letter_jobs: result.deadLettered,
      duration_ms: Date.now() - startedAt,
      error_message: null,
    })
    .eq("id", context.id);

  if (error) {
    console.error(
      "Unable to complete worker execution log.",
      error,
    );
  }
}

async function failExecutionLog(
  context: ExecutionLogContext | null,
  startedAt: number,
  error: unknown,
) {
  if (!context) {
    return;
  }

  const message =
    error instanceof Error
      ? error.message
      : "Unknown worker execution error";

  const { error: logError } = await context.client
    .from("worker_execution_logs")
    .update({
      status: "failed",
      completed_at: new Date().toISOString(),
      duration_ms: Date.now() - startedAt,
      error_message: message.slice(0, 4000),
    })
    .eq("id", context.id);

  if (logError) {
    console.error(
      "Unable to fail worker execution log.",
      logError,
    );
  }
}

export async function GET(request: Request) {
  const startedAt = Date.now();
  let executionLog: ExecutionLogContext | null = null;

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

    const workerId = resolveWorkerId(request);
    executionLog = await startExecutionLog(workerId);

    const sequenceScheduling =
      await scheduleDueSequenceEnrollments(25);

    const exportSchedulerUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const exportSchedulerKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

    let exportScheduling = 0;
    if (exportSchedulerUrl && exportSchedulerKey) {
      const exportSchedulerClient = createWorkerLogClient(
        exportSchedulerUrl,
        exportSchedulerKey,
      );
      const scheduledExports = await exportSchedulerClient.rpc(
        'enqueue_due_export_schedules',
        { p_limit: 100 },
      );

      if (scheduledExports.error) {
        throw new Error(
          `Unable to schedule due exports: ${scheduledExports.error.message}`,
        );
      }

      exportScheduling = Number(scheduledExports.data ?? 0);
    }

    const result = await processJobs({
      workerId,
      queues: [
        "communications",
        "default",
        "post_call",
        "sequences",
        "campaigns",
        "telephony",
        "ai",
        "reports",
      ],
      limit: 25,
      leaseSeconds: 300,
    });

    await completeExecutionLog(
      executionLog,
      startedAt,
      result,
    );

    return NextResponse.json({
      ok: true,
      workerId,
      processedAt: new Date().toISOString(),
      sequenceScheduling,
      exportScheduling,
      ...result,
    });
  } catch (error) {
    await failExecutionLog(
      executionLog,
      startedAt,
      error,
    );

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