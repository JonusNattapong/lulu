#!/bin/bash
# Setup git hooks for Lulu workspace indexing
# Run once: ./scripts/setup-git-hooks.sh

set -e

HOOKS_DIR="$(git rev-parse --git-dir)/hooks"
mkdir -p "$HOOKS_DIR"

cat > "$HOOKS_DIR/post-commit" << 'EOF'
#!/bin/bash
# Auto-index workspace after commit
LULU_HOOK_INDEX="${LULU_HOOK_INDEX:-true}"
if [ "$LULU_HOOK_INDEX" = "true" ]; then
  bun run index 2>/dev/null &
fi
EOF

cat > "$HOOKS_DIR/post-merge" << 'EOF'
#!/bin/bash
# Auto-index workspace after merge/pull
LULU_HOOK_INDEX="${LULU_HOOK_INDEX:-true}"
if [ "$LULU_HOOK_INDEX" = "true" ]; then
  bun run index 2>/dev/null &
fi
EOF

cat > "$HOOKS_DIR/post-checkout" << 'EOF'
#!/bin/bash
# Auto-index workspace after checkout
LULU_HOOK_INDEX="${LULU_HOOK_INDEX:-true}"
if [ "$LULU_HOOK_INDEX" = "true" ]; then
  bun run index 2>/dev/null &
fi
EOF

chmod +x "$HOOKS_DIR/post-commit" "$HOOKS_DIR/post-merge" "$HOOKS_DIR/post-checkout"

echo "Git hooks installed: post-commit, post-merge, post-checkout"
echo "To disable: export LULU_HOOK_INDEX=false"
