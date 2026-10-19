// Backend probes for the harness's NOT-RUN handling (Story 5.3, FR-9).
//
// `backendFor(variant)` is the backend a Variant needs: the part after `@` of
// a `<driver>@<backend>` Variant, else the Variant itself.
//
// `probe(backend, env)` says whether that backend is reachable locally:
//
//   none, sqlite   always (nothing to reach);
//   pgsql          Postgres at `PGHOST`:`PGPORT` (default 127.0.0.1:5432); a
//                  `PGHOST` starting with `/` is a socket directory, probed as
//                  the unix socket `<PGHOST>/.s.PGSQL.<port>`;
//   redis          Redis at `REDIS_HOST`:`REDIS_PORT` (default 127.0.0.1:6379);
//   anything else  (mysql, mariadb, sqlsrv, beanstalkd, …) never: there is no
//                  local probe for it.
//
// Reachable means a TCP or unix-socket connect succeeds within 1 s. Nothing is
// sent over the connection; it is closed at once.
import { connect } from "node:net";

export const PROBE_TIMEOUT_MS = 1000;

export type ProbeResult = { readonly reachable: true } | { readonly reachable: false; readonly why: string };

type Env = Readonly<Record<string, string | undefined>>;

/** The backend the Variant `variant` needs. */
export function backendFor(variant: string): string {
  const at = variant.indexOf("@");
  return at === -1 ? variant : variant.slice(at + 1);
}

export function setting(env: Env, name: string, fallback: string): string {
  const value = env[name];
  return value === undefined || value === "" ? fallback : value;
}

export function parsePort(text: string): number | null {
  return /^[1-9][0-9]{0,4}$/.test(text) && Number(text) <= 65535 ? Number(text) : null;
}

export type Target = { readonly host: string; readonly port: number; readonly label: string } | { readonly path: string; readonly label: string };

/** Connects to `target`; resolves with null on success or the reason it failed. */
export function tryConnect(target: Target): Promise<string | null> {
  return new Promise((resolvePromise) => {
    let settled = false;
    const socket = "path" in target ? connect({ path: target.path }) : connect({ host: target.host, port: target.port });
    const finish = (why: string | null): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolvePromise(why);
    };
    const timer = setTimeout(() => {
      finish(`no connection within ${PROBE_TIMEOUT_MS} ms`);
    }, PROBE_TIMEOUT_MS);
    socket.once("connect", () => {
      finish(null);
    });
    socket.once("error", (error: NodeJS.ErrnoException) => {
      finish(error.code ?? error.message);
    });
  });
}

/** Whether `backend` is reachable with the settings in `env` (see the header). */
export async function probe(backend: string, env: Env): Promise<ProbeResult> {
  let target: Target;
  if (backend === "none" || backend === "sqlite") {
    return { reachable: true };
  } else if (backend === "pgsql") {
    const host = setting(env, "PGHOST", "127.0.0.1");
    const portText = setting(env, "PGPORT", "5432");
    const port = parsePort(portText);
    if (port === null) {
      return { reachable: false, why: `PGPORT is not a port: ${JSON.stringify(portText)}` };
    }
    target = host.startsWith("/") ? { path: `${host}/.s.PGSQL.${port}`, label: `Postgres at ${host}/.s.PGSQL.${port}` } : { host, port, label: `Postgres at ${host}:${port}` };
  } else if (backend === "redis") {
    const host = setting(env, "REDIS_HOST", "127.0.0.1");
    const portText = setting(env, "REDIS_PORT", "6379");
    const port = parsePort(portText);
    if (port === null) {
      return { reachable: false, why: `REDIS_PORT is not a port: ${JSON.stringify(portText)}` };
    }
    target = { host, port, label: `Redis at ${host}:${port}` };
  } else {
    return { reachable: false, why: `no local probe for backend ${backend}` };
  }
  const failure = await tryConnect(target);
  return failure === null ? { reachable: true } : { reachable: false, why: `${target.label} is not reachable (${failure})` };
}
