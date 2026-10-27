// Interface for the independently tested CommonJS protocol adapter.
declare const api: {
  records(...args: any[]): any;
  scheduleDetail(...args: any[]): any;
  readRuns(...args: any[]): any;
};
export = api;
