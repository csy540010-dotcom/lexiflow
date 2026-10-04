interface PageStubProps {
  title: string
  subtitle: string
  planned: string
}

export default function PageStub({ title, subtitle, planned }: PageStubProps): React.JSX.Element {
  return (
    <section>
      <h1 className="page-title">{title}</h1>
      <p className="page-sub">{subtitle}</p>
      <div className="card">
        <p className="stub-note">{planned}</p>
      </div>
    </section>
  )
}
