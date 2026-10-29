declare const api: {
  isToolPermission(decision: unknown): boolean;
  executionGuidance(autoAllow?: boolean): string;
  install(pool: any, options?: {
    getEnabled?: () => boolean;
    saveEnabled?: (enabled: boolean) => void;
    getLanguage?: () => string;
    labels?: () => Record<string, string>;
  }): {
    autoAllow(): boolean;
    apply(): string[];
    setEnabled(enabled: boolean): { ok: boolean; toolAutoAllow: boolean; resolvedPermIds: string[] };
  };
};
export = api;
