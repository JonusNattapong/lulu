# Sub-Agents

For complex tasks, Lulu can spawn Sub-Agents. 

For example, if you ask Lulu to "Research the documentation for React Router", the main agent can spawn a **Browser Sub-Agent**. This sub-agent receives a specific set of tools (like `read_browser_page`, `click_element`), performs the research in the background, and returns a summarized report to the main Lulu agent.
