import { Link } from 'react-router-dom'
import Layout from '../components/Layout'

export default function NotFoundPage() {
  return (
    <Layout>
      <div className="panel p-10 text-center">
        <div className="font-display font-900 text-6xl">404</div>
        <p className="mt-3 text-faint font-mono">This page isn't on the ballot.</p>
        <Link to="/" className="btn mt-6 inline-block">Back to start</Link>
      </div>
    </Layout>
  )
}
