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
  const [hasInk, setHasInk] = useState(false);

  const clear = () => {
    sigCanvas.current?.clear();
    setHasInk(false);
    setError('');
    if (onClear) onClear();
  };

  const save = () => {
    if (sigCanvas.current) {
      if (!hasInk) {
        setError('Поставьте подпись перед сохранением');
        return;
      }
      setError('');
      const dataURL = sigCanvas.current.toDataURL();
      onSave(dataURL);
    }
  };

  return (
    <div className="border border-gray-300 rounded-lg p-3 sm:p-4 bg-white">
      <div
        className="border-2 border-dashed border-gray-300 rounded mb-4 touch-none"
        onPointerDown={() => setHasInk(true)}
      >
        <SignatureCanvas
          ref={sigCanvas}
          // clearOnResize=false: поворот телефона / схлопывание адресной строки
          // вызывает resize и по умолчанию молча стирает нарисованную подпись.
          // Проп существует в рантайме, но отсутствует в типах пакета 1.0.6.
          {...({ clearOnResize: false } as Record<string, unknown>)}
          canvasProps={{
            className: 'w-full h-48 touch-none',
          }}
        />
      </div>
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={save}
          className="min-h-11 flex-1 rounded bg-blue-600 px-4 font-medium text-white hover:bg-blue-700"
        >
          Сохранить подпись
        </button>
        <button
          type="button"
          onClick={clear}
          className="min-h-11 rounded bg-gray-600 px-4 font-medium text-white hover:bg-gray-700"
        >
          Очистить
        </button>
      </div>
    </div>
  );
}
