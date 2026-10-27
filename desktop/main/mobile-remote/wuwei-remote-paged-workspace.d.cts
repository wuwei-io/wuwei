// Interface for the independently tested CommonJS protocol adapter.
declare const api: {
  paginate(...args: any[]): any;
  sessions(...args: any[]): any;
  workspace(...args: any[]): any;
};
export = api;
