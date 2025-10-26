#!/bin/bash

echo "================================"
echo "  Scholar Platform Launcher    "
echo "================================"
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "Creating .env from .env.example..."
    cp .env.example .env
    echo "✓ .env file created"
    echo ""
    echo "Please review and update .env file if needed."
    echo ""
fi

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Error: Docker is not running"
    echo "Please start Docker and try again"
    exit 1
fi

echo "Starting Scholar platform..."
echo ""

# Build and start containers
docker-compose up -d --build

echo ""
echo "================================"
echo "  Platform Status               "
echo "================================"
echo ""

# Wait a moment for containers to start
sleep 3

# Show container status
docker-compose ps

echo ""
echo "================================"
echo "  Access URLs                   "
echo "================================"
echo ""
echo "📚 User Portal:       http://localhost:3000"
echo "⚙️  Admin Dashboard:   http://localhost:3001"
echo "🔧 Backend API:       http://localhost:8080"
echo ""
echo "Default Admin Credentials:"
echo "  Username: admin"
echo "  Password: adminadmin"
echo ""
echo "================================"
echo ""
echo "To view logs: docker-compose logs -f"
echo "To stop:      docker-compose down"
echo ""
