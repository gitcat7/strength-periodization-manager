export type LocalQaSessionConfig = {
  hostname: string;
  nodeEnv: string | undefined;
  qaEmail: string | undefined;
  qaPassword: string | undefined;
  supabaseAnonKey: string | undefined;
  supabaseUrl: string | undefined;
};

export function isLocalDevelopmentHost({ hostname, nodeEnv }: Pick<LocalQaSessionConfig, "hostname" | "nodeEnv">) {
  return nodeEnv === "development" && (hostname === "localhost" || hostname === "127.0.0.1");
}

export function isLocalQaSessionEnabled(config: LocalQaSessionConfig) {
  return (
    isLocalDevelopmentHost(config) &&
    Boolean(config.qaEmail && config.qaPassword && config.supabaseUrl && config.supabaseAnonKey)
  );
}
