import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import './LoginPage.css'

function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login, user, loading: authLoading } = useAuth()
  const navigate = useNavigate()

  // Redirect if already logged in
  useEffect(() => {
    if (!authLoading && user) {
      navigate('/')
    }
  }, [user, authLoading, navigate])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      await login(email, password)
      // Navigation will happen automatically via useEffect when user is set
    } catch (err) {
      const detail = err.response?.data?.detail
    
      if (Array.isArray(detail)) {
        // FastAPI validation errors
        setError(detail.map(e => e.msg).join(', '))
      } else if (typeof detail === 'string') {
        setError(detail)
      } else if (err.message) {
        setError(err.message)
      } else {
        setError('Ошибка входа')
      }
    
      setLoading(false)
    }
  }

  // Show loading if checking auth
  if (authLoading) {
    return (
      <div className="login-container">
        <div className="login-card">
          <div>Проверка авторизации...</div>
        </div>
      </div>
    )
  }

  // Don't show login form if already logged in
  if (user) {
    return null
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <h1>Вход в систему</h1>
        <form onSubmit={handleSubmit}>
          {error && <div className="error-message">{error}</div>}
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label>Пароль</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Вход...' : 'Войти'}
          </button>
        </form>
        <div className="login-hint">
          <p>Для тестирования используйте:</p>
          <p>Email: admin@example.com</p>
          <p>Password: admin123</p>
        </div>
      </div>
    </div>
  )
}

export default LoginPage

