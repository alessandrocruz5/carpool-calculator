import * as Sentry from "@sentry/nextjs";
import { headers } from "next/headers";

type Meta = Record<string, unknown>;
type Level = "info" | "warn" | "error";

function getAutoContext(): Meta {
  const ctx: Meta = {};
  try {
    const h = headers();
    const userId = h.get("x-user-id");
    const requestId = h.get("x-request-id") || h.get("x-vercel-id");
    const route = h.get("x-invoke-path") || h.get("x-matched-path");
    if (userId) ctx.userId = userId;
    if (requestId) ctx.requestId = requestId;
    if (route) ctx.route = route;
  } catch {
    // Called outside a request scope (e.g. worker, startup). Skip.
  }
  return ctx;
}

function normalizeMeta(input: unknown): { meta: Meta; err?: Error } {
  if (!input) return { meta: {} };
  if (input instanceof Error) {
    return {
      meta: { error: { name: input.name, message: input.message, stack: input.stack } },
      err: input,
    };
  }
  if (typeof input === "object") {
    const m = input as Meta;
    const candidate = (m.err ?? m.error) as unknown;
    if (candidate instanceof Error) {
      return {
        meta: { ...m, error: { name: candidate.name, message: candidate.message, stack: candidate.stack } },
        err: candidate,
      };
    }
    return { meta: m };
  }
  return { meta: { value: input } };
}

function emit(level: Level, msg: string, rawMeta?: unknown): void {
  const { meta, err } = normalizeMeta(rawMeta);
  const record = {
    level,
    time: new Date().toISOString(),
    msg,
    ...getAutoContext(),
    ...meta,
  };

  if (process.env.NODE_ENV === "production") {
    const line = JSON.stringify(record);
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
  } else {
    const colors: Record<Level, string> = {
      info: "\x1b[36m",
      warn: "\x1b[33m",
      error: "\x1b[31m",
    };
    const reset = "\x1b[0m";
    const { level: _l, time, msg: _m, ...rest } = record;
    const tail = Object.keys(rest).length ? " " + JSON.stringify(rest) : "";
    const line = `${colors[level]}[${level}]${reset} ${time} ${msg}${tail}`;
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
  }

  if (level === "error") {
    const captured = err ?? new Error(msg);
    Sentry.captureException(captured, { extra: { msg, ...meta } });
  }
}

export const log = {
  info(msg: string, meta?: Meta): void {
    emit("info", msg, meta);
  },
  warn(msg: string, meta?: Meta): void {
    emit("warn", msg, meta);
  },
  error(msg: string, meta?: Meta | Error | unknown): void {
    emit("error", msg, meta);
  },
};
