#!/bin/bash

echo "Stopping Scholar platform..."
docker-compose down

echo ""
echo "Platform stopped successfully!"
echo ""
echo "To remove all data (including database):"
echo "  docker-compose down -v"
echo ""
