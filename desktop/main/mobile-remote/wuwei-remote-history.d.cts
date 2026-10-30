// Interface for the independently tested CommonJS protocol adapter.
declare const api: {
  historyPage(...args: any[]): any;
  previewImage(...args: any[]): any;
  fullImage(...args: any[]): any;
  digest(...args: any[]): any;
};
export = api;
