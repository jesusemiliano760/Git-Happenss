import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number, currency: 'MXN' | 'USD' = 'MXN') {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency }).format(amount)
}

export function formatPercent(value: number) {
  return `${value.toFixed(1)}%`
}
