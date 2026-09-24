import type { ErrorCode } from "./api";

// A distinguishable, user-facing error a route handler's fetcher can throw
// so the outer catch knows exactly what message/status/code to return,
// instead of every call site re-deriving that from a generic Error.
export class RouteError extends Error {
  status: number;
  code: ErrorCode;
  constructor(message: string, status: number, code: ErrorCode) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
