import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import './Layout.css'

function Layout({ children }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  if (!user) {
    return (
      <div className="container" style={{ padding: '2rem', textAlign: 'center' }}>
        <div>Ошибка: пользователь не найден</div>
        <button onClick={handleLogout} className="btn btn-primary" style={{ marginTop: '1rem' }}>
          Вернуться к входу
        </button>
      </div>
    )
  }

  return (
    <div className="layout">
      <nav className="navbar">
        <div className="navbar-brand">
          <Link to="/">Acts Digitalization</Link>
        </div>
        <div className="navbar-menu">
          <Link to="/" className="navbar-item">Акты</Link>
          {user.role === 'ADMIN' && (
            <Link to="/templates" className="navbar-item">Шаблоны</Link>
          )}
          <div className="navbar-user">
            <span>{user.full_name || user.email}</span>
            <button onClick={handleLogout} className="btn btn-secondary">Выход</button>
          </div>
        </div>
      </nav>
      <main className="main-content">
        {children}
      </main>
    </div>
  )
}

export default Layout

