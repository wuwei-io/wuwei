// Interface for the independently tested CommonJS protocol adapter.
declare const api: {
  history(...args: any[]): any;
  sessions(...args: any[]): any;
  page(...args: any[]): any;
};
export = api;
