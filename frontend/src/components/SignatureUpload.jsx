import { useState } from 'react'
import './SignatureUpload.css'

function SignatureUpload({ onSave, onCancel }) {
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [error, setError] = useState('')

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0]
    if (selectedFile) {
      if (!selectedFile.type.startsWith('image/')) {
        setError('Пожалуйста, выберите изображение')
        return
      }
      setFile(selectedFile)
      setError('')
      
      const reader = new FileReader()
      reader.onloadend = () => {
        setPreview(reader.result)
      }
      reader.readAsDataURL(selectedFile)
    }
  }

  const handleSave = () => {
    if (file && preview) {
      // Remove data URL prefix
      const base64 = preview.split(',')[1]
      onSave(base64)
    }
  }

  return (
    <div className="signature-modal">
      <div className="signature-modal-content">
        <h2>Загрузить подпись</h2>
        {error && <div className="error-message">{error}</div>}
        <div className="upload-section">
          <input
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="file-input"
          />
          {preview && (
            <div className="preview-container">
              <img src={preview} alt="Preview" className="preview-image" />
            </div>
          )}
        </div>
        <div className="signature-actions">
          <button
            onClick={handleSave}
            className="btn btn-primary"
            disabled={!file}
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

export default SignatureUpload

