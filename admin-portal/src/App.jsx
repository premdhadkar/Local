import { useState, useEffect } from 'react';
import axios from 'axios';

function App() {
  const [token, setToken] = useState(localStorage.getItem('adminToken'));
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [officeName, setOfficeName] = useState('');
  const [photo, setPhoto] = useState(null);
  const [createdUser, setCreatedUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [searchName, setSearchName] = useState('');
  const [filterOffice, setFilterOffice] = useState('');
  const [metrics, setMetrics] = useState(null);

  const fetchMetrics = async () => {
    try {
      const res = await axios.get(`/api/admin/metrics`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMetrics(res.data);
    } catch (err) {
      console.error('Failed to fetch metrics', err);
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await axios.get(`/api/admin/users`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUsers(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    let intervalId;
    if (token) {
      fetchUsers();
      fetchMetrics();
      // Dynamically fetch metrics every 3 seconds
      intervalId = setInterval(() => {
        fetchMetrics();
      }, 3000);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [token]);

  const handleDeleteUser = async (id) => {
    if (!window.confirm('Are you sure you want to delete this user? All their messages and files will be permanently deleted.')) return;
    try {
      await axios.delete(`/api/admin/users/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchUsers();
    } catch (err) {
      alert('Failed to delete user');
    }
  };

  const handleCleanHistory = async () => {
    if (!window.confirm('CAUTION: Are you sure you want to delete all messages and media? User accounts will be retained.')) return;
    try {
      const res = await axios.delete(`/api/admin/clean-history`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      alert(res.data.message || 'Chat history cleaned successfully!');
    } catch (err) {
      alert('Failed to clean history');
    }
  };

  const handleCleanDatabase = async () => {
    if (!window.confirm('CAUTION: Are you sure you want to completely wipe the database? This will delete all users (except admin), messages, and media files permanently.')) return;
    try {
      const res = await axios.delete(`/api/admin/clean-db`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      alert(res.data.message || 'Database cleaned successfully!');
      fetchUsers();
    } catch (err) {
      alert('Failed to clean database');
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post(`/api/admin/login`, { username, password });
      setToken(res.data.token);
      localStorage.setItem('adminToken', res.data.token);
    } catch (err) {
      alert(err.response?.data?.error || 'Login failed. Ensure backend is running.');
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    const formData = new FormData();
    formData.append('firstName', firstName);
    formData.append('lastName', lastName);
    formData.append('officeName', officeName);
    if (photo) formData.append('photograph', photo);

    try {
      const res = await axios.post(`/api/admin/users`, formData, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });
      setCreatedUser(res.data.credentials);
      setFirstName(''); setLastName(''); setOfficeName(''); setPhoto(null);
      fetchUsers();
    } catch (err) {
      alert('Failed to create user');
    }
  };

  if (!token) {
    return (
      <div style={{ padding: '2rem', maxWidth: '400px', margin: '2rem auto', background: 'white', borderRadius: '8px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)' }}>
        <h2 style={{ textAlign: 'center', color: '#333' }}>Admin Login</h2>
        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '20px' }}>
          <input style={{ padding: '10px', borderRadius: '4px', border: '1px solid #ddd' }} placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} required />
          <input style={{ padding: '10px', borderRadius: '4px', border: '1px solid #ddd' }} type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required />
          <button style={{ padding: '10px', background: '#075E54', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }} type="submit">Login</button>
        </form>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '600px', margin: '2rem auto', background: 'white', borderRadius: '8px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #eee', paddingBottom: '10px', marginBottom: '20px' }}>
        <h2 style={{ color: '#075E54', margin: 0 }}>Create NIC Office User</h2>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button style={{ padding: '5px 10px', background: '#f0ad4e', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }} onClick={handleCleanHistory}>Clean History Only</button>
          <button style={{ padding: '5px 10px', background: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }} onClick={handleCleanDatabase}>Clean Full Database</button>
          <button style={{ padding: '5px 10px', background: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }} onClick={() => { setToken(null); localStorage.removeItem('adminToken'); }}>Logout</button>
        </div>
      </div>
      
      {metrics && (
        <div style={{ marginBottom: '30px', background: '#f8f9fa', padding: '20px', borderRadius: '8px', border: '1px solid #dee2e6' }}>
          <h3 style={{ marginTop: 0, color: '#075E54' }}>System Metrics</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '15px' }}>
            <div style={{ background: 'white', padding: '15px', borderRadius: '6px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', textAlign: 'center' }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#075E54' }}>{metrics.users}</div>
              <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>Total Users</div>
            </div>
            <div style={{ background: 'white', padding: '15px', borderRadius: '6px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', textAlign: 'center' }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#075E54' }}>{metrics.readWriteRequests}</div>
              <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>Total Interactions</div>
            </div>
            <div style={{ background: 'white', padding: '15px', borderRadius: '6px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', textAlign: 'center' }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#075E54' }}>{(metrics.dataPerUserBytes / 1024).toFixed(2)} KB</div>
              <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>Avg Data / User</div>
            </div>
            <div style={{ background: 'white', padding: '15px', borderRadius: '6px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', textAlign: 'center' }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#075E54' }}>{(metrics.totalDiskUsageBytes / 1024 / 1024).toFixed(2)} MB</div>
              <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>Disk Usage</div>
            </div>
            <div style={{ background: 'white', padding: '15px', borderRadius: '6px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', textAlign: 'center' }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#075E54' }}>{(metrics.uploadPerUserPerSec || 0).toFixed(1)} B/s</div>
              <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>Upload / User</div>
            </div>
            <div style={{ background: 'white', padding: '15px', borderRadius: '6px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', textAlign: 'center' }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#075E54' }}>{(metrics.downloadPerUserPerSec || 0).toFixed(1)} B/s</div>
              <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>Download / User</div>
            </div>
            <div style={{ background: 'white', padding: '15px', borderRadius: '6px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', textAlign: 'center' }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#075E54' }}>{(metrics.ramUsage.processBytes / 1024 / 1024).toFixed(1)} MB</div>
              <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>Process RAM Usage</div>
            </div>
          </div>
        </div>
      )}

      {createdUser && (
        <div style={{ background: '#d4edda', color: '#155724', padding: '15px', marginBottom: '20px', borderRadius: '4px', border: '1px solid #c3e6cb' }}>
          <strong>User Created Successfully!</strong><br /><br />
          Please provide these credentials to the user:<br />
          <strong style={{ fontSize: '18px' }}>Username:</strong> {createdUser.username}<br />
          <strong style={{ fontSize: '18px' }}>Password:</strong> {createdUser.password}
        </div>
      )}

      <form onSubmit={handleCreateUser} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
        <div>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>First Name</label>
          <input style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ddd', boxSizing: 'border-box' }} value={firstName} onChange={e => setFirstName(e.target.value)} required />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Last Name</label>
          <input style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ddd', boxSizing: 'border-box' }} value={lastName} onChange={e => setLastName(e.target.value)} required />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Office Name (NIC Office)</label>
          <input style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ddd', boxSizing: 'border-box' }} value={officeName} onChange={e => setOfficeName(e.target.value)} required />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Photograph (Optional)</label>
          <input type="file" accept="image/*" onChange={e => setPhoto(e.target.files[0])} />
        </div>
        <button type="submit" style={{ padding: '12px', background: '#25D366', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px', marginTop: '10px' }}>Register User</button>
      </form>

      <div style={{ marginTop: '40px', borderTop: '1px solid #eee', paddingTop: '20px' }}>
        <h3 style={{ color: '#075E54' }}>Manage Users</h3>

        {/* Search and Filter Controls */}
        <div style={{ display: 'flex', gap: '15px', marginBottom: '20px', alignItems: 'center' }}>
          <input 
            style={{ flex: 1, padding: '10px', borderRadius: '4px', border: '1px solid #ddd' }} 
            placeholder="Search by name..." 
            value={searchName} 
            onChange={e => setSearchName(e.target.value)} 
          />
          <button style={{ padding: '10px 20px', background: '#075E54', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
            Search
          </button>
          <select 
            style={{ padding: '10px', borderRadius: '4px', border: '1px solid #ddd' }} 
            value={filterOffice} 
            onChange={e => setFilterOffice(e.target.value)}
          >
            <option value="">All Offices</option>
            {[...new Set(users.map(u => u.officeName))].map(office => (
              <option key={office} value={office}>{office}</option>
            ))}
          </select>
        </div>

        {(() => {
          const filteredUsers = users.filter(u => {
            const matchesName = (u.firstName + ' ' + u.lastName).toLowerCase().includes(searchName.toLowerCase());
            const matchesOffice = filterOffice ? u.officeName === filterOffice : true;
            return matchesName && matchesOffice;
          });

          if (users.length === 0) return <p style={{ color: '#666' }}>No users found.</p>;
          if (filteredUsers.length === 0) return <p style={{ color: '#666' }}>No users match your search.</p>;

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {filteredUsers.map(u => (
              <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px', background: '#f9f9f9', borderRadius: '4px', border: '1px solid #eee' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                  {u.photographUrl ? <img src={`${u.photographUrl}`} style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover' }} alt="profile" /> : <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#ccc' }}></div>}
                  <div>
                    <div style={{ fontWeight: 'bold' }}>{u.firstName} {u.lastName}</div>
                    <div style={{ fontSize: '13px', color: '#666' }}>@{u.username} • {u.officeName}</div>
                  </div>
                </div>
                <button onClick={() => handleDeleteUser(u.id)} style={{ padding: '8px 12px', background: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Delete User</button>
              </div>
            ))}
          </div>
          );
        })()}
      </div>
    </div>
  );
}

export default App;
