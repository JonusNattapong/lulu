# Lulu LSP for Neovim

## Installation

### Using vim-plug or similar plugin manager

```vim
Plug 'yourname/lulu-lsp'
```

### Using lazy.nvim

```lua
{
  'yourname/lulu-lsp',
  config = function()
    require('lulu-lsp').setup()
  end
}
```

## Configuration

### Basic Setup

```lua
-- init.lua or lua/plugins/lulu-lsp.lua
local lspconfig = require('lspconfig')

lspconfig.lulu_lsp = {
  default_config = {
    cmd = { 'bun', 'src/langserver/main.ts' },
    filetypes = { 'typescript', 'javascript', 'python', 'go', 'rust', 'lua' },
    root_dir = lspconfig.util.root_pattern('.git', 'tsconfig.json', 'package.json'),
    settings = {},
  },
}

-- Setup LSP
lspconfig.lulu_lsp.setup {
  capabilities = require('cmp_nvim_lsp').default_capabilities(),
  on_attach = function(client, bufnr)
    -- Key mappings
    local function buf_set_keymap(...) vim.api.nvim_buf_set_keymap(bufnr, ...) end
    local opts = { noremap=true, silent=true }

    buf_set_keymap('n', 'ga', '<cmd>lua vim.lsp.buf.code_action()<CR>', opts)
    buf_set_keymap('n', 'gA', '<cmd>lua require("lulu-lsp").ask()<CR>', opts)
    buf_set_keymap('n', 'gE', '<cmd>lua require("lulu-lsp").explain()<CR>', opts)
    buf_set_keymap('n', 'gF', '<cmd>lua require("lulu-lsp").fix()<CR>', opts)
    buf_set_keymap('n', 'gR', '<cmd>lua require("lulu-lsp").refactor()<CR>', opts)
  end,
}
```

### TCP Mode Setup

If running Lulu LSP as TCP server:

```lua
lspconfig.lulu_lsp.setup {
  cmd = { 'nc', 'localhost', '18790' },  -- netcat for TCP connection
  -- or use the TCP mode directly if LSP supports it
}
```

### Using lsp-zero

```lua
local lsp_zero = require('lsp-zero')

lsp_zero.configure('lulu_lsp', {
  cmd = { 'bun', 'src/langserver/main.ts' },
  filetypes = { 'typescript', 'javascript', 'python', 'go', 'rust' },
})

lsp_zero.on_attach(function(client, bufnr)
  lsp_zero.default_keymaps({buffer = bufnr})
  lsp_zero.buffer_auto_command(bufnr)
end)
```

## Usage

### Commands

| Command | Description |
|---------|-------------|
| `:LuluAsk` | Ask Lulu about current selection |
| `:LuluExplain` | Explain the code under cursor |
| `:LuluFix` | Fix issues in current file |
| `:LuluRefactor` | Refactor selection |
| `:LuluGenerate` | Generate code from prompt |

### Selections

Select code in visual mode and run:

```vim
vip          " Select paragraph
:LuluAsk<CR>  " Ask Lulu about it

vap          " Select paragraph including whitespace
:LuluExplain<CR>
```

### Default Keybindings

| Key | Action |
|-----|--------|
| `gA` | Ask Lulu |
| `gE` | Explain |
| `gF` | Fix |
| `gR` | Refactor |
| `K` | Hover (show docs) |
| `<leader>ca` | Code action |

## Plugin Module

```lua
-- lua/lulu-lsp/init.lua
local M = {}

M.config = {
  server_path = 'src/langserver/main.ts',
  port = 18790,
  mode = 'stdio', -- or 'tcp'
}

function M.setup(opts)
  opts = vim.tbl_deep_extend('force', M.config, opts or {})
  M.config = opts

  vim.api.nvim_create_user_command('LuluAsk', function()
    M.ask()
  end, {})

  vim.api.nvim_create_user_command('LuluExplain', function()
    M.explain()
  end, {})

  vim.api.nvim_create_user_command('LuluFix', function()
    M.fix()
  end, {})

  vim.api.nvim_create_user_command('LuluRefactor', function()
    M.refactor()
  end, {})

  vim.api.nvim_create_user_command('LuluGenerate', function()
    M.generate()
  end, {})
end

function M.get_selection()
  local start_pos = vim.fn.getpos("'<")
  local end_pos = vim.fn.getpos("'>")
  return vim.api.nvim_buf_get_text(0, start_pos[2]-1, start_pos[3]-1, end_pos[2]-1, end_pos[3], {})
end

function M.ask()
  local selection = table.concat(M.get_selection(), '\n')
  if not selection or selection == '' then
    return vim.notify('No text selected', vim.log.levels.WARN)
  end
  vim.notify('Asking Lulu: ' .. selection:sub(1, 50) .. '...', vim.log.levels.INFO)
  -- TODO: Send to LSP
end

function M.explain()
  local selection = table.concat(M.get_selection(), '\n')
  vim.notify('Explaining: ' .. selection:sub(1, 50) .. '...', vim.log.levels.INFO)
end

function M.fix()
  vim.notify('Fixing...', vim.log.levels.INFO)
end

function M.refactor()
  vim.notify('Refactoring...', vim.log.levels.INFO)
end

function M.generate()
  local prompt = vim.fn.input('Generate: ')
  if prompt and prompt ~= '' then
    vim.notify('Generating: ' .. prompt, vim.log.levels.INFO)
  end
end

return M
```

## Troubleshooting

1. **Server won't start**
   ```vim
   :checkhealth lspconfig
   :LspInfo
   ```

2. **Commands not showing**
   Make sure Lulu LSP is attached:
   ```vim
   :lua print(vim.lsp.get_active_clients())
   ```

3. **Port already in use (TCP mode)**
   ```bash
   lsof -i :18790  # Check what's using the port
   ```