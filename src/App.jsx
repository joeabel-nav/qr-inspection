import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import ScanLanding   from './pages/ScanLanding.jsx'
import AssetConfirm  from './pages/AssetConfirm.jsx'
import EmployeePin   from './pages/EmployeePin.jsx'
import Inspection    from './pages/Inspection.jsx'
import Complete      from './pages/Complete.jsx'
import NotFound      from './pages/NotFound.jsx'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* QR code lands here: /inspect?asset=NVMT005 */}
        <Route path="/inspect"  element={<ScanLanding />} />
        <Route path="/confirm"  element={<AssetConfirm />} />
        <Route path="/pin"      element={<EmployeePin />} />
        <Route path="/run"      element={<Inspection />} />
        <Route path="/complete" element={<Complete />} />
        <Route path="/"         element={<Navigate to="/inspect" replace />} />
        <Route path="*"         element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  )
}
