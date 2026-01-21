import { useState, useEffect } from 'react'
import api from '../services/api'
import './TemplatesPage.css'

function TemplatesPage() {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchTemplates()
  }, [])

  const fetchTemplates = async () => {
    try {
      const response = await api.get('/api/templates')
      setTemplates(response.data)
    } catch (error) {
      console.error('Error fetching templates:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('ru-RU')
  }

  return (
    <div className="container">
      <h1>Шаблоны</h1>
      {loading ? (
        <div>Загрузка...</div>
      ) : (
        <div className="templates-grid">
          {templates.map((template) => (
            <div key={template.id} className="card">
              <h2>{template.name}</h2>
              <p><strong>Код:</strong> {template.code}</p>
              <p><strong>Описание:</strong> {template.description || '-'}</p>
              <p><strong>Статус:</strong> {template.is_active ? 'Активен' : 'Неактивен'}</p>
              <p><strong>Создан:</strong> {formatDate(template.created_at)}</p>
              <details>
                <summary>Schema JSON</summary>
                <pre>{JSON.stringify(template.schema_json, null, 2)}</pre>
              </details>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default TemplatesPage

