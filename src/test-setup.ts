import '@testing-library/jest-dom'

class MemoryStorage implements Storage {
  private data = new Map<string, string>()

  get length(): number {
    return this.data.size
  }

  clear(): void {
    this.data.clear()
  }

  getItem(key: string): string | null {
    return this.data.has(key) ? this.data.get(key)! : null
  }

  key(index: number): string | null {
    return Array.from(this.data.keys())[index] ?? null
  }

  removeItem(key: string): void {
    this.data.delete(key)
  }

  setItem(key: string, value: string): void {
    this.data.set(key, String(value))
  }
}

function installStorage(name: 'localStorage' | 'sessionStorage') {
  const storage = new MemoryStorage()
  Object.defineProperty(globalThis, name, {
    value: storage,
    configurable: true,
    writable: true,
  })
  Object.defineProperty(window, name, {
    value: storage,
    configurable: true,
    writable: true,
  })
}

installStorage('localStorage')
installStorage('sessionStorage')
