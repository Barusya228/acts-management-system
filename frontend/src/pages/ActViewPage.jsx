import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import api from '../services/api'
import SignaturePad from '../components/SignaturePad'
import SignatureUpload from '../components/SignatureUpload'
import './ActViewPage.css'

function ActViewPage() {
  const { id } = useParams()
  const [act, setAct] = useState(null)
  const [versions, setVersions] = useState([])
  const [loading, setLoading] = useState(true)
  const [showSignaturePad1, setShowSignaturePad1] = useState(false)
  const [showSignaturePad2, setShowSignaturePad2] = useState(false)
  const [showSignatureUpload1, setShowSignatureUpload1] = useState(false)
  const [showSignatureUpload2, setShowSignatureUpload2] = useState(false)

  useEffect(() => {
    fetchAct()
    fetchVersions()
  }, [id])

  const fetchAct = async () => {
    try {
      const response = await api.get(`/api/acts/${id}`)
      setAct(response.data)
    } catch (error) {
      console.error('Error fetching act:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchVersions = async () => {
    try {
      const response = await api.get(`/api/acts/${id}/versions`)
      setVersions(response.data)
    } catch (error) {
      console.error('Error fetching versions:', error)
    }
  }

  const handleSignature = async (party, signatureBase64) => {
    try {
      await api.post(`/api/acts/${id}/sign/${party}`, {
        signature_base64: signatureBase64
      })
      setShowSignaturePad1(false)
      setShowSignaturePad2(false)
      setShowSignatureUpload1(false)
      setShowSignatureUpload2(false)
      fetchAct()
      fetchVersions()
    } catch (error) {
      console.error('Error signing:', error)
      alert('Ошибка при сохранении подписи')
    }
  }

  const downloadPDF = async () => {
    try {
      const response = await api.get(`/api/acts/${id}/download/pdf`, {
        responseType: 'blob'
      })
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `act_${id}.pdf`)
      document.body.appendChild(link)
      link.click()
      link.remove()
    } catch (error) {
      console.error('Error downloading PDF:', error)
      alert('Ошибка при загрузке PDF')
    }
  }

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString('ru-RU')
  }

  const getStatusLabel = (status) => {
    const labels = {
      DRAFT: 'Черновик',
      SIGNED_PARTY1: 'Подписано стороной 1',
      SIGNED_PARTY2: 'Подписано стороной 2',
      COMPLETED: 'Завершено'
    }
    return labels[status] || status
  }

  if (loading) {
    return <div className="container">Загрузка...</div>
  }

  if (!act) {
    return <div className="container">Акт не найден</div>
  }

  return (
    <div className="container">
      <div className="page-header">
        <h1>Просмотр акта</h1>
        <div>
          <Link to={`/acts/${id}/edit`} className="btn btn-primary">
            Редактировать
          </Link>
          <button onClick={downloadPDF} className="btn btn-secondary" style={{ marginLeft: '10px' }}>
            Скачать PDF
          </button>
        </div>
      </div>

      <div className="card">
        <h2>Информация об акте</h2>
        <div className="act-info">
          <div className="info-row">
            <strong>ID:</strong> <span>{act.id}</span>
          </div>
          <div className="info-row">
            <strong>Сторона 1:</strong> <span>{act.party1_name}</span>
          </div>
          <div className="info-row">
            <strong>Сторона 2:</strong> <span>{act.party2_name}</span>
          </div>
          <div className="info-row">
            <strong>Дата выдачи:</strong> <span>{formatDate(act.issue_date)}</span>
          </div>
          <div className="info-row">
            <strong>Техника:</strong> <span>{act.item_name}</span>
          </div>
          <div className="info-row">
            <strong>Email получателя:</strong> <span>{act.receiver_email}</span>
          </div>
          <div className="info-row">
            <strong>Статус:</strong> <span>{getStatusLabel(act.status)}</span>
          </div>
          <div className="info-row">
            <strong>Текущая версия:</strong> <span>{act.current_version}</span>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Подписи</h2>
        <div className="signature-section">
          <div>
            <h3>Сторона 1</h3>
            {act.status === 'DRAFT' || act.status === 'SIGNED_PARTY2' ? (
              <>
                <button
                  onClick={() => setShowSignaturePad1(true)}
                  className="btn btn-primary"
                >
                  Подписать (Canvas)
                </button>
                <button
                  onClick={() => setShowSignatureUpload1(true)}
                  className="btn btn-secondary"
                  style={{ marginLeft: '10px' }}
                >
                  Загрузить подпись
                </button>
              </>
            ) : (
              <p className="signed-badge">Подписано</p>
            )}
          </div>
          <div>
            <h3>Сторона 2</h3>
            {act.status === 'DRAFT' || act.status === 'SIGNED_PARTY1' ? (
              <>
                <button
                  onClick={() => setShowSignaturePad2(true)}
                  className="btn btn-primary"
                >
                  Подписать (Canvas)
                </button>
                <button
                  onClick={() => setShowSignatureUpload2(true)}
                  className="btn btn-secondary"
                  style={{ marginLeft: '10px' }}
                >
                  Загрузить подпись
                </button>
              </>
            ) : (
              <p className="signed-badge">Подписано</p>
            )}
          </div>
        </div>
      </div>

      {showSignaturePad1 && (
        <SignaturePad
          onSave={(signature) => handleSignature('party1', signature)}
          onCancel={() => setShowSignaturePad1(false)}
        />
      )}

      {showSignaturePad2 && (
        <SignaturePad
          onSave={(signature) => handleSignature('party2', signature)}
          onCancel={() => setShowSignaturePad2(false)}
        />
      )}

      {showSignatureUpload1 && (
        <SignatureUpload
          onSave={(signature) => handleSignature('party1', signature)}
          onCancel={() => setShowSignatureUpload1(false)}
        />
      )}

      {showSignatureUpload2 && (
        <SignatureUpload
          onSave={(signature) => handleSignature('party2', signature)}
          onCancel={() => setShowSignatureUpload2(false)}
        />
      )}

      <div className="card">
        <h2>Версии</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Версия</th>
              <th>Дата создания</th>
              <th>Примечание</th>
            </tr>
          </thead>
          <tbody>
            {versions.map((version) => (
              <tr key={version.id}>
                <td>{version.version_number}</td>
                <td>{formatDate(version.created_at)}</td>
                <td>{version.change_note || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default ActViewPage

