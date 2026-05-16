#!/bin/bash
# setup.sh — Run this once to install Node.js and all dependencies

set -e

echo "=== Shadowing App Setup ==="

# Check if Homebrew is installed
if ! command -v brew &>/dev/null; then
  echo "Installing Homebrew..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  # Add Homebrew to PATH for Apple Silicon Macs
  if [[ -f /opt/homebrew/bin/brew ]]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
    echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
  fi
else
  echo "Homebrew already installed."
fi

# Check if Node.js is installed
if ! command -v node &>/dev/null; then
  echo "Installing Node.js..."
  brew install node
else
  echo "Node.js already installed: $(node --version)"
fi

# Install dependencies
echo "Installing npm packages..."
cd "$(dirname "$0")"
npm install

echo ""
echo "=== Setup complete! ==="
echo "To start the app, run:"
echo "  cd $(pwd)"
echo "  npx expo start"
echo ""
echo "Then:"
echo "  - Press 'i' for iOS Simulator"
echo "  - Press 'a' for Android Emulator"
echo "  - Scan QR code with Expo Go app on your phone"
