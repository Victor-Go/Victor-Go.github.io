export const PRODUCTION_HOST = "victor-go.github.io";
export const LOCAL_HOSTS = ["localhost", "127.0.0.1"] as const;

/** Hostnames on which the epoch script defines its global. Local hosts are left out of CI builds. */
export function epochHosts(ci: boolean): string[] {
  return ci ? [PRODUCTION_HOST] : [PRODUCTION_HOST, ...LOCAL_HOSTS];
}
