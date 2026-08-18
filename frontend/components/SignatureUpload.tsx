'use client';

import { useState } from 'react';

interface SignatureUploadProps {
  onUpload: (file: File) => void;
}

export default function SignatureUpload({ onUpload }: SignatureUploadProps) {
  const [preview, setPreview] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUpload(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="border border-gray-300 rounded-lg p-4 bg-white">
      <label className="block mb-4">
        <span className="text-sm font-medium text-gray-700 mb-2 block">
          Загрузить изображение подписи
        </span>
        <input
          type="file"
          accept="image/png,image/jpeg"
          onChange={handleFileChange}
          className="block w-full text-sm text-gray-500 file:mr-4 file:min-h-11 file:py-2.5 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
        />
      </label>
      {preview && (
        <div className="mt-4">
          <p className="text-sm font-medium text-gray-700 mb-2">Предпросмотр:</p>
          <img src={preview} alt="Signature preview" className="max-w-full h-32 border border-gray-300 rounded" />
        </div>
      )}
    </div>
  );
}
