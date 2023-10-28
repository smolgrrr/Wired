// Make TypeScript treat *.worker.ts as a module
declare module 'worker-loader!*' {
    class WebpackWorker extends Worker {
      constructor();
    }
  
    export = WebpackWorker;
  }
  
  // Extend the default Worker type with the properties used in the worker
  interface Worker {
    new (stringUrl: string, options?: WorkerOptions): Worker;
    postMessage: (message: any) => void;
  }
  