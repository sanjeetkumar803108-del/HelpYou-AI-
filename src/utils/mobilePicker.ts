 import { FilePicker } from '@capawesome/capacitor-file-picker';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';

export interface MobilePickedFile {
  name: string;
  mimeType: string;
  base64: string;
  dataUrl: string;
  blob: Blob;
  fileObj: File; // Mock/Real File object
}

// Convert base64 to Blob
export function base64ToBlob(base64: string, mimeType: string): Blob {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
}

// Convert Blob to File object
export function blobToFile(blob: Blob, name: string): File {
  return new File([blob], name, { type: blob.type, lastModified: Date.now() });
}

/**
 * Triggers native image picker or camera, or file explorer depending on request.
 * Returns a promise of MobilePickedFile[] or empty array on cancel/error.
 */
export async function pickNativeFiles(options: {
  types?: 'image' | 'pdf' | 'document' | 'all';
  multiple?: boolean;
}): Promise<MobilePickedFile[]> {
  if (!Capacitor.isNativePlatform()) {
    console.warn('[mobilePicker] Not on a native platform, fallback to web inputs instead.');
    return [];
  }

  const multiple = options.multiple ?? false;
  const types = options.types ?? 'all';

  try {
    if (types === 'image') {
      const photo = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.Base64,
        source: CameraSource.Photos,
      });

      if (!photo.base64String) return [];

      const mimeType = photo.format ? `image/${photo.format}` : 'image/jpeg';
      const name = `gallery_${Date.now()}.${photo.format || 'jpg'}`;
      const base64 = photo.base64String;
      const dataUrl = `data:${mimeType};base64,${base64}`;
      const blob = base64ToBlob(base64, mimeType);
      const fileObj = blobToFile(blob, name);

      return [{
        name,
        mimeType,
        base64,
        dataUrl,
        blob,
        fileObj,
      }];
    }

    let pickerTypes: string[] = [];
    if (types === 'pdf') {
      // Multiple mime-types forces Android to open the full device File Manager / Document Explorer
      pickerTypes = [
        'application/pdf', 
        'text/plain', 
        'application/msword', 
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ];
    } else if (types === 'document') {
      pickerTypes = [
        'application/pdf', 
        'text/plain', 
        'application/msword', 
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/markdown', 
        'text/csv'
      ];
    } else {
      pickerTypes = ['*/*'];
    }

    const result = await FilePicker.pickFiles({
      types: pickerTypes,
      readData: true,
    });

    const filesToProcess = (!multiple && result.files.length > 1) 
      ? [result.files[0]] 
      : result.files;

    const output: MobilePickedFile[] = [];
    for (const file of filesToProcess) {
      if (!file.data) continue;
      const mimeType = file.mimeType || (types === 'pdf' ? 'application/pdf' : 'application/octet-stream');
      const name = file.name || `file_${Date.now()}`;
      const base64 = file.data;
      const dataUrl = `data:${mimeType};base64,${base64}`;
      const blob = base64ToBlob(base64, mimeType);
      const fileObj = blobToFile(blob, name);

      output.push({
        name,
        mimeType,
        base64,
        dataUrl,
        blob,
        fileObj,
      });
    }

    return output;
  } catch (err) {
    console.error('[mobilePicker] Error picking file natives:', err);
    return [];
  }
}

/**
 * Capture photo natively using camera (Robust Permission Flow)
 *
 * Fix 1: Check permission status FIRST before requesting.
 *         Calling requestPermissions() when already GRANTED throws an
 *         exception on many Android devices.
 * Fix 2: Use CameraResultType.Base64 — reliable on Android WebView
 *         (CameraResultType.Uri fails with "content://" path issues).
 * Fix 3: Return null on cancel — callers show their own toasts.
 */
export async function takeNativePhoto(): Promise<MobilePickedFile | null> {
  if (!Capacitor.isNativePlatform()) {
    return null;
  }

  try {
    // Step 1: Check current permission status first
    const currentStatus = await Camera.checkPermissions();

    // Step 2: Only request if not already granted
    if (currentStatus.camera !== 'granted') {
      const requested = await Camera.requestPermissions({ permissions: ['camera'] });
      if (requested.camera !== 'granted') {
        // Permission denied — return special sentinel so caller can show toast
        throw Object.assign(new Error('Camera permission denied'), { code: 'denied' });
      }
    }

    // Step 3: Launch native camera
    // NOTE: correctOrientation:false prevents Capacitor from writing a temp
    //       rotated copy to disk — which causes "unable to create photo on disk"
    //       on Android 10+ devices with strict file-access policies.
    //       saveToGallery must be omitted (defaults false) — explicitly passing
    //       false still triggers a disk-write path on some OEMs.
    const photo = await Camera.getPhoto({
      quality: 85,
      allowEditing: false,
      resultType: CameraResultType.Base64,
      source: CameraSource.Camera,
      correctOrientation: false,
    });

    if (!photo || !photo.base64String) return null;

    const mimeType = photo.format ? `image/${photo.format}` : 'image/jpeg';
    const name = `camera_${Date.now()}.${photo.format || 'jpg'}`;
    const base64 = photo.base64String;
    const dataUrl = `data:${mimeType};base64,${base64}`;
    const blob = base64ToBlob(base64, mimeType);
    const fileObj = blobToFile(blob, name);

    return { name, mimeType, base64, dataUrl, blob, fileObj };

  } catch (err: any) {
    const msg = String(err?.message || err || '').toLowerCase();
    // Rethrow permission denials so caller can show Settings toast
    if (err?.code === 'denied' || msg.includes('denied') || msg.includes('not authorized')) {
      throw Object.assign(new Error('Camera permission denied'), { code: 'denied' });
    }
    // User cancelled — return null silently
    if (msg.includes('cancel') || msg.includes('dismissed') || msg.includes('user cancelled photos')) {
      return null;
    }
    console.warn('[mobilePicker] Native camera error:', err);
    // TEMP DEBUG: rethrow instead of silently returning null, so the
    // real native error surfaces in AITutor.tsx's catch block/toast.
    // Once root cause is confirmed & fixed, you can revert to `return null;`
    throw Object.assign(new Error(msg || 'Unknown camera error'), { code: 'unknown', original: err });
  }
}
