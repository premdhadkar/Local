#!/bin/bash
source ~/.nvm/nvm.sh
echo "Starting WhatsApp Clone Full-Stack System..."

# Start Backend
cd /home/premdroid/.gemini/antigravity-ide/scratch/whatsapp-project/backend
npm start &
BACKEND_PID=$!
echo "Backend running on port 3000 (API & Sockets)"

# Start Admin Portal
cd /home/premdroid/.gemini/antigravity-ide/scratch/whatsapp-project/admin-portal
npm run dev &
ADMIN_PID=$!
echo "Admin Portal starting on port 5174..."

# Start Client App
cd /home/premdroid/.gemini/antigravity-ide/scratch/whatsapp-project/whatsapp-clone
npm run dev &
CLIENT_PID=$!
echo "Client App starting on port 5173..."

echo ""
echo "All services are running in the background!"
echo "Press Ctrl+C to stop all of them."

# Trap Ctrl+C to gracefully shut down the servers
trap "echo 'Shutting down...'; kill $BACKEND_PID $ADMIN_PID $CLIENT_PID; exit" SIGINT SIGTERM

# Keep the script running
wait
