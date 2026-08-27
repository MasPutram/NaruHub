import {NextApiRequest, NextApiResponse} from 'next'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const API_URL = process.env.POSTER_API_URL || 'http://localhost:8765'
  
  try {
    const response = await fetch(`${API_URL}/api/accounts`)
    const data = await response.json()
    res.status(200).json(data)
  } catch (err) {
    console.error('Proxy error:', err)
    res.status(500).json({ error: 'Failed to fetch accounts' })
  }
}
