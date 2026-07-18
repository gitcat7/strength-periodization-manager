export type LocalQaSessionConfig = {
  hostname: string;
  nodeEnv: string | undefined;
  qaEmail: string | undefined;
  qaPassword: string | undefined;
  supabaseAnonKey: string | undefined;
  supabaseUrl: string | undefined;
};

export function isLocalQaSessionEnabled(config: LocalQaSessionConfig) {
  return (
    config.nodeEnv === "development" &&
    (config.hostname === "localhost" || config.hostname === "127.0.0.1") &&
    Boolean(config.qaEmail && config.qaPassword && config.supabaseUrl && config.supabaseAnonKey)
  );
}
