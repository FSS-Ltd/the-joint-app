import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import type { CsvReader, PickedFile } from "./import-file";

/** The system picker; the file is copied to the app cache so it can be read locally. */
export async function pickCsvFile(): Promise<PickedFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: [
      "text/csv",
      "text/comma-separated-values",
      "application/csv",
      "application/vnd.ms-excel",
    ],
    copyToCacheDirectory: true,
    multiple: false,
  });
  const asset = result.canceled ? undefined : result.assets[0];
  return asset ? { name: asset.name, uri: asset.uri, size: asset.size } : null;
}
/** Reads only the cached local copy; the caller validates the uri first. */
export const readLocalFile: CsvReader = async (uri, signal) => {
  const response = await fetch(uri, { signal });
  return response.arrayBuffer();
};
/** The picker's cache copy is a plaintext statement; remove it as soon as it has been read. */
export function discardLocalFile(uri: string): void {
  try {
    // Only a file inside the app cache is ever deleted.
    if (uri.startsWith(Paths.cache.uri) && !/(^|[\\/])\.\.([\\/]|$)/.test(uri))
      new File(uri).delete();
  } catch {
    // Nothing more can be done; the OS clears the cache eventually.
  }
}
