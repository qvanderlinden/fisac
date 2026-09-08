#!/usr/bin/env bash
# Coder personalize script for this workspace (Ubuntu-based image).
#
# Coder runs this as the workspace user on every workspace start, so it must be
# idempotent and non-interactive: each step is skipped when the tool is already
# there. It installs the two toolchains this repo needs — uv for the Python
# backend and Node/npm for the Vite frontend.
set -euo pipefail

NODE_MAJOR="${NODE_MAJOR:-22}"   # matches node:22-slim in the root Dockerfile

log() { printf '\033[1;34m[personalize]\033[0m %s\n' "$*"; }

# Passwordless sudo is available in most Coder Ubuntu images, but not all; the
# Node install has a rootless fallback for when it isn't.
if [ "$(id -u)" -eq 0 ]; then
  SUDO=""
  HAVE_ROOT=1
elif sudo -n true 2>/dev/null; then
  SUDO="sudo"
  HAVE_ROOT=1
else
  SUDO=""
  HAVE_ROOT=0
fi

export DEBIAN_FRONTEND=noninteractive

# ---------------------------------------------------------------- base packages
if [ "$HAVE_ROOT" -eq 1 ]; then
  log "installing base packages"
  $SUDO apt-get update -qq
  $SUDO apt-get install -y -qq --no-install-recommends \
    ca-certificates curl git gnupg
fi

# ------------------------------------------------------------------------- uv
# The installer drops uv/uvx in ~/.local/bin and needs no root.
if command -v uv >/dev/null 2>&1; then
  log "uv already installed ($(uv --version))"
else
  log "installing uv"
  curl -LsSf https://astral.sh/uv/install.sh | env UV_NO_MODIFY_PATH=1 sh
fi
export PATH="$HOME/.local/bin:$PATH"

# ------------------------------------------------------------------ node + npm
# Ubuntu's own nodejs package lags badly, so use NodeSource when we can become
# root and nvm otherwise.
if command -v npm >/dev/null 2>&1; then
  log "npm already installed ($(npm --version), node $(node --version))"
elif [ "$HAVE_ROOT" -eq 1 ]; then
  log "installing node ${NODE_MAJOR} from NodeSource"
  $SUDO install -m 0755 -d /usr/share/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
    | $SUDO gpg --dearmor --yes -o /usr/share/keyrings/nodesource.gpg
  $SUDO chmod a+r /usr/share/keyrings/nodesource.gpg
  echo "deb [signed-by=/usr/share/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" \
    | $SUDO tee /etc/apt/sources.list.d/nodesource.list >/dev/null
  $SUDO apt-get update -qq
  $SUDO apt-get install -y -qq nodejs   # ships npm
else
  log "no root available — installing node ${NODE_MAJOR} via nvm"
  export NVM_DIR="$HOME/.nvm"
  if [ ! -s "$NVM_DIR/nvm.sh" ]; then
    curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
  fi
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"
  nvm install "$NODE_MAJOR"
  nvm alias default "$NODE_MAJOR"
fi

# ------------------------------------------------------------------------ PATH
# Persist ~/.local/bin (uv) for future shells; the nvm installer already appends
# its own block to the rc files it finds.
for rc in "$HOME/.bashrc" "$HOME/.zshrc"; do
  [ -f "$rc" ] || continue
  grep -qF '.local/bin' "$rc" && continue
  printf '\nexport PATH="$HOME/.local/bin:$PATH"\n' >>"$rc"
  log "added ~/.local/bin to PATH in $rc"
done

log "done: $(uv --version), node $(node --version 2>/dev/null || echo '?'), npm $(npm --version 2>/dev/null || echo '?')"
