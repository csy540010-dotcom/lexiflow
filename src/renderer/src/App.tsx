import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import Today from './pages/Today'
import StudySession from './pages/StudySession'
import ReviewSession from './pages/ReviewSession'
import PracticeCenter from './pages/PracticeCenter'
import Training from './pages/Training'
import Reading from './pages/Reading'
import Music from './pages/Music'
import Vocabulary from './pages/Vocabulary'
import WordDetail from './pages/WordDetail'
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

  // 学习时长心跳：窗口可见时每 30 秒累计一次
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void window.lexi.statsTick(30)
      }
    }, 30_000)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="app-content">
        <Routes>
          <Route path="/" element={<Navigate to="/today" replace />} />
          <Route path="/today" element={<Today />} />
          <Route path="/today/study" element={<StudySession />} />
          <Route path="/today/review" element={<ReviewSession />} />
          <Route path="/today/practice" element={<PracticeCenter />} />
          <Route path="/training" element={<Training />} />
          <Route path="/reading" element={<Reading />} />
          <Route path="/music" element={<Music />} />
          <Route path="/vocabulary" element={<Vocabulary />} />
          <Route path="/vocabulary/word/:id" element={<WordDetail />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  )
}
