import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { Link, Redirect, useParams } from "wouter";
import { useHistoryState } from "wouter/use-browser-location";
import { Button } from "@/components/ui/button";
import { request } from "@/lib/api";
import { shortDate, slugOf } from "@/lib/format";
import { STATUS_NAMES, groupApplications, latestEvent } from "@/lib/status";
import { cn } from "@/lib/utils";
import type { Application } from "../../shared/applications";
import ApplicationDetail from "./ApplicationDetail";
import { RouteStrip } from "./StatusRoute";

const ALREADY_TRACKED = "Already tracked; what you entered and the new resume were not saved.";

export type AddedState = { alreadyTracked: boolean };

export default function ApplicationList() {
  const params = useParams<{ id?: string }>();
  const [applications, setApplications] = useState<Application[]>();
  const [error, setError] = useState("");
  const alreadyTracked = useHistoryState<AddedState | null>()?.alreadyTracked;
  const latestLoad = useRef(0);

  const selectedId = params.id === undefined ? undefined : /^\d+$/.test(params.id) ? Number(params.id) : NaN;
  const selected = applications?.find((application) => application.id === selectedId);

  async function load() {
    const loadNumber = ++latestLoad.current;
    // A slower earlier load must not replace the list after an add, undo or save.
    const isLatest = () => loadNumber === latestLoad.current;

    const result = await request("/api/applications");
    if (!result.ok) {
      if (isLatest()) setError(result.error);
      return;
    }

    const fetched: Application[] = await result.res.json();
    if (!isLatest()) return;
    setError("");
    setApplications(fetched);
  }

  // The extension adds applications while this tab sits in the background.
  useEffect(() => {
    load();
    window.addEventListener("focus", load);
    return () => window.removeEventListener("focus", load);
  }, []);

  if (selectedId !== undefined && !Number.isInteger(selectedId)) return <Redirect to="/applications" />;

  const errorBanner = error && (
    <p role="alert" className="mb-4 border bg-panel p-3 text-fault">
      {error}
    </p>
  );

  return (
    <div className={cn("grid h-full", selectedId !== undefined && "grid-cols-[minmax(0,1fr)_minmax(0,36rem)]")}>
      <section className="@container mx-auto min-h-0 w-full max-w-6xl overflow-y-auto p-6">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold whitespace-nowrap">
            Applications{applications?.length ? <span className="font-mono font-normal text-dim"> ({applications.length})</span> : null}
          </h1>
          <Button size="lg" asChild>
            <Link href="/new">
              <Plus aria-hidden />
              New application
            </Link>
          </Button>
        </div>
        {selectedId === undefined && errorBanner}
        {applications?.length === 0 && (
          <p className="max-w-[70ch] border bg-panel p-4">No applications yet. Send a posting from the extension, or add one with New application.</p>
        )}
        <div className="grid gap-6">
          {groupApplications(applications ?? []).map((group) => {
            const headingId = `group-${slugOf(group.name)}`;
            return (
              <section key={group.name} aria-labelledby={headingId}>
                <h2 id={headingId} className="mb-2 font-semibold">
                  {group.name} <span className="font-mono font-normal text-dim">({group.applications.length})</span>
                </h2>
                <ul className="divide-y rounded-md border bg-panel">
                  {group.applications.map((application) => (
                    <li key={application.id}>
                      <ApplicationRow application={application} selected={application.id === selectedId} />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </section>

      {selectedId !== undefined && (
        <div className="min-h-0 overflow-y-auto border-l">
          {errorBanner}
          {selected ? (
            <ApplicationDetail
              key={selected.id}
              application={selected}
              notice={alreadyTracked ? ALREADY_TRACKED : undefined}
              onChange={load}
            />
          ) : (
            applications && (
              <p className="bg-panel p-6">
                This application no longer exists.{" "}
                <Link href="/applications" className="text-signal underline underline-offset-4">
                  Back to applications
                </Link>
              </p>
            )
          )}
        </div>
      )}
    </div>
  );
}

function ApplicationRow({ application, selected }: { application: Application; selected: boolean }) {
  const latest = latestEvent(application);

  return (
    <Link
      href={`/applications/${application.id}`}
      aria-current={selected ? "page" : undefined}
      className={cn(
        "grid gap-1 px-4 py-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 @2xl:grid-cols-[9rem_minmax(0,1fr)_8rem_9rem_6rem] @2xl:items-center @2xl:gap-4",
        selected && "shadow-[inset_3px_0_0_var(--color-signal)]",
      )}
    >
      <span className="truncate font-semibold">{application.company ?? "Untitled"}</span>
      <span className="truncate">{application.position_title}</span>
      <span className="flex items-center gap-4 @2xl:contents">
        <RouteStrip events={application.events} />
        <span className="font-mono text-sm">
          {latest ? `${STATUS_NAMES[latest.status]} ${shortDate(latest.at)}` : "Not sent"}
        </span>
      </span>
      <span className="font-mono text-sm">{application.deadline && `Due ${shortDate(application.deadline)}`}</span>
    </Link>
  );
}
