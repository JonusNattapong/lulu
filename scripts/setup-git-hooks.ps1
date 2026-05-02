# Setup git hooks for Lulu workspace indexing
# Run once: .\scripts\setup-git-hooks.ps1

$hooksDir = ".git\hooks"
if (!(Test-Path $hooksDir)) {
  Write-Host "Not a git repository or hooks dir not found"
  exit 1
}

$bunCmd = "bun.cmd"

$postCommit = @"
# Auto-index workspace after commit
if (`$env:LULU_HOOK_INDEX -ne "false") {
  Start-Process -FilePath "$bunCmd" -ArgumentList "run index" -WindowStyle Hidden
}
"@

$postMerge = @"
# Auto-index workspace after merge/pull
if (`$env:LULU_HOOK_INDEX -ne "false") {
  Start-Process -FilePath "$bunCmd" -ArgumentList "run index" -WindowStyle Hidden
}
"@

$postCheckout = @"
# Auto-index workspace after checkout
if (`$env:LULU_HOOK_INDEX -ne "false") {
  Start-Process -FilePath "$bunCmd" -ArgumentList "run index" -WindowStyle Hidden
}
"@

Set-Content -Path "$hooksDir\post-commit" -Value $postCommit -NoNewline
Set-Content -Path "$hooksDir\post-merge" -Value $postMerge -NoNewline
Set-Content -Path "$hooksDir\post-checkout" -Value $postCheckout -NoNewline

Write-Host "Git hooks installed: post-commit, post-merge, post-checkout"
Write-Host "To disable: `$env:LULU_HOOK_INDEX = `"false`""
