import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../services/api'
import './ActFormPage.css'

function ActEditPage() {
  const { id } = useParams()
  const [formData, setFormData] = useState({
    party1_name: '',
    party2_name: '',
    issue_date: '',
    item_name: '',
    receiver_email: '',
    change_note: ''
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    fetchAct()
  }, [id])

  const fetchAct = async () => {
    try {
      const response = await api.get(`/api/acts/${id}`)
      const act = response.data
      setFormData({
        party1_name: act.party1_name,
        party2_name: act.party2_name,
        issue_date: act.issue_date.split('T')[0],
        item_name: act.item_name,
        receiver_email: act.receiver_email,
        change_note: ''
      })
    } catch (error) {
      console.error('Error fetching act:', error)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const updateData = {
        ...formData,
        issue_date: new Date(formData.issue_date).toISOString()
      }
      await api.patch(`/api/acts/${id}`, updateData)
      navigate(`/acts/${id}`)
    } catch (err) {
      setError(err.response?.data?.detail || 'Ошибка обновления акта')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container">
      <h1>Редактировать акт</h1>
      <div className="card">
        {error && <div className="error-message">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Сторона 1</label>
            <input
              type="text"
              value={formData.party1_name}
              onChange={(e) => setFormData({ ...formData, party1_name: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label>Сторона 2</label>
            <input
              type="text"
              value={formData.party2_name}
              onChange={(e) => setFormData({ ...formData, party2_name: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label>Дата выдачи</label>
            <input
              type="date"
              value={formData.issue_date}
              onChange={(e) => setFormData({ ...formData, issue_date: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label>Техника</label>
            <input
              type="text"
              value={formData.item_name}
              onChange={(e) => setFormData({ ...formData, item_name: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label>Email получателя</label>
            <input
              type="email"
              value={formData.receiver_email}
              onChange={(e) => setFormData({ ...formData, receiver_email: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label>Примечание к изменению</label>
            <textarea
              value={formData.change_note}
              onChange={(e) => setFormData({ ...formData, change_note: e.target.value })}
              rows="3"
            />
          </div>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Сохранение...' : 'Сохранить'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => navigate(`/acts/${id}`)}
            >
              Отмена
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default ActEditPage

