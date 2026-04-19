import * as vscode from 'vscode'

export function activate(context: vscode.ExtensionContext): void {
  const disposable = vscode.commands.registerCommand('logex.writeArticle', () => {
    const terminal =
      vscode.window.activeTerminal ??
      vscode.window.createTerminal({ name: 'Logex' })
    terminal.show()
    terminal.sendText('logex write', true)
  })

  context.subscriptions.push(disposable)
}

export function deactivate(): void {
  // no-op
}
