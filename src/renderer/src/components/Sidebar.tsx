import { NavLink } from 'react-router-dom'

const NAV_ITEMS = [
  { to: '/today', icon: '🏠', label: '今日学习' },
  { to: '/training', icon: '▦', label: '训练' },
  { to: '/reading', icon: '▤', label: '阅读' },
  { to: '/music', icon: '♫', label: '音乐听力' },
  { to: '/vocabulary', icon: '▣', label: '词汇库' },
  { to: '/stats', icon: '▥', label: '统计分析' },
  { to: '/settings', icon: '⚙', label: '设置' }
]

export default function Sidebar(): React.JSX.Element {
  return (
    <aside className="sidebar">
      <div className="brand">LexiFlow</div>
      <nav className="nav">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}
          >
            <span className="nav-icon">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-foot">v0.1.0 · M4</div>
    </aside>
  )
}
