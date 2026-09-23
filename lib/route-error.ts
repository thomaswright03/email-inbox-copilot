// A distinguishable, user-facing error a route handler's fetcher can throw
// so the outer catch knows exactly what message/status to return, instead
// of every call site re-deriving that from a generic Error.
export class RouteError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
