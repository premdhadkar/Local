const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

if (!fs.existsSync(path.join(__dirname, '../uploads'))) {
  fs.mkdirSync(path.join(__dirname, '../uploads'));
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../uploads')),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

const JWT_SECRET = 'nic-secret-key';

// Middleware
const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

const adminAuth = (req, res, next) => {
  auth(req, res, () => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Forbidden' });
    next();
  });
};

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET);
  res.json({ token, user });
});

app.get('/api/users', auth, async (req, res) => {
  const users = await prisma.user.findMany({ where: { id: { not: req.user.id } } });
  res.json(users);
});

app.put('/api/profile', auth, upload.single('photograph'), async (req, res) => {
  const { firstName, lastName, officeName, password } = req.body;
  const data = { firstName, lastName, officeName };
  if (password) data.password = await bcrypt.hash(password, 10);
  if (req.file) data.photographUrl = 'http://localhost:3000/uploads/' + req.file.filename;
  const updatedUser = await prisma.user.update({ where: { id: req.user.id }, data });
  res.json({ user: updatedUser });
});

app.get('/api/admin/users', adminAuth, async (req, res) => {
  const users = await prisma.user.findMany();
  res.json(users);
});

app.post('/api/admin/users', adminAuth, upload.single('photograph'), async (req, res) => {
  const { username, password, firstName, lastName, officeName, role } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const data = { username, password: hashedPassword, firstName, lastName, officeName, role: role || 'USER' };
  if (req.file) data.photographUrl = 'http://localhost:3000/uploads/' + req.file.filename;
  const user = await prisma.user.create({ data });
  res.json(user);
});

app.put('/api/admin/users/:id', adminAuth, upload.single('photograph'), async (req, res) => {
  const { firstName, lastName, officeName, password, role } = req.body;
  const data = { firstName, lastName, officeName, role };
  if (password) data.password = await bcrypt.hash(password, 10);
  if (req.file) data.photographUrl = 'http://localhost:3000/uploads/' + req.file.filename;
  const user = await prisma.user.update({ where: { id: parseInt(req.params.id) }, data });
  res.json(user);
});

app.delete('/api/admin/users/:id', adminAuth, async (req, res) => {
  await prisma.user.delete({ where: { id: parseInt(req.params.id) } });
  res.json({ success: true });
});

app.get('/api/messages/:id', auth, async (req, res) => {
  const messages = await prisma.message.findMany({
    where: {
      OR: [
        { senderId: req.user.id, receiverId: parseInt(req.params.id) },
        { senderId: parseInt(req.params.id), receiverId: req.user.id }
      ]
    },
    orderBy: { timestamp: 'asc' }
  });
  res.json(messages);
});

app.get('/api/call-logs', auth, async (req, res) => {
  const logs = await prisma.callLog.findMany({
    where: { OR: [{ callerId: req.user.id }, { receiverId: req.user.id }] },
    include: { caller: true, receiver: true },
    orderBy: { startTime: 'desc' }
  });
  res.json(logs);
});

app.post('/api/upload', auth, upload.single('file'), (req, res) => {
  if (req.file) {
    res.json({ fileUrl: 'http://localhost:3000/uploads/' + req.file.filename });
  } else {
    res.status(400).json({ error: 'No file' });
  }
});

const activeUsers = new Map();

io.on('connection', (socket) => {
  socket.on('register', (userId) => {
    activeUsers.set(userId, socket.id);
    io.emit('user_status', { userId, status: 'online' });
  });

  socket.on('disconnect', () => {
    for (const [userId, socketId] of activeUsers.entries()) {
      if (socketId === socket.id) {
        activeUsers.delete(userId);
        io.emit('user_status', { userId, status: 'offline' });
        break;
      }
    }
  });

  socket.on('send_message', async (data) => {
    const { senderId, receiverId, text, fileUrl } = data;
    const msg = await prisma.message.create({ data: { senderId, receiverId, text, fileUrl } });
    const rId = activeUsers.get(receiverId);
    if (rId) io.to(rId).emit('receive_message', msg);
    socket.emit('receive_message', msg);
  });

  socket.on('delete_message', async ({ messageId, userId }) => {
    const msg = await prisma.message.findUnique({ where: { id: messageId } });
    if (msg && msg.senderId === userId) {
      await prisma.message.delete({ where: { id: messageId } });
      io.emit('message_deleted', messageId);
    }
  });

  socket.on('call_user', ({ userToCall, signalData, from, name, callType }) => {
    const rId = activeUsers.get(userToCall);
    if (rId) {
      io.to(rId).emit('incoming_call', { signal: signalData, from, callerInfo: name });
    }
  });

  socket.on('answer_call', ({ to, signal }) => {
    const rId = activeUsers.get(to);
    if (rId) io.to(rId).emit('call_accepted', signal);
  });

  socket.on('reject_call', ({ to }) => {
    const rId = activeUsers.get(to);
    if (rId) io.to(rId).emit('call_rejected');
  });

  socket.on('end_call', async ({ to, callType, callDuration, status, callerId, receiverId }) => {
    if (callerId && receiverId) {
      await prisma.callLog.create({
        data: { callerId, receiverId, callType: callType || 'video', status: status || 'missed', duration: callDuration || 0 }
      });
    }
    const rId = activeUsers.get(to);
    if (rId) io.to(rId).emit('call_ended');
  });
});

const PORT = 3000;
server.listen(PORT, () => console.log('Backend running on port ' + PORT));
