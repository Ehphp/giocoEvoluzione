import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const BINARY_EXTENSION = /\.(?:avif|gif|ico|jpe?g|mp3|mp4|pdf|png|webp|woff2?|zip)$/i
const PROVIDER_SECRET_PATTERNS = [
    ['fal-api-key', /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{32,}\b/gi],
    ['openai-api-key', /\bsk-[A-Za-z0-9_-]{16,}\b/g],
    ['google-api-key', /\bAIza[0-9A-Za-z_-]{20,}\b/g],
    ['supabase-secret-key', /\bsb_secret_[A-Za-z0-9_-]{16,}\b/g],
    ['github-token', /\b(?:gh[pousr]_[A-Za-z0-9_]{16,}|github_pat_[A-Za-z0-9_]{16,})\b/g],
    ['netlify-token', /\bnfp_[A-Za-z0-9]{16,}\b/g],
    ['jwt', /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/g],
]
const NAMED_SECRET_ASSIGNMENT = /^[ \t]*(?:FAL_(?:FLUX|SEEDREAM)_API_KEY|FAL_KEY|OPENAI_API_KEY|TOGETHER_API_KEY|GEMINI_API_KEY|SUPABASE_SERVICE_ROLE_KEY|DATABASE_URL|JWT_SECRET|GITHUB_TOKEN|NETLIFY_AUTH_TOKEN)[ \t]*=[ \t]*(?![ \t]*(?:$|#|['"]?(?:your|example|change-me|replace|<|\.\.\.)[^\r\n]*$|['"]?env\([^\r\n]*$))([^\r\n#]+?)[ \t]*$/gmi

function fingerprint(value) {
    return createHash('sha256').update(value).digest('hex').slice(0, 12)
}

function lineNumber(source, index) {
    return source.slice(0, index).split('\n').length
}

function trackedFiles() {
    return execFileSync('git', ['ls-files', '-z'], { encoding: 'buffer' })
        .toString('utf8')
        .split('\0')
        .filter((path) => path && !BINARY_EXTENSION.test(path))
}

const findings = []
for (const path of trackedFiles()) {
    let source
    try {
        source = readFileSync(path, 'utf8')
    } catch {
        continue
    }
    for (const [rule, pattern] of PROVIDER_SECRET_PATTERNS) {
        pattern.lastIndex = 0
        for (let match = pattern.exec(source); match; match = pattern.exec(source)) {
            findings.push({ path, line: lineNumber(source, match.index), rule, value: match[0] })
        }
    }
    NAMED_SECRET_ASSIGNMENT.lastIndex = 0
    for (let match = NAMED_SECRET_ASSIGNMENT.exec(source); match; match = NAMED_SECRET_ASSIGNMENT.exec(source)) {
        findings.push({ path, line: lineNumber(source, match.index), rule: 'named-secret-assignment', value: match[1] })
    }
}

if (findings.length) {
    for (const finding of findings) {
        console.error(`${finding.path}:${finding.line} [${finding.rule}] fingerprint=${fingerprint(finding.value)}`)
    }
    process.exitCode = 1
} else {
    console.log('Secret scan passed: no high-confidence credential found in tracked files.')
}
