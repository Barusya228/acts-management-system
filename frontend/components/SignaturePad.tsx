'use client';

import { useRef, useState } from 'react';
import SignatureCanvas from 'react-signature-canvas';

interface SignaturePadProps {
  onSave: (signature: string) => void;
  onClear?: () => void;
}

export default function SignaturePad({ onSave, onClear }: SignaturePadProps) {
  const sigCanvas = useRef<SignatureCanvas>(null);
  const [error, setError] = useState('');

  const clear = () => {
    sigCanvas.current?.clear();
    setError('');
    if (onClear) onClear();
  };

  const save = () => {
    if (sigCanvas.current) {
      if (sigCanvas.current.isEmpty()) {
        setError('Поставьте подпись перед сохранением');
        return;
      }
      setError('');
      const dataURL = sigCanvas.current.toDataURL();
      onSave(dataURL);
    }
  };

  return (
    <div className="border border-gray-300 rounded-lg p-4 bg-white">
      <div className="border-2 border-dashed border-gray-300 rounded mb-4">
        <SignatureCanvas
          ref={sigCanvas}
          canvasProps={{
            className: 'w-full h-48',
          }}
        />
      </div>
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={save}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          Сохранить подпись
        </button>
        <button
          type="button"
          onClick={clear}
          className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700"
        >
          Очистить
        </button>
      </div>
    </div>
  );
}
