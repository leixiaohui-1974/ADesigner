import { Attachment } from '../types';

export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        // Remove the data URL prefix (e.g., "data:image/png;base64,")
        const base64 = reader.result.split(',')[1];
        resolve(base64);
      } else {
        reject(new Error('Failed to convert file to base64'));
      }
    };
    reader.onerror = (error) => reject(error);
  });
};

export const validateFile = (file: File): boolean => {
  // Gemini supports specific mime types. 
  // Ref: https://ai.google.dev/gemini-api/docs/prompting_with_media
  const allowedTypes = [
    'image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif',
    'application/pdf', 'text/plain', 'text/csv'
  ];
  return allowedTypes.includes(file.type);
};

export const processAttachments = async (files: FileList | null): Promise<Attachment[]> => {
  if (!files || files.length === 0) return [];

  const attachments: Attachment[] = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (validateFile(file)) {
      try {
        const base64 = await fileToBase64(file);
        attachments.push({
          mimeType: file.type,
          data: base64,
          fileName: file.name
        });
      } catch (e) {
        console.error(`Failed to process file ${file.name}`, e);
      }
    }
  }
  return attachments;
};