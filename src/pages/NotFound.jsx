import Shell from '../components/Shell.jsx'
import { useNavigate } from 'react-router-dom'

export default function NotFound() {
  const navigate = useNavigate()
  return (
    <Shell title="Page not found" subtitle="Navacon Inspection">
      <div className="space-y-4 text-center py-10">
        <p className="text-gray-400">This page doesn't exist.</p>
        <button onClick={() => navigate('/inspect')} className="bg-[#2B7FC1] text-white px-6 py-3 rounded-xl font-medium">
          Back to start
        </button>
      </div>
    </Shell>
  )
}
