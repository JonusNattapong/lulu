const DOCS_DATA = [
    {
        group: "First steps",
        items: [
            { id: "readme", title: "Getting started", file: "content/readme.md" }
        ]
    },
    {
        group: "Documentation",
        items: [
            { id: "architecture", title: "Architecture", file: "content/architecture.md" },
            { id: "roadmap", title: "Roadmap", file: "content/roadmap.md" },
            { id: "desktop", title: "Desktop", file: "content/desktop.md" },
            { id: "lsp", title: "LSP Neovim", file: "content/lsp-neovim.md" },
            { id: "decisions", title: "Decisions", file: "content/decisions.md" }
        ]
    },
    {
        group: "Core Systems",
        items: [
            { id: "gateway", title: "Gateway", file: "content/gateway.md" },
            { id: "skill-system", title: "Skill System", file: "content/skill-system.md" },
            { id: "sub-agents", title: "Sub-Agents", file: "content/sub-agents.md" },
            { id: "knowledge", title: "Knowledge Brain", file: "content/knowledge-brain.md" }
        ]
    },
    {
        group: "Features & Tools",
        items: [
            { id: "providers", title: "Providers", file: "content/providers.md" },
            { id: "commands", title: "CLI Commands", file: "content/commands.md" },
            { id: "tools", title: "Built-in Tools", file: "content/tools.md" }
        ]
    },
    {
        group: "Reference",
        items: [
            { id: "endpoints", title: "Endpoints", file: "content/endpoints.md" }
        ]
    }
];

// App State
let currentItem = DOCS_DATA[0].items[0];

// DOM Elements
const sidebarNav = document.getElementById('sidebarNav');
const contentWrapper = document.getElementById('contentWrapper');
const breadcrumbs = document.getElementById('breadcrumbs');
const searchInput = document.getElementById('searchInput');
const tocNav = document.getElementById('tocNav');

// Initialize
async function init() {
    renderLeftSidebar(DOCS_DATA);
    await loadContent(currentItem, currentItem.title);
    
    searchInput.addEventListener('input', (e) => {
        handleSearch(e.target.value.toLowerCase());
    });
}

// Fetch Markdown Content
async function loadContent(item, title) {
    breadcrumbs.textContent = title;
    contentWrapper.innerHTML = '<div style="color:var(--text-muted);">Loading...</div>';
    
    try {
        const response = await fetch(item.file);
        if (!response.ok) throw new Error("File not found");
        const text = await response.text();
        item.content = text; 
        
        // Render Markdown
        contentWrapper.innerHTML = marked.parse(text);
        
        // Generate TOC
        generateTOC();
    } catch (err) {
        contentWrapper.innerHTML = \`<h1>Error</h1><p>Could not load \${item.file}</p>\`;
        console.error(err);
    }
}

// Generate Right Sidebar TOC
function generateTOC() {
    tocNav.innerHTML = '';
    const headings = contentWrapper.querySelectorAll('h1, h2, h3');
    
    if (headings.length === 0) {
        tocNav.innerHTML = '<div class="toc-item">No headings found</div>';
        return;
    }

    headings.forEach((heading, index) => {
        // Assign ID for anchor jumping
        const id = \`heading-\${index}\`;
        heading.id = id;

        const link = document.createElement('a');
        link.href = \`#\${id}\`;
        link.textContent = heading.textContent;
        link.className = 'toc-item';
        
        // Active the first H1
        if (index === 0) link.classList.add('active');
        
        if (heading.tagName === 'H2' || heading.tagName === 'H3') {
            link.classList.add('indent');
        }
        
        link.onclick = (e) => {
            document.querySelectorAll('.toc-item').forEach(el => el.classList.remove('active'));
            e.currentTarget.classList.add('active');
        };

        tocNav.appendChild(link);
    });
}

// Render Left Sidebar Navigation
function renderLeftSidebar(data) {
    sidebarNav.innerHTML = '';
    
    data.forEach(group => {
        if (group.items.length === 0) return;
        
        const groupEl = document.createElement('div');
        groupEl.className = 'nav-group';
        
        const titleEl = document.createElement('div');
        titleEl.className = 'nav-group-title';
        titleEl.textContent = group.group;
        groupEl.appendChild(titleEl);
        
        group.items.forEach(item => {
            const itemEl = document.createElement('a');
            itemEl.className = \`nav-item \${item.id === currentItem.id ? 'active' : ''}\`;
            itemEl.textContent = item.title;
            itemEl.href = "#";
            itemEl.onclick = (e) => {
                e.preventDefault();
                selectItem(item, item.title);
            };
            groupEl.appendChild(itemEl);
        });
        
        sidebarNav.appendChild(groupEl);
    });
}

// Handle Selection
function selectItem(item, title) {
    currentItem = item;
    
    // Update active class in sidebar
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    event.currentTarget.classList.add('active');
    
    loadContent(item, title);
}

// Handle Search
function handleSearch(query) {
    if (!query) {
        renderLeftSidebar(DOCS_DATA);
        return;
    }
    
    const filteredData = DOCS_DATA.map(group => {
        return {
            group: group.group,
            items: group.items.filter(item => {
                const titleMatch = item.title.toLowerCase().includes(query);
                const contentMatch = item.content && item.content.toLowerCase().includes(query);
                return titleMatch || contentMatch;
            })
        };
    }).filter(group => group.items.length > 0);
    
    renderLeftSidebar(filteredData);
}

// Run init
init();
