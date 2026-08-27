import { useEffect, useState } from 'react'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8765'

export default function Monitor() {
  const [accounts, setAccounts] = useState([])
  const [stats, setStats] = useState({ total: 0, online: 0, value: 0 })

  useEffect(() => {
    const fetchAccounts = async () => {
      try {
        const res = await fetch(`${API_URL}/api/accounts`)
        if (res.ok) {
          const data = await res.json()
          setAccounts(data.accounts || [])
          
          const total = data.accounts?.length || 0
          const online = data.accounts?.filter(a => a.online).length || 0
          const value = data.accounts?.reduce((sum, a) => sum + (a.value || 0), 0) || 0
          
          setStats({ total, online, value })
        }
      } catch (err) {
        console.error('Failed to fetch accounts:', err)
      }
    }

    fetchAccounts()
    const interval = setInterval(fetchAccounts, 10000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="container">
      <header className="header">
        <h1>🐾 StealAnEgg Monitor</h1>
        <p>Track your egg farming accounts in real-time</p>
      </header>

      <div className="stats">
        <div className="stat-card">
          <h3>Total Accounts</h3>
          <div className="value">{stats.total}</div>
        </div>
        <div className="stat-card">
          <h3>Online</h3>
          <div className="value">{stats.online}</div>
        </div>
        <div className="stat-card">
          <h3>Total Value</h3>
          <div className="value">${stats.value.toLocaleString()}</div>
        </div>
      </div>

      <div className="accounts">
        <div className="accounts-header">
          <h2>Active Accounts</h2>
          <span className="status-active">{stats.online} online</span>
        </div>
        
        {accounts.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#718096' }}>
            No accounts yet. Start farming!
          </div>
        ) : (
          <div className="accounts-list">
            {accounts.map((acc, idx) => (
              <div key={idx} className="account-row">
                <div className="account-name">
                  {acc.name || 'Unknown'}
                  {acc.activeEgg && (
                    <div style={{ fontSize: 12, color: '#718096' }}>
                      🥚 {acc.activeEgg}
                    </div>
                  )}
                </div>
                <div className="account-egg">
                  Rate: ${acc.rate?.toLocaleString() || 0}/s
                </div>
                <div className="account-value">
                  ${acc.value?.toLocaleString() || 0}
                </div>
                <div className="account-status">
                  <span className={acc.online ? 'status-active' : 'status-inactive'}>
                    {acc.online ? 'Active' : 'Idle'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
        
        {accounts.length > 0 && (
          <div className="total-value">
            <h4>Grand Total Value</h4>
            <div className="amount">${stats.value.toLocaleString()}</div>
          </div>
        )}
      </div>
    </div>
  )
}
