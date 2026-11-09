import { randomUUID } from "expo-crypto";
import { File, Paths } from "expo-file-system";
import { Share } from "react-native";

export interface ExportFileSystem {
  readonly cacheUri: string;
  write(uri: string, bytes: Uint8Array<ArrayBuffer>): void;
  delete(uri: string): void;
  share(uri: string): Promise<void>;
}

const defaultFileSystem: ExportFileSystem = {
  get cacheUri() {
    return Paths.cache.uri;
  },
  write(uri, bytes) {
    const file = new File(uri);
    file.create({ overwrite: true });
    file.write(bytes);
  },
  delete(uri) {
    new File(uri).delete();
  },
  async share(uri) {
    await Share.share({
      title: "joint-export.csv",
      url: uri,
    });
  },
};

function safeCacheUri(cacheRoot: string, uri: string): boolean {
  const root = cacheRoot.replace(/\/$/, "");
  if (!uri.startsWith(`${root}/`)) return false;
  let decoded: string;
  try {
    decoded = decodeURIComponent(uri);
  } catch {
    return false;
  }
  const relative = decoded.slice(root.length + 1);
  if (!/^joint-export-[A-Za-z0-9-]+\.csv$/.test(relative)) return false;
  return !/(^|[\\/])\.\.([\\/]|$)/.test(decoded);
}

/** Tracks temporary CSV export files in the app cache and cleans them up on background, logout or unmount. */
export class ExportFileRegistry {
  private readonly active = new Set<string>();
  constructor(private readonly fs: ExportFileSystem = defaultFileSystem) {}

  writeTempCsv(bytes: Uint8Array<ArrayBuffer>): string {
    const root = this.fs.cacheUri.replace(/\/$/, "");
    const uri = `${root}/joint-export-${randomUUID()}.csv`;
    if (!safeCacheUri(this.fs.cacheUri, uri))
      throw new Error("Invalid cache export path.");
    this.active.add(uri);
    try {
      this.fs.write(uri, bytes);
      return uri;
    } catch (error) {
      this.discard(uri);
      throw error;
    }
  }

  discard(uri: string): void {
    this.active.delete(uri);
    try {
      if (safeCacheUri(this.fs.cacheUri, uri)) this.fs.delete(uri);
    } catch {
      // Best-effort cache cleanup; OS cache eviction backs up any native fs error.
    }
  }

  cleanupAll(): void {
    for (const uri of [...this.active]) {
      this.discard(uri);
    }
  }

  count(): number {
    return this.active.size;
  }

  async shareAndCleanup(bytes: Uint8Array<ArrayBuffer>): Promise<void> {
    const uri = this.writeTempCsv(bytes);
    try {
      await this.fs.share(uri);
    } finally {
      this.discard(uri);
    }
  }
}

export const defaultExportFiles = new ExportFileRegistry();
