// Interface for the independently tested CommonJS protocol adapter.
declare const api: {
  runEmployee(...args: any[]): any;
  stopMember(...args: any[]): any;
  state(...args: any[]): any;
};
export = api;
