#!/usr/bin/env python3
"""Reject private development material in tracked public source. Run Gitleaks separately."""
from pathlib import PurePosixPath
import subprocess
import sys

def reason(name):
    p = PurePosixPath(name)
    private = {'.codex', '.agents', '.claude', '.playwright-cli', '.acceptance',
               '.openspace', '__pycache__', 'node_modules', 'TestResults', '.DS_Store'}
    if any(part in private for part in p.parts):
        return 'private configuration or generated files'
    if name.startswith(('openspec/changes/', 'docs/brainstorms/', 'docs/compound/',
                        'docs/plans/', 'docs/project/', 'docs/audits/', 'docs/obsidian/')):
        return 'internal development history'
    if p.name in {'AGENTS.md', 'AGENTS.local.md.example', 'CLAUDE.md', 'session_log.md',
                   'openspace-local-ca.crt', '.gitleaksignore'}:
        return 'internal process or local trust data'
    if p.name.startswith('.env') and p.name not in {'.env.example', '.env.sample', '.env.template'}:
        return 'local environment'
    if p.suffix.lower() in {'.pem', '.key', '.p12', '.pfx', '.keystore', '.log', '.pdb', '.dmp'}:
        return 'private key or diagnostic artifact'
    return None

if __name__ == '__main__':
    files = subprocess.check_output(['git', 'ls-files', '-z']).decode().split('\0')
    failures = [(p, reason(p)) for p in files if p and reason(p)]
    for path, why in failures:
        print(f'{path}: {why}', file=sys.stderr)
    if failures:
        sys.exit(1)
    print('Public source tree hygiene passed')
