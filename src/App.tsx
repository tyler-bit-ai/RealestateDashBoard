import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import PortfolioPage from './pages/PortfolioPage'
import UnitDetailPage from './pages/UnitDetailPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<PortfolioPage />} />
        <Route path="/units/:unitSlug" element={<UnitDetailPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
