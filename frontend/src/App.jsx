import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import LoginPage from './pages/LoginPage'
import ActsListPage from './pages/ActsListPage'
import ActCreatePage from './pages/ActCreatePage'
import ActEditPage from './pages/ActEditPage'
import ActViewPage from './pages/ActViewPage'
import TemplatesPage from './pages/TemplatesPage'
import Layout from './components/Layout'

function PrivateRoute({ children }) {
  const { user, loading } = useAuth()
  
  if (loading) {
    return (
      <div className="container" style={{ padding: '2rem', textAlign: 'center' }}>
        <div>Загрузка...</div>
      </div>
    )
  }
  
  if (!user) {
    return <Navigate to="/login" replace />
  }
  
  return children
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <PrivateRoute>
            <Layout>
              <ActsListPage />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path="/acts/create"
        element={
          <PrivateRoute>
            <Layout>
              <ActCreatePage />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path="/acts/:id/edit"
        element={
          <PrivateRoute>
            <Layout>
              <ActEditPage />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path="/acts/:id"
        element={
          <PrivateRoute>
            <Layout>
              <ActViewPage />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path="/templates"
        element={
          <PrivateRoute>
            <Layout>
              <TemplatesPage />
            </Layout>
          </PrivateRoute>
        }
      />
    </Routes>
  )
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <AppRoutes />
      </Router>
    </AuthProvider>
  )
}

export default App

