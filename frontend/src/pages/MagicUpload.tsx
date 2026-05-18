import { useParams } from 'react-router-dom'
import { useState } from 'react'

export default function MagicUploadPage() {
  const { token } = useParams<{ token: string }>()
  const [uploaded, setUploaded] = useState(false)

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white rounded-xl shadow-sm border border-gray-200 p-8">
        <h1 className="text-xl font-bold text-gray-900 mb-2">Upload Certificate of Insurance</h1>
        {uploaded ? (
          <p className="text-green-600 text-sm mt-4">
            Thank you — your certificate has been received and is being processed.
          </p>
        ) : (
          <>
            <p className="text-gray-500 text-sm mb-6">
              Please upload your current certificate of insurance (PDF). No login required.
            </p>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center text-gray-400 text-sm">
              COI upload — coming in Phase 3.
              <br />
              <span className="text-xs text-gray-300 mt-1 block">Token: {token}</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

