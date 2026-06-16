const fs = require('fs');
let code = fs.readFileSync('backend/server.js', 'utf8');
code = code.replace("socket.on('call_user', (data) => {", "socket.on('call_user', (data) => {\n    console.log('Received call_user:', data.from, 'to', data.userToCall);\n    console.log('Connected users:', Array.from(connectedUsers.entries()));");
fs.writeFileSync('backend/server.js', code);
