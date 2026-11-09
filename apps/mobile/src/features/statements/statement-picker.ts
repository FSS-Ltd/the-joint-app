import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import type { PickedStatementFile } from "./statement-converter";

export async function pickStatementPdfFile(): Promise<PickedStatementFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ["application/pdf"],
    copyToCacheDirectory: true,
    multiple: false,
  });
  const asset = result.canceled ? undefined : result.assets[0];
  return asset ? { name: asset.name, uri: asset.uri, size: asset.size } : null;
}

export const readLocalStatementBytes = async (
  uri: string,
  signal: AbortSignal,
): Promise<Uint8Array<ArrayBuffer>> => {
  const response = await fetch(uri, { signal });
  const buffer = await response.arrayBuffer();
  return new Uint8Array(buffer);
};

export function discardStatementFile(uri: string): void {
  try {
    if (
      uri.startsWith(Paths.cache.uri) &&
      !/(^|[\\/])\.\.([\\/]|$)/.test(uri)
    ) {
      new File(uri).delete();
    }
  } catch {
    // OS clears the cache eventually.
  }
}
