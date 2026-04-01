// utils.ts
/**
 * Asynchronous sleep helper.
 * @param ms Number of milliseconds to wait.
 * @returns A Promise that resolves after ms milliseconds.
 */
export const sleep = async (ms: number) => {
  return await new Promise((resolve) => setTimeout(resolve, ms));
};

/**
 * Converts an ArrayBuffer into a Base64 encoded string.
 * @param buffer The ArrayBuffer to convert.
 * @returns A base64-encoded string representation of the buffer.
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

/**
 * Converts a Base64 encoded string into an ArrayBuffer.
 * @param base64 The base64 string to convert.
 * @returns The decoded ArrayBuffer.
 */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Converts a data URL (base64) string into a File object.
 * @param dataurl The data URL string (e.g. 'data:image/png;base64,...').
 * @param filename The filename to assign to the resulting File.
 * @returns A Promise that resolves to a File built from the data URL.
 */
export async function dataURLtoFile(dataurl: string, filename: string): Promise<File> {
  const arr = dataurl.split(',');
  const mime = arr[0]?.match(/:(.*?);/)?.[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);

  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  const blob = new Blob([u8arr], { type: mime });
  return new File([blob], filename, { type: mime });
}
