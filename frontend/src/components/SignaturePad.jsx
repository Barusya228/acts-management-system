import { useRef, useState } from 'react'
import SignatureCanvas from 'react-signature-canvas'
import './SignaturePad.css'

function SignaturePad({ onSave, onCancel }) {
  const sigPad = useRef(null)
  const [isEmpty, setIsEmpty] = useState(true)

  const handleClear = () => {
    sigPad.current?.clear()
    setIsEmpty(true)
  }

  const handleSave = () => {
    if (sigPad.current && !sigPad.current.isEmpty()) {
      const dataURL = sigPad.current.toDataURL('image/png')
      // Remove data URL prefix
      const base64 = dataURL.split(',')[1]
      onSave(base64)
    }
  }

  const handleBegin = () => {
    setIsEmpty(false)
  }

  return (
    <div className="signature-modal">
      <div className="signature-modal-content">
        <h2>Подпись</h2>
        <div className="signature-canvas-container">
          <SignatureCanvas
            ref={sigPad}
            canvasProps={{
              className: 'signature-canvas'
            }}
            onBegin={handleBegin}
          />
        </div>
        <div className="signature-actions">
          <button onClick={handleClear} className="btn btn-secondary">
            Очистить
          </button>
          <button
            onClick={handleSave}
            className="btn btn-primary"
            disabled={isEmpty}
          >
            Сохранить
          </button>
          <button onClick={onCancel} className="btn btn-secondary">
            Отмена
          </button>
        </div>
      </div>
    </div>
  )
}

export default SignaturePad

