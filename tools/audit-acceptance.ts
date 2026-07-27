import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import './audit-report.ts'

type AcceptanceReport = {
    ruleVersion: string
    fitnessVersion: string
    acceptance: {
        maxGenePickRate: number
        maxPolicyWinRate: number
        maxPolicyWinShare: number
        evolveRate: number
        orderOutcomeSpread: number
        passes: Record<string, boolean>
    }
}

const output = resolve(import.meta.dirname, '../artifacts/audit')
const report = JSON.parse(readFileSync(resolve(output, 'baseline-report.json'), 'utf8')) as AcceptanceReport
const failed = Object.entries(report.acceptance.passes).filter(([, passed]) => !passed).map(([name]) => name)
const result = {
    ...report.acceptance,
    accepted: failed.length === 0,
    failedChecks: failed,
    ruleVersion: report.ruleVersion,
    fitnessVersion: report.fitnessVersion,
}

mkdirSync(output, { recursive: true })
writeFileSync(resolve(output, 'acceptance.json'), `${JSON.stringify(result, null, 2)}\n`)
writeFileSync(resolve(output, 'acceptance.md'), [
    '# Audit acceptance', '',
    `- Stato: ${result.accepted ? 'PASS' : 'FAIL'}`,
    `- Regole: ${result.ruleVersion}; fitness: ${result.fitnessVersion}.`,
    `- Controlli: ${failed.length ? `falliti: ${failed.join(', ')}` : 'tutti superati'}.`,
    `- Scelta gene massima: ${(result.maxGenePickRate * 100).toFixed(1)}%.`,
    `- Quota vittorie policy massima: ${(result.maxPolicyWinShare * 100).toFixed(1)}%.`,
    `- Evoluzione: ${(result.evolveRate * 100).toFixed(1)}%.`,
    `- Spread ordine eventi: ${result.orderOutcomeSpread}.`,
].join('\n') + '\n')

console.log(JSON.stringify(result))
if (!result.accepted) throw new Error(`Audit acceptance failed: ${failed.join(', ')}`)
