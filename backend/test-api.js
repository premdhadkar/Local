const jwt = require('jsonwebtoken');

const JWT_SECRET = 'supersecret_for_local_network'; 
const token = jwt.sign({ id: 10, role: 'USER' }, JWT_SECRET);

fetch('http://127.0.0.1:3000/api/chats', { headers: { Authorization: `Bearer ${token}` } })
  .then(res => res.json())
  .then(data => console.log(data))
  .catch(err => console.error(err));
