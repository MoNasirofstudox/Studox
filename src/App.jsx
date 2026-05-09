import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { Spinner } from './components/ui'
import LoginPage          from './pages/auth/LoginPage'
import SignUpPage         from './pages/auth/SignUpPage'
import OfficeSelectorPage from './pages/OfficeSelectorPage'
import OnboardingPage     from './pages/onboarding/OnboardingPage'
import Coredesk           from './pages/coredesk/Coredesk'
import Acadex             from './pages/acadex/Acadex'
import Boarddesk          from './pages/boarddesk/Boarddesk'
import Paydesk            from './pages/paydesk/Paydesk'
import Schedox            from './pages/schedox/Schedox'
import StudoxDesk         from './pages/studox/StudoxDesk'
import StudentPortal      from './pages/student/StudentPortal'

export default function App() {
  const { session, person, loading } = useAuth()

  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Spinner size="lg" />
    </div>
  )

  if (!session) return (
    <Routes>
      <Route path="/signup" element={<SignUpPage />} />
      <Route path="*"       element={<LoginPage />} />
    </Routes>
  )

  if (!person) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Spinner size="lg" />
    </div>
  )

  return (
    <Routes>
      <Route path="/"             element={<OfficeSelectorPage />} />
      <Route path="/onboarding/*" element={<OnboardingPage />} />
      <Route path="/coredesk/*"   element={<Coredesk />} />
      <Route path="/acadex/*"     element={<Acadex />} />
      <Route path="/boarddesk/*"  element={<Boarddesk />} />
      <Route path="/paydesk/*"    element={<Paydesk />} />
      <Route path="/schedox/*"    element={<Schedox />} />
      <Route path="/desk/*"       element={<StudoxDesk />} />
      <Route path="/student/*"    element={<StudentPortal />} />
      <Route path="*"             element={<Navigate to="/" replace />} />
    </Routes>
  )
}
