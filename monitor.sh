#!/bin/bash

# Define Colors
GREEN='\033[1;32m'
RED='\033[1;31m'
CYAN='\033[1;36m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Spinner characters for animation
SPINNER=( "⠋" "⠙" "⠹" "⠸" "⠼" "⠴" "⠦" "⠧" "⠇" "⠏" )

# Function to check if a port is in use
check_port() {
    local port=$1
    # Check if port is listening using nc
    if nc -z localhost $port > /dev/null 2>&1; then
        echo -e "${GREEN}● ONLINE${NC}"
    else
        echo -e "${RED}○ OFFLINE${NC}"
    fi
}

# Main monitoring loop
i=0
while true; do
    # Clear the screen and move cursor to top left
    printf "\033c"
    
    echo -e "${CYAN}==========================================${NC}"
    echo -e "${YELLOW}   🚀 WhatsApp Clone Server Monitor ${SPINNER[$i]}   ${NC}"
    echo -e "${CYAN}==========================================${NC}"
    echo ""
    
    # Check each service
    printf " %-35s " "🌐 Backend API & Sockets (Port 3000):"
    check_port 3000
    
    printf " %-35s " "🛡️  Admin API             (Port 3001):"
    check_port 3001
    
    printf " %-35s " "📱 Client App             (Port 5173):"
    check_port 5173
    
    printf " %-35s " "💻 Admin Portal           (Port 5174):"
    check_port 5174
    
    echo ""
    echo -e "${CYAN}==========================================${NC}"
    echo -e "Press [CTRL+C] to exit monitor."
    
    # Increment spinner index
    i=$(( (i + 1) % 10 ))
    
    # Wait for a short duration to create animation
    sleep 0.5
done
