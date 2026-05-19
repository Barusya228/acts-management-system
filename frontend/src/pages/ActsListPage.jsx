import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import api from '../services/api'
import './ActsListPage.css'

function ActsListPage() {
  const [acts, setActs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [adSyncLoading, setAdSyncLoading] = useState(false)
  const [adSyncResult, setAdSyncResult] = useState(null)
  const [showAdSync, setShowAdSync] = useState(false)
  const [filters, setFilters] = useState({
    template_code: '',
    party1: '',
    party2: '',
    item_name: '',
    email: '',
    sort_by: 'created_at',
    sort_dir: 'desc',
    page: 1,
    page_size: 20
  })
  const [total, setTotal] = useState(0)

  useEffect(() => {
    fetchActs()
  }, [filters])

  const fetchActs = async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      Object.entries(filters).forEach(([key, value]) => {
        if (value) {
          params.append(key, value)
        }
      })

      const response = await api.get(`/api/acts?${params.toString()}`)
      setActs(response.data?.items || [])
      setTotal(response.data?.total || 0)
    } catch (error) {
      console.error('Error fetching acts:', error)
      setError(error.response?.data?.detail || 'Ошибка загрузки актов')
      setActs([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }

  const handleFilterChange = (field, value) => {
    setFilters({ ...filters, [field]: value, page: 1 })
  }

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('ru-RU')
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

  const handleAdSync = async () => {
    setAdSyncLoading(true)
    setAdSyncResult(null)
    try {
      const response = await api.post('/api/admin/ad-sync/run')
      setAdSyncResult(response.data)
    } catch (error) {
      setAdSyncResult({ status: 'error', reason: error.response?.data?.detail || 'Ошибка синхронизации' })
    } finally {
      setAdSyncLoading(false)
    }
  }

  return (
    <div className="container">
      <div className="page-header">
        <h1>Список актов</h1>
        <Link to="/acts/create" className="btn btn-primary">
          Создать акт
        </Link>
      </div>

      {showAdSync && (
        <div className="card" style={{ marginBottom: '16px' }}>
          <h2>Массовая синхронизация с AD</h2>
          <p style={{ fontSize: '14px', color: '#666' }}>
            Загрузка пользователей из Active Directory. Новые пользователи будут созданы,
            существующие — обновлены. Никто не удаляется.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={handleAdSync}
              disabled={adSyncLoading}
              className="btn btn-primary"
            >
              {adSyncLoading ? 'Синхронизация...' : 'Загрузить пользователей'}
            </button>
            <button
              onClick={() => { setShowAdSync(false); setAdSyncResult(null) }}
              className="btn btn-secondary"
            >
              Скрыть
            </button>
          </div>
          {adSyncResult && (
            <pre style={{
              marginTop: '12px',
              padding: '12px',
              background: adSyncResult.status === 'success' ? '#e8f5e9' : '#ffebee',
              borderRadius: '4px',
              fontSize: '13px',
              whiteSpace: 'pre-wrap'
            }}>
              {JSON.stringify(adSyncResult, null, 2)}
            </pre>
          )}
        </div>
      )}

      {!showAdSync && (
        <button
          onClick={() => setShowAdSync(true)}
          className="btn btn-secondary"
          style={{ marginBottom: '16px' }}
        >
          Массовая синхронизация с АД
        </button>
      )}

      <div className="card">
        <h2>Фильтры</h2>
        <div className="filters">
          <div className="form-group">
            <label>Сторона 1</label>
            <input
              type="text"
              value={filters.party1}
              onChange={(e) => handleFilterChange('party1', e.target.value)}
              placeholder="Поиск по стороне 1"
            />
          </div>
          <div className="form-group">
            <label>Сторона 2</label>
            <input
              type="text"
              value={filters.party2}
              onChange={(e) => handleFilterChange('party2', e.target.value)}
              placeholder="Поиск по стороне 2"
            />
          </div>
          <div className="form-group">
            <label>Техника</label>
            <input
              type="text"
              value={filters.item_name}
              onChange={(e) => handleFilterChange('item_name', e.target.value)}
              placeholder="Поиск по технике"
            />
          </div>
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={filters.email}
              onChange={(e) => handleFilterChange('email', e.target.value)}
              placeholder="Поиск по email"
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="card">
          <div>Загрузка...</div>
        </div>
      ) : error ? (
        <div className="card">
          <div className="error-message" style={{ color: '#d32f2f', padding: '1rem' }}>
            {error}
          </div>
          <button onClick={fetchActs} className="btn btn-primary" style={{ marginTop: '1rem' }}>
            Попробовать снова
          </button>
        </div>
      ) : (
        <>
          <div className="card">
            <p>Всего актов: {total}</p>
          </div>
          {acts.length === 0 ? (
            <div className="card">
              <p>Акты не найдены</p>
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Сторона 1</th>
                  <th>Сторона 2</th>
                  <th>Техника</th>
                  <th>Дата</th>
                  <th>Статус</th>
                  <th>Версия</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {acts.map((act) => (
                  <tr key={act.id}>
                    <td>{act.id?.substring(0, 8) || 'N/A'}...</td>
                    <td>{act.party1_name || '-'}</td>
                    <td>{act.party2_name || '-'}</td>
                    <td>{act.item_name || '-'}</td>
                    <td>{act.issue_date ? formatDate(act.issue_date) : '-'}</td>
                    <td>{act.status ? getStatusLabel(act.status) : '-'}</td>
                    <td>{act.current_version || '-'}</td>
                    <td>
                      <Link to={`/acts/${act.id}`} className="btn btn-secondary">
                        Просмотр
                      </Link>
                      <Link
                        to={`/acts/${act.id}/edit`}
                        className="btn btn-primary"
                        style={{ marginLeft: '5px' }}
                      >
                        Редактировать
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  )
}

export default ActsListPage

