/**
 * Mock for the 'obsidian' module.
 * Provides stubs for all Obsidian APIs used by the plugin.
 */

// ─── Vault & File system stubs ────────────────────────────────

export class TFolder {
  path: string;
  constructor(path: string) {
    this.path = path;
  }
}

export class TFile {
  path: string;
  constructor(path: string) {
    this.path = path;
  }
}

export class Vault {
  private files: Map<string, string | ArrayBuffer> = new Map();
  private folders: Set<string> = new Set();

  getAbstractFileByPath(path: string): TFolder | TFile | null {
    if (this.folders.has(path)) return new TFolder(path);
    if (this.files.has(path)) return new TFile(path);
    return null;
  }

  async createFolder(path: string): Promise<void> {
    this.folders.add(path);
  }

  async create(path: string, content: string): Promise<TFile> {
    this.files.set(path, content);
    return new TFile(path);
  }

  async createBinary(path: string, data: ArrayBuffer): Promise<TFile> {
    this.files.set(path, data);
    return new TFile(path);
  }

  // Test helper
  getFileContent(path: string): string | ArrayBuffer | undefined {
    return this.files.get(path);
  }
}

export class App {
  vault: Vault;
  constructor() {
    this.vault = new Vault();
  }
}

// ─── UI stubs ─────────────────────────────────────────────────

export class Notice {
  message: string;
  constructor(message: string, _timeout?: number) {
    this.message = message;
  }
  hide(): void {}
}

export class Plugin {
  app: App;
  constructor() {
    this.app = new App();
  }
  async loadData(): Promise<unknown> {
    return {};
  }
  async saveData(_data: unknown): Promise<void> {}
  addCommand(_cmd: unknown): void {}
  addRibbonIcon(_icon: string, _title: string, _cb: () => void): void {}
  addSettingTab(_tab: unknown): void {}
  addStatusBarItem(): { setText: (t: string) => void } {
    return { setText: () => {} };
  }
  registerEvent(_evt: unknown): void {}
}

export class PluginSettingTab {
  app: App;
  plugin: Plugin;
  containerEl: { empty: () => void; createEl: () => HTMLElement };

  constructor(app: App, plugin: Plugin) {
    this.app = app;
    this.plugin = plugin;
    this.containerEl = {
      empty: () => {},
      createEl: () => document.createElement('div'),
    };
  }

  display(): void {}
}

export class Setting {
  constructor(_el: unknown) {}
  setName(_n: string): this { return this; }
  setDesc(_d: string): this { return this; }
  addText(_cb: (t: unknown) => unknown): this { return this; }
  addDropdown(_cb: (d: unknown) => unknown): this { return this; }
  addToggle(_cb: (t: unknown) => unknown): this { return this; }
}

// ─── Utility stubs ────────────────────────────────────────────

export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/|\/$/g, '');
}

// ─── Network stubs ────────────────────────────────────────────

export interface RequestUrlParam {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string | ArrayBuffer;
  contentType?: string;
}

export interface RequestUrlResponse {
  status: number;
  text: string;
  json: unknown;
  arrayBuffer: ArrayBuffer;
  headers: Record<string, string>;
}

/**
 * Default mock for requestUrl — tests should override via vi.fn()
 */
export async function requestUrl(
  _params: RequestUrlParam
): Promise<RequestUrlResponse> {
  throw new Error('requestUrl is not mocked for this test');
}
