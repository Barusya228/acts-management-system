import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import './ActFormPage.css'

function ActCreatePage() {
  const [templates, setTemplates] = useState([])
  const [formData, setFormData] = useState({
    template_id: '',
    party1_name: '',
    party2_name: '',
    issue_date: new Date().toISOString().split('T')[0],
    item_name: '',
    receiver_email: ''
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    fetchTemplates()
  }, [])

  const fetchTemplates = async () => {
    try {
      const response = await api.get('/api/templates?is_active=true')
      setTemplates(response.data)
      if (response.data.length > 0) {
        setFormData({ ...formData, template_id: response.data[0].id })
      }
    } catch (error) {
      console.error('Error fetching templates:', error)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const actData = {
        ...formData,
        issue_date: new Date(formData.issue_date).toISOString()
      }
      const response = await api.post('/api/acts', actData)
      navigate(`/acts/${response.data.id}`)
    } catch (err) {
      setError(err.response?.data?.detail || 'Ошибка создания акта')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container">
      <h1>Создать акт</h1>
      <div className="card">
        {error && <div className="error-message">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Шаблон</label>
            <select
              value={formData.template_id}
              onChange={(e) => setFormData({ ...formData, template_id: e.target.value })}
              required
            >
              <option value="">Выберите шаблон</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
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
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Создание...' : 'Создать'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => navigate('/')}
            >
              Отмена
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default ActCreatePage

