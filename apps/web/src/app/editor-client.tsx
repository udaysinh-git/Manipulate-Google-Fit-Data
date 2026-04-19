"use client";

import { useEffect, useMemo, useState } from "react";

type SessionResponse = {
  session: { accountId: string; email: string } | null;
};

type PreviewDay = {
  date: string;
  oldSteps: number;
  newSteps: number;
  delta: number;
};

type PreviewResponse = {
  days: PreviewDay[];
  summary: {
    totalOldSteps: number;
    totalNewSteps: number;
    totalDelta: number;
    avgWeekdaySteps: number;
    avgWeekendSteps: number;
    maxIncrease: number;
    maxDecrease: number;
  };
};

type Job = {
  id: string;
  mode: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
};

function isoDateOffset(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  oauth_failed:
    "Google sign-in failed after redirect. Check the terminal for [google oauth callback] logs, client id/secret, and redirect URI.",
  userinfo_forbidden:
    "Google blocked profile access. Add OpenID / email / profile scopes in Cloud Console (OAuth consent screen) and reconnect.",
  invalid_grant:
    "Authorization code expired or was reused. Click Connect again (do not refresh the callback URL).",
  missing_refresh_token:
    "Google did not return a refresh token. Revoke this app under Google Account → Security → Third-party access, then connect again.",
  missing_code: "OAuth callback was missing the authorization code.",
  profile_fetch_failed: "Could not read your Google account id or email from the profile response.",
};

const initialForm = {
  startDate: isoDateOffset(-14),
  endDate: isoDateOffset(-1),
  globalMinSteps: 3500,
  globalMaxSteps: 17000,
  weekdayMinSteps: 6000,
  weekdayMaxSteps: 14000,
  weekendMinSteps: 3500,
  weekendMaxSteps: 9000,
  variancePercent: 18,
  randomSeed: 42,
  customDailyOverrides: "{}",
  monthlyPattern: "1.00,1.05,0.95,1.10",
};

