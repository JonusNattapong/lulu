#!/bin/bash

# Lulu AI Installer for Linux/macOS
echo -e "\033[0;36m"
echo "  _      _    _   _      _    _ "
echo " | |    | |  | | | |    | |  | |"
echo " | |    | |  | | | |    | |  | |"
echo " | |____| |__| | | |____| |__| |"
echo " |______|______| |______|______|"
echo -e "       v0.0.5 | Installation\033[0m"
echo ""

# 1. Check for Bun
if ! command -v bun &> /dev/null; then
    echo "Bun not found. Installing Bun..."
    curl -fsSL https://bun.sh/install | bash
    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"
else
    echo "✓ Bun is already installed."
fi

# 2. Install dependencies
echo "Installing dependencies..."
bun install

# 3. Build the project
echo "Building Lulu..."
bun run build

# 4. Setup Alias
SHELL_RC=""
if [[ $SHELL == *"zsh"* ]]; then
    SHELL_RC="$HOME/.zshrc"
elif [[ $SHELL == *"bash"* ]]; then
    SHELL_RC="$HOME/.bashrc"
fi

if [ -n "$SHELL_RC" ]; then
    if ! grep -q "alias lulu=" "$SHELL_RC"; then
        echo "Adding 'lulu' alias to $SHELL_RC..."
        echo "alias lulu='bun $(pwd)/src/index.tsx'" >> "$SHELL_RC"
        echo "✓ Alias added! Please run 'source $SHELL_RC' or restart your terminal."
    else
        echo "✓ Alias 'lulu' already exists in $SHELL_RC."
    fi
fi

echo -e "\n\033[0;32mInstallation complete! Run 'lulu' to start.\033[0m"
