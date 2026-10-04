export default function MasteryDots({ level, max = 4 }: { level: number; max?: number }): React.JSX.Element {
  const safeLevel = Math.max(0, Math.min(max, level))
  return (
    <span className="dots" title={`掌握度 ${safeLevel}/${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={'dot' + (i < safeLevel ? ' dot-on' : '')} />
      ))}
    </span>
  )
}
