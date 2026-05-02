---
name: security-audit
version: 1.0.0
description: Perform security audit on code
triggers: ["security", "audit", "vulnerability", "secure", "hack"]
category: code
quality_bar: "Identifies security issues with severity and remediation"
---

# Security Audit

Perform security review of code.

## When to Trigger
- User requests security audit
- Before major release
- New security-sensitive code

## Steps
1. **Scan dependencies** - Check for known vulnerabilities
2. **Review code** - Look for common issues:
   - SQL injection
   - XSS vulnerabilities
   - Authentication issues
   - Data exposure
3. **Check configs** - Verify secure defaults
4. **Report findings** - Document issues found

## Security Checklist
- [ ] Input validation
- [ ] Authentication/Authorization
- [ ] Data encryption
- [ ] Secure defaults
- [ ] Error handling
- [ ] Logging (no secrets)

## Tools Required
- read_file
- search (for vulnerable patterns)
- dependency checkers