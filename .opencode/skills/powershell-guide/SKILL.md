# PowerShell Skills Guide for Windows

## Creating Custom Skills

Skills are markdown files placed in `.opencode/skills/<skill-name>/SKILL.md`.

### Skill File Structure

```
.opencode/
  skills/
    my-skill/
      SKILL.md        # Skill definition (required)
      README.md       # Optional documentation
```

### SKILL.md Format

```markdown
---
name: my-skill
description: What this skill does
trigger: when to activate
---

Instructions for the AI agent when this skill is triggered.
Include step-by-step guidance, constraints, and examples.
```

## PowerShell-Specific Skills

When creating skills for Windows corporate environments:

### Network/Proxy Considerations

- PwC corporate networks may use proxy servers
- Set `HTTP_PROXY` and `HTTPS_PROXY` environment variables
- PowerShell: `$env:HTTP_PROXY = "http://proxy.pwcinternal.com:8080"`
- Use `-Proxy` parameter for `Invoke-WebRequest` and `Invoke-RestMethod`

### Common PowerShell Patterns

```powershell
# Check execution policy
Get-ExecutionPolicy -List

# Run with bypass for scripts
Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process

# Working with PwC internal APIs
$headers = @{ "Authorization" = "Bearer $env:PWC_API_KEY" }
Invoke-RestMethod -Uri $apiUrl -Headers $headers
```

### File System Operations

```powershell
# Workspace paths on Windows
$workspaceRoot = Join-Path $env:USERPROFILE "workspace"

# Ensure directory exists
New-Item -ItemType Directory -Force -Path $workspaceRoot
```

## Security Notes

- Never hardcode API keys in skill files
- Use environment variables for sensitive configuration
- Skills are plain text and may be committed to version control
