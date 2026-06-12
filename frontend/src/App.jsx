import { Routes, Route } from 'react-router-dom'
import LandingPage from './pages/LandingPage'
import CreateElectionPage from './pages/CreateElectionPage'
import VotePage from './pages/VotePage'
import ResultsPage from './pages/ResultsPage'
import RegisterPage from './pages/RegisterPage'
import NominatePage from './pages/NominatePage'
import RequestAccessPage from './pages/RequestAccessPage'
import AdminPage from './pages/admin/AdminPage'
import NotFoundPage from './pages/NotFoundPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/create" element={<CreateElectionPage />} />
      <Route path="/e/:code" element={<VotePage />} />
      <Route path="/e/:code/results" element={<ResultsPage />} />
      <Route path="/e/:code/register" element={<RegisterPage />} />
      <Route path="/e/:code/nominate" element={<NominatePage />} />
      <Route path="/e/:code/request" element={<RequestAccessPage />} />
      <Route path="/e/:code/admin" element={<AdminPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
