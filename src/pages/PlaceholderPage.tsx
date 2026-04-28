interface PlaceholderPageProps {
  title: string
  description: string
}

export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <section className="dashboard-panel">
      <h2 className="dashboard-title">{title}</h2>
      <p className="placeholder-copy">{description}</p>
    </section>
  )
}
