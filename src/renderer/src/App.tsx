import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import Today from './pages/Today'
import Training from './pages/Training'
import Reading from './pages/Reading'
import Music from './pages/Music'
import Vocabulary from './pages/Vocabulary'
import Stats from './pages/Stats'
import Settings from './pages/Settings'
import { applyTheme } from './lib/theme'

export default function App(): React.JSX.Element {
  useEffect(() => {
    window.lexi
      .getSettings()
      .then((s) => applyTheme(s.appearance.theme))
      .catch(() => {})
  }, [])

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="app-content">
        <Routes>
          <Route path="/" element={<Navigate to="/today" replace />} />
          <Route path="/today" element={<Today />} />
          <Route path="/training" element={<Training />} />
          <Route path="/reading" element={<Reading />} />
          <Route path="/music" element={<Music />} />
          <Route path="/vocabulary" element={<Vocabulary />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  )
}
