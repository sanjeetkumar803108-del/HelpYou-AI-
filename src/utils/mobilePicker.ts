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
    if (types === 'image' && !multiple) {
      // Prompt user to choose between Camera or Gallery
      // On mobile, this is a clean native experience or we can use FilePicker or Camera
    }

    let pickerTypes: string[] = [];
    if (types === 'image') {
      pickerTypes = ['image/*'];
    } else if (types === 'pdf') {
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
 * Capture photo natively using camera
 */
export async function takeNativePhoto(): Promise<MobilePickedFile | null> {
  if (!Capacitor.isNativePlatform()) {
    return null;
  }

  try {
    // Request camera permission explicitly before triggering the camera
    const req = await Camera.requestPermissions({ permissions: ['camera'] });
    if (req.camera !== 'granted') {
      alert("Camera Permission Needed\n\nHelpYou needs access to your camera to capture photos of your study materials, homework, or essays. Please allow camera access in your device settings.");
      return null;
    }

    const photo = await Camera.getPhoto({
      quality: 90,
      allowEditing: false,
      resultType: CameraResultType.Base64,
      source: CameraSource.Camera,
    });

    if (!photo.base64String) return null;

    const mimeType = photo.format ? `image/${photo.format}` : 'image/jpeg';
    const name = `camera_${Date.now()}.${photo.format || 'jpg'}`;
    const base64 = photo.base64String;
    const dataUrl = `data:${mimeType};base64,${base64}`;
    const blob = base64ToBlob(base64, mimeType);
    const fileObj = blobToFile(blob, name);

    return {
      name,
      mimeType,
      base64,
      dataUrl,
      blob,
      fileObj,
    };
  } catch (err) {
    console.error('[mobilePicker] Error capturing native camera:', err);
    return null;
  }
}
