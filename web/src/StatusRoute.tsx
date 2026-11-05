import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { request, sendJson } from "@/lib/api";
import { localDay, shortDate } from "@/lib/format";
import { STATUS_NAMES, eventAt, isClosing, lastRecordedEvent, routeOf } from "@/lib/status";
import { cn } from "@/lib/utils";
import { STATUSES, type Application, type Status, type StatusEvent } from "../../shared/applications";

const UNDO_WINDOW_MS = 8000;
const ROW_SEGMENT_REM = 1.25;

export function RouteStrip({ events }: { events: StatusEvent[] }) {
  const line = routeOf(events);
  const summary = events.map((event) => `${STATUS_NAMES[event.status]} ${shortDate(event.at)}`).join(", ");

  const segmentWidth = { width: `${ROW_SEGMENT_REM}rem` };

  return (
    // End-aligned so an overflowing route clips its oldest pads, never the current one.
    <span role="img" aria-label={summary || "Not sent"} className="flex h-5 min-w-0 justify-end overflow-hidden">
      <span className="flex min-w-full shrink-0 items-center">
        {events.map((event, index) => (
          <span key={event.id} className="flex items-center">
            {index > 0 && <Segment reached closed={line.closed} style={segmentWidth} />}
            <Pad status={event.status} closed={line.closed} current={index === events.length - 1} />
          </span>
        ))}
        {events.length === 0 && <HollowPad />}
        <AheadTrace count={events.length === 0 ? line.ahead - 1 : line.ahead} segmentStyle={segmentWidth} />
      </span>
    </span>
  );
}

export default function StatusRoute({ application, onChange }: { application: Application; onChange: () => Promise<unknown> }) {
  const [day, setDay] = useState(() => localDay(new Date()));
  const [pending, setPending] = useState(false);
  const [drawnEventId, setDrawnEventId] = useState<number>();

  const { events } = application;
  const line = routeOf(events);
  const undoable = lastRecordedEvent(events);
  const toastId = `stop-${application.id}`;
  const stopList = useRef<HTMLOListElement>(null);

  // A long route overflows a phone; keep the current stop and its Undo in view.
  useEffect(() => {
    stopList.current?.scrollTo({ left: stopList.current.scrollWidth });
  }, [events.length]);

  async function addStop(status: Status) {
    setPending(true);
    const result = await sendJson("POST", `/api/applications/${application.id}/events`, { status, at: eventAt(day) });
    if (!result.ok) {
      setPending(false);
      toast.error(result.error);
      return;
    }

    const event: StatusEvent = await result.res.json();
    setDrawnEventId(event.id);
    await onChange();
    setPending(false);
    setDay(localDay(new Date()));

    toast(`Marked ${STATUS_NAMES[status]}`, {
      id: toastId,
      duration: UNDO_WINDOW_MS,
      action: { label: "Undo", onClick: () => undo(event.id) },
    });
  }

  async function undo(eventId: number) {
    toast.dismiss(toastId);
    setPending(true);
    const result = await request(`/api/applications/${application.id}/events/${eventId}`, { method: "DELETE" });
    if (result.ok) await onChange();
    else toast.error(result.error);
    setPending(false);
  }

  return (
    <section aria-label="Status" className="grid gap-4">
      {events.length === 0 ? (
        <p className="text-dim">Not sent yet. Add the first stop when you apply.</p>
      ) : (
        <ol ref={stopList} className="flex overflow-x-auto pb-1">
          {events.map((event, index) => {
            const next = events.at(index + 1);
            return (
              <li key={event.id} className={cn("grid min-w-24 flex-1 shrink-0 content-start gap-0.5", !next && line.ahead > 0 && "flex-[1.5]")}>
                <span className="flex h-6 items-center">
                  <Pad status={event.status} closed={line.closed} current={!next} />
                  {next && <Segment reached closed={line.closed} drawn={next.id === drawnEventId} className="flex-1" />}
                  {!next && <AheadTrace count={line.ahead} segmentClassName="flex-1" />}
                </span>
                <span className="font-mono font-medium">{STATUS_NAMES[event.status]}</span>
                <time dateTime={event.at} className="font-mono text-sm">
                  {shortDate(event.at)}
                </time>
                {event.id === undoable?.id && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="-ml-2.5 justify-self-start"
                    aria-label={`Undo ${STATUS_NAMES[event.status]}`}
                    disabled={pending}
                    onClick={() => undo(event.id)}
                  >
                    Undo
                  </Button>
                )}
              </li>
            );
          })}
        </ol>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" disabled={pending}>
              Add stop
              <ChevronDown data-icon="inline-end" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-40">
            {STATUSES.map((status) => (
              <DropdownMenuItem key={status} onSelect={() => addStop(status)}>
                {STATUS_NAMES[status]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="grid gap-1">
          <Label htmlFor="stop-day">
            Date
          </Label>
          <Input
            id="stop-day"
            type="date"
            max={localDay(new Date())}
            value={day}
            onChange={(e) => setDay(e.target.value)}
            className="w-40 font-mono"
          />
        </div>
      </div>
    </section>
  );
}

function Pad({ status, closed, current }: { status: Status; closed: boolean; current: boolean }) {
  const tone = closed ? "text-dim" : current ? "text-signal" : "text-ink";
  if (isClosing(status)) return <span className={cn("h-4 w-0.5 shrink-0 bg-current", tone)} />;

  const offer = status === "offer" && "mx-1 outline-1 outline-offset-2 outline-current";
  return <span className={cn("size-2.5 shrink-0 bg-current", tone, offer, current && !closed && "shadow-pad-glow")} />;
}

function AheadTrace({ count, segmentClassName, segmentStyle }: { count: number; segmentClassName?: string; segmentStyle?: CSSProperties }) {
  return Array.from({ length: count }, (_, index) => (
    <span key={index} className={cn("flex items-center", segmentClassName)}>
      <Segment className="flex-1" style={segmentStyle} />
      <HollowPad />
    </span>
  ));
}

function HollowPad() {
  return <span className="size-2.5 shrink-0 border border-dim" />;
}

function Segment({
  reached = false,
  closed = false,
  drawn = false,
  className,
  style,
}: {
  reached?: boolean;
  closed?: boolean;
  drawn?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const stroke = reached ? (closed ? "border-dim" : "border-ink") : "border-dashed border-dim";
  return <span className={cn("h-0 border-t", stroke, drawn && "origin-left animate-route-draw", className)} style={style} />;
}
