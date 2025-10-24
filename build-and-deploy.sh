#!/bin/bash

# Click-to-Call 3C Plus HubSpot - Build and Deploy Script
# This script builds and deploys the Docker application

set -e

echo "🚀 Starting Click-to-Call 3C Plus HubSpot build and deploy..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    print_error "Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

# Stop existing containers
print_status "Stopping existing containers..."
docker-compose down || true

# Remove old images (optional)
if [ "$1" = "--clean" ]; then
    print_status "Cleaning up old images..."
    docker system prune -f
    docker image rm clicktocall-3cplus-hubspot clicktocall-3cplus-hubspot_clicktocall-app || true
fi

# Build the application
print_status "Building Docker image..."
docker-compose build --no-cache

# Start the services
print_status "Starting services..."
docker-compose up -d

# Wait for services to be ready
print_status "Waiting for services to be ready..."
sleep 10

# Check if services are running
if docker-compose ps | grep -q "Up"; then
    print_success "Services are running!"
    print_status "Application is available at:"
    echo "  - Main app: http://localhost:3000"
    echo "  - With nginx: http://localhost:80"
    echo ""
    print_status "To view logs:"
    echo "  docker-compose logs -f"
    echo ""
    print_status "To stop services:"
    echo "  docker-compose down"
else
    print_error "Failed to start services. Check logs with: docker-compose logs"
    exit 1
fi

print_success "Deployment completed successfully! 🎉"