export function EditorClient() {
  const [session, setSession] = useState<SessionResponse["session"]>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [form, setForm] = useState(initialForm);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const parsedMonthlyPattern = useMemo(
    () =>
      form.monthlyPattern
        .split(",")
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isFinite(value))
        .slice(0, 4),
    [form.monthlyPattern],
  );

  async function loadJobs() {
    const response = await fetch("/api/jobs/list");
    const data = await response.json();
    if (response.ok) {
      setJobs(data.jobs as Job[]);
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthErr = params.get("error");
    if (oauthErr) {
      setError(OAUTH_ERROR_MESSAGES[oauthErr] ?? `OAuth error: ${oauthErr}`);
      const url = new URL(window.location.href);
      url.searchParams.delete("error");
      window.history.replaceState({}, "", `${url.pathname}${url.search}`);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/session")
      .then((response) => response.json() as Promise<SessionResponse>)
      .then((data) => {
        if (!cancelled) {
          setSession(data.session);
          setLoadingSession(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoadingSession(false);
          setError("Failed to load session.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (session) {
      void fetch("/api/jobs/list")
        .then((response) => response.json())
        .then((data) => {
          setJobs((data.jobs ?? []) as Job[]);
        });
    }
  }, [session]);

  async function connectGoogle() {
    setBusyAction("connect");
    setError(null);
    const response = await fetch("/api/auth/google/start", { method: "POST" });
    const data = await response.json();
    if (response.ok && data.url) {
      window.location.href = data.url as string;
      return;
    }
    setBusyAction(null);
    setError(data.error ?? "Could not start OAuth.");
  }

  async function logout() {
    setBusyAction("logout");
    await fetch("/api/auth/logout", { method: "POST" });
    setSession(null);
    setPreview(null);
    setJobs([]);
    setBusyAction(null);
  }

  function buildPayload() {
    let customDailyOverrides = {};
    try {
      customDailyOverrides = JSON.parse(form.customDailyOverrides || "{}");
    } catch {
      throw new Error("Custom daily overrides must be valid JSON.");
    }

    if (parsedMonthlyPattern.length !== 4) {
      throw new Error("Monthly pattern must contain exactly 4 comma-separated values.");
    }

    return {
      startDate: form.startDate,
      endDate: form.endDate,
      globalMinSteps: Number(form.globalMinSteps),
      globalMaxSteps: Number(form.globalMaxSteps),
      weekdayMinSteps: Number(form.weekdayMinSteps),
      weekdayMaxSteps: Number(form.weekdayMaxSteps),
      weekendMinSteps: Number(form.weekendMinSteps),
      weekendMaxSteps: Number(form.weekendMaxSteps),
      variancePercent: Number(form.variancePercent),
      randomSeed: Number(form.randomSeed),
      monthlyPattern: parsedMonthlyPattern,
      customDailyOverrides,
    };
  }

  async function runPreview() {
    try {
      setBusyAction("preview");
      setError(null);
      const response = await fetch("/api/fit/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Preview failed.");
      } else {
        setPreview(data as PreviewResponse);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed.");
    } finally {
      setBusyAction(null);
    }
  }

  async function applyChanges() {
    if (!preview) {
      setError("Run preview before apply.");
      return;
    }

    const confirmed = window.confirm(
      "This will overwrite step data for the selected range in Google Fit. Continue?",
    );
    if (!confirmed) {
      return;
    }

    try {
      setBusyAction("apply");
      setError(null);
      const response = await fetch("/api/fit/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Apply failed.");
      } else {
        await loadJobs();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Apply failed.");
    } finally {
      setBusyAction(null);
    }
  }

  async function revertJob(jobId: string) {
    const confirmed = window.confirm("Revert this job using its snapshot?");
    if (!confirmed) {
      return;
    }

    setBusyAction(`revert-${jobId}`);
    const response = await fetch("/api/fit/revert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error ?? "Revert failed.");
    } else {
      await loadJobs();
    }
    setBusyAction(null);
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-8">
      <header className="rounded-xl border border-zinc-700 bg-zinc-900 p-5 text-zinc-100">
        <h1 className="text-2xl font-semibold">Google Fit Data Editor</h1>
        <p className="mt-2 text-sm text-zinc-300">
          Edits write directly to your account. Always preview first and keep ranges small.
        </p>
      </header>

      {loadingSession ? (
        <p>Loading session...</p>
      ) : !session ? (
        <section className="rounded-xl border border-zinc-300 p-6">
          <p className="mb-4">
            Connect a Google account with step write permissions to start editing.
          </p>
          <button
            onClick={connectGoogle}
            disabled={busyAction === "connect"}
            className="rounded-md bg-black px-4 py-2 text-white disabled:opacity-60"
          >
            {busyAction === "connect" ? "Redirecting..." : "Connect Google Account"}
          </button>
        </section>
      ) : (
        <>
          <section className="rounded-xl border border-zinc-300 p-6">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm">
                Connected as <span className="font-semibold">{session.email}</span>
              </p>
              <button
                onClick={logout}
                disabled={busyAction === "logout"}
                className="rounded-md border border-zinc-400 px-3 py-1 text-sm"
              >
                Disconnect
              </button>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {Object.entries(form).map(([key, value]) => (
                <label key={key} className="flex flex-col gap-1 text-sm">
                  {key}
                  <input
                    className="rounded-md border border-zinc-300 px-2 py-1"
                    value={value}
                    onChange={(event) =>
                      setForm((previous) => ({ ...previous, [key]: event.target.value }))
                    }
                  />
                </label>
              ))}
            </div>
            <div className="mt-4 flex gap-3">
              <button
                onClick={runPreview}
                disabled={busyAction === "preview"}
                className="rounded-md bg-zinc-900 px-4 py-2 text-white disabled:opacity-60"
              >
                {busyAction === "preview" ? "Generating..." : "Dry-run Preview"}
              </button>
              <button
                onClick={applyChanges}
                disabled={busyAction === "apply" || !preview}
                className="rounded-md bg-emerald-700 px-4 py-2 text-white disabled:opacity-60"
              >
                {busyAction === "apply" ? "Applying..." : "Apply Overwrite"}
              </button>
            </div>
          </section>

          {error ? (
            <p className="rounded-md border border-red-200 bg-red-100 p-3 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100">
              {error}
            </p>
          ) : null}

          {preview ? (
            <section className="rounded-xl border border-zinc-300 p-6 dark:border-zinc-600">
              <h2 className="mb-3 text-xl font-semibold">Preview</h2>
              <p className="mb-3 text-sm text-zinc-700 dark:text-zinc-300">
                Total delta:{" "}
                <strong className="text-zinc-900 dark:text-zinc-50">
                  {preview.summary.totalDelta}
                </strong>{" "}
                steps
              </p>
              <div className="max-h-[min(70vh,32rem)] overflow-auto rounded-lg border border-zinc-300 bg-white text-zinc-900 shadow-sm dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100">
                <table className="w-full min-w-[18rem] border-collapse text-sm tabular-nums">
                  <thead className="sticky top-0 z-10 border-b border-zinc-300 bg-zinc-200 text-zinc-950 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold">Date</th>
                      <th className="px-3 py-2 text-right font-semibold">Old</th>
                      <th className="px-3 py-2 text-right font-semibold">New</th>
                      <th className="px-3 py-2 text-right font-semibold">Delta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.days.map((day) => (
                      <tr
                        key={day.date}
                        className="border-b border-zinc-200 odd:bg-zinc-50 even:bg-white dark:border-zinc-700 dark:odd:bg-zinc-900/80 dark:even:bg-zinc-950"
                      >
                        <td className="px-3 py-1.5">{day.date}</td>
                        <td className="px-3 py-1.5 text-right">{day.oldSteps}</td>
                        <td className="px-3 py-1.5 text-right">{day.newSteps}</td>
                        <td className="px-3 py-1.5 text-right">{day.delta}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          <section className="rounded-xl border border-zinc-300 p-6">
            <h2 className="mb-3 text-xl font-semibold">History / Undo</h2>
            <div className="flex flex-col gap-2">
              {jobs.map((job) => (
                <div
                  key={job.id}
                  className="flex items-center justify-between rounded-md border border-zinc-200 p-3"
                >
                  <div>
                    <p className="font-medium">
                      {job.mode.toUpperCase()} - {job.status}
                    </p>
                    <p className="text-xs text-zinc-600">
                      Started: {new Date(job.startedAt).toLocaleString()}
                    </p>
                  </div>
                  {job.mode === "apply" && job.status === "completed" ? (
                    <button
                      onClick={() => revertJob(job.id)}
                      disabled={busyAction === `revert-${job.id}`}
                      className="rounded-md border border-zinc-400 px-3 py-1 text-sm disabled:opacity-60"
                    >
                      Revert
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
